#!/usr/bin/env node
// Launch ChatGPT.app with a private DevTools pipe and keep flat-shell.css
// applied to its own UI windows. Nothing inside /Applications is modified.
//
//   node src/launch.mjs [--app /Applications/ChatGPT.app] [--css flat-shell.css] [--no-watch] [--dump]
//
// The CSS file is watched; saving it restyles open windows immediately.
// Ctrl+Option+Cmd+F inside the app toggles the override on and off.

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const appPath = opt("--app", "/Applications/ChatGPT.app");
const cssPath = path.resolve(opt("--css", path.join(root, "flat-shell.css")));
const watch = !args.includes("--no-watch");
const helper = path.join(root, "build", "spawn-disclaimed");
const logPath = path.join(os.homedir(), "Library", "Logs", "chatgpt-flat-shell.log");

const log = (...m) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${m.join(" ")}\n`);

function appExecutable() {
  const plist = path.join(appPath, "Contents", "Info.plist");
  const exe = execFileSync("/usr/bin/defaults", ["read", plist, "CFBundleExecutable"]).toString().trim();
  return path.join(appPath, "Contents", "MacOS", exe);
}

function isRunning(exe, argsPattern = "( |$)") {
  // Match the app's main process (not its helpers), optionally with given args.
  const pattern = `^${exe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${argsPattern}`;
  try {
    execFileSync("/usr/bin/pgrep", ["-f", pattern], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function osa(script) {
  return execFileSync("/usr/bin/osascript", ["-e", script]).toString().trim();
}

async function ensureNotRunning(exe) {
  if (!isRunning(exe)) return;
  const bundleId = execFileSync("/usr/bin/defaults", ["read", path.join(appPath, "Contents", "Info.plist"), "CFBundleIdentifier"]).toString().trim();
  // Already running flat (e.g. a second click on the Dock icon): bring it forward.
  // `open` on a running app sends a reopen event, so a closed window comes back.
  if (isRunning(exe, " --remote-debugging-pipe")) {
    execFileSync("/usr/bin/open", ["-b", bundleId]);
    process.exit(0);
  }
  let answer = "";
  try {
    answer = osa(
      'display dialog "ChatGPT is already running without the flat shell. Quit it and relaunch?" ' +
        'buttons {"Cancel", "Relaunch"} default button "Relaunch" with title "ChatGPT Flat Shell"',
    );
  } catch {
    process.exit(0); // Cancel
  }
  if (!answer.includes("Relaunch")) process.exit(0);
  osa(`tell application id "${bundleId}" to quit`);
  for (let i = 0; i < 100 && isRunning(exe); i++) await new Promise((r) => setTimeout(r, 200));
  if (isRunning(exe)) {
    osa('display notification "ChatGPT did not quit in time." with title "ChatGPT Flat Shell"');
    process.exit(1);
  }
}

// ---------------------------------------------------------------- page side

// Runs in every new document of the app's own windows before its scripts.
// Must stay self-contained: it is serialized into the page.
function pageInstaller(css, enabledByDefault) {
  const own = !/^(https?|about|data|blob|devtools|chrome|chrome-extension|file):$/.test(location.protocol);
  if (!own) return;
  const KEY = "__flatShell";
  const state = (window[KEY] = window[KEY] || {});
  if (!state.sheet) {
    state.sheet = new CSSStyleSheet();
    state.enabled = enabledByDefault;
    const attach = () => {
      if (!document.adoptedStyleSheets.includes(state.sheet)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, state.sheet];
      }
    };
    attach();
    // Re-attach if the app ever replaces adoptedStyleSheets wholesale.
    state.timer = setInterval(attach, 2000);
    const mark = () => document.documentElement?.toggleAttribute("data-flat-shell", state.enabled);
    state.mark = mark;
    mark();
    document.addEventListener("readystatechange", mark);
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.ctrlKey && e.altKey && e.metaKey && e.code === "KeyF") {
          e.preventDefault();
          state.enabled = !state.enabled;
          state.sheet.disabled = !state.enabled;
          mark();
        }
      },
      true,
    );
  }
  state.sheet.replaceSync(css);
  state.sheet.disabled = !state.enabled;
  state.mark?.();
}

// ---------------------------------------------------------------- CDP over pipe

class PipeCDP {
  constructor(writable, readable) {
    this.w = writable;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    let buf = "";
    readable.setEncoding("utf8");
    readable.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\0")) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (raw) this.#dispatch(JSON.parse(raw));
      }
    });
  }
  #dispatch(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of this.handlers.get(msg.method) || []) fn(msg.params, msg.sessionId);
    }
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.w.write(JSON.stringify(msg) + "\0");
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

// ---------------------------------------------------------------- main

const exe = appExecutable();
if (!fs.existsSync(helper)) {
  console.error(`missing ${helper}; run ./install.sh first`);
  process.exit(1);
}
await ensureNotRunning(exe);

const out = fs.openSync(logPath, "a");
const child = spawn(helper, [exe, "--remote-debugging-pipe"], {
  stdio: ["ignore", out, out, "pipe", "pipe"],
});
log(`launched ${exe} pid=${child.pid}`);
child.on("exit", (code, sig) => {
  log(`app exited code=${code} sig=${sig}`);
  process.exit(0);
});
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => child.kill(s));

const cdp = new PipeCDP(child.stdio[3], child.stdio[4]);

const readCss = () => fs.readFileSync(cssPath, "utf8");
let css = readCss();
const sessions = new Map(); // sessionId -> { scriptId }
const script = () => `(${pageInstaller})(${JSON.stringify(css)}, true);`;

async function prepare(sessionId) {
  const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: script() }, sessionId);
  sessions.set(sessionId, { scriptId: identifier });
  await cdp.send("Runtime.evaluate", { expression: script() }, sessionId).catch(() => {});
}

cdp.on("Target.attachedToTarget", async ({ sessionId, targetInfo, waitingForDebugger }) => {
  log(`attached ${targetInfo.type} ${targetInfo.url}`);
  try {
    if (targetInfo.type === "page") {
      await cdp.send("Page.enable", {}, sessionId).catch(() => {});
      await prepare(sessionId);
      log(`styled ${targetInfo.url || "(new page)"}`);
    }
  } catch (e) {
    log(`attach ${targetInfo.url}: ${e.message}`);
  } finally {
    if (waitingForDebugger) await cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
  }
});
cdp.on("Target.detachedFromTarget", ({ sessionId }) => sessions.delete(sessionId));

const attached = new Set(); // targetIds
cdp.on("Target.attachedToTarget", ({ targetInfo }) => attached.add(targetInfo.targetId));
cdp.on("Target.detachedFromTarget", ({ targetId }) => targetId && attached.delete(targetId));
const attachPage = (info) => {
  if (info.type !== "page" || info.attached || attached.has(info.targetId)) return;
  attached.add(info.targetId);
  cdp.send("Target.attachToTarget", { targetId: info.targetId, flatten: true }).catch((e) => log(`attachToTarget: ${e.message}`));
};
cdp.on("Target.targetCreated", ({ targetInfo }) => attachPage(targetInfo));

await cdp.send("Target.setDiscoverTargets", { discover: true });
const { targetInfos } = await cdp.send("Target.getTargets");
log(`cdp connected; targets: ${targetInfos.map((t) => `${t.type}:${t.url}`).join(", ") || "none yet"}`);
targetInfos.forEach(attachPage);

if (args.includes("--dump")) {
  // Dev only: drop files into .dev/ to eval JS (eval.js), send raw CDP
  // (cdp.json) or capture page screenshots (shot.req). Never used by the app.
  const dir = path.join(root, ".dev");
  fs.mkdirSync(dir, { recursive: true });
  const req = path.join(dir, "eval.js");
  fs.watchFile(req, { interval: 300 }, async () => {
    if (!fs.existsSync(req)) return;
    const expr = fs.readFileSync(req, "utf8");
    const results = [];
    for (const sid of sessions.keys()) {
      const r = await cdp
        .send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sid)
        .catch((e) => ({ error: e.message }));
      results.push({ sid, value: r.result?.value ?? r.exceptionDetails?.text ?? r.error ?? r.result?.description });
    }
    fs.writeFileSync(path.join(dir, "eval.out.json"), JSON.stringify(results, null, 2));
  });
  // {"method": "...", "params": {...}} sent to the main window's session.
  const raw = path.join(dir, "cdp.json");
  fs.watchFile(raw, { interval: 300 }, async () => {
    if (!fs.existsSync(raw)) return;
    const { method, params } = JSON.parse(fs.readFileSync(raw, "utf8"));
    const sid = sessions.keys().next().value;
    const r = await cdp.send(method, params, sid).catch((e) => ({ error: e.message }));
    fs.writeFileSync(path.join(dir, "cdp.out.json"), JSON.stringify(r, null, 2));
  });
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  const shot = path.join(dir, "shot.req");
  fs.watchFile(shot, { interval: 300 }, async () => {
    if (!fs.existsSync(shot)) return;
    let n = 0;
    for (const sid of sessions.keys()) {
      const r = await withTimeout(cdp.send("Page.captureScreenshot", { format: "png" }, sid).catch(() => null), 1500);
      if (r?.data) fs.writeFileSync(path.join(dir, `shot-${n++}.png`), Buffer.from(r.data, "base64"));
    }
    fs.rmSync(shot);
  });
}

if (watch) {
  // Polling survives editors that save by replacing the file.
  let t;
  fs.watchFile(cssPath, { interval: 400 }, () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      try {
        css = readCss();
      } catch {
        return;
      }
      for (const [sid, s] of sessions) {
        await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: s.scriptId }, sid).catch(() => {});
        await prepare(sid).catch(() => {});
      }
      log("css reloaded");
    }, 100);
  });
}
