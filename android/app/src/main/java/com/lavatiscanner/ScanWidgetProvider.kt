package com.lavatiscanner

import com.reactnativeandroidwidget.RNWidgetProvider

/**
 * Home-screen "One-Tap Scan" widget - all rendering, resize and click
 * handling (including the lavatiscanner:// deep links) is done by the
 * base class and the JS side (src/widgets/ScanWidget.tsx +
 * registerWidgetTaskHandler in index.js); this subclass only exists so
 * Android has a distinct provider class to register in the manifest.
 */
class ScanWidgetProvider : RNWidgetProvider()
