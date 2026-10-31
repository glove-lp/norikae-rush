const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {chromium}=require('playwright');
const id='G-V48HF21Y4C';
let html;
async function fixture(browser,{url='https://norikae-rush.jp/',fault,blocked=false}={}){
  html??=await readFile('index.html','utf8');
  const page=await browser.newPage();const errors=[],tags=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(fault)await page.addInitScript({content:fault});
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='www.googletagmanager.com'){
      tags.push(u.href);
      return blocked?route.abort('blockedbyclient'):route.fulfill({contentType:'text/javascript',body:'/* GA4 stub: no real measurement is transmitted by tests. */'});
    }
    if(u.pathname==='/'||u.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:html});
    if(['train_matsu.ogg','after_fanfare_aishu.ogg'].includes(u.pathname.slice(1)))return route.fulfill({contentType:'audio/ogg',body:await readFile(u.pathname.slice(1))});
    return route.fulfill({status:204,body:''});
  });
  await page.goto(url);await page.waitForSelector('#home.active');
  const events=()=>page.evaluate(()=>Array.from(window.dataLayer||[],entry=>Array.from(entry)).filter(entry=>entry[0]==='event').map(entry=>({name:entry[1],params:entry[2]})));
  return {page,errors,tags,events};
}
const launch=()=>chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

