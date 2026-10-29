// Serve the checkout and run with Playwright on NODE_PATH; TEST_URL overrides the server URL.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:8013';
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
  test(`Issue 4 battle ${viewport.width}x${viewport.height}`,async t=>{
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
    try{
      const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);await page.clock.install({time:new Date('2026-10-29T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-29T00:00:01Z'));
      async function start(){await page.evaluate(()=>startBattle());await page.clock.runFor(2300);}
      async function answer(correct=true){await page.evaluate(correct=>{const a=BATTLE_Q[bRound%BATTLE_Q.length].answer,i=correct?a:(a+1)%4;battleAnswer(i,document.querySelectorAll('.battle-option')[i])},correct);}
      const round=()=>page.evaluate(()=>bRound);
      await t.test('equal panel sizes and content alignment',async()=>{
        await start();const r=await page.evaluate(()=>['battleUserPanel','battleRivalPanel'].map(id=>{const el=b$(id),r=el.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,score:el.querySelector('b').getBoundingClientRect().top,hearts:el.querySelector('.heart-row').getBoundingClientRect().top}}));
        for(const key of ['width','height','top','score','hearts'])assert(Math.abs(r[0][key]-r[1][key])<1,`${key}: ${JSON.stringify(r)}`);
      });
      await t.test('correct result stays five seconds with visible countdown',async()=>{
        await start();await answer();await page.clock.runFor(2050);assert.match(await page.locator('#battleCountdown').textContent(),/5秒/);await page.clock.runFor(1000);assert.match(await page.locator('#battleCountdown').textContent(),/4秒/);await page.clock.runFor(3990);assert.equal(await round(),0);await page.clock.runFor(10);assert.equal(await round(),1);assert.equal(await page.evaluate(()=>bMy),1);
      });
      await t.test('manual skip and queued auto callback cannot advance twice',async()=>{
        await start();await answer();await page.clock.runFor(2050);await page.evaluate(()=>{const original=setTimeout;window.issue4Queued=null;window.setTimeout=(fn,delay)=>{window.issue4Queued=fn;return original(fn,delay)};battleLater(()=>nextBattleQuestion(),5000);window.setTimeout=original;nextBattleQuestion();nextBattleQuestion();window.issue4Queued()});assert.equal(await round(),1);await page.clock.runFor(5100);assert.equal(await round(),1);
      });
      await t.test('wrong answer waits for round outcome then auto advances',async()=>{
        await start();await page.evaluate(()=>bSecond=true);await answer(false);assert.match(await page.locator('#battleFeedbackTitle').textContent(),/両者不正解/);await page.clock.runFor(5000);assert.equal(await round(),1);assert.equal(await page.evaluate(()=>bMistakes),1);
      });
      await t.test('timeout auto advances',async()=>{
        await start();await page.evaluate(()=>{clearTimeout(bBotTimer);bStart=performance.now()-20000;updateBattleTimer()});assert.equal(await page.locator('#battleFeedbackTitle').textContent(),'TIME UP');await page.clock.runFor(5000);assert.equal(await round(),1);
      });
      await t.test('winning, losing and deck-final results never auto advance',async()=>{
        for(const mode of ['win','lose','last']){
          await start();await page.evaluate(mode=>{if(mode==='win')bMy=4;if(mode==='lose'){bMistakes=4;bSecond=true}if(mode==='last')bRound=BATTLE_Q.length-1},mode);await answer(mode!=='lose');await page.clock.runFor(mode==='lose'?0:2050);const n=await round();assert.equal(await page.locator('#battleCountdown').textContent(),'');await page.clock.runFor(10000);assert.equal(await round(),n);assert(await page.locator('#battleFeedback').isVisible());await page.locator('#battleFeedback button').click();if(mode==='win')assert(await page.locator('#battleVictory').isVisible());if(mode==='lose')assert.equal(await page.locator('#battleFeedbackTitle').textContent(),'YOU LOSE');
        }
      });
      await t.test('close, restart and home transition cancel countdowns',async()=>{
        for(const action of ['closeBattle','retryBattle','home']){await start();await answer();await page.clock.runFor(2050);await page.evaluate(action=>action==='home'?show('home'):window[action](),action);await page.clock.runFor(5500);assert.equal(await round(),0);assert.equal(await page.locator('#battleFeedback').isVisible(),false);if(action!=='retryBattle')assert.equal(await page.evaluate(()=>bTimeouts.size),0);}
        assert.deepEqual(errors,[]);
      });
    }finally{await browser.close()}
  });
}

