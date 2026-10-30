# Issue #5 validation

Base: `ffbe821` (latest origin/main at implementation time). PR #2 (battle timer cleanup)
and PR #3 (rush results reset) are already included in this base. The unmerged Issue #4
UI/countdown/share improvements are included in this branch; merge this combined change
instead of separately merging the overlapping Issue #4 branch.

## Current cloud instance

```bash
npm ci --prefix tests --cache /tmp/norikae-npm-cache --no-audit --no-fund
python3 -m http.server 8014 --bind 127.0.0.1
# in another terminal
python3 tests/wait-for-server.py http://127.0.0.1:8014/
TEST_URL=http://127.0.0.1:8014 CHROMIUM_PATH=/usr/bin/chromium node --test tests/*.cjs
```

Result: **65 passed, 0 failed, 0 skipped** (7 parent tests included; 58 leaf tests),
about 47 seconds, Node.js 24 / Playwright 1.64.1 / installed Chromium.
Workflow YAML, embedded Bash syntax and `git diff --check` also passed.

Coverage:
- Battle panel alignment at 1280x900, 390x844 and 320x568; countdown starts when result
  feedback appears, manual/automatic race, repeated clicks, victory/defeat/final question,
  timer cancellation during introduction, result, BOT waiting, exit, navigation and rematch.
- All 300 master definitions produce four unique choices and exactly one master answer.
  Separately, all three normal modes complete five questions, save scores/bests, and
  exercise the actual 20-second timer. The 300-master test is not 300 complete games or
  an independent validation of real railway routes/timetables.
- Rush is answered through all 100 questions in the browser with virtual animation time:
  combo, scores, best record, MASTER, fireworks elements, and share payload/PNG. Existing
  master-to-retry regression and additional zero-correct/timeout/retry coverage pass.
- Hearts retain their battle-only role; rush still ends on one miss or timeout.
- Local ratings/ranks and best records are tested. World ranking is intentionally disabled
  in the existing production build, not an unavailable service to be enabled in this task.
- Existing desktop/mobile layout, back/help operations, small/landscape help scrolling,
  share text/image/URL, and audio assets/playback state/mute/persisted preference tests pass.
- Audio bugs fixed: mute now covers correct/wrong/battle SE; result BGM preview is no longer
  volume zero; delayed screen synchronization cannot restart home BGM over a battle.

## CI and unverified items

The workflow runs all `tests/*.cjs` on push and pull request, installs locked Playwright
and Chromium, preserves TAP/server logs, and fails the job on a test failure. It never
merges or deploys. Remote Actions success must be checked separately; local success does
not establish a successful GitHub-hosted run. Branch protection is not changed.

The cloud network rejects `cdn.playwright.dev` with 403 Domain forbidden, so the official
bundled browser download could not be validated here. No verification was disabled; local
tests used installed Chromium. The CI's bundled Chromium is a separate browser version.

Actual iPhone/Safari/Android, OS share sheets, receiving images on SNS, and subjective
speaker/audio quality remain unverified. Share APIs are mocked; media tests check real
browser playback state and audio-node creation, not what a human hears. No external
posts, main merge or production deployment are part of these checks.
