# dark-mofo

Dark Mofo (`dark-mofo` is the project and folder name) is a Firefox WebExtension (Manifest V3) that keeps web pages in the colour scheme Firefox asks for. It never adds a dark mode to a site that has one: it measures the page and only applies a filter when the page stays light while `prefers-color-scheme: dark` matches. It never lightens a dark page.

## Layout

- `extension/icons/logo.svg`: the add-on logo (half-light, half-dark disc wearing shades). `icon-dark.svg` and `icon-light.svg` are the monochrome toolbar versions for light and dark Firefox themes.
- `extension/content.js`: runs at `document_start` in top-level documents. Decides per page and toggles `data-dark-mofo` on `<html>`.
- `extension/darken.css`: the filter, keyed on that attribute. Injected by the manifest, so it costs nothing until the attribute is set.
- `extension/popup/`: toolbar popup. Talks to the content script with a `{type: "status"}` message and writes settings to `storage.local`.
- `test/`: puppeteer-core drives a headless Firefox over WebDriver BiDi. `test/pages` holds one page per detection case.

## How detection works

- A page "looks dark" when most of a 3x3 grid of viewport points sits on a background with luminance below `DARK_LUMINANCE`. Each point walks up from `elementFromPoint` to the first opaque `background-color`. Background images and gradients count as unknown rather than guessed.
- Below the content, the canvas shows `<body>`'s background if `<html>` has none (CSS background propagation), else the `Canvas` system colour for the page's `color-scheme`. A probe element resolves `Canvas`, which is how `color-scheme: light dark` pages count as natively dark.
- CSS `filter` doesn't change computed styles, so detection reads the page's own colours even while dark-mofo is darkening it. Re-checks after load, on `<html>`/`<body>` attribute changes and on body child changes are therefore safe and catch sites that switch themes late.
- While the page parses, `content.js` judges it on every animation frame, which runs just before paint, so the verdict lands in the frame where content first shows. Until then `data-dark-mofo-pending` paints the canvas dark; `measure()` lifts it while reading colours, and DOMContentLoaded drops it if the page still can't be judged. The cached verdict is only used once `<body>` exists and still can't be judged; before that the pending canvas covers it, because inverting a canvas that `<meta name="color-scheme">` already made dark paints it white.
- `storage.local` keys: `enabled` (global switch), `sites` (`{host: "dark" | "off"}`, absent means auto), `darkened` (`{host: true}`, last auto verdict, used to darken a page whose content can't be measured yet).

## Writing rules

- Keep the filter in `darken.css` and the decisions in `content.js`. The CSS must stay inert without the attribute.
- Media is re-inverted with the same `invert(1) hue-rotate(180deg)`. Don't add a selector whose matches can nest inside another match (for example `picture` alongside `img`), or the two inversions cancel.
- Fullscreen elements live in the top layer, outside the root filter, so `darken.css` filters them separately. Check fullscreen video after touching the media rules.
- Comments say why a rule exists: which page behaviour it handles, or which browser constraint forces its shape.

## Verifying a change

Run `node test/run.mjs` after `npm --prefix test install`. Some sandboxed shells can't start Firefox directly, so the runner launches it with `open -n -a Firefox`, and it passes `--remote-allow-system-access` so it can open `moz-extension://` pages and set storage. Look at the screenshots in `test/out/` as well as the pass/fail lines. Add a page to `test/pages` and a case to `run.mjs` for each new detection behaviour.

Run `npx web-ext lint --source-dir extension` before signing.

## README

README.md has exactly two sections: what it is, and instructions.