test('all modes, full 100-question rush, sharing and instructions',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.clock.install({time:new Date('2026-10-29T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-29T00:00:01Z'));
    for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:568}]){
      await page.setViewportSize(viewport);await page.evaluate(()=>goHome());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for(const mode of ['beginner','intermediate','extreme']){
        await page.evaluate(mode=>startGame(mode),mode);assert.equal(await page.locator('#choices button').count(),4);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.evaluate(()=>answerChoice(currentOptions.findIndex(x=>x.correct)));await page.clock.runFor(6000);assert(await page.locator('#answerJourneyNext').isEnabled());await page.locator('#answerJourneyNext').click();assert.equal(await page.locator('#qnum').textContent(),'2');
      }
    }
    await page.evaluate(()=>{goHome();startRush()});
    for(let i=1;i<=100;i++){
      await page.evaluate(()=>answerChoice(currentOptions.findIndex(x=>x.correct)));await page.clock.runFor(2500);await page.locator('#answerJourneyNext').click();assert.equal(await page.evaluate(()=>rushCorrect),i);
      assert.equal(await page.evaluate(()=>combo),i);
    }
    const result=await page.evaluate(()=>({active:document.querySelector('.screen.active').id,master:rushMasterAchieved,records:records.length,correct:records.every(x=>x.correct),total,recordTotal:records.reduce((sum,x)=>sum+x.score,0),celebration:b$('masterCelebration').classList.contains('show'),fireworks:document.querySelectorAll('.fireworks-layer > *').length,best:getRushBest()}));
    assert.equal(result.active,'final');assert.equal(result.master,true);assert.equal(result.records,100);assert.equal(result.correct,true);assert.equal(result.total,result.recordTotal);assert.equal(result.celebration,true);assert(result.fireworks>0);assert.equal(result.best,100);
    // Inspect actual share payload and Canvas rendering without sending anything externally.
    await page.evaluate(()=>{window.shareCalls=[];window.drawnText=[];const ctx=b$('shareCanvas').getContext('2d'),draw=ctx.fillText.bind(ctx);ctx.fillText=(text,...args)=>{drawnText.push(String(text));draw(text,...args)};Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{shareCalls.push({text:data.text,url:data.url,files:data.files?.map(f=>({type:f.type,size:f.size}))})}});Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true})});
    await page.evaluate(()=>shareResult());let share=await page.evaluate(()=>({payload:shareCalls.at(-1),text:drawnText,pixel:[...b$('shareCanvas').getContext('2d').getImageData(0,0,1,1).data]}));
    assert.match(share.payload.text,/100問連続正解/);assert.equal(share.payload.url,'https://norikae-rush.jp/');assert(share.payload.files[0].size>10000);assert.equal(share.payload.files[0].type,'image/png');assert(share.text.includes('100'));assert.equal(share.pixel[3],255);
    await page.evaluate(()=>{goHome();startGame('beginner');for(let i=0;i<5;i++){answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion()}drawnText.length=0});await page.evaluate(()=>shareResult());share=await page.evaluate(()=>({payload:shareCalls.at(-1),text:drawnText}));assert.match(share.payload.text,/5\/5問正解/);assert(share.text.includes('東京偏差値'));assert(share.payload.files[0].size>10000);
    await page.evaluate(()=>shareBattleResult());assert.equal(await page.evaluate(()=>shareCalls.at(-1).url),'https://norikae-rush.jp/');
    for(const viewport of [{width:320,height:568},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      for(const mode of ['normal','rush','battle']){await page.evaluate(mode=>openHowTo(mode),mode);await page.clock.runFor(300);assert(await page.locator('#howToOverlay').isVisible());const panel=await page.locator('.howto-panel').boundingBox();assert(panel.y>=0&&panel.y+panel.height<=viewport.height);await page.locator('.howto-ok').click();assert.equal(await page.locator('#howToOverlay').isVisible(),false)}
    }
    const instructions=await page.evaluate(()=>JSON.stringify(HOWTO_DATA));assert.match(instructions,/時間切れ/);assert.match(instructions,/5秒/);assert.match(instructions,/BOT/);assert.doesNotMatch(instructions,/エンドレス|ENDLESS/);assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
