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
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  let wsUrl;
  for (let i = 0; i < 100 && !wsUrl; i++) {
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
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description);
  });

  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result.value;
  const go = async (path) => { await send("Page.navigate", { url: BASE + path }); await sleep(1500); };

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
  return { send, ev, q: ev, go, sleep, check, shot, errors, finish };
}
