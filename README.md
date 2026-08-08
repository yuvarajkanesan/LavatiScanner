# Lavati Scanner

A React Native document scanner (CamScanner/OKEN-style): scan → crop/edge-detect →
filter → save as a multi-page document → export to PDF or JPGs, with folders,
PIN-locked vaults, and on-device OCR.

## Status

The **scan → filter → save → PDF export** pipeline is wired end to end and is the
part to test first — everything else (folders, PIN lock, settings) is built on
top of it. See [Known deviations from the original spec](#known-deviations-from-the-original-spec)
below for two deliberate implementation choices worth knowing about before you dig in.

## Tech stack

| Concern | Library |
|---|---|
| Capture + edge detection + manual crop | `react-native-document-scanner-plugin` |
| On-device OCR | `@react-native-ml-kit/text-recognition` |
| Filter preview & baking (B&W / Grayscale / Enhanced) | `react-native-color-matrix-image-filters` + `react-native-view-shot` |
| PDF assembly | `pdf-lib` (pure JS) |
| File storage | `react-native-fs` |
| Metadata DB | `react-native-sqlite-storage` |
| Navigation | `@react-navigation` (native-stack + bottom-tabs) |
| Page reorder | `react-native-draggable-flatlist` |
| Vault PIN storage | `react-native-keychain` (PIN is SHA-256 hashed before it's stored) |
| Share sheet | `react-native-share` |

## Project layout

```
App.tsx                       # providers (gesture handler, safe area, scan session), DB init
index.js                      # entry point; gesture-handler + Buffer polyfill imports
src/
  components/                 # AdBanner, DocumentCard, Fab, FilteredImage, OcrModal, PinPad
  context/ScanSessionContext.tsx  # in-progress multi-page scan session (pre-save)
  db/database.ts              # SQLite schema + CRUD (documents, pages, folders)
  navigation/                 # RootNavigator (stack) + MainTabs (bottom tabs)
  screens/                    # Home, Scan, Filter, DocumentDetail, Folders, FolderDetail,
                               # Settings, UpgradePro
  services/
    fileStorage.ts            # RNFS paths: DocumentDirectoryPath/scans/<docId>/*.jpg
    scanPipeline.ts           # session -> DB + file writes (save / append)
    pdfExport.ts               # pdf-lib JPG-per-page PDF assembly
    ocr.ts                     # ML Kit text recognition wrapper
    pin.ts                      # keychain-backed vault PIN (set/verify/clear)
  types/models.ts             # Document, Page, Folder types
  utils/                      # id/hash/date helpers, cross-platform text-prompt modal
```

### Data model (SQLite)

```
documents(id, name, folderId, createdAt, updatedAt)
pages(id, docId, pageIndex, filePath, ocrText, createdAt)
folders(id, name, isLocked, createdAt)
```

Pages are compressed JPGs on disk at
`RNFS.DocumentDirectoryPath/scans/<docId>/page_<id>.jpg`, referenced by `pages.filePath`.
Exported PDFs are cached at `RNFS.DocumentDirectoryPath/exports/` — "Clear cache" in
Settings wipes that folder only, never your saved scans.

### The scan pipeline, screen by screen

1. **Home** → tap the camera FAB → `Scan` screen opens
   `react-native-document-scanner-plugin`'s native camera UI (edge detection + capture
   + draggable-corner crop, all native — see deviation #1 below).
2. On a successful capture, the returned image path becomes a `SessionPage` in
   `ScanSessionContext` and you land on `Filter`.
3. **Filter** shows a live-filtered full preview (Original / B&W / Grayscale / Enhanced)
   plus a filmstrip of thumbnails. Choosing a filter and tapping **Add Page** or **Done**
   bakes it into a real JPG via `react-native-view-shot` (`captureRef` on the preview view).
4. **Add Page** re-invokes `Scan` for the next page; **Done** calls
   `saveSessionAsDocument()` (or `appendSessionToDocument()` if you got here from
   "Add Page" on an existing document's detail screen), which copies each page into
   permanent storage and writes the `documents`/`pages` rows.
5. **Document Detail**: drag to reorder pages, delete a page, add more pages, run OCR
   on a page (modal with copy-to-clipboard), export as a multi-page PDF or share the
   raw JPGs — both via the native share sheet.

## Known deviations from the original spec

1. **No hand-rolled JS crop screen.** `react-native-document-scanner-plugin`'s
   `scanDocument()` call already opens a native screen that does edge detection,
   capture, *and* lets the user drag the corners to adjust the crop before confirming
   — there's no JS hook into that intermediate step, only the final cropped image path.
   Reimplementing draggable-corner perspective cropping in JS would duplicate what the
   chosen library already does natively (and far less reliably). If you want a fully
   custom-branded crop UI later, look at swapping in `react-native-vision-camera` +
   a hand-rolled perspective-warp step — that's a much bigger undertaking.
2. **PDF assembly uses `pdf-lib` (pure JS), not `react-native-pdf-lib`.** The native
   `react-native-pdf-lib` package hasn't been published in years and is a known risk to
   build against current Android tooling. `pdf-lib` needs no native linking, is actively
   maintained, and does the same job (embed each page's JPG, one page per image) — see
   `src/services/pdfExport.ts`. `index.js` polyfills `global.Buffer` for it.
3. **`react-native-vector-icons` was dropped.** Nothing in the UI ended up needing it —
   tab bar and buttons use plain emoji glyphs — so it was removed rather than left as an
   unused native dependency (one less thing to link/build).
4. **Folder PIN lock uses one app-wide vault PIN**, not a PIN per folder. Set it once in
   Settings; any folder can be toggled locked/unlocked, and unlocking any locked folder
   asks for that same PIN. This matches how CamScanner-style "private folder" features
   usually work and is simpler than juggling N separate PINs.

## Android setup

### Prerequisites

- Node.js 18+ (this scaffold was built and installed against Node 18.20; anything ≥18 in
  the `react-native@0.73` support window works)
- JDK 17
- Android Studio with:
  - Android SDK Platform 34
  - Android SDK Build-Tools 34.0.0
  - An emulator, **or** a physical device with USB debugging enabled (`adb devices`
    should list it)
- `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) pointing at your SDK install

### Install & run

```bash
npm install
npx react-native run-android
```

`run-android` builds the debug APK, installs it on whatever device/emulator `adb`
sees, and starts Metro. For subsequent runs you can just do:

```bash
npx react-native start   # Metro, in one terminal
npx react-native run-android   # in another
```

### Permissions

`AndroidManifest.xml` declares `CAMERA` and the camera hardware features. The document
scanner plugin uses Google Play Services' ML Kit Document Scanner activity, which
handles its own runtime permission prompt — you don't need to add a manual
`PermissionsAndroid.request(CAMERA)` call before invoking it.

### Release build

Standard RN release flow — generate a signing key, configure it in
`android/gradle.properties` / `android/app/build.gradle`, then:

```bash
cd android
./gradlew assembleRelease
```

The signed APK lands in `android/app/build/outputs/apk/release/`.

## Ads

`src/components/AdBanner.tsx` is a placeholder — a dashed-border box reserving a
320×50 slot. Swap its contents for a real `BannerAd` from
`react-native-google-mobile-ads` (or your ad SDK of choice) once you have AdMob unit
IDs; the layout won't shift when you do.

## In-app purchase

`src/screens/UpgradeProScreen.tsx` is a placeholder paywall — the "Upgrade" button
shows a stub alert. Wire it to `react-native-iap` / RevenueCat / your billing
integration of choice.

## What's not built yet

- iOS: the Xcode project scaffold exists (`ios/`), but `pod install` wasn't run in
  this environment (no CocoaPods on the Windows dev machine this was scaffolded on)
  and the flows above haven't been exercised on iOS. `react-native-document-scanner-plugin`
  and ML Kit text recognition both support iOS, so it should mostly be a
  `cd ios && pod install` away, but budget time to verify.
- No automated tests were added for the scan/save/export pipeline.
