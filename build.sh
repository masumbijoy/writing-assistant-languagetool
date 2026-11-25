#!/usr/bin/env bash
# Builds an installable copy of the extension:
#   dist/writing-assistant/          -> folder for chrome://extensions "Load unpacked"
#   dist/writing-assistant-<ver>.zip -> zip for sharing or Chrome Web Store upload
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT=dist/writing-assistant
rm -rf dist && mkdir -p "$OUT"
cp manifest.json background.js content.js popup.html popup.js "$OUT"/
cp -R icons "$OUT"/
# stamp the build time into version_name (shown on chrome://extensions and in the popup) so every build is identifiable
BUILD=$(date '+%Y-%m-%d %H:%M')
python3 - "$OUT/manifest.json" "$VERSION" "$BUILD" <<'PY'
import json, sys
p, v, b = sys.argv[1:]
m = json.load(open(p)); m['version_name'] = f'{v} (build {b})'
open(p, 'w').write(json.dumps(m, indent=2) + '\n')
PY
for f in "$OUT"/*.js; do node --check "$f"; done
(cd "$OUT" && zip -qr -X "../writing-assistant-$VERSION.zip" .)
echo "Built $VERSION (build $BUILD): $OUT and dist/writing-assistant-$VERSION.zip"
