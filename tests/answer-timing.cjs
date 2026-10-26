// Run with: NODE_PATH=/path/to/playwright/node_modules node --test tests/answer-timing.cjs
// Serve the checkout with python3 -m http.server 8000 before running.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('answer time excludes animations and review time', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8000');
    await page.evaluate(() => {
      window.testNow = Date.now();
      Date.now = () => window.testNow;
      startGame('beginner');
    });
    async function answer(correct, milliseconds, reviewMilliseconds) {
      const index = await page.evaluate(({ correct, milliseconds }) => {
        window.testNow = questionStart + milliseconds;
        return currentOptions.findIndex(option => option.correct === correct);
      }, { correct, milliseconds });
      await page.locator('#choices button').nth(index).click();
      await page.waitForFunction(() => !document.getElementById('answerJourneyNext').disabled);
      await page.evaluate(delay => { window.testNow += delay; }, reviewMilliseconds);
      await page.locator('#answerJourneyNext').click();
      return page.evaluate(() => records.at(-1));
    }
    const correct = await answer(true, 2200, 30000);
    assert.equal(correct.elapsed, 2);
    assert.equal(correct.timePenalty, 100);
    assert.equal(correct.score, 9900);
    const wrong = await answer(false, 4400, 45000);
    assert.equal(wrong.elapsed, 4);
    assert.equal(wrong.timePenalty, wrong.yourTime === null ? 0 : 200);
    assert.equal(wrong.score, wrong.yourTime === null ? 0 : Math.max(0, 6000 - 200 - wrong.detourPenalty));
    const consecutive = await answer(true, 800, 60000);
    assert.equal(consecutive.elapsed, 1);
    assert.equal(consecutive.score, 9950);
    // Advance the clock to the deadline, then let the real interval take the timeout path.
    await page.evaluate(() => { window.testNow = questionStart + 20000; timeLeft = 1; });
    await page.waitForFunction(() => document.querySelector('#answerJourney.active'));
    await page.waitForFunction(() => !document.getElementById('answerJourneyNext').disabled);
    await page.evaluate(() => { window.testNow += 60000; });
    await page.locator('#answerJourneyNext').click();
    const timeout = await page.evaluate(() => records.at(-1));
    assert.equal(timeout.timeout, true);
    assert.equal(timeout.elapsed, 20);
    assert.equal(timeout.score, 0);
    const final = await answer(true, 3100, 30000);
    assert.equal(final.elapsed, 3);
    assert.equal(final.score, 9850);
    assert.equal(await page.locator('#final.active').count(), 1);
    assert.equal(await page.evaluate(() => records.length), 5);
  } finally {
    await browser.close();
  }
});
