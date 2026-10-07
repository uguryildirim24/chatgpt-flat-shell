#!/bin/zsh
# Remove the launcher app and put the normal ChatGPT back in its Dock slot.
# ChatGPT itself was never modified; just open it normally.
set -euo pipefail
ROOT="${0:A:h}"

# Swap the Dock tile back (only if the Flat tile is there).
TMP="$(mktemp -t chatgpt-dock)"
defaults export com.apple.dock - | python3 -c '
import plistlib, sys
d = plistlib.loads(sys.stdin.buffer.read())
changed = False
for tile in d.get("persistent-apps", []):
    td = tile.get("tile-data", {})
    if td.get("bundle-identifier") == "local.rolf.chatgpt-flat-shell":
        td.pop("book", None)
        td["file-label"] = "ChatGPT"
        td["bundle-identifier"] = "com.openai.codex"
        td["file-data"] = {"_CFURLString": "file:///Applications/ChatGPT.app/", "_CFURLStringType": 15}
        changed = True
sys.stdout.buffer.write(plistlib.dumps(d, fmt=plistlib.FMT_BINARY))
sys.exit(0 if changed else 3)
' > "$TMP" && { defaults import com.apple.dock "$TMP"; killall Dock; echo "Dock: ChatGPT restored."; } || true
rm -f "$TMP"

rm -rf "$HOME/Applications/ChatGPT Flat.app" "$ROOT/build"
echo "Removed ~/Applications/ChatGPT Flat.app. Quit ChatGPT and open it normally to get the stock layout."
