#!/bin/zsh
# Build the launcher helper and create ~/Applications/ChatGPT Flat.app.
# Nothing in /Applications/ChatGPT.app is touched. Re-run after moving this folder.
set -euo pipefail

ROOT="${0:A:h}"
APP_NAME="ChatGPT Flat"
DEST="$HOME/Applications/$APP_NAME.app"
TARGET_APP="${CHATGPT_APP:-/Applications/ChatGPT.app}"

# Prefer fnm's default alias (survives node upgrades), else whatever node is on PATH.
NODE="$HOME/.local/share/fnm/aliases/default/bin/node"
[[ -x "$NODE" ]] || NODE="$(command -v node || true)"
[[ -x "$NODE" ]] || { echo "node not found" >&2; exit 1; }

mkdir -p "$ROOT/build"
xcrun clang -O2 -Wall -o "$ROOT/build/spawn-disclaimed" "$ROOT/src/spawn-disclaimed.c"

# Same icon as ChatGPT: its asset-catalog icon, with the .icns as fallback.
ICON_NAME="$(defaults read "$TARGET_APP/Contents/Info.plist" CFBundleIconName 2>/dev/null || echo Icon)"

rm -rf "$DEST"
mkdir -p "$DEST/Contents/MacOS" "$DEST/Contents/Resources"

cat > "$DEST/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>local.rolf.chatgpt-flat-shell</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>chatgpt.icns</string>
  <key>CFBundleIconName</key><string>$ICON_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

cat > "$DEST/Contents/MacOS/launch" <<SH
#!/bin/zsh
exec "$NODE" "$ROOT/src/launch.mjs" --app "$TARGET_APP" "\$@"
SH
chmod +x "$DEST/Contents/MacOS/launch"

# Use the same icon file ChatGPT declares for itself.
ICON="$(defaults read "$TARGET_APP/Contents/Info.plist" CFBundleIconFile)"
[[ "$ICON" == *.icns ]] || ICON="$ICON.icns"
ln -sf "$TARGET_APP/Contents/Resources/$ICON" "$DEST/Contents/Resources/chatgpt.icns"
ln -sf "$TARGET_APP/Contents/Resources/Assets.car" "$DEST/Contents/Resources/Assets.car"
codesign --force --sign - "$DEST" >/dev/null 2>&1 || true

echo "Installed: $DEST"
echo "Launch it instead of ChatGPT.app to get the flat shell."
