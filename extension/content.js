// Keeps the page in the colour scheme Firefox asks for (prefers-color-scheme,
// which follows the Firefox theme or macOS). A page that is already dark is
// left alone; a page that stays light when dark is wanted gets the filter from
// darken.css. Light is never forced: a dark-only site stays dark.

(() => {
  // Image, PDF and media documents have nothing to darken.
  if (!/^(text\/html|application\/xhtml\+xml|text\/plain)$/.test(document.contentType)) return;

  const ATTR = "data-dark-mofo";
  // Paints the canvas dark while the page can't be judged yet (see darken.css).
  const PENDING = "data-dark-mofo-pending";
  const DARK_LUMINANCE = 0.2; // below this a background reads as dark (#7f7f7f is ~0.21)
  const root = document.documentElement;
  const site = location.hostname || location.protocol; // file: pages share one entry
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");

  // enabled: global switch. sites[site]: "dark" (always darken) or "off" (never).
  // darkened[site]: auto mode darkened this site last time, so start dark on the
  // next visit instead of flashing white until the page has loaded.
  let settings = { enabled: true, sites: {}, darkened: {} };
  let state = "pending";
  let darkening = false;
  let settingsLoaded = false;
  let parsed = false; // DOMContentLoaded has fired

  // A blank page about to be judged starts dark when dark is wanted, so the
  // first paint isn't white. Settings aren't loaded yet; a site set to "off"
  // just shows a dark canvas for a few milliseconds.
  if (darkQuery.matches) root.toggleAttribute(PENDING, true);

  function setDarkening(on, why) {
    state = why;
    darkening = on;
    root.removeAttribute(PENDING);
    if (on !== root.hasAttribute(ATTR)) root.toggleAttribute(ATTR, on);
  }

  // --- Is the page already dark? -------------------------------------------

  function luminance([r, g, b]) {
    const lin = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function parseColor(value) {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { rgb: [r, g, b], alpha: a };
  }

  // What shows below <html>'s content. CSS paints <body>'s background over the
  // whole canvas when <html> has none, so a short page with a dark body is dark
  // all the way down. Otherwise it is Firefox's Canvas system colour for the
  // page's colour-scheme: a page declaring `color-scheme: light dark` with no
  // colours of its own is natively dark. Canvas is resolved with a probe.
  function canvasColor() {
    if (document.body) {
      const style = getComputedStyle(document.body);
      if (style.backgroundImage !== "none") return null;
      const body = parseColor(style.backgroundColor);
      if (body && body.alpha >= 0.5) return body.rgb;
    }
    const probe = document.createElement("dark-mofo-probe");
    probe.style.cssText = "display:none;background-color:Canvas";
    root.append(probe);
    const color = parseColor(getComputedStyle(probe).backgroundColor);
    probe.remove();
    return color?.rgb ?? null;
  }

  // Luminance of what is painted behind (x, y): the first opaque background up
  // the tree. Images and gradients are unknown (null), not guessed.
  function backgroundAt(x, y) {
    for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.backgroundImage !== "none") return null;
      const color = parseColor(style.backgroundColor);
      if (color && color.alpha >= 0.5) return luminance(color.rgb);
    }
    const canvas = canvasColor();
    return canvas && luminance(canvas);
  }

  // Samples a 3x3 grid over the viewport and lets the majority decide, so a
  // dark header on a white page, or a white card on a dark page, doesn't.
  // Returns null when it can't tell yet.
  function pageLooksDark() {
    if (!document.body || !innerWidth || !innerHeight) return null;
    let dark = 0;
    let light = 0;
    for (const fx of [0.1, 0.5, 0.9]) {
      for (const fy of [0.1, 0.5, 0.9]) {
        const lum = backgroundAt(fx * innerWidth, fy * innerHeight);
        if (lum === null) continue;
        lum < DARK_LUMINANCE ? dark++ : light++;
      }
    }
    if (dark === light) return null;
    return dark > light;
  }

  // The pending canvas is the page's own <html> background as far as
  // getComputedStyle is concerned, so it is lifted while measuring. Nothing
  // paints in between.
  function measure() {
    const pending = root.hasAttribute(PENDING);
    if (pending) root.removeAttribute(PENDING);
    const dark = pageLooksDark();
    if (pending && dark === null) root.setAttribute(PENDING, "");
    return dark;
  }

  // --- Deciding -------------------------------------------------------------

  function evaluate() {
    if (!settingsLoaded) return;
    const mode = settings.sites[site] ?? "auto";
    if (!settings.enabled) return setDarkening(false, "disabled");
    if (!darkQuery.matches) return setDarkening(false, "light-wanted");
    if (mode === "off") return setDarkening(false, "off");
    if (mode === "dark") return setDarkening(true, "forced");

    // The filter doesn't change computed styles, so this reads the page's own
    // colours even while it is being darkened.
    const dark = measure();
    if (dark === null) return;
    setDarkening(!dark, dark ? "native" : "darkened");
    remember(!dark);
  }

  async function remember(darkened) {
    if (!!settings.darkened[site] === darkened) return;
    // Updated here too, as the page is judged every frame while it loads.
    if (darkened) settings.darkened[site] = true;
    else delete settings.darkened[site];
    const { darkened: stored = {} } = await browser.storage.local.get("darkened");
    if (darkened) stored[site] = true;
    else delete stored[site];
    await browser.storage.local.set({ darkened: stored });
  }

  let pending = false;
  function scheduleEvaluate() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      evaluate();
    });
  }

  // While the page is parsing, judge it every frame. Animation frame callbacks
  // run right before paint, so the verdict lands in the frame where the content
  // first shows. Sites that load slow scripts before DOMContentLoaded (google.com)
  // were painted white for a few hundred milliseconds before this.
  function pollWhileParsing() {
    if (parsed) return;
    evaluate();
    requestAnimationFrame(pollWhileParsing);
  }

  // --- Wiring ---------------------------------------------------------------

  async function loadSettings() {
    const stored = await browser.storage.local.get(["enabled", "sites", "darkened"]);
    settings = {
      enabled: stored.enabled ?? true,
      sites: stored.sites ?? {},
      darkened: stored.darkened ?? {},
    };
    settingsLoaded = true;
  }

  loadSettings().then(() => {
    evaluate();
    // A page with no body yet can't be measured. Until it can, trust last
    // visit's verdict; if the site has since turned dark, the first
    // measurement removes the filter again.
    if (state === "pending" && settings.darkened[site]) setDarkening(true, "darkened");
    if (!parsed) requestAnimationFrame(pollWhileParsing);
  });

  function watch() {
    parsed = true;
    // A page that still can't be judged (background images everywhere) shows
    // as it is rather than staying dark.
    root.removeAttribute(PENDING);
    scheduleEvaluate();
    // Sites switch themes by changing attributes on <html> or <body>, and
    // single-page apps swap body content; both can change the verdict.
    // This also restores our attribute if the page rewrites <html>'s attributes.
    const observer = new MutationObserver((records) => {
      if (records.every((r) => r.attributeName === PENDING ||
          (r.attributeName === ATTR && root.hasAttribute(ATTR) === darkening))) return;
      scheduleEvaluate();
    });
    observer.observe(root, { attributes: true });
    if (document.body) observer.observe(document.body, { attributes: true, childList: true });
  }
  // Firefox also injects into tabs already open when dark-mofo is installed,
  // where the page has long finished loading.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
  addEventListener("load", () => {
    scheduleEvaluate();
    // Late stylesheets and theme scripts often land just after load.
    setTimeout(scheduleEvaluate, 1000);
  });
  darkQuery.addEventListener("change", scheduleEvaluate);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("darkened" in changes) settings.darkened = changes.darkened.newValue ?? {};
    if ("enabled" in changes || "sites" in changes) loadSettings().then(evaluate);
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "status") return Promise.resolve({ site, state, darkening });
  });
})();
