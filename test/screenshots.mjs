// Takes the README screenshots in docs/screenshots/ with Dark Mofo loaded into a
// headless Firefox in dark mode. Uses live sites, so it needs the network.
// Run: npm --prefix test install && node test/screenshots.mjs

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const extension = join(here, "..", "extension");
const out = join(here, "..", "docs", "screenshots");
const FIREFOX = process.env.FIREFOX ?? "/Applications/Firefox.app";
const UUID = "da4c0f00-0000-4000-8000-000000000001";
const LIGHT_SITE = "https://news.ycombinator.com/";
const NATIVE_SITE = "https://docs.python.org/3/";
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = await mkdtemp(join(tmpdir(), "dark-mofo-shots-"));
  const prefs = {
    "remote.prefs.recommended": true,
    "browser.shell.checkDefaultBrowser": false,
    "layout.css.prefers-color-scheme.content-override": 0,
    "extensions.webextensions.uuids": JSON.stringify({ "dark-mofo@thapar.local": UUID }),
  };
  await writeFile(
    join(profile, "user.js"),
    Object.entries(prefs)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join("\n"),
  );
  const debugPort = 9300 + Math.floor(Math.random() * 600);
  // Same launch as run.mjs: through LaunchServices, with system access for moz-extension:// pages.
  execFile("open", [
    "-n", "-a", FIREFOX, "--args", "--headless", "--no-remote",
    "--profile", profile, "--remote-debugging-port", String(debugPort),
    "--remote-allow-system-access",
  ]);
  for (let i = 0; i < 60; i++) {
    try {
      return await puppeteer.connect({
        browserWSEndpoint: `ws://127.0.0.1:${debugPort}/session`,
        protocol: "webDriverBiDi",
      });
    } catch {
      await sleep(500);
    }
  }
  throw new Error("Firefox did not start");
}

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
    for (const page of await browser.pages()) {
      if ((await page.evaluate(() => location.href).catch(() => "")) === target) return page;
    }
    await sleep(250);
  }
  throw new Error(`could not open ${target}`);
}

await mkdir(out, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), "dark-mofo-shots-"));
const browser = await launch();
try {
  await browser.installExtension(extension);
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(LIGHT_SITE, { waitUntil: "load" });
  // The extension can take a moment to register its moz-extension:// host.
  let ext;
  for (let i = 0; !ext; i++) {
    ext = await openExtensionPage(browser, "popup/popup.html").catch((e) => {
      if (i === 3) throw e;
    });
  }
  await sleep(300);
  const store = (value) => ext.evaluate((v) => browser.storage.local.set(v), value);
  const shoot = async (url, path) => {
    await page.bringToFront();
    await page.goto(url, { waitUntil: "load" });
    await sleep(1500);
    await page.screenshot({ path });
  };

  await store({ enabled: false });
  await shoot(LIGHT_SITE, join(out, "light-site-before.png"));
  await store({ enabled: true });
  await shoot(LIGHT_SITE, join(out, "light-site-after.png"));
  await shoot(NATIVE_SITE, join(out, "native-dark-site.png"));

  // The popup, as it opens over the darkened light site. Opened as a tab, it
  // would ask about itself, so point its active-tab query at the site's tab.
  // Privileged pages can't be screenshotted over WebDriver, so the rendered
  // markup is copied into an ordinary page with the popup's stylesheet.
  await shoot(LIGHT_SITE, join(scratch, "backdrop.png"));
  await store({ sites: { "docs.python.org": "off", "example.com": "dark" } });
  const markup = await ext.evaluate(async (host) => {
    const [tab] = await browser.tabs.query({ url: `*://${host}/*` });
    browser.tabs.query = async () => [tab];
    await render();
    for (const input of document.querySelectorAll("input")) {
      if (input.checked) input.setAttribute("checked", "");
    }
    for (const s of document.querySelectorAll("script")) s.remove();
    return document.body.outerHTML;
  }, new URL(LIGHT_SITE).host);
  const css = await readFile(join(extension, "popup", "popup.css"), "utf8");
  const logo = (await readFile(join(extension, "icons", "logo.svg"))).toString("base64");
  await page.setViewport({ width: 328, height: 300, deviceScaleFactor: 2 });
  await page.goto("about:blank");
  await page.setContent(
    `<!doctype html><style>${css}</style>` +
      markup.replace("../icons/logo.svg", `data:image/svg+xml;base64,${logo}`),
  );
  await sleep(300);
  await (await page.$("body")).screenshot({ path: join(scratch, "popup.png") });
  await page.setViewport(VIEWPORT);

  // Compose the popup over the page, roughly where Firefox's panel opens.
  const [backdrop, popup] = await Promise.all(
    ["backdrop.png", "popup.png"].map(async (f) =>
      (await readFile(join(scratch, f))).toString("base64"),
    ),
  );
  await page.goto("about:blank");
  await page.setContent(`<!doctype html><style>
      body { margin: 0; position: relative; width: 1280px; height: 800px; overflow: hidden; }
      .bg { width: 1280px; height: 800px; display: block; }
      .popup { position: absolute; top: 8px; right: 16px; width: 328px; border-radius: 8px;
               box-shadow: 0 6px 24px rgba(0,0,0,.6); outline: 1px solid rgba(255,255,255,.15); }
    </style>
    <img class="bg" src="data:image/png;base64,${backdrop}">
    <img class="popup" src="data:image/png;base64,${popup}">`);
  await sleep(300);
  await page.screenshot({ path: join(out, "popup.png") });
} finally {
  await browser.close().catch(() => {});
}
console.log(`screenshots in ${out}`);
