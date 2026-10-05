# Dark Mofo

## What it is

Dark Mofo is a Firefox extension that keeps every website in the colour scheme Firefox asks for. Firefox tells sites whether to be light or dark, following its theme or macOS. Plenty of sites ignore that and stay white. Dark Mofo checks each page and only steps in when one stays light while you are in dark mode.

- Sites that have their own dark mode keep it. This includes sites that switch themes after loading; Dark Mofo notices and backs off.
- Light-only sites are darkened by inverting the page and flipping images, video and embeds back, so photos look normal and link colours keep their hue.
- In light mode, Dark Mofo does nothing. Sites that are always dark are left dark.
- Dark Mofo remembers which sites it darkened, so on the next visit they open dark without a white flash.
- The toolbar button shows what Dark Mofo is doing on the current site. You can set a site to **Always darken** or **Never**, or turn Dark Mofo off everywhere.

It pairs with [flatty-mofo](https://github.com/kartikthapar/flatty-mofo), which darkens Firefox's own toolbars and tabs.

## Instructions

1. Create an API key at <https://addons.mozilla.org/developers/addon/api/key/>, then export it as `WEB_EXT_API_KEY` (the JWT issuer) and `WEB_EXT_API_SECRET` (the JWT secret).
2. Run `./sign.sh`. It uploads the add-on to Mozilla as unlisted, which signs it without publishing it, and prints the path of the signed `.xpi` in `web-ext-artifacts/`. Bump `version` in `extension/manifest.json` before signing a new release; Mozilla won't sign the same version twice. `./sign.sh listed` submits a public version to the store instead, using the listing in `amo-metadata.json`.
3. Open the `.xpi` in Firefox (drag it onto a window, or **Install Add-on From File…** in `about:addons`) and accept. It stays installed across restarts. If Firefox asks, allow Dark Mofo on all websites; the toolbar popup also has an **Allow** button.
4. Pin the half-moon button to the toolbar from the puzzle-piece menu.

For a quick try while developing, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `extension/manifest.json`. Firefox removes temporary add-ons when it quits.

To run the tests, which load Dark Mofo into a headless Firefox and check it against the pages in `test/pages`:

```sh
npm --prefix test install
node test/run.mjs
```

Screenshots of each page in light and dark mode are written to `test/out/`.
