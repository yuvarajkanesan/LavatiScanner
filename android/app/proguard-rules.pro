# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# react-native-sqlite-storage
-keep class io.liteglue.** { *; }
-keep class org.pgsqlite.** { *; }

# ML Kit (text recognition / barcode scanning)
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }

# react-native-keychain
-keep class com.oblador.keychain.** { *; }

# react-native-vector-icons
-keep class com.oblador.vectoricons.** { *; }

# react-native-svg
-keep class com.horcrux.svg.** { *; }

# react-native-pdf-thumbnail
-keep class org.songsterq.pdfthumbnail.** { *; }

-dontwarn com.google.mlkit.**
-dontwarn org.liteglue.**
