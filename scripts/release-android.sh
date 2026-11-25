#!/usr/bin/env bash
# One-command Android release: build -> sign -> (optionally) publish a GitHub Release.
#   scripts/release-android.sh            build + sign only
#   scripts/release-android.sh --publish  also create the GitHub Release with the APK attached
# Needs apps/mobile/.env.local with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_WEB_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

# The signing key lives OUTSIDE the repo. Keep a backup: losing it means users can't update the app.
KEY_DIR="$HOME/.lifetrack-release"
KEYSTORE="$KEY_DIR/release.keystore"
PASS_FILE="$KEY_DIR/password.txt"
if [ ! -f "$KEYSTORE" ]; then
  echo "Creating release keystore in $KEY_DIR (back this folder up!)"
  mkdir -p "$KEY_DIR" && chmod 700 "$KEY_DIR"
  openssl rand -base64 18 | tr -d '/+=' > "$PASS_FILE" && chmod 600 "$PASS_FILE"
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias lifetrack -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" -dname "CN=LifeTrack, O=Aatralex, C=IN"
fi
PASS="$(cat "$PASS_FILE")"

[ -f "$MOBILE/.env.local" ] && { set -a; . "$MOBILE/.env.local"; set +a; }
for v in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY; do
  [ -n "${!v:-}" ] || { echo "Missing $v (put it in apps/mobile/.env.local)"; exit 1; }
done

VERSION="$(cd "$MOBILE" && npx expo config --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).version))")"

cd "$MOBILE"
npx expo prebuild --platform android --no-install --clean
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)

BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
UNSIGNED="$(ls android/app/build/outputs/apk/release/*.apk | head -1)"
OUT="$ROOT/LifeTrack-$VERSION.apk"
"$BT/zipalign" -f -p 4 "$UNSIGNED" "$OUT.aligned"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias lifetrack --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --out "$OUT" "$OUT.aligned"
rm -f "$OUT.aligned" "$OUT.idsig"
"$BT/apksigner" verify "$OUT" && echo "Signed APK: $OUT"

if [ "${1:-}" = "--publish" ]; then
  gh release create "v$VERSION" "$OUT" --title "LifeTrack $VERSION" --notes "Android APK. Download, open it, and allow installs from this source if asked."
fi
