# chatgpt-flat-shell

Removes the gray outer shell from the ChatGPT/Codex desktop app (2026 layout):
no perimeter padding, no inset rounded panel, no shadow, no separate full-width
gray titlebar band. The sidebar and main content reach the window edges, and
the left icon rail becomes a small toolbar at the bottom of the sidebar.

`/Applications/ChatGPT.app` is never modified. ChatGPT ships with ASAR
integrity checks and locked Electron fuses, so patching the bundle would
break its signature, its keychain access, and Sparkle updates.

## How it works

`ChatGPT Flat.app` (in `~/Applications`) runs `src/launch.mjs`, which:

1. starts the real ChatGPT binary with `--remote-debugging-pipe`, a private
   DevTools channel on file descriptors 3/4. No TCP port is opened.
2. spawns it through `build/spawn-disclaimed`, so ChatGPT stays its own
   "responsible process" and keeps its own microphone, screen and automation
   permissions, just as when you start it from the Dock.
3. attaches to each of the app's own windows (`app://` pages only) and adds
   `flat-shell.css` as a constructed stylesheet. Reloads get it before page
   scripts run; a brand-new window can flash the stock layout for a moment.
4. watches `flat-shell.css` and restyles open windows when you save it.

The launcher exits when ChatGPT quits.

## Use

```sh
./install.sh          # builds the helper, creates ~/Applications/ChatGPT Flat.app
open ~/Applications/ChatGPT\ Flat.app
```

If ChatGPT is already running, the launcher asks before quitting and
relaunching it.

- **Ctrl+Option+Cmd+F** in the app toggles the override on and off.
- Logs: `~/Library/Logs/chatgpt-flat-shell.log`
- Edit `flat-shell.css` while the app runs to tweak the look.

## What the CSS changes

| Stock shell | Flat shell |
|---|---|
| 4px gray gutter right and bottom, rounded panel with shadow | gone; main content is flush and square |
| gray band across the top | sidebar color over the sidebar, content color over the content |
| 52px icon rail left of the sidebar | horizontal toolbar at the bottom of the sidebar (Home, Space, Scheduled, Plugins, Explore, Code Review, profile menu with Settings) |
| sidebar closed: rail stays as a thin column | sidebar closed: nothing; use the sidebar toggle in the titlebar |

The selectors target the app's `data-app-shell-*` / `data-app-navigation-rail`
attributes and `--app-shell-*` variables, not hashed class names, so most
updates won't break them. If an update does, check the log for `styled ...`
lines and compare the attributes in a fresh DOM dump.

## Limits

- The layout only applies when ChatGPT is started through `ChatGPT Flat.app`.
  Starting it from the Dock, Spotlight, launch-at-login, or Sparkle's
  post-update relaunch gives the stock layout. Quit it and reopen through the
  launcher. `ChatGPT Flat` has replaced ChatGPT in the Dock (same slot, same
  icon); turn off ChatGPT's own launch at login if it's on.
- A ChatGPT started by the launcher doesn't appear as a separate running icon
  in the Dock. Clicking the Flat tile while it runs just brings ChatGPT
  forward (and reopens its window if it was closed).
- The app positions some panels (the "full view" tab layout) from the rail's
  measured width. The CSS keeps the rail box 1px wide so those panels sit
  flush with the window edge; if a panel ever starts at an odd offset after
  an update, that measurement is the first thing to check.

## Undo

```sh
./uninstall.sh        # removes the launcher app and build/
```

Then quit ChatGPT and open it normally. You can delete this folder afterwards.
