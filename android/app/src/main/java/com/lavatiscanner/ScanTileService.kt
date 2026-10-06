package com.lavatiscanner

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Quick Settings "Scan" tile - tapping it jumps straight to the scan screen
 * via the same lavatiscanner:// deep link the app-icon shortcuts and
 * home-screen widget use (handled in RootNavigator.tsx), instead of just
 * opening to Home.
 */
class ScanTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      label = getString(R.string.shortcut_scan_short)
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("lavatiscanner://scan")).apply {
      setClassName(applicationContext, "com.lavatiscanner.MainActivity")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    // `startActivityAndCollapse(Intent)` throws on API 34+ once targetSdk
    // reaches 34 - the PendingIntent overload replaces it there; the plain
    // Intent overload is kept for the API 24-33 devices this app still
    // supports (minSdk 24), where the PendingIntent overload doesn't exist.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val pendingIntent = PendingIntent.getActivity(
        this,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE,
      )
      startActivityAndCollapse(pendingIntent)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
