// Shared setup for the browser tests: starts headless Chrome, connects over the
// DevTools protocol, and gives each test a few helpers. Run the tests through
// tests/run.sh, which builds the site and serves it first.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BASE = process.env.HAWKINS_URL || "http://127.0.0.1:4123";
export const SHOTS = process.env.SHOTS_DIR || join(ROOT, "tests", ".shots");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// GitHub's Ubuntu runners don't allow Chrome's sandbox.
const SANDBOX = process.env.CI ? ["--no-sandbox"] : [];
// Act like a computer with a mouse everywhere. Headless Chrome on a Mac reports
// one, but on Linux (GitHub's machines) it reports none, which changes how the
// site behaves (+ Plan buttons show without hovering).
const MOUSE = "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2";

// The clearance code, for the classified tests. It lives in the gitignored
// .classified-code, never in a test.
const CODE_FILE = join(ROOT, ".classified-code");
export const CODE = existsSync(CODE_FILE) ? readFileSync(CODE_FILE, "utf8").split("\n")[0].trim() : null;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open() {
  mkdirSync(SHOTS, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "hawkins-test-"));
  // Port 0 lets Chrome pick a free port and write it to DevToolsActivePort.
  const chrome = spawn(CHROME, [
    // Muted, so timers the tests start never beep through your speakers.
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio", MOUSE, "--remote-debugging-port=0", ...SANDBOX,
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  // Never leave Chrome running behind us: not when a test throws, and not when
  // the run is stopped (Ctrl+C, a timeout).
  process.on("exit", () => chrome.kill());
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
  process.on("unhandledRejection", (error) => { console.error(error); process.exit(1); });

  // Up to 30 seconds: a busy CI machine running two at once can be slow to start one.
  let wsUrl;
  for (let i = 0; i < 300 && !wsUrl; i++) {
    await sleep(100);
    try {
      const port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())
        .find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) { chrome.kill(); throw new Error(`Couldn't start Chrome at ${CHROME}`); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  let onLoad = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description);
    if (m.method === "Page.loadEventFired") { const fns = onLoad; onLoad = []; fns.forEach((fn) => fn()); }
  });

  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result.value;
  // Opens a page and waits for it to load (or 5 s, for a same-page #hash change).
  const go = async (path) => {
    const loaded = new Promise((r) => { onLoad.push(r); setTimeout(r, 5000); });
    await send("Page.navigate", { url: BASE + path });
    await loaded;
    await sleep(250); // let deferred scripts settle
  };
  // Waits until a page expression is truthy (or the timeout passes), and returns its value.
  const until = async (expression, timeout = 3000) => {
    const end = Date.now() + timeout;
    let value;
    while (!(value = await ev(expression)) && Date.now() < end) await sleep(50);
    return value;
  };

  let failed = 0;
  const check = (label, ok) => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", label); };
  const shot = async (name) => {
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, "base64"));
  };
  // Ends the test: exit code 1 if any check failed, so run.sh can count it.
  const finish = () => { ws.close(); chrome.kill(); process.exit(failed ? 1 : 0); };

  await send("Page.enable");
  await send("Runtime.enable");
  return { send, ev, q: ev, go, until, sleep, check, shot, errors, finish };
}
