# Browser regression tests

Requires Node.js 24, Python 3 and Chromium. No application build or paid testing service is required.

```bash
npm ci --prefix tests
cd tests
npx playwright install --with-deps chromium
cd ..
python3 -m http.server 8014 --bind 127.0.0.1
```

In a second terminal at the checkout root:

```bash
export TEST_URL=http://127.0.0.1:8014
export CHROMIUM_PATH="$(node -p "require('./tests/node_modules/playwright').chromium.executablePath()")"
node --test --test-reporter=tap tests/*.cjs
```

An already installed Chromium may be selected using `CHROMIUM_PATH=/usr/bin/chromium`.
All `tests/*.cjs` run on every push and pull request in `.github/workflows/browser-tests.yml`.
A failed command fails the job; the workflow never merges or deploys. TAP output and the server
log are retained as artifacts for seven days. Requiring the check before merging additionally
needs a GitHub branch protection/ruleset configured by the repository owner.

Node's total includes parent tests as well as individual subtests. Tests use a virtual clock
for timeouts and countdowns, isolated browser storage, and mocked share APIs (nothing is posted).
The 300-master test validates choices against the existing master data, not railway timetable
accuracy. Rush is actually answered through all 100 questions in `issue-4.cjs`.
Hearts are an existing battle-only feature; rush ends on the first miss or timeout.
World ranking is disabled in this production build; local best records and battle ratings are tested.
Actual mobile Safari/Android, OS share sheets, external SNS receipt, and subjective audio quality
require manual verification. Browser audio tests verify media playback state and oscillator calls.
