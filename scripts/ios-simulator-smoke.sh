#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
SIMULATOR_ID="$(xcrun simctl list devices available -j | python3 -c 'import sys,json; d=json.load(sys.stdin)["devices"]; phones=[x for runtime in sorted(d,reverse=True) for x in d[runtime] if x["name"].startswith("iPhone")]; assert phones,"No available iPhone Simulator"; print(phones[0]["udid"])')"
echo "Using iPhone Simulator $SIMULATOR_ID"
xcrun simctl boot "$SIMULATOR_ID" || true
xcrun simctl bootstatus "$SIMULATOR_ID" -b
xcrun simctl install "$SIMULATOR_ID" build/ios/Build/Products/Debug-iphonesimulator/App.app
DATA="$(xcrun simctl get_app_container "$SIMULATOR_ID" jp.norikae.rush data)"
run_smoke() {
  local phase="$1"
  shift
  rm -f "$DATA/Documents/smoke-results.json"
  xcrun simctl launch "$SIMULATOR_ID" jp.norikae.rush --smoke-test "$@"
  for attempt in $(seq 1 180); do
    if [ -f "$DATA/Documents/smoke-results.json" ]; then
      cp "$DATA/Documents/smoke-results.json" "artifacts/$phase.json"
      cat "artifacts/$phase.json"
      python3 scripts/report-ios-failure.py "artifacts/$phase.json"
      python3 -c 'import json,sys; result=json.load(open(sys.argv[1])); assert result.get("success") is True,result' "artifacts/$phase.json"
      xcrun simctl io "$SIMULATOR_ID" screenshot "artifacts/$phase.png"
      return
    fi
    sleep 1
  done
  xcrun simctl spawn "$SIMULATOR_ID" log show --last 5m --predicate 'process == "App"' > "artifacts/$phase-system.log"
  echo "Timed out waiting for $phase" >&2
  return 1
}
run_smoke native-offline-share
xcrun simctl terminate "$SIMULATOR_ID" jp.norikae.rush
# Deliberately remove only this disposable Simulator app's WebKit data. Preferences remain.
python3 - "$DATA" <<'PY'
import pathlib,shutil,sys
root=pathlib.Path(sys.argv[1])
for relative in ['Library/WebKit','Library/Caches/WebKit']:
    shutil.rmtree(root/relative,ignore_errors=True)
PY
run_smoke preferences-restore --restore-test
xcrun simctl terminate "$SIMULATOR_ID" jp.norikae.rush
