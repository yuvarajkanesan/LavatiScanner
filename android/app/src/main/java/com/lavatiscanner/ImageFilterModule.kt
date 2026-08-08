package com.lavatiscanner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise
import java.io.File
import java.io.FileOutputStream

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
}
