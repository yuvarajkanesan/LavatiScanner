package com.lavatiscanner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Applies a 4x5 color matrix to an image entirely off the View hierarchy -
 * decode into a Bitmap, draw through a Bitmap-backed (always software)
 * Canvas, encode back to JPEG. This never touches a hardware-accelerated
 * View/GPU layer, so it can't hit the device-specific "ColorMatrixColorFilter
 * renders solid black on a hardware layer" class of bug that affects the
 * react-native-color-matrix-image-filters on-screen preview on some GPUs.
 */
class ImageFilterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ImageFilterModule"

  private companion object {
    /** Longest side (px) the document detector works at. Higher than a bare
     * "find a rough rectangle" needs, because these fractional corners get
     * scaled up and fed straight into `warpPerspective` at full sensor
     * resolution afterward - imprecision here is what shows up as a
     * slightly crooked or clipped final scan, not just a fuzzy preview. */
    const val DETECT_SIZE = 640
  }

  /**
   * Decodes at full resolution when `maxDimension <= 0` (the real "bake to file"
   * path, which needs full quality), otherwise decodes pre-downsampled via
   * `inSampleSize` so a preview thumbnail never briefly holds a full-sensor-resolution
   * ARGB_8888 bitmap in memory. Without this, rendering N concurrent preview
   * thumbnails (filmstrip + per-page strip) scales native memory with page
   * count and can OOM-crash the whole app past ~3-4 pages on a high-megapixel
   * camera.
   */
  private fun decodeSampledBitmap(path: String, maxDimension: Int): Bitmap {
    val decoded =
        if (maxDimension <= 0) {
          BitmapFactory.decodeFile(path)
        } else {
          val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeFile(path, bounds)
          var sampleSize = 1
          while (bounds.outWidth / (sampleSize * 2) >= maxDimension &&
              bounds.outHeight / (sampleSize * 2) >= maxDimension) {
            sampleSize *= 2
          }
          BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sampleSize })
        } ?: throw IllegalStateException("Could not decode image at $path")
    return applyExifOrientation(path, decoded)
  }

  /**
   * Doubles resolution (bilinear-scaled, "filter=true" on
   * `createScaledBitmap`), capped so the result never exceeds 3840px on the
   * long side - a modest low-res scan still gets a real resolution bump
   * without an already-large photo ballooning into an unreasonable memory
   * footprint. Already-4K-or-larger sources are left untouched; only the
   * sharpen/contrast pass in applyFilterPixels's "hdUpscale" branch still
   * applies to them.
   */
  private fun upscaleForHd(bitmap: Bitmap): Bitmap {
    val longSide = max(bitmap.width, bitmap.height)
    if (longSide >= 3840) {
      return bitmap
    }
    val targetLongSide = min(longSide * 2, 3840)
    val scale = targetLongSide.toFloat() / longSide
    val newWidth = (bitmap.width * scale).toInt().coerceAtLeast(1)
    val newHeight = (bitmap.height * scale).toInt().coerceAtLeast(1)
    val scaled = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    if (scaled !== bitmap) {
      bitmap.recycle()
    }
    return scaled
  }

  /**
   * BitmapFactory ignores the JPEG's EXIF orientation tag, but the rest of the
   * app (React Native's Image, and therefore the Trim screen's crop-corner
   * coordinates) sees the photo already rotated upright. Camera photos are
   * stored sensor-landscape (e.g. 4080x3060) with an "orientation 6" tag, so
   * without this the native warp/filter would work on a sideways bitmap
   * while being handed upright coordinates - sampling the wrong region and
   * leaving the rest of the output white (only part of the page comes out).
   */
  private fun applyExifOrientation(path: String, bitmap: Bitmap): Bitmap {
    val orientation =
        try {
          ExifInterface(path)
              .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
          ExifInterface.ORIENTATION_NORMAL
        }
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> {
        matrix.setRotate(180f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.setRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.setRotate(-90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
      else -> return bitmap
    }
    val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (oriented !== bitmap) {
      bitmap.recycle()
    }
    return oriented
  }

  @ReactMethod
  fun applyColorMatrix(
      inputPath: String,
      outputPath: String,
      matrix: ReadableArray,
      quality: Int,
      sharpenAmount: Double,
      maxDimension: Int,
      promise: Promise
  ) {
    Thread {
      // Tracked outside the try body (rather than recycled inline at each
      // step) so the `finally` below can always clean up whatever got as
      // far as being allocated - without it, an exception partway through
      // (a malformed matrix, a full disk on the file write, a decode
      // failure) leaked that bitmap's native memory until GC happened to
      // finalize it, which compounds fast when errors repeat on retry.
      var srcBitmap: Bitmap? = null
      var outBitmap: Bitmap? = null
      try {
        val cleanInput = inputPath.removePrefix("file://")
        srcBitmap = decodeSampledBitmap(cleanInput, maxDimension)

        val values = FloatArray(20)
        for (i in 0 until 20) {
          values[i] = matrix.getDouble(i).toFloat()
        }

        outBitmap = Bitmap.createBitmap(srcBitmap.width, srcBitmap.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(outBitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        paint.colorFilter = ColorMatrixColorFilter(ColorMatrix(values))
        canvas.drawBitmap(srcBitmap, 0f, 0f, paint)
        srcBitmap.recycle()
        srcBitmap = null

        if (sharpenAmount > 0.0) {
          val sharpened = sharpen(outBitmap, sharpenAmount.toFloat())
          outBitmap.recycle()
          outBitmap = sharpened
        }

        val cleanOutput = outputPath.removePrefix("file://")
        FileOutputStream(File(cleanOutput)).use { out ->
          outBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }

        promise.resolve(cleanOutput)
      } catch (e: Exception) {
        promise.reject("IMAGE_FILTER_ERROR", e.message, e)
      } finally {
        srcBitmap?.let { if (!it.isRecycled) it.recycle() }
        outBitmap?.let { if (!it.isRecycled) it.recycle() }
      }
    }.start()
  }

  /**
   * A single-pass Laplacian unsharp-mask convolution (center weight
   * 1+4*amount, four orthogonal neighbors weighted -amount) — applied after
   * the color matrix so filters like "Enhanced" actually crisp up scanned
   * text instead of just re-compressing it, which was making letters look
   * softer than the original capture.
   */
  private fun sharpen(bitmap: Bitmap, amount: Float): Bitmap {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    val out = IntArray(width * height)

    val center = 1f + 4f * amount
    val edge = -amount

    for (y in 0 until height) {
      val yUp = if (y > 0) y - 1 else y
      val yDown = if (y < height - 1) y + 1 else y
      val rowOffset = y * width
      for (x in 0 until width) {
        val xLeft = if (x > 0) x - 1 else x
        val xRight = if (x < width - 1) x + 1 else x

        val pC = pixels[rowOffset + x]
        val pU = pixels[yUp * width + x]
        val pD = pixels[yDown * width + x]
        val pL = pixels[rowOffset + xLeft]
        val pR = pixels[rowOffset + xRight]

        val a = pC ushr 24 and 0xFF
        val r = sharpenChannel(center, edge, pC shr 16 and 0xFF, pU shr 16 and 0xFF, pD shr 16 and 0xFF, pL shr 16 and 0xFF, pR shr 16 and 0xFF)
        val g = sharpenChannel(center, edge, pC shr 8 and 0xFF, pU shr 8 and 0xFF, pD shr 8 and 0xFF, pL shr 8 and 0xFF, pR shr 8 and 0xFF)
        val b = sharpenChannel(center, edge, pC and 0xFF, pU and 0xFF, pD and 0xFF, pL and 0xFF, pR and 0xFF)

        out[rowOffset + x] = (a shl 24) or (r shl 16) or (g shl 8) or b
      }
    }

    return Bitmap.createBitmap(out, width, height, Bitmap.Config.ARGB_8888)
  }

  private fun sharpenChannel(center: Float, edge: Float, c: Int, u: Int, d: Int, l: Int, r: Int): Int {
    val v = center * c + edge * (u + d + l + r)
    return v.toInt().coerceIn(0, 255)
  }

  /**
   * Renders one of the "real" scan filters (background-division shadow
   * removal, CLAHE, adaptive threshold, etc. - see `applyFilterPixels`)
   * rather than a linear color matrix. These aren't expressible as a 4x5
   * matrix, so unlike `applyColorMatrix` this always walks pixel arrays
   * directly. Same decode/downsample/encode shape as `applyColorMatrix`
   * otherwise, including running off the UI thread and recycling bitmaps
   * eagerly so a mid-pipeline exception can't leak native memory.
   */
  @ReactMethod
  fun applyScanFilter(
      inputPath: String,
      outputPath: String,
      filterId: String,
      quality: Int,
      maxDimension: Int,
      promise: Promise
  ) {
    Thread {
      var srcBitmap: Bitmap? = null
      var outBitmap: Bitmap? = null
      try {
        val cleanInput = inputPath.removePrefix("file://")
        srcBitmap = decodeSampledBitmap(cleanInput, maxDimension)
        if (filterId == "hdUpscale") {
          srcBitmap = upscaleForHd(srcBitmap)
        }
        val width = srcBitmap.width
        val height = srcBitmap.height
        val pixels = IntArray(width * height)
        srcBitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        srcBitmap.recycle()
        srcBitmap = null

        val resultPixels = applyFilterPixels(pixels, width, height, filterId)
        outBitmap = Bitmap.createBitmap(resultPixels, width, height, Bitmap.Config.ARGB_8888)

        val cleanOutput = outputPath.removePrefix("file://")
        FileOutputStream(File(cleanOutput)).use { out ->
          outBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }
        promise.resolve(cleanOutput)
      } catch (e: Exception) {
        promise.reject("SCAN_FILTER_ERROR", e.message, e)
      } finally {
        srcBitmap?.let { if (!it.isRecycled) it.recycle() }
        outBitmap?.let { if (!it.isRecycled) it.recycle() }
      }
    }.start()
  }

  /**
   * Dispatches to each scan filter's pixel pipeline. Rewritten from scratch
   * around one rule: every transform here is a flat, global operation
   * (brightness/contrast/saturation/sharpen) applied the same way to every
   * pixel - no local-neighborhood-relative technique (CLAHE, "divide each
   * pixel by its local background average"). Those looked great on a
   * perfectly flat, evenly lit page in testing, but on anything else they
   * produced wildly inconsistent, unpredictable results: flat/muddy output
   * on low-contrast subjects, haloing, and in the worst case entire photos
   * blown out to solid white because any pixel brighter than its own
   * immediate surroundings got mapped straight to 255. A flat global
   * transform can't do that - the same math runs everywhere, so the result
   * is predictable regardless of what's being scanned. `sharpen` (the same
   * Laplacian unsharp mask as the color-matrix path) stays in every branch
   * so text/image crispness doesn't regress.
   */
  private fun applyFilterPixels(pixels: IntArray, w: Int, h: Int, filterId: String): IntArray {
    return when (filterId) {
      "lighten" -> {
        // Brightness + contrast lift, full color.
        sharpenARGB(brightnessBoost(contrastBoost(pixels, 1.08f), 18), w, h, 0.5f)
      }
      "magicColor" -> {
        // Vibrant, saturated color pop.
        sharpenARGB(boostSaturation(contrastBoost(pixels, 1.12f), 1.4f), w, h, 0.6f)
      }
      "grayscale" -> {
        // Monochrome, auto-levels stretched to the image's own actual
        // min/max (normalizeGray) so it always uses the full tonal range
        // instead of sitting flat/muddy in the middle - a global, bounded
        // operation that can't go flat or blow out the way CLAHE did.
        val gray = toGray(pixels)
        sharpenARGB(grayToARGB(normalizeGray(gray)), w, h, 0.5f)
      }
      "warm" -> {
        // Warm color-balance shift (more red/yellow, less blue) + a mild
        // contrast lift - useful for scans taken under cool/fluorescent
        // lighting.
        sharpenARGB(colorBalance(contrastBoost(pixels, 1.05f), 1.12f, 1.0f, 0.9f), w, h, 0.55f)
      }
      "cool" -> {
        // Same idea, opposite direction (more blue, less red) - a crisp,
        // cool-toned look.
        sharpenARGB(colorBalance(contrastBoost(pixels, 1.05f), 0.9f, 1.0f, 1.12f), w, h, 0.55f)
      }
      "bw" -> {
        // Punchier, higher-contrast monochrome than "grayscale" - still
        // continuous tone throughout (no binary threshold: an earlier
        // version of this filter did that and collapsed any photo/logo
        // content into solid black/white blobs, which is exactly the
        // "damaged quality" this whole filter rewrite was about fixing).
        val gray = toGray(pixels)
        val leveled = normalizeGray(gray)
        sharpenARGB(contrastBoost(grayToARGB(leveled), 1.25f), w, h, 0.55f)
      }
      "hdUpscale" -> {
        // The actual resolution increase already happened in
        // applyScanFilter (see upscaleForHd) before pixels ever reach this
        // function - this branch just sharpens the now-upscaled image to
        // counteract the inherent softness of bilinear scaling, plus a
        // mild contrast lift so it reads as crisper, not just bigger.
        sharpenARGB(contrastBoost(pixels, 1.06f), w, h, 0.65f)
      }
      "cleanWhite" -> {
        // Per-channel auto white balance (percentile-stretched - see
        // normalizeChannels) neutralizes a warm/yellow cast from indoor
        // lighting and pushes the paper background toward clean white while
        // keeping full color for anything printed in color (letterheads,
        // logos, stamps). The contrast lift afterward pushes dark text
        // further toward black at the same time it pushes the background
        // toward white, so this filter sharpens text contrast rather than
        // risking it the way a flat brightness-only whitening would; the
        // strongest sharpen pass here (matching "magicColor") keeps it from
        // reading soft next to the punchier "bw" mode.
        val balanced = normalizeChannels(pixels, 0.004f)
        sharpenARGB(contrastBoost(balanced, 1.15f), w, h, 0.6f)
      }
      else -> pixels
    }
  }

  private fun toGray(pixels: IntArray): IntArray {
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      out[i] = (((p shr 16) and 0xFF) * 299 + ((p shr 8) and 0xFF) * 587 + (p and 0xFF) * 114) / 1000
    }
    return out
  }

  private fun grayToARGB(gray: IntArray): IntArray {
    val out = IntArray(gray.size)
    for (i in gray.indices) {
      val v = gray[i].coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
    }
    return out
  }

  private fun brightnessBoost(pixels: IntArray, delta: Int): IntArray {
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      val r = (((p shr 16) and 0xFF) + delta).coerceIn(0, 255)
      val g = (((p shr 8) and 0xFF) + delta).coerceIn(0, 255)
      val b = ((p and 0xFF) + delta).coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }
    return out
  }

  private fun contrastBoost(pixels: IntArray, factor: Float): IntArray {
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      val r = ((((p shr 16) and 0xFF) - 128) * factor + 128).toInt().coerceIn(0, 255)
      val g = ((((p shr 8) and 0xFF) - 128) * factor + 128).toInt().coerceIn(0, 255)
      val b = (((p and 0xFF) - 128) * factor + 128).toInt().coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }
    return out
  }

  private fun boostSaturation(pixels: IntArray, factor: Float): IntArray {
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      val r = (p shr 16) and 0xFF
      val g = (p shr 8) and 0xFF
      val b = p and 0xFF
      val gray = (r * 299 + g * 587 + b * 114) / 1000f
      val nr = (gray + (r - gray) * factor).toInt().coerceIn(0, 255)
      val ng = (gray + (g - gray) * factor).toInt().coerceIn(0, 255)
      val nb = (gray + (b - gray) * factor).toInt().coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
    }
    return out
  }

  /** Per-channel multiplier - a flat white-balance-style color shift (warm/
   * cool tone). Same "global, bounded, same math everywhere" shape as every
   * other filter here. */
  private fun colorBalance(pixels: IntArray, rFactor: Float, gFactor: Float, bFactor: Float): IntArray {
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      val r = (((p shr 16) and 0xFF) * rFactor).toInt().coerceIn(0, 255)
      val g = (((p shr 8) and 0xFF) * gFactor).toInt().coerceIn(0, 255)
      val b = ((p and 0xFF) * bFactor).toInt().coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }
    return out
  }

  /**
   * The [clipFraction, 1-clipFraction] bounds of `values` (each 0-255) via a
   * 256-bucket histogram, instead of raw min/max - a single outlier pixel
   * (sensor noise, a staple, a glare speck) can otherwise compress the whole
   * stretch range and wash out text contrast in the result. Still one flat
   * pass over the whole image - same "global, bounded, predictable" shape as
   * every other filter here, just robust to a handful of extreme pixels.
   */
  private fun percentileBounds(values: IntArray, clipFraction: Float): Pair<Int, Int> {
    val hist = IntArray(256)
    for (v in values) hist[v.coerceIn(0, 255)]++
    val total = values.size
    val clipCount = (total * clipFraction).toInt()
    var cum = 0
    var lo = 0
    for (i in 0..255) {
      cum += hist[i]
      if (cum > clipCount) {
        lo = i
        break
      }
    }
    cum = 0
    var hi = 255
    for (i in 255 downTo 0) {
      cum += hist[i]
      if (cum > clipCount) {
        hi = i
        break
      }
    }
    if (hi <= lo) return Pair(0, 255)
    return Pair(lo, hi)
  }

  private fun normalizeGray(gray: IntArray): IntArray {
    val (mn, mx) = percentileBounds(gray, 0.004f)
    val range = (mx - mn).toFloat()
    val out = IntArray(gray.size)
    for (i in gray.indices) {
      out[i] = (((gray[i] - mn) / range) * 255f).toInt().coerceIn(0, 255)
    }
    return out
  }

  /** Per-channel version of `normalizeGray` - independently percentile-
   * stretches R, G and B so each channel's own near-white highlight lands
   * close to 255. A warm cast (e.g. R already near 255 while G/B lag behind)
   * gets neutralized because the lagging channels stretch up to meet it,
   * without touching hue-neutral dark text (whose own channel values are
   * already near each channel's low end and barely move). */
  private fun normalizeChannels(pixels: IntArray, clipFraction: Float): IntArray {
    val r = IntArray(pixels.size)
    val g = IntArray(pixels.size)
    val b = IntArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      r[i] = (p shr 16) and 0xFF
      g[i] = (p shr 8) and 0xFF
      b[i] = p and 0xFF
    }
    val (rMin, rMax) = percentileBounds(r, clipFraction)
    val (gMin, gMax) = percentileBounds(g, clipFraction)
    val (bMin, bMax) = percentileBounds(b, clipFraction)
    val rRange = (rMax - rMin).coerceAtLeast(1)
    val gRange = (gMax - gMin).coerceAtLeast(1)
    val bRange = (bMax - bMin).coerceAtLeast(1)
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
      val nr = (((r[i] - rMin) * 255) / rRange).coerceIn(0, 255)
      val ng = (((g[i] - gMin) * 255) / gRange).coerceIn(0, 255)
      val nb = (((b[i] - bMin) * 255) / bRange).coerceIn(0, 255)
      out[i] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
    }
    return out
  }

  /**
   * Same Laplacian unsharp mask as `sharpen(Bitmap, Float)`, operating on a
   * packed ARGB pixel array so the new filter pipeline never has to round-trip
   * through a Bitmap just to sharpen. */
  /**
   * Phone camera lenses are almost universally optically softer toward the
   * frame's edges/corners than the center (ordinary lens physics) - barely
   * noticeable on a typical photo, but very visible scanning a flat page
   * where the whole thing should look uniformly sharp (confirmed on-device:
   * crisp middle, "portrait mode"-looking soft edges). A single fixed
   * sharpen amount can't fix that since it treats every pixel the same;
   * this instead ramps the sharpen strength up with distance from center -
   * roughly the base `amount` in the middle, growing to ~2.2x that out at
   * the corners - to counteract the lens falloff directly rather than just
   * sharpening everything uniformly harder.
   */
  private fun sharpenARGB(pixels: IntArray, w: Int, h: Int, amount: Float): IntArray {
    val out = IntArray(w * h)
    val cx = (w - 1) / 2f
    val cy = (h - 1) / 2f
    val maxDist = sqrt(cx * cx + cy * cy).coerceAtLeast(1f)
    val edgeBoost = 1.2f
    for (y in 0 until h) {
      val yUp = if (y > 0) y - 1 else y
      val yDown = if (y < h - 1) y + 1 else y
      val rowOffset = y * w
      val dy = y - cy
      for (x in 0 until w) {
        val xLeft = if (x > 0) x - 1 else x
        val xRight = if (x < w - 1) x + 1 else x

        val dx = x - cx
        val t = (sqrt(dx * dx + dy * dy) / maxDist).coerceIn(0f, 1f)
        val localAmount = amount * (1f + edgeBoost * t)
        val center = 1f + 4f * localAmount
        val edge = -localAmount

        val pC = pixels[rowOffset + x]
        val pU = pixels[yUp * w + x]
        val pD = pixels[yDown * w + x]
        val pL = pixels[rowOffset + xLeft]
        val pR = pixels[rowOffset + xRight]

        val a = pC ushr 24 and 0xFF
        val r = sharpenChannel(center, edge, pC shr 16 and 0xFF, pU shr 16 and 0xFF, pD shr 16 and 0xFF, pL shr 16 and 0xFF, pR shr 16 and 0xFF)
        val g = sharpenChannel(center, edge, pC shr 8 and 0xFF, pU shr 8 and 0xFF, pD shr 8 and 0xFF, pL shr 8 and 0xFF, pR shr 8 and 0xFF)
        val b = sharpenChannel(center, edge, pC and 0xFF, pU and 0xFF, pD and 0xFF, pL and 0xFF, pR and 0xFF)

        out[rowOffset + x] = (a shl 24) or (r shl 16) or (g shl 8) or b
      }
    }
    return out
  }

  /**
   * Straightens a document photographed at an angle: maps the 4 corners the
   * user dragged onto the actual page edges (in source-image pixel space,
   * ordered top-left/top-right/bottom-right/bottom-left) onto a clean
   * rectangle using Android's standard `Matrix.setPolyToPoly` perspective
   * mapping, then redraws the bitmap through that matrix. This is the same
   * technique most native document-scanner implementations use — no
   * external CV library needed for a 4-point warp.
   */
  @ReactMethod
  fun warpPerspective(
      inputPath: String,
      outputPath: String,
      corners: ReadableArray,
      quality: Int,
      promise: Promise
  ) {
    Thread {
      var srcBitmap: Bitmap? = null
      var outBitmap: Bitmap? = null
      try {
        val cleanInput = inputPath.removePrefix("file://")
        srcBitmap = decodeSampledBitmap(cleanInput, 0)

        val src = FloatArray(8)
        for (i in 0 until 8) {
          src[i] = corners.getDouble(i).toFloat()
        }
        val tlX = src[0]
        val tlY = src[1]
        val trX = src[2]
        val trY = src[3]
        val brX = src[4]
        val brY = src[5]
        val blX = src[6]
        val blY = src[7]

        val topWidth = distance(tlX, tlY, trX, trY)
        val bottomWidth = distance(blX, blY, brX, brY)
        val leftHeight = distance(tlX, tlY, blX, blY)
        val rightHeight = distance(trX, trY, brX, brY)
        val outWidth = max(1f, max(topWidth, bottomWidth)).toInt()
        val outHeight = max(1f, max(leftHeight, rightHeight)).toInt()

        val dst =
            floatArrayOf(
                0f, 0f,
                outWidth.toFloat(), 0f,
                outWidth.toFloat(), outHeight.toFloat(),
                0f, outHeight.toFloat())

        val matrix = Matrix()
        if (!matrix.setPolyToPoly(src, 0, dst, 0, 4)) {
          throw IllegalStateException("Could not compute perspective transform")
        }

        outBitmap = Bitmap.createBitmap(outWidth, outHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(outBitmap)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        canvas.drawBitmap(srcBitmap, matrix, paint)

        val cleanOutput = outputPath.removePrefix("file://")
        FileOutputStream(File(cleanOutput)).use { out ->
          outBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }

        promise.resolve(cleanOutput)
      } catch (e: Exception) {
        promise.reject("IMAGE_WARP_ERROR", e.message, e)
      } finally {
        srcBitmap?.let { if (!it.isRecycled) it.recycle() }
        outBitmap?.let { if (!it.isRecycled) it.recycle() }
      }
    }.start()
  }

  /**
   * Finds the document (page / book) in a photo without OpenCV: downscale,
   * blur, split bright vs dark with Otsu's threshold, take the largest
   * connected blob (paper is normally the biggest bright region against a
   * darker desk), and read its four corners off the blob's extreme points
   * along the two diagonals. Resolves with 8 numbers - tl, tr, br, bl as
   * (x, y) fractions 0..1 of the upright image - or null when nothing
   * document-like stands out (e.g. white paper on a white desk), in which
   * case the caller keeps its default full-frame crop.
   */
  @ReactMethod
  fun detectDocumentCorners(inputPath: String, promise: Promise) {
    Thread {
      var decoded: Bitmap? = null
      var small: Bitmap? = null
      try {
        val cleanInput = inputPath.removePrefix("file://")
        decoded = decodeSampledBitmap(cleanInput, DETECT_SIZE)
        val scale = DETECT_SIZE.toFloat() / max(decoded.width, decoded.height)
        small =
            if (scale < 1f) {
              Bitmap.createScaledBitmap(
                  decoded,
                  max(1, (decoded.width * scale).toInt()),
                  max(1, (decoded.height * scale).toInt()),
                  true)
            } else {
              decoded
            }
        if (small !== decoded) {
          decoded.recycle()
          decoded = null
        }
        val w = small.width
        val h = small.height
        val px = IntArray(w * h)
        small.getPixels(px, 0, w, 0, 0, w, h)
        small.recycle()
        small = null

        val gray = toGray(px)
        // Blur radius scales with the working resolution (see DETECT_SIZE) so
        // raising that constant doesn't leave noise/paper-texture under-smoothed
        // relative to the larger image.
        val blurRadius = max(2, (min(w, h) * 0.005f).toInt())
        val blurred = boxBlur(boxBlur(gray, w, h, blurRadius), w, h, blurRadius)

        val quad = findBestDocumentQuad(blurred, w, h)
        if (quad == null) {
          promise.resolve(null)
        } else {
          val result = com.facebook.react.bridge.Arguments.createArray()
          for (v in quad) {
            result.pushDouble(v.toDouble())
          }
          promise.resolve(result)
        }
      } catch (e: Exception) {
        promise.reject("DOC_DETECT_ERROR", e.message, e)
      } finally {
        decoded?.let { if (!it.isRecycled) it.recycle() }
        small?.let { if (!it.isRecycled) it.recycle() }
      }
    }.start()
  }

  /**
   * Crops to a ratio-based region (0..1 of the EXIF-corrected, upright
   * image) and saves as JPEG. Used by the live-camera frame guide (e.g. ID
   * Card mode) to cut the captured photo down to just the on-screen guide
   * box. Goes through `decodeSampledBitmap` (same as every other method
   * here) specifically so the crop ratios are applied to the same upright
   * orientation the rest of the app already sees - cropping the raw,
   * sensor-landscape buffer directly (as the old PDF-based crop path did)
   * produced a correctly-framed but sideways result.
   */
  @ReactMethod
  fun cropRegion(
      inputPath: String,
      outputPath: String,
      xRatio: Double,
      yRatio: Double,
      widthRatio: Double,
      heightRatio: Double,
      quality: Int,
      promise: Promise
  ) {
    Thread {
      var decoded: Bitmap? = null
      var cropped: Bitmap? = null
      try {
        val cleanInput = inputPath.removePrefix("file://")
        decoded = decodeSampledBitmap(cleanInput, -1)
        val w = decoded.width
        val h = decoded.height
        val cropX = (xRatio * w).toInt().coerceIn(0, w - 1)
        val cropY = (yRatio * h).toInt().coerceIn(0, h - 1)
        val cropW = (widthRatio * w).toInt().coerceIn(1, w - cropX)
        val cropH = (heightRatio * h).toInt().coerceIn(1, h - cropY)

        cropped = Bitmap.createBitmap(decoded, cropX, cropY, cropW, cropH)
        if (cropped !== decoded) {
          decoded.recycle()
          decoded = null
        }

        val cleanOutput = outputPath.removePrefix("file://")
        FileOutputStream(File(cleanOutput)).use { out ->
          cropped.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }

        promise.resolve(cleanOutput)
      } catch (e: Exception) {
        promise.reject("IMAGE_CROP_ERROR", e.message, e)
      } finally {
        decoded?.let { if (!it.isRecycled) it.recycle() }
        cropped?.let { if (!it.isRecycled) it.recycle() }
      }
    }.start()
  }

  private fun boxBlur(src: IntArray, w: Int, h: Int, r: Int): IntArray {
    val div = 2 * r + 1
    val tmp = IntArray(w * h)
    for (y in 0 until h) {
      val row = y * w
      var sum = 0
      for (x in -r..r) {
        sum += src[row + x.coerceIn(0, w - 1)]
      }
      for (x in 0 until w) {
        tmp[row + x] = sum / div
        sum += src[row + (x + r + 1).coerceAtMost(w - 1)] - src[row + (x - r).coerceAtLeast(0)]
      }
    }
    val out = IntArray(w * h)
    for (x in 0 until w) {
      var sum = 0
      for (y in -r..r) {
        sum += tmp[y.coerceIn(0, h - 1) * w + x]
      }
      for (y in 0 until h) {
        out[y * w + x] = sum / div
        sum +=
            tmp[(y + r + 1).coerceAtMost(h - 1) * w + x] - tmp[(y - r).coerceAtLeast(0) * w + x]
      }
    }
    return out
  }

  private fun otsuThreshold(gray: IntArray): Int {
    val hist = IntArray(256)
    for (v in gray) {
      hist[v.coerceIn(0, 255)]++
    }
    val total = gray.size
    var sumAll = 0L
    for (i in 0..255) {
      sumAll += i.toLong() * hist[i]
    }
    var sumB = 0L
    var weightB = 0
    var best = 0.0
    var threshold = 128
    for (t in 0..255) {
      weightB += hist[t]
      if (weightB == 0) continue
      val weightF = total - weightB
      if (weightF == 0) break
      sumB += t.toLong() * hist[t]
      val meanB = sumB.toDouble() / weightB
      val meanF = (sumAll - sumB).toDouble() / weightF
      val between = weightB.toDouble() * weightF * (meanB - meanF) * (meanB - meanF)
      if (between > best) {
        best = between
        threshold = t
      }
    }
    return threshold
  }

  private class DocCandidate(
      val score: Float,
      val frac: Float,
      val quad: FloatArray,
      val cx: Float,
      val cy: Float
  )

  /**
   * Picks the best page/book outline across several brightness thresholds and
   * both polarities (bright page on darker desk, dark page on lighter desk).
   * Every candidate is scored on how rectangular the blob is and - crucially -
   * whether a real brightness step exists along each of its four sides, so a
   * shadow across the page, an uneven desk or a distant bright window can't
   * win. Returns tl,tr,br,bl as 8 fractions, or null when nothing convincing
   * stands out (caller keeps the full-frame crop rather than guessing).
   */
  private fun findBestDocumentQuad(gray: IntArray, w: Int, h: Int): FloatArray? {
    val base = otsuThreshold(gray)
    val closeRadius = max(3, (kotlin.math.min(w, h) * 0.02f).toInt())
    var best: DocCandidate? = null
    for (delta in intArrayOf(-45, -30, -15, 0, 12, 24)) {
      for (bright in booleanArrayOf(true, false)) {
        val c = documentCandidate(gray, w, h, base + delta, bright, closeRadius) ?: continue
        val b = best
        if (b == null ||
            c.score > b.score + 0.04f ||
            (kotlin.math.abs(c.score - b.score) <= 0.04f && c.frac > b.frac)) {
          best = c
        }
      }
    }
    val chosen = best ?: return null
    if (chosen.score < 0.55f) return null

    // Expand ~2% outward so the crop sits just outside the paper edge instead of clipping it.
    val k = 0.02f
    val out = FloatArray(8)
    for (i in 0 until 4) {
      val x = chosen.quad[i * 2] + (chosen.quad[i * 2] - chosen.cx) * k
      val y = chosen.quad[i * 2 + 1] + (chosen.quad[i * 2 + 1] - chosen.cy) * k
      out[i * 2] = (x / (w - 1)).coerceIn(0f, 1f)
      out[i * 2 + 1] = (y / (h - 1)).coerceIn(0f, 1f)
    }
    return out
  }

  private fun documentCandidate(
      gray: IntArray,
      w: Int,
      h: Int,
      threshold: Int,
      bright: Boolean,
      closeRadius: Int
  ): DocCandidate? {
    val total = w * h
    val raw = ByteArray(total) { if (if (bright) gray[it] > threshold else gray[it] <= threshold) 1 else 0 }
    val mask = closeMask(raw, w, h, closeRadius)

    val labels = IntArray(total)
    val stack = IntArray(total)
    var nextLabel = 0
    var bestLabel = 0
    var bestArea = 0
    for (start in 0 until total) {
      if (mask[start].toInt() == 0 || labels[start] != 0) continue
      nextLabel++
      var sp = 0
      stack[sp++] = start
      labels[start] = nextLabel
      var area = 0
      while (sp > 0) {
        val idx = stack[--sp]
        area++
        val x = idx % w
        val y = idx / w
        if (x > 0 && mask[idx - 1].toInt() != 0 && labels[idx - 1] == 0) {
          labels[idx - 1] = nextLabel; stack[sp++] = idx - 1
        }
        if (x < w - 1 && mask[idx + 1].toInt() != 0 && labels[idx + 1] == 0) {
          labels[idx + 1] = nextLabel; stack[sp++] = idx + 1
        }
        if (y > 0 && mask[idx - w].toInt() != 0 && labels[idx - w] == 0) {
          labels[idx - w] = nextLabel; stack[sp++] = idx - w
        }
        if (y < h - 1 && mask[idx + w].toInt() != 0 && labels[idx + w] == 0) {
          labels[idx + w] = nextLabel; stack[sp++] = idx + w
        }
      }
      if (area > bestArea) {
        bestArea = area
        bestLabel = nextLabel
      }
    }
    val frac = bestArea.toFloat() / total
    if (bestLabel == 0 || frac < 0.10f || frac > 0.98f) return null

    var best: DocCandidate? = null
    for (quad in arrayOf(extremeQuad(labels, bestLabel, w, h), hullQuad(labels, bestLabel, w, h))) {
      if (quad == null) continue
      val quadArea = polygonArea(quad)
      val quadFrac = quadArea / total
      if (quadFrac < 0.12f || quadFrac > 0.9f) continue
      val minSide = kotlin.math.min(w, h) * 0.1f
      var tooShort = false
      for (i in 0 until 4) {
        val j = (i + 1) % 4
        if (distance(quad[i * 2], quad[i * 2 + 1], quad[j * 2], quad[j * 2 + 1]) < minSide) {
          tooShort = true
        }
      }
      if (tooShort) continue

      val rect = bestArea / quadArea
      val cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4f
      val cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4f
      val polarity = if (bright) 1f else -1f
      var sideSum = 0f
      var sideMin = Float.MAX_VALUE
      for (i in 0 until 4) {
        val j = (i + 1) % 4
        val c = sideContrast(gray, w, h, quad[i * 2], quad[i * 2 + 1], quad[j * 2], quad[j * 2 + 1], cx, cy, polarity)
        // A side that runs off-frame can't be checked - neutral, not free credit.
        val s = if (c == null) 0.5f else (c / 40f).coerceIn(-0.5f, 1f)
        sideSum += s
        if (s < sideMin) sideMin = s
      }
      // No real brightness step along some side => this isn't a page edge.
      if (sideMin < 0.25f) continue
      val edge = 0.5f * (sideSum / 4f) + 0.5f * sideMin
      val rect01 = ((rect - 0.6f) / 0.35f).coerceIn(0f, 1f)
      val score = 0.4f * rect01 + 0.6f * edge.coerceIn(0f, 1f)
      if (best == null || score > best.score) {
        best = DocCandidate(score, frac, quad, cx, cy)
      }
    }
    return best
  }

  /** Blob's four corners taken as the extreme points along both diagonals. */
  private fun extremeQuad(labels: IntArray, label: Int, w: Int, h: Int): FloatArray? {
    var minSum = Int.MAX_VALUE; var maxSum = Int.MIN_VALUE
    var minDiff = Int.MAX_VALUE; var maxDiff = Int.MIN_VALUE
    var tlX = 0; var tlY = 0; var brX = 0; var brY = 0
    var trX = 0; var trY = 0; var blX = 0; var blY = 0
    for (idx in 0 until w * h) {
      if (labels[idx] != label) continue
      val x = idx % w
      val y = idx / w
      val s = x + y
      val d = x - y
      if (s < minSum) { minSum = s; tlX = x; tlY = y }
      if (s > maxSum) { maxSum = s; brX = x; brY = y }
      if (d > maxDiff) { maxDiff = d; trX = x; trY = y }
      if (d < minDiff) { minDiff = d; blX = x; blY = y }
    }
    return floatArrayOf(
        tlX.toFloat(), tlY.toFloat(), trX.toFloat(), trY.toFloat(),
        brX.toFloat(), brY.toFloat(), blX.toFloat(), blY.toFloat())
  }

  /**
   * Smallest four-sided outline around the blob's convex hull: repeatedly
   * drop the hull edge whose removal (extending its two neighbours until they
   * meet) adds the least area. Unlike the extreme-point quad this recovers a
   * page corner hidden by a dark logo/photo, since the truncating chord is
   * exactly the cheapest edge to remove.
   */
  private fun hullQuad(labels: IntArray, label: Int, w: Int, h: Int): FloatArray? {
    val xs = ArrayList<Int>()
    val ys = ArrayList<Int>()
    for (idx in 0 until w * h) {
      if (labels[idx] != label) continue
      val x = idx % w
      val y = idx / w
      val onEdge =
          x == 0 || y == 0 || x == w - 1 || y == h - 1 ||
              labels[idx - 1] != label || labels[idx + 1] != label ||
              labels[idx - w] != label || labels[idx + w] != label
      if (onEdge) {
        xs.add(x)
        ys.add(y)
      }
    }
    if (xs.size < 4) return null
    val order = (0 until xs.size).sortedWith(compareBy({ xs[it] }, { ys[it] }))
    val px = FloatArray(order.size) { xs[order[it]].toFloat() }
    val py = FloatArray(order.size) { ys[order[it]].toFloat() }

    fun cross(ox: Float, oy: Float, ax: Float, ay: Float, bx: Float, by: Float) =
        (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)

    val hullX = ArrayList<Float>()
    val hullY = ArrayList<Float>()
    // Andrew's monotone chain: lower hull then upper hull.
    val lowerStart = 0
    for (i in px.indices) {
      while (hullX.size - lowerStart >= 2 &&
          cross(hullX[hullX.size - 2], hullY[hullY.size - 2], hullX[hullX.size - 1], hullY[hullY.size - 1], px[i], py[i]) <= 0f) {
        hullX.removeAt(hullX.size - 1); hullY.removeAt(hullY.size - 1)
      }
      hullX.add(px[i]); hullY.add(py[i])
    }
    val upperStart = hullX.size - 1
    for (i in px.indices.reversed()) {
      while (hullX.size - upperStart >= 2 &&
          cross(hullX[hullX.size - 2], hullY[hullY.size - 2], hullX[hullX.size - 1], hullY[hullY.size - 1], px[i], py[i]) <= 0f) {
        hullX.removeAt(hullX.size - 1); hullY.removeAt(hullY.size - 1)
      }
      hullX.add(px[i]); hullY.add(py[i])
    }
    hullX.removeAt(hullX.size - 1); hullY.removeAt(hullY.size - 1)
    if (hullX.size < 4) return null

    var vx = hullX.toFloatArray()
    var vy = hullY.toFloatArray()

    while (vx.size > 4) {
      val n = vx.size
      var bestAdded = Float.MAX_VALUE
      var bestI = -1
      var bestPx = 0f
      var bestPy = 0f
      for (i in 0 until n) {
        val a = (i - 1 + n) % n
        val b = i
        val c = (i + 1) % n
        val d = (i + 2) % n
        // Intersection of line a->b with line c->d.
        val rX = vx[b] - vx[a]; val rY = vy[b] - vy[a]
        val sX = vx[d] - vx[c]; val sY = vy[d] - vy[c]
        val den = rX * sY - rY * sX
        if (kotlin.math.abs(den) < 1e-9f) continue
        val t = ((vx[c] - vx[a]) * sY - (vy[c] - vy[a]) * sX) / den
        val ix = vx[a] + t * rX
        val iy = vy[a] + t * rY
        // The new point must lie outside edge b->c, otherwise removing it would shrink the shape.
        if (cross(vx[b], vy[b], vx[c], vy[c], ix, iy) * cross(vx[a], vy[a], vx[b], vy[b], vx[c], vy[c]) >= 0f) continue
        val added = kotlin.math.abs(cross(vx[b], vy[b], ix, iy, vx[c], vy[c])) / 2f
        if (added < bestAdded) {
          bestAdded = added; bestI = i; bestPx = ix; bestPy = iy
        }
      }
      if (bestI < 0) return null
      val j = (bestI + 1) % n
      val nx = ArrayList<Float>()
      val ny = ArrayList<Float>()
      for (k in 0 until n) {
        when (k) {
          bestI -> { nx.add(bestPx); ny.add(bestPy) }
          j -> {}
          else -> { nx.add(vx[k]); ny.add(vy[k]) }
        }
      }
      vx = nx.toFloatArray()
      vy = ny.toFloatArray()
    }
    if (vx.size != 4) return null

    var tl = 0; var br = 0; var tr = 0; var bl = 0
    for (i in 1 until 4) {
      if (vx[i] + vy[i] < vx[tl] + vy[tl]) tl = i
      if (vx[i] + vy[i] > vx[br] + vy[br]) br = i
      if (vx[i] - vy[i] > vx[tr] - vy[tr]) tr = i
      if (vx[i] - vy[i] < vx[bl] - vy[bl]) bl = i
    }
    if (setOf(tl, tr, br, bl).size < 4) return null
    return floatArrayOf(vx[tl], vy[tl], vx[tr], vy[tr], vx[br], vy[br], vx[bl], vy[bl])
  }

  private fun polygonArea(q: FloatArray): Float {
    var a = 0f
    for (i in 0 until 4) {
      val j = (i + 1) % 4
      a += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1]
    }
    return kotlin.math.abs(a) / 2f
  }

  /** Median (inside - outside) brightness step along one quad side; null if the side lies off-frame. */
  private fun sideContrast(
      gray: IntArray,
      w: Int,
      h: Int,
      x0: Float,
      y0: Float,
      x1: Float,
      y1: Float,
      cx: Float,
      cy: Float,
      polarity: Float
  ): Float? {
    val dx = x1 - x0
    val dy = y1 - y0
    val len = sqrt(dx * dx + dy * dy)
    if (len < 1f) return null
    var nx = dy / len
    var ny = -dx / len
    val mx = (x0 + x1) / 2f
    val my = (y0 + y1) / 2f
    if ((cx - mx) * nx + (cy - my) * ny > 0f) { // make the normal point outward
      nx = -nx; ny = -ny
    }
    fun at(x: Float, y: Float): Int {
      val xi = Math.round(x)
      val yi = Math.round(y)
      return if (xi < 0 || yi < 0 || xi >= w || yi >= h) -1 else gray[yi * w + xi]
    }
    // Tuned at the old 400px working resolution (DETECT_SIZE) - scaled so a
    // higher DETECT_SIZE keeps sampling the same real-world distance from
    // the candidate edge instead of hugging it too closely.
    val offsetScale = min(w, h) / 400f
    val nearOffset = 4f * offsetScale
    val farOffset = 7f * offsetScale
    val values = ArrayList<Float>()
    val samples = 24
    for (k in 1..samples) {
      val t = k / (samples + 1f)
      val x = x0 + dx * t
      val y = y0 + dy * t
      val in1 = at(x - nx * nearOffset, y - ny * nearOffset)
      val in2 = at(x - nx * farOffset, y - ny * farOffset)
      val out1 = at(x + nx * nearOffset, y + ny * nearOffset)
      val out2 = at(x + nx * farOffset, y + ny * farOffset)
      if (in1 < 0 || in2 < 0 || out1 < 0 || out2 < 0) continue
      values.add(polarity * ((in1 + in2) / 2f - (out1 + out2) / 2f))
    }
    if (values.size < 5) return null
    values.sort()
    val m = values.size / 2
    return if (values.size % 2 == 1) values[m] else (values[m - 1] + values[m]) / 2f
  }

  /** Binary closing (dilate then erode) with a square window, edge-replicated, via prefix sums. */
  private fun closeMask(mask: ByteArray, w: Int, h: Int, r: Int): ByteArray {
    fun pass(src: ByteArray, horizontal: Boolean, needAll: Boolean): ByteArray {
      val out = ByteArray(w * h)
      val n = 2 * r + 1
      val lineCount = if (horizontal) h else w
      val len = if (horizontal) w else h
      val pre = IntArray(len + 1)
      for (line in 0 until lineCount) {
        fun idx(i: Int) = if (horizontal) line * w + i else i * w + line
        for (i in 0 until len) pre[i + 1] = pre[i] + src[idx(i)]
        val first = src[idx(0)].toInt()
        val last = src[idx(len - 1)].toInt()
        for (i in 0 until len) {
          var lo = i - r
          var hi = i + r
          var cnt = 0
          if (lo < 0) { cnt += (-lo) * first; lo = 0 }
          if (hi > len - 1) { cnt += (hi - (len - 1)) * last; hi = len - 1 }
          cnt += pre[hi + 1] - pre[lo]
          out[idx(i)] = if (if (needAll) cnt == n else cnt > 0) 1 else 0
        }
      }
      return out
    }
    val dilated = pass(pass(mask, true, false), false, false)
    return pass(pass(dilated, true, true), false, true)
  }

  private fun distance(x1: Float, y1: Float, x2: Float, y2: Float): Float {
    val dx = x2 - x1
    val dy = y2 - y1
    return sqrt(dx * dx + dy * dy)
  }
}
