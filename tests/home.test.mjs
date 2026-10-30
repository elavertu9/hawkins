// The home page on desktop and phone.
import { BASE, open } from "./lib.mjs";

const { send, ev, go, sleep, check, shot, errors, finish } = await open();
for (const [w, h, mobile, label] of [[1280, 1000, false, "desktop"], [390, 844, true, "mobile"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await go("/");
  await ev("document.querySelector('.files').scrollIntoView()"); await sleep(300);
  check(`${label}: no overflow`, await ev("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
  await shot(`files-${label}`);
}
check(`JS errors: ${errors.length}`, errors.length === 0);
finish();
