#!/bin/sh
# Signs Dark Mofo on addons.mozilla.org.
#
#   ./sign.sh          unlisted: Mozilla signs it but never shows it on the
#                      store. Waits and downloads the signed .xpi.
#   ./sign.sh listed   submits a public version with the store details in
#                      amo-metadata.json. Review takes days, so it doesn't wait.
#
# Needs WEB_EXT_API_KEY and WEB_EXT_API_SECRET from
# https://addons.mozilla.org/developers/addon/api/key/ in the environment.
# AMO refuses a version it has already signed, so bump "version" in
# extension/manifest.json before signing again.
set -eu
cd "$(dirname "$0")"

: "${WEB_EXT_API_KEY:?set WEB_EXT_API_KEY to your AMO JWT issuer}"
: "${WEB_EXT_API_SECRET:?set WEB_EXT_API_SECRET to your AMO JWT secret}"

channel="${1:-unlisted}"
npx --yes web-ext@10 lint --source-dir extension

if [ "$channel" = listed ]; then
  npx --yes web-ext@10 sign --source-dir extension --channel listed \
    --amo-metadata amo-metadata.json --approval-timeout 0 \
    --artifacts-dir web-ext-artifacts
else
  npx --yes web-ext@10 sign --source-dir extension --channel unlisted \
    --artifacts-dir web-ext-artifacts
  ls -t web-ext-artifacts/*.xpi | head -1
fi
