#!/bin/sh
# Signs Dark Mofo on addons.mozilla.org as an unlisted add-on, so release
# Firefox keeps it installed across restarts. Unlisted means Mozilla signs it
# but never shows it on the store.
#
# Needs WEB_EXT_API_KEY and WEB_EXT_API_SECRET from
# https://addons.mozilla.org/developers/addon/api/key/ in the environment.
# AMO refuses a version it has already signed, so bump "version" in
# extension/manifest.json before signing again.
set -eu
cd "$(dirname "$0")"

: "${WEB_EXT_API_KEY:?set WEB_EXT_API_KEY to your AMO JWT issuer}"
: "${WEB_EXT_API_SECRET:?set WEB_EXT_API_SECRET to your AMO JWT secret}"

npx --yes web-ext@10 lint --source-dir extension
npx --yes web-ext@10 sign --source-dir extension --channel unlisted \
  --artifacts-dir web-ext-artifacts
ls -t web-ext-artifacts/*.xpi | head -1
