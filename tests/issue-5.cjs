const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:8014';

test('Issue 5 normal modes and all 300 question definitions',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
    await page.clock.install({time:new Date('2026-10-30T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
    await t.test('each of 300 masters produces four unique choices and one master answer',async()=>{
      const checked=await page.evaluate(()=>Object.entries(modeConfig).map(([mode,config])=>{
        const results=config.pool.map(master=>{
          startGame(mode);gameQuestions[0]=master;q=0;newQuestion();
          const answer=currentOptions.filter(x=>x.correct);
          return {four:currentOptions.length===4,unique:new Set(currentOptions.map(x=>x.label)).size===4,correct:answer.length===1&&answer[0].route.join('|')===[master.from,...master.masterTransfers,master.to].join('|'),transfers:master.masterTransfers.length};
        });
        return {mode,results};
      }));
      for(const {mode,results} of checked){assert.equal(results.length,100);for(const r of results){assert(r.four&&r.unique&&r.correct,mode);assert(mode==='beginner'?r.transfers===1:mode==='intermediate'?r.transfers===2:r.transfers>=3)}}
    });
    for(const mode of ['beginner','intermediate','extreme']){
      await t.test(`${mode}: five questions, score, results and persisted best`,async()=>{
        await page.evaluate(mode=>startGame(mode),mode);
        for(let i=0;i<5;i++){
          assert.equal(await page.locator('#timer').textContent(),'20');
          await page.evaluate(()=>answerChoice(currentOptions.findIndex(x=>x.correct)));await page.clock.runFor(6000);await page.locator('#answerJourneyNext').click();
        }
        const r=await page.evaluate(()=>({screen:document.querySelector('.screen.active').id,records:records.length,score:total,sum:records.reduce((n,r)=>n+r.score,0),best:getBest(currentMode),correct:records.every(r=>r.correct),details:b$('details').children.length}));
        assert.equal(r.screen,'final');assert.equal(r.records,5);assert(r.correct);assert.equal(r.score,r.sum);assert(r.score>0&&r.score<=50000);assert.equal(r.best.correctCount,5);assert.equal(r.details,5);
      });
      await t.test(`${mode}: real 20-second timeout preserves zero score`,async()=>{
        await page.evaluate(mode=>startGame(mode),mode);await page.clock.runFor(20000);assert(await page.locator('#answerJourney.active').isVisible());await page.clock.runFor(6000);await page.locator('#answerJourneyNext').click();assert.deepEqual(await page.evaluate(()=>({timeout:records[0].timeout,elapsed:records[0].elapsed,score:records[0].score})),{timeout:true,elapsed:20,score:0});
      });
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('Issue 5 rush retry, zero correct, timeout, combo and existing hearts',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.goto(url);await page.clock.install({time:new Date('2026-10-30T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
    await page.evaluate(()=>{startRush();answerChoice(currentOptions.findIndex(x=>!x.correct))});await page.clock.runFor(2500);await page.locator('#answerJourneyNext').click();assert.equal(await page.locator('#rushCorrectCount').textContent(),'0');assert.equal(await page.locator('#final.active').count(),1);
    await page.evaluate(()=>restartCurrentGame());assert.equal(await page.evaluate(()=>rushCorrect),0);assert.equal(await page.evaluate(()=>combo),0);assert.equal(await page.locator('#qnum').textContent(),'1');
    await page.evaluate(()=>answerChoice(currentOptions.findIndex(x=>x.correct)));await page.clock.runFor(2500);await page.locator('#answerJourneyNext').click();assert.equal(await page.evaluate(()=>combo),1);assert.equal(await page.evaluate(()=>rushCorrect),1);
    await page.clock.runFor(20000);await page.clock.runFor(2500);await page.locator('#answerJourneyNext').click();assert.equal(await page.locator('#rushCorrectCount').textContent(),'1');assert.equal(await page.evaluate(()=>combo),0);assert.equal(await page.evaluate(()=>records.at(-1).timeout),true);
    // Hearts belong to battle; rush retains its existing one-miss termination rule.
    await page.evaluate(()=>{goHome();startBattle()});await page.clock.runFor(2300);assert.equal(await page.locator('#battleHearts .heart:not(.lost)').count(),5);await page.evaluate(()=>{bSecond=true;const i=(BATTLE_Q[0].answer+1)%4;battleAnswer(i,document.querySelectorAll('.battle-option')[i])});assert.equal(await page.locator('#battleHearts .heart:not(.lost)').count(),4);
  }finally{await browser.close()}
});

test('Issue 5 local ratings, duplicate scoring and BOT waiting cancellation',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.goto(url);await page.clock.install({time:new Date('2026-10-30T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
    await page.evaluate(()=>startBattle());await page.clock.runFor(2300);
    await page.evaluate(()=>{const a=BATTLE_Q[0].answer,btn=document.querySelectorAll('.battle-option')[a];battleAnswer(a,btn);battleAnswer(a,btn)});assert.equal(await page.evaluate(()=>bMy),1);assert.equal(await page.evaluate(()=>bCorrect),1);
    await page.evaluate(()=>{bMy=5;});await page.clock.runFor(2050);const before=await page.evaluate(()=>bRating);await page.evaluate(()=>{nextBattleQuestion();nextBattleQuestion()});assert.equal(await page.evaluate(()=>bRating),before+24);assert.equal(await page.evaluate(()=>Number(localStorage.getItem('norikaeBattleRating'))),before+24);
    assert.equal(await page.locator('#homeBattleRating').textContent(),String(before+24));assert.equal(await page.evaluate(()=>ratingRank(1400)),'S');assert.equal(await page.evaluate(()=>ratingRank(1200)),'A');assert.equal(await page.evaluate(()=>ratingRank(1000)),'B');assert.equal(await page.evaluate(()=>ratingRank(800)),'C');
    await page.evaluate(()=>retryBattle());await page.clock.runFor(2300);await page.evaluate(()=>{const i=(BATTLE_Q[0].answer+1)%4;battleAnswer(i,document.querySelectorAll('.battle-option')[i]);closeBattle()});await page.clock.runFor(15000);assert.equal(await page.evaluate(()=>bRival),0);assert.equal(await page.locator('#battleFeedback').isVisible(),false);assert.equal(await page.evaluate(()=>bTimeouts.size),0);
  }finally{await browser.close()}
});

test('Issue 5 audio assets, playback, mute and saved mute preference',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
    for(const file of ['train_matsu.ogg','after_fanfare_aishu.ogg']){const r=await page.request.get(`${url}/${file}`);assert.equal(r.status(),200);assert.equal((await r.body()).subarray(0,4).toString(),'OggS')}
    // A real browser gesture unlocks audio; no external playback service is used.
    await page.locator('.home-logo').click();
    for(const mode of ['home','resultBgm']){await page.evaluate(mode=>startBgm(mode),mode);await page.waitForFunction(mode=>{const a=getDovaAudio(mode);return !a.paused&&a.readyState>=2&&a.volume>0},mode);await page.evaluate(()=>stopBgm())}
    await page.evaluate(()=>{window.oscillators=0;const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){oscillators++;return create.call(this)};soundPrefs.enabled=false;playCorrectSound();playWrongSound();playNextSE();playResultSE();battleTone(440,0,.1);uxTone(440)});assert.equal(await page.evaluate(()=>oscillators),0);
    await page.evaluate(()=>{soundPrefs.enabled=true;playCorrectSound();playWrongSound();playNextSE();playResultSE();battleTone(440,0,.1)});assert((await page.evaluate(()=>oscillators))>0);
    await page.evaluate(()=>{toggleAllSound();startBattle()});assert.equal(await page.evaluate(()=>soundPrefs.enabled),false);assert.equal(await page.evaluate(()=>b$('dovaHomeBgm').paused),true);
    await page.reload();assert.equal(await page.evaluate(()=>soundPrefs.enabled),false);await page.evaluate(()=>startBgm('home'));assert.equal(await page.evaluate(()=>b$('dovaHomeBgm').paused),true);assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
