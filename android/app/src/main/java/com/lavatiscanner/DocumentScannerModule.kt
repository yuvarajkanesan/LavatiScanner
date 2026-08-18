package com.lavatiscanner

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

/**
 * Launches Google's ML Kit Document Scanner (a native activity with live
 * edge detection, auto-capture, and multi-page support built in) for the
 * "Docs" capture mode, instead of building real-time contour detection from
 * scratch. Uses the classic startIntentSenderForResult + ActivityEventListener
 * pattern (not the Jetpack registerForActivityResult API, which requires
 * registering at Activity-construction time and isn't reachable from a
 * bridge module) — the same approach RN's own native modules use for any
 * activity-for-result flow.
 */
class DocumentScannerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    private const val REQUEST_CODE = 51245
  }

  private var pendingPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "DocumentScannerModule"

  @ReactMethod
  fun startScan(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No active Activity to launch the scanner from")
      return
    }
    if (pendingPromise != null) {
      promise.reject("SCAN_IN_PROGRESS", "A scan is already in progress")
      return
    }
    pendingPromise = promise

    val options = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(30)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build()

    val scanner = GmsDocumentScanning.getClient(options)
    scanner.getStartScanIntent(activity)
        .addOnSuccessListener { intentSender ->
          try {
            activity.startIntentSenderForResult(intentSender, REQUEST_CODE, null, 0, 0, 0)
          } catch (e: Exception) {
            pendingPromise?.reject("START_SCAN_FAILED", e.message, e)
            pendingPromise = null
          }
        }
        .addOnFailureListener { e ->
          pendingPromise?.reject("START_SCAN_FAILED", e.message, e)
          pendingPromise = null
        }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE) {
      return
    }
    val promise = pendingPromise ?: return
    pendingPromise = null

    if (resultCode != Activity.RESULT_OK) {
      // Cancelled — resolve with an empty array so JS can treat "cancelled"
      // the same as "chose not to add pages" without a separate error branch.
      promise.resolve(Arguments.createArray())
      return
    }

    try {
      val result = GmsDocumentScanningResult.fromActivityResultIntent(data)
      val uris = Arguments.createArray()
      result?.pages?.forEach { page -> uris.pushString(page.imageUri.toString()) }
      promise.resolve(uris)
    } catch (e: Exception) {
      promise.reject("SCAN_RESULT_ERROR", e.message, e)
    }
  }

  override fun onNewIntent(intent: Intent?) {
    // Not needed for this flow — results come back via onActivityResult.
  }
}
