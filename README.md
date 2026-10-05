# dark-mofo

## What it is

dark-mofo is a Firefox extension that keeps every website in the colour scheme Firefox asks for. Firefox tells sites whether to be light or dark, following its theme or macOS. Plenty of sites ignore that and stay white. dark-mofo checks each page and only steps in when one stays light while you are in dark mode.

- Sites that have their own dark mode keep it. This includes sites that switch themes after loading; dark-mofo notices and backs off.
- Light-only sites are darkened by inverting the page and flipping images, video and embeds back, so photos look normal and link colours keep their hue.
- In light mode, dark-mofo does nothing. Sites that are always dark are left dark.
- dark-mofo remembers which sites it darkened, so on the next visit they open dark without a white flash.
- The toolbar button shows what dark-mofo is doing on the current site. You can set a site to **Always darken** or **Never**, or turn dark-mofo off everywhere.

It pairs with [flatty-mofo](../flatty-mofo), which darkens Firefox's own toolbars and tabs.

## Instructions

1. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `extension/manifest.json`. Firefox removes temporary add-ons when it quits, so repeat this after a restart. If Firefox asks, allow dark-mofo on all websites; the toolbar popup also has an **Allow** button.
2. Pin the half-moon button to the toolbar from the puzzle-piece menu.

To keep dark-mofo installed across restarts, use Firefox Developer Edition or Nightly. Set `xpinstall.signatures.required` to `false` in `about:config`, build the add-on with `npx web-ext build --source-dir extension`, and install the `.zip` from `web-ext-artifacts/` via **Install Add-on From File…** in `about:addons`.

To run the tests, which load dark-mofo into a headless Firefox and check it against the pages in `test/pages`:

```sh
npm --prefix test install
node test/run.mjs
```

Screenshots of each page in light and dark mode are written to `test/out/`.