test('GA4 page view and metadata contain no query, hash, storage or player data',async()=>{
  const browser=await launch();try{
    const {page,tags,events,errors}=await fixture(browser,{url:'https://norikae-rush.jp/?player=PRIVATE_PLAYER&email=private@example.test#PRIVATE_HASH',fault:"localStorage.setItem('playerName','PRIVATE_STORAGE')"});
    await page.evaluate(()=>{startGame('PRIVATE_MODE');goHome()});
    const calls=await page.evaluate(()=>Array.from(dataLayer,entry=>Array.from(entry)));
    assert.equal(calls.filter(x=>x[0]==='config').length,1);assert.equal(calls.find(x=>x[0]==='config')[1],id);assert.equal(calls.find(x=>x[0]==='config')[2].send_page_view,false);
    const pv=(await events()).filter(e=>e.name==='page_view');assert.equal(pv.length,1);assert.equal(pv[0].params.page_location,'https://norikae-rush.jp/');assert.equal(pv[0].params.page_referrer,'');
    assert.equal(tags.length,1);assert.equal(tags[0],`https://www.googletagmanager.com/gtag/js?id=${id}`);
    assert.doesNotMatch(JSON.stringify(calls),/PRIVATE_|private@example|playerName|user_id|user_properties|user_data/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('normal modes start/end once, retain grade and correct count, and permit replay',async()=>{
  const browser=await launch();try{
    const {page,events}=await fixture(browser);
    for(const mode of ['beginner','intermediate','extreme']){
      await page.evaluate(mode=>{startGame(mode);startGame(mode);for(let i=0;i<5;i++){answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion()}showFinal();goHome()},mode);
    }
    let e=await events();assert.deepEqual(e.filter(x=>x.name==='game_start').map(x=>x.params.game_mode),['beginner','intermediate','extreme']);
    const ends=e.filter(x=>x.name==='game_end');assert.equal(ends.length,3);for(const x of ends){assert.equal(x.params.correct_count,5);assert.equal(x.params.result,'s_rank')}
    await page.evaluate(()=>{startGame('beginner');for(let i=0;i<5;i++){showAnswerJourney(true,false,'時間切れ',Infinity);completePendingQuestion()}});
    e=await events();assert.equal(e.filter(x=>x.name==='game_start').length,4);assert.equal(e.filter(x=>x.name==='game_end').at(-1).params.result,'d_rank');assert.equal(e.filter(x=>x.name==='game_end').at(-1).params.correct_count,0);
  }finally{await browser.close()}
});

test('rush records master, wrong and timeout results without duplicate ends',async()=>{
  const browser=await launch();try{
    const {page,events}=await fixture(browser);
    await page.evaluate(()=>{startRush();for(let i=0;i<100;i++){answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion()}showRushFinal();goHome();startRush();answerChoice(currentOptions.findIndex(x=>!x.correct));completePendingQuestion();showRushFinal();startRush();showAnswerJourney(true,false,'時間切れ',Infinity);completePendingQuestion()});
    const e=await events();assert.equal(e.filter(x=>x.name==='game_start').length,3);
    assert.deepEqual(e.filter(x=>x.name==='game_end').map(x=>({result:x.params.result,correct:x.params.correct_count,mode:x.params.game_mode})),[{result:'master',correct:100,mode:'rush'},{result:'wrong',correct:0,mode:'rush'},{result:'timeout',correct:0,mode:'rush'}]);
  }finally{await browser.close()}
});

test('battle ends at match decision, not each question; win/loss/quit are deduplicated',async()=>{
  const browser=await launch();try{
    const {page,events}=await fixture(browser);
    await page.evaluate(()=>{
      startBattle();startBattle();bMy=4;bCorrect=4;
      const i=BATTLE_Q[0].answer,btn=document.querySelectorAll('.battle-option')[i];btn.disabled=false;battleAnswer(i,btn);
      showBattleVictory();showBattleVictory();closeBattle();
      startBattle();bRival=5;finishBattleRound('rival','相手が正解！','相手が1問ゲット');showBattleFeedback();nextBattleQuestion();nextBattleQuestion();closeBattle();
      startBattle();finishBattleRound('draw','TIME UP','次の問題へ');
    });
    let e=await events();assert.deepEqual(e.filter(x=>x.name==='game_end').map(x=>[x.params.result,x.params.correct_count]),[['win',5],['loss',0]]);
    await page.evaluate(()=>{closeBattle();closeBattle();startBattle();bRivalMistakes=4;rivalWrong();closeBattle()});
    e=await events();assert.deepEqual(e.filter(x=>x.name==='game_end').map(x=>x.params.result),['win','loss','quit','win']);assert.equal(e.filter(x=>x.name==='game_start').length,4);
  }finally{await browser.close()}
});

test('quit counts completed correct answers and share button sends once per result',async()=>{
  const browser=await launch();try{
    const {page,events}=await fixture(browser);
    await page.evaluate(()=>{startGame();answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion();goHome();goHome();startGame();for(let i=0;i<5;i++){answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion()}});
    await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancelled','AbortError')}})});
    await page.evaluate(async()=>{await shareResult();await shareResult()});
    let e=await events();assert.deepEqual(e.filter(x=>x.name==='game_end').map(x=>[x.params.result,x.params.correct_count]),[['quit',1],['s_rank',5]]);assert.equal(e.filter(x=>x.name==='result_share').length,1);assert.equal(e.find(x=>x.name==='result_share').params.correct_count,5);
    await page.evaluate(async()=>{startBattle();bMy=5;bCorrect=5;showBattleVictory();await shareBattleResult();await shareBattleResult()});
    e=await events();assert.deepEqual(e.filter(x=>x.name==='result_share').map(x=>x.params.game_mode),['beginner','battle']);
    for(const event of e.filter(x=>x.name!=='page_view')){
      assert.deepEqual(Object.keys(event.params).sort(),(event.name==='game_start'?['send_to','game_mode']:['send_to','game_mode','result','correct_count']).sort());
    }
  }finally{await browser.close()}
});

test('development, HTTP and preview hosts never load or queue GA4',async()=>{
  const browser=await launch();try{
    for(const url of ['http://127.0.0.1:8018/','http://norikae-rush.jp/','https://preview.invalid/']){
      const {page,tags}=await fixture(browser,{url});await page.evaluate(()=>{startGame();goHome()});assert.equal(tags.length,0);assert.equal(await page.locator('#norikae-ga4').count(),0);assert.equal(await page.evaluate(()=>window.dataLayer),undefined);await page.close();
    }
  }finally{await browser.close()}
});

test('blocked tag, throwing or rejecting tracker and broken queue do not break games',async t=>{
  const browser=await launch();try{
    for(const [name,options] of [
      ['blocked download',{blocked:true}],
      ['throwing tracker',{fault:"window.gtag=()=>{throw Error('tracker failed')}"}],
      ['rejecting tracker',{fault:"window.gtag=()=>Promise.reject(Error('tracker failed'))"}],
      ['broken queue',{fault:"window.dataLayer={push(){throw Error('queue failed')}}"}],
      ['initialization failure',{fault:"Object.defineProperty(window,'dataLayer',{get(){throw Error('unavailable')}})"}],
    ])await t.test(name,async()=>{
      const {page,errors}=await fixture(browser,options);
      await page.evaluate(()=>{startGame();for(let i=0;i<5;i++){answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion()}});
      assert.equal(await page.locator('#final.active').count(),1);assert.equal(await page.evaluate(()=>records.length),5);assert(await page.evaluate(()=>total>0));
      await page.evaluate(()=>{startRush();answerChoice(currentOptions.findIndex(x=>!x.correct));completePendingQuestion();startBattle();bMy=5;bCorrect=5;showBattleVictory();closeBattle()});
      await page.waitForTimeout(50);assert.deepEqual(errors,[]);await page.close();
    });
  }finally{await browser.close()}
});
