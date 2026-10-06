package com.lavatiscanner

import android.content.Intent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "LavatiScanner"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // launchMode="singleTask" (needed so the camera/scan flow doesn't stack
  // duplicate activities) means a repeat launch - from a home-screen
  // shortcut, the Quick Settings tile, or the widget, all of which reuse
  // this same running activity - arrives via onNewIntent, not a fresh
  // onCreate. Without re-pointing the activity's intent at the new one,
  // React Native's `Linking` module keeps reporting the *original* launch
  // intent's data forever, so every shortcut after the first silently
  // no-ops.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }
}
