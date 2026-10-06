// Opens the page in headless Chromium and checks the worm behaves:
// no errors, body stays intact, it finds food, and reflexes fire.
// Run: npm install && npm test
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const page_url = "file://" + path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.html");
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(page_url);

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed += 1;
}

const body = () =>
  page.evaluate(() => {
    const w = sim.worm;
    let length = 0;
    let finite = true;
    for (let i = 0; i < w.n; i += 1) finite &&= Number.isFinite(w.x[i]) && Number.isFinite(w.y[i]);
    for (const l of w.len) length += l;
    return { length, finite, rest: w.restLength * (w.n - 1), state: sim.brain.state };
  });

// 1. Seek food at several spots, including one behind the worm.
for (const [x, y] of [[150, 320], [820, 140], [600, 540]]) {
  await page.mouse.move(x, y, { steps: 2 });
  const start = Date.now();
  let b;
  do {
    await page.waitForTimeout(200);
    b = await body();
    if (!b.finite || Math.abs(b.length / b.rest - 1) > 0.35) break;
  } while (b.state !== "forage" && Date.now() - start < 25000);
  check(`reaches food at ${x},${y}`, b.state === "forage", `${((Date.now() - start) / 1000).toFixed(1)}s`);
  check("body intact", b.finite && Math.abs(b.length / b.rest - 1) < 0.35, `length ${b.length.toFixed(0)} / ${b.rest}`);
}

// 2. Poking the head triggers the withdrawal reflex.
const [hx, hy] = await page.evaluate(() => [sim.worm.x[1], sim.worm.y[1]]);
await page.mouse.click(hx, hy);
await page.waitForTimeout(150);
const after = await body();
check("head poke -> withdraw", after.state === "withdraw");
check("withdraw shortens body", after.length < after.rest * 0.92, `length ${after.length.toFixed(0)}`);

// 3. Cursor leaving the window -> back to exploring.
await page.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })));
await page.waitForTimeout(2500);
check("cursor leaves -> explore", (await body()).state === "explore");

check("no page errors", errors.length === 0, errors.join("; "));
await browser.close();
process.exit(failed ? 1 : 0);
