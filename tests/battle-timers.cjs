// Serve the checkout, then run NODE_PATH=/path/to/node_modules node --test tests/battle-timers.cjs.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
  test(`battle lifecycle ${viewport.width}x${viewport.height}`,async t=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    try{
      const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(process.env.TEST_URL||'http://127.0.0.1:8011');await page.clock.install();
      async function start(){await page.evaluate(()=>startBattle());await page.clock.runFor(2300);}
      async function answer(correct){const i=await page.evaluate(correct=>{const a=BATTLE_Q[bRound%BATTLE_Q.length].answer;return correct?a:(a+1)%4},correct);await page.locator('.battle-option').nth(i).click();}
      async function hidden(){assert.deepEqual(await page.evaluate(()=>['battleFeedback','battleJourney','battleVictory'].map(id=>b$(id).classList.contains('show'))),[false,false,false]);}
      await t.test('correct answer, feedback and next question',async()=>{
        await start();await answer(true);assert.equal(await page.evaluate(()=>bMy),1);await page.clock.runFor(2100);assert(await page.locator('#battleFeedback').isVisible());await page.locator('#battleFeedback button').click();assert.equal(await page.evaluate(()=>bRound),1);
      });
      await t.test('wrong answer preserves penalty and BOT response',async()=>{
        await start();await page.evaluate(()=>{window.savedRandom=Math.random;Math.random=()=>0});await answer(false);assert.equal(await page.evaluate(()=>bMistakes),1);await page.clock.runFor(3700);assert.equal(await page.evaluate(()=>bRival),1);await page.evaluate(()=>Math.random=window.savedRandom);
      });
      await t.test('timeout produces feedback',async()=>{
        await start();await page.evaluate(()=>clearTimeout(bBotTimer));await page.clock.runFor(20100);assert.equal(await page.locator('#battleFeedbackTitle').textContent(),'TIME UP');
      });
      await t.test('close during introduction cancels pending work',async()=>{
        await page.evaluate(()=>{startBattle();closeBattle()});await page.clock.runFor(3000);await hidden();assert.equal(await page.evaluate(()=>bTimeouts.size),0);
      });
      await t.test('close during correct animation cannot reopen feedback',async()=>{
        await start();await answer(true);await page.evaluate(()=>closeBattle());await page.clock.runFor(3000);await hidden();assert.equal(await page.evaluate(()=>bTimeouts.size),0);
      });
      await t.test('restart invalidates callbacks even if already queued',async()=>{
        await start();await answer(true);
        await page.evaluate(()=>{const original=window.setTimeout;window.queuedBattleCallback=null;window.setTimeout=(fn,ms)=>{window.queuedBattleCallback=fn;return original(fn,ms)};battleLater(()=>b$('battleFeedback').classList.add('show'),2000);window.setTimeout=original;retryBattle();window.queuedBattleCallback()});
        await page.clock.runFor(2300);await hidden();assert.equal(await page.evaluate(()=>bMy),0);assert.equal(await page.locator('.battle-option:enabled').count(),4);
      });
      await t.test('screen transition cancels animation; victory and rematch reset state',async()=>{
        await start();await answer(true);await page.evaluate(()=>show('home'));await page.clock.runFor(3000);await hidden();
        await start();await page.evaluate(()=>bMy=4);await answer(true);await page.clock.runFor(2100);await page.locator('#battleFeedback button').click();assert(await page.locator('#battleVictory').isVisible());await page.evaluate(()=>retryBattle());await page.clock.runFor(2300);await hidden();assert.equal(await page.evaluate(()=>bMy),0);
      });
      await t.test('layout and browser errors',async()=>{
        const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.battle-option')].map(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=40})}));assert.equal(layout.overflow,false);assert(layout.buttons.every(Boolean));assert.deepEqual(errors,[]);
      });
    }finally{await browser.close()}
  });
}
