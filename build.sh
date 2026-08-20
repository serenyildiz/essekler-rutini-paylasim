#!/bin/bash
# Eşşeklerin Rutini — dist/ üretir.
#   ./build.sh          → sürümü kayıt sayısından türetir (v26, v27...)
#   ./build.sh v99      → sürümü elle ver
# Netlify bunu kendisi çalıştırır; zip sadece elle yükleme içindir.
set -e
cd "$(dirname "$0")"

if [ -n "$1" ]; then
  V="$1"
else
  # Her kayıt sürümü bir artırır. TABAN, elle yayınlanan v25'in üstünden
  # devam etmek için; sürüm asla geriye gitmemeli (güncelleme kontrolü buna bakıyor).
  TABAN=24
  N=$(git rev-list --count HEAD 2>/dev/null || echo "")
  if [ -n "$N" ]; then V="v$((N + TABAN))"; else V="v$(date +%s)"; fi
fi

rm -rf dist && mkdir -p dist
cp index.html sw.js manifest.webmanifest icon-192.png icon-512.png apple-touch-icon.png dist/
printf '%s' "$V" > dist/version.txt

python3 - "$V" <<'PY'
import re, sys
V = sys.argv[1]
p = 'dist/index.html'; s = open(p, encoding='utf-8').read()
assert '__APP_VERSION__' in s, 'sürüm yer tutucusu yok'
open(p, 'w', encoding='utf-8').write(s.replace('__APP_VERSION__', V))
p = 'dist/sw.js'; s = open(p, encoding='utf-8').read()
s = re.sub(r"const V = 'essek-v[^']*'", "const V = 'essek-%s'" % V, s)
open(p, 'w', encoding='utf-8').write(s)
print('sürüm:', V)
PY

# zip yalnızca elle yükleme gerekirse (Netlify'da gereksiz)
if [ "$NETLIFY" != "true" ]; then
  rm -f essek-dist.zip && (cd dist && zip -qr ../essek-dist.zip .)
fi
