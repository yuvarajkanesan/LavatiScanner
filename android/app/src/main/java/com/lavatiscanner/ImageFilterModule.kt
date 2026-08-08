package com.lavatiscanner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
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

  @ReactMethod
  fun applyColorMatrix(
      inputPath: String,
      outputPath: String,
      matrix: ReadableArray,
      quality: Int,
      promise: Promise
  ) {
    Thread {
      try {
        val cleanInput = inputPath.removePrefix("file://")
        val srcBitmap =
            BitmapFactory.decodeFile(cleanInput)
                ?: throw IllegalStateException("Could not decode image at $cleanInput")

        val values = FloatArray(20)
        for (i in 0 until 20) {
          values[i] = matrix.getDouble(i).toFloat()
        }

        val outBitmap = Bitmap.createBitmap(srcBitmap.width, srcBitmap.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(outBitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        paint.colorFilter = ColorMatrixColorFilter(ColorMatrix(values))
        canvas.drawBitmap(srcBitmap, 0f, 0f, paint)

        val cleanOutput = outputPath.removePrefix("file://")
        FileOutputStream(File(cleanOutput)).use { out ->
          outBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }

        srcBitmap.recycle()
        outBitmap.recycle()

        promise.resolve(cleanOutput)
      } catch (e: Exception) {
        promise.reject("IMAGE_FILTER_ERROR", e.message, e)
      }
    }.start()
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
      try {
        val cleanInput = inputPath.removePrefix("file://")
        val srcBitmap =
            BitmapFactory.decodeFile(cleanInput)
                ?: throw IllegalStateException("Could not decode image at $cleanInput")

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

        val outBitmap = Bitmap.createBitmap(outWidth, outHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(outBitmap)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        canvas.drawBitmap(srcBitmap, matrix, paint)

        val cleanOutput = outputPath.removePrefix("file://")
        FileOutputStream(File(cleanOutput)).use { out ->
          outBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }

        srcBitmap.recycle()
        outBitmap.recycle()

        promise.resolve(cleanOutput)
      } catch (e: Exception) {
        promise.reject("IMAGE_WARP_ERROR", e.message, e)
      }
    }.start()
  }

  private fun distance(x1: Float, y1: Float, x2: Float, y2: Float): Float {
    val dx = x2 - x1
    val dy = y2 - y1
    return sqrt(dx * dx + dy * dy)
  }
}
