const ALL_SITES = { origins: ["<all_urls>"] };

const STATUS_TEXT = {
  pending: "Checking this page…",
  disabled: "Dark Mofo is off.",
  "light-wanted": "Firefox is in light mode, so pages are left as they are.",
  native: "This site has its own dark mode, so it is left as it is.",
  darkened: "This site has no dark mode, so Dark Mofo is darkening it.",
  forced: "Always darkened.",
  off: "Never darkened.",
};

const MODE_TEXT = { dark: "always darken", off: "never" };

const $ = (id) => document.getElementById(id);

async function getSettings() {
  const stored = await browser.storage.local.get(["enabled", "sites"]);
  return { enabled: stored.enabled ?? true, sites: stored.sites ?? {} };
}

async function setSiteMode(site, mode) {
  const { sites } = await getSettings();
  if (mode === "auto") delete sites[site];
  else sites[site] = mode;
  await browser.storage.local.set({ sites });
}

async function pageStatus() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    return await browser.tabs.sendMessage(tab.id, { type: "status" });
  } catch {
    return null; // about: pages, addons.mozilla.org, or a tab loaded before install
  }
}

function renderExceptions(sites) {
  const list = $("exception-list");
  list.replaceChildren();
  for (const [site, mode] of Object.entries(sites).sort()) {
    const item = document.createElement("li");
    const host = document.createElement("span");
    host.className = "host";
    host.textContent = site;
    const label = document.createElement("span");
    label.className = "muted";
    label.textContent = MODE_TEXT[mode];
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.title = `Put ${site} back on Auto`;
    remove.addEventListener("click", () => setSiteMode(site, "auto"));
    item.append(host, label, remove);
    list.append(item);
  }
  $("exceptions").hidden = list.children.length === 0;
}

async function render() {
  const granted = await browser.permissions.contains(ALL_SITES);
  $("grant").hidden = granted;

  const settings = await getSettings();
  $("enabled").checked = settings.enabled;
  renderExceptions(settings.sites);

  const status = granted ? await pageStatus() : null;
  $("site").hidden = !status;
  $("unavailable").hidden = !granted || !!status;
  if (!status) return;

  $("site-name").textContent = status.site;
  $("site-status").textContent = STATUS_TEXT[status.state] ?? "";
  const mode = settings.sites[status.site] ?? "auto";
  for (const radio of document.querySelectorAll("input[name=mode]")) {
    radio.checked = radio.value === mode;
    radio.onchange = () => setSiteMode(status.site, radio.value);
  }
}

$("enabled").addEventListener("change", (event) => {
  browser.storage.local.set({ enabled: event.target.checked });
});

$("grant-button").addEventListener("click", async () => {
  await browser.permissions.request(ALL_SITES);
  render();
});

// Content scripts re-evaluate on the same storage change, so give them a frame
// before asking for the page's new state.
browser.storage.onChanged.addListener(() => setTimeout(render, 100));

render();
