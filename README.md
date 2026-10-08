# chatgpt-flat-shell

A macOS launcher that injects CSS into the ChatGPT desktop app to flatten its window layout.

The CSS removes the outer gutter, rounded inset panel and shadow. It moves the
navigation rail to the bottom of the sidebar. The launcher does not edit
`/Applications/ChatGPT.app`. This is an independent customization, not an OpenAI
product.

## Requirements

- macOS.
- Node.js. The cleanup checks used v24.19.0.
- Xcode command-line tools with `clang`. Install them with
  `xcode-select --install` if needed.
- A separately installed ChatGPT desktop app that accepts
  `--remote-debugging-pipe`.

There are no npm dependencies, API keys, datasets or model downloads. Any account
requirements belong to the installed app.

## Run from a clean clone

Run these commands from the repository root:

```sh
node --version
xcrun --find clang
./install.sh
mkdir -p "$HOME/Library/Logs"
open "$HOME/Applications/ChatGPT Flat.app"
```

The installer builds `build/spawn-disclaimed` and creates
`~/Applications/ChatGPT Flat.app`. It prefers Node at
`~/.local/share/fnm/aliases/default/bin/node`, then uses Node on `PATH`. It links
ChatGPT's icon resources and attempts local signing. Signing errors are ignored
by the installer.

The generated launcher runs `src/launch.mjs` directly from this folder. Changes
here affect the next launch. Keep the folder in place. Rerun installation after
moving it or removing the recorded Node path. Installation replaces any existing
`~/Applications/ChatGPT Flat.app` without checking its identity.

For an app installed elsewhere:

```sh
CHATGPT_APP="/path/to/ChatGPT.app" ./install.sh
```

If ChatGPT is already running without the debugging pipe, the launcher asks
before quitting and relaunching it. Cancel leaves it running. A second launch
when the app already uses the pipe brings it forward.

- **Ctrl+Option+Cmd+F** toggles the stylesheet inside the app.
- Saving `flat-shell.css` refreshes attached pages.
- Starting ChatGPT normally does not apply the stylesheet.

To run directly after building the helper:

```sh
node src/launch.mjs --app /Applications/ChatGPT.app --css "$PWD/flat-shell.css" --no-watch
```

Supported options are `--app PATH`, `--css PATH`, `--no-watch` and `--dump`.
The defaults are `/Applications/ChatGPT.app`, this folder's `flat-shell.css`,
and live refresh enabled. There is no `--help` option.

## How it works

1. The C helper requests independent macOS process responsibility and starts the
   app with a DevTools pipe on file descriptors 3 and 4. No TCP port is opened.
2. The Node launcher attaches to page targets and registers a page-side installer
   for current and future documents.
3. The installer skips `http:`, `https:`, `about:`, `data:`, `blob:`, `devtools:`,
   `chrome:`, `chrome-extension:` and `file:` documents. It is not restricted to
   `app:` alone.
4. It adds the CSS as a constructed stylesheet and polls the CSS file for changes.

The launcher exits with status 0 when the app exits, even if the app failed.
The helper uses a private macOS API. Microphone, screen-recording and automation
permission behavior has not been checked end to end.

## Logs and development tools

Status messages and the app's own stdout and stderr go to
`~/Library/Logs/chatgpt-flat-shell.log`. Its parent directory must already exist.
Status lines include page URLs and DevTools error text. The log is append-only and
not rotated. Only run code and CSS you trust, since the DevTools pipe gives the
launcher access to app pages.

`--dump` enables the existing development tools in `.dev/`:

- `eval.js` is evaluated in attached pages. Results go to `eval.out.json`.
- `cdp.json` sends a raw DevTools command to the first attached session. Results
  go to `cdp.out.json`.
- `shot.req` requests screenshots as `shot-0.png`, `shot-1.png` and so on. The
  request file is removed after capture.

These tools can write conversation or account data. Do not publish their inputs
or outputs. `.dev/`, build output, logs, environment files and key files are
ignored. Environment variables come from the process; `.env` files are not loaded.
The log can contain page URLs and app output. Do not publish it.

## Limits and checks

App updates can break the DevTools connection, selectors or layout. The CSS uses
`data-*` hooks, custom properties and class substrings, including `_PageSurface_`.
A new window may briefly show the stock layout. The rail keeps a 1px width for
panel offsets, which can change after an app update.

Launching ChatGPT through its normal icon, login items or an update relaunch
bypasses the launcher. Quit it and reopen through `ChatGPT Flat.app`. The
relaunch prompt may need macOS automation permission.

During this scope review, Node and zsh syntax checks passed. The installer built
the native helper and created a launcher under a temporary `HOME` inside the
worktree. Its plist passed validation. Strict code-signature verification failed
with `invalid destination for symbolic link in bundle`. The installer still
reported success because it ignores signing errors. Generated artifacts were
removed.

The GUI launch and uninstaller were not run. No visual compatibility, toggle,
reload or permission result is claimed. No automated tests or CI are included.

## Undo

Quit ChatGPT first, then run:

```sh
./uninstall.sh
open /Applications/ChatGPT.app
```

The uninstaller tries to replace a matching Flat launcher Dock tile with the
normal ChatGPT tile. If it finds one, it imports the changed Dock preferences and
restarts the Dock. It also removes `~/Applications/ChatGPT Flat.app` and `build/`.
It leaves this repository, `.dev/`, logs and the ChatGPT app in place.

The Dock restoration uses `/Applications/ChatGPT.app`, even if installation used
`CHATGPT_APP`. Remove local diagnostics and logs separately after quitting. The
repository can be removed once the launcher is uninstalled.

## How this was built

AI coding agents did much of the implementation under Rolf's direction. This
publication cleanup removed generated output and updated the documentation. Rolf's original visual checks and implementation review are
not recorded here. The checks above do not establish full GUI compatibility.

## License

The repository's code is licensed under MIT. See `LICENSE`. This license does
not cover the separately installed ChatGPT app. No paper or preprint is included.
