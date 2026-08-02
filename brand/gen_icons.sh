#!/usr/bin/env bash
# Regenerate SoloMD app and Markdown document icons from the SVG masters.
set -euo pipefail

BRAND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$BRAND_DIR/.." && pwd)"
ICON_DIR="$REPO_DIR/app/src-tauri/icons"

command -v magick >/dev/null
command -v iconutil >/dev/null

# App icon: Tauri creates the cross-platform matrix, then the macOS helper
# applies the platform-specific safe area and continuous-corner mask.
magick -background none "$BRAND_DIR/solomd-mark.svg" -resize 1024x1024 -depth 8 -strip \
  "$BRAND_DIR/solomd_icon_fullbleed.png"
magick "$BRAND_DIR/solomd_icon_fullbleed.png" -alpha off -depth 8 -strip \
  "$REPO_DIR/app-store/icon-1024.png"
(
  cd "$REPO_DIR/app"
  pnpm tauri icon ../brand/solomd_icon_fullbleed.png --output src-tauri/icons
)
"$REPO_DIR/scripts/gen-mac-icon.sh"

# Tauri's mobile generators can skip pre-existing native project assets. Make
# the checked-in iOS and Android matrices deterministic as a final pass.
for target in "$ICON_DIR"/ios/AppIcon-*.png; do
  read -r width height < <(magick identify -format '%w %h\n' "$target")
  magick "$BRAND_DIR/solomd_icon_fullbleed.png" -resize "${width}x${height}!" \
    -depth 8 -strip "$target"
done

# When the native mobile projects already exist locally, keep the assets they
# compile in sync as well. These directories are generated/ignored, so this is
# intentionally conditional and does not make them release sources of truth.
APPLE_APPICON_DIR="$REPO_DIR/app/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"
if [[ -d "$APPLE_APPICON_DIR" ]]; then
  cp "$ICON_DIR"/ios/AppIcon-*.png "$APPLE_APPICON_DIR/"
fi

for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r density launcher foreground <<< "$spec"
  android_dir="$ICON_DIR/android/mipmap-$density"
  magick "$BRAND_DIR/solomd_icon_fullbleed.png" -resize "${launcher}x${launcher}!" -depth 8 -strip \
    "$android_dir/ic_launcher.png"
  half=$((launcher / 2))
  magick "$BRAND_DIR/solomd_icon_fullbleed.png" -resize "${launcher}x${launcher}!" \
    \( -size "${launcher}x${launcher}" xc:none -fill white \
       -draw "circle $half,$half $half,0" \) \
    -alpha off -compose CopyOpacity -composite -depth 8 -strip "$android_dir/ic_launcher_round.png"
  magick "$BRAND_DIR/solomd_icon_fullbleed.png" -resize "${foreground}x${foreground}!" -depth 8 -strip \
    "$android_dir/ic_launcher_foreground.png"
done

ANDROID_RES_DIR="$REPO_DIR/app/src-tauri/gen/android/app/src/main/res"
if [[ -d "$ANDROID_RES_DIR" ]]; then
  for density in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    cp "$ICON_DIR/android/mipmap-$density"/ic_launcher*.png \
      "$ANDROID_RES_DIR/mipmap-$density/"
  done
fi

# Document icon: keep transparent padding so Finder and Explorer can add their
# own selection/background treatment without a visible square.
for size in 32 64 128 256 512 1024; do
  magick -background none "$BRAND_DIR/file_icon.svg" -resize "${size}x${size}" -depth 8 -strip \
    "$BRAND_DIR/file_icon_${size}.png"
done

ICONSET="$BRAND_DIR/file_icon.iconset"
mkdir -p "$ICONSET"
cp "$BRAND_DIR/file_icon_32.png" "$ICONSET/icon_16x16@2x.png"
cp "$BRAND_DIR/file_icon_32.png" "$ICONSET/icon_32x32.png"
magick "$BRAND_DIR/file_icon_1024.png" -resize 16x16 "$ICONSET/icon_16x16.png"
cp "$BRAND_DIR/file_icon_64.png" "$ICONSET/icon_32x32@2x.png"
cp "$BRAND_DIR/file_icon_128.png" "$ICONSET/icon_128x128.png"
cp "$BRAND_DIR/file_icon_256.png" "$ICONSET/icon_128x128@2x.png"
cp "$BRAND_DIR/file_icon_256.png" "$ICONSET/icon_256x256.png"
cp "$BRAND_DIR/file_icon_512.png" "$ICONSET/icon_256x256@2x.png"
cp "$BRAND_DIR/file_icon_512.png" "$ICONSET/icon_512x512.png"
cp "$BRAND_DIR/file_icon_1024.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$BRAND_DIR/file_icon.icns"

magick "$BRAND_DIR/file_icon_256.png" \
  -define icon:auto-resize=256,128,64,48,32,16 "$BRAND_DIR/file_icon.ico"
cp "$BRAND_DIR/file_icon_256.png" "$ICON_DIR/file_icon.png"
cp "$BRAND_DIR/file_icon.icns" "$ICON_DIR/file_icon.icns"
cp "$BRAND_DIR/file_icon.ico" "$ICON_DIR/file_icon.ico"

echo "Regenerated SoloMD app and document icon families."
