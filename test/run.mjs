// Loads the extension into a headless Firefox, opens each test page in light
// and dark mode, and checks whether dark-mofo darkened it. Screenshots land in
// test/out/. Run: npm --prefix test install && node test/run.mjs

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const extension = join(here, "..", "extension");
const out = join(here, "out");
const FIREFOX = process.env.FIREFOX ?? "/Applications/Firefox.app";
const UUID = "da4c0f00-0000-4000-8000-000000000001";

// Each page gets its own *.localhost host, because dark-mofo remembers verdicts per host.
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(here, "pages", req.url.split("?")[0]));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;
const url = (name) => `http://${name}.localhost:${port}/${name}.html`;

// [page, expected in dark mode]; nothing is ever darkened in light mode.
const cases = [
  ["light", true],
  ["header", true],
  ["native", false],
  ["scheme", false],
  ["darkonly", false],
];

async function launch(dark) {
  const profile = await mkdtemp(join(tmpdir(), "dark-mofo-"));
  const prefs = {
    "remote.prefs.recommended": true,
    "browser.shell.checkDefaultBrowser": false,
    "layout.css.prefers-color-scheme.content-override": dark ? 0 : 1,
    "extensions.webextensions.uuids": JSON.stringify({ "dark-mofo@thapar.local": UUID }),
  };
  await writeFile(
    join(profile, "user.js"),
    Object.entries(prefs)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join("\n"),
  );
  const debugPort = 9300 + Math.floor(Math.random() * 600);
  // Launched through LaunchServices: some sandboxed shells can't start Firefox directly.
  execFile("open", [
    "-n",
    "-a",
    FIREFOX,
    "--args",
    "--headless",
    "--no-remote",
    "--profile",
    profile,
    "--remote-debugging-port",
    String(debugPort),
    // Lets the test open the extension's own pages, which WebDriver can't navigate to.
    "--remote-allow-system-access",
  ]);
  for (let i = 0; i < 60; i++) {
    try {
      return await puppeteer.connect({
        browserWSEndpoint: `ws://127.0.0.1:${debugPort}/session`,
        protocol: "webDriverBiDi",
      });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Firefox did not start");
}

// Opens a moz-extension:// page from Firefox's chrome, then returns it as a puppeteer page.
async function openExtensionPage(browser, path) {
  const target = `moz-extension://${UUID}/${path}`;
  const {
    result: { contexts },
  } = await browser.connection.send("browsingContext.getTree", { "moz:scope": "chrome" });
  await browser.connection.send("script.evaluate", {
    expression: `gBrowser.selectedTab = gBrowser.addTab(${JSON.stringify(target)}, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() })`,
    target: { context: contexts[0].context },
    awaitPromise: false,
  });
  for (let i = 0; i < 40; i++) {
    // puppeteer doesn't see the navigation, so ask each page where it is.
    for (const page of await browser.pages()) {
      if ((await page.evaluate(() => location.href).catch(() => "")) === target) return page;
    }
    await sleep(250);
  }
  throw new Error(`could not open ${target}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const darkened = (page) =>
  page.evaluate(() => document.documentElement.hasAttribute("data-dark-mofo"));
let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: got ${actual}, expected ${expected}`);
}

await mkdir(out, { recursive: true });

for (const dark of [true, false]) {
  const scheme = dark ? "dark" : "light";
  const browser = await launch(dark);
  try {
    await browser.installExtension(extension);
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });

    for (const [name, expected] of cases) {
      await page.goto(url(name), { waitUntil: "load" });
      await sleep(300);
      check(`${scheme} ${name}`, await darkened(page), dark && expected);
      await page.screenshot({ path: join(out, `${scheme}-${name}.png`) });
    }

    // A site that turns on its own dark theme after loading gets the filter removed.
    await page.goto(url("toggle"), { waitUntil: "load" });
    await sleep(300);
    check(`${scheme} toggle before`, await darkened(page), dark);
    await sleep(1800);
    check(`${scheme} toggle after`, await darkened(page), false);

    if (dark) {
      // Per-site overrides and the global switch, set from an extension page.
      const ext = await openExtensionPage(browser, "popup/popup.html");
      await sleep(300);
      const store = (value) => ext.evaluate((v) => browser.storage.local.set(v), value);

      await store({ sites: { "light.localhost": "off", "darkonly.localhost": "dark" } });
      await page.bringToFront();
      await page.goto(url("light"), { waitUntil: "load" });
      await sleep(300);
      check("override off light", await darkened(page), false);
      await page.goto(url("darkonly"), { waitUntil: "load" });
      await sleep(300);
      check("override dark darkonly", await darkened(page), true);

      await store({ sites: {}, enabled: false });
      await sleep(300);
      check("disabled darkonly", await darkened(page), false);

      // The popup asks the page's content script for its state.
      await store({ enabled: true });
      await page.goto(url("light"), { waitUntil: "load" });
      await sleep(300);
      const status = await ext.evaluate(async () => {
        const [tab] = await browser.tabs.query({ url: "*://light.localhost/*" });
        return browser.tabs.sendMessage(tab.id, { type: "status" });
      });
      check("status message", status?.state, "darkened");

      // Cached verdict: a remembered site is darkened before load finishes.
      await page.goto(url("light"), { waitUntil: "domcontentloaded" });
      check("cached light at DOMContentLoaded", await darkened(page), true);
    }
  } finally {
    // Also on failure, or the headless Firefox outlives the test.
    await browser.close().catch(() => {});
  }
}

server.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
