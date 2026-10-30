const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {chromium}=require('playwright');
const root=process.env.TEST_URL||'http://127.0.0.1:8017';
const app=`${root}/mobile/dist/`;

test('iOS bundle preserves game scripts and local assets without a remote server',async()=>{
  const original=await readFile('index.html','utf8');
  const scripts=[...original.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(let i=0;i<scripts.length;i++)assert.equal(await readFile(`mobile/dist/game-${i}.js`,'utf8'),scripts[i]);
  const config=JSON.parse(await readFile('capacitor.config.json','utf8'));assert.equal(config.server,undefined);assert.equal(config.webDir,'mobile/dist');
  for(const file of ['train_matsu.m4a','after_fanfare_aishu.m4a'])assert((await readFile(`mobile/assets/${file}`)).equals(await readFile(`mobile/dist/${file}`)));
});

test('iPhone bundle layout, touch, modes, audio and offline local requests',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    for(const width of [320,375,390,430])await t.test(`${width}px bundled game`,async()=>{
      const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
      const page=await context.newPage();const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>{if(new URL(route.request().url()).origin===new URL(root).origin)return route.continue();external.push(route.request().url());return route.abort()});
      await page.goto(app);await page.waitForFunction(()=>window.NativeGame?.ready);
      await page.evaluate(()=>{document.documentElement.style.setProperty('--native-top','47px');document.documentElement.style.setProperty('--native-bottom','34px')});
      assert.match(await page.locator('meta[name=viewport]').getAttribute('content'),/viewport-fit=cover/);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).paddingTop),'47px');
      await page.locator('#native-sound').tap();assert.equal(await page.locator('#native-sound').getAttribute('aria-pressed'),'false');
      await page.locator('#native-sound').tap();assert.equal(await page.locator('#native-sound').getAttribute('aria-pressed'),'true');
      await page.clock.install({time:new Date('2026-10-30T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
      for(const mode of ['beginner','intermediate','extreme']){
        await page.evaluate(()=>goHome());await page.locator(`.mode-btn.${mode}`).tap();assert.equal(await page.locator('#choices button').count(),4);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const back=await page.locator('#game .back-row button').boundingBox(),head=await page.locator('#game .game-head').boundingBox();assert(back.y>=head.y&&back.y+back.height<=head.y+head.height,'native back control stays within game header');
        const i=await page.evaluate(()=>currentOptions.findIndex(x=>x.correct));await page.locator('#choices button').nth(i).tap();await page.clock.runFor(6000);await page.locator('#answerJourneyNext').tap();assert.equal(await page.locator('#qnum').textContent(),'2');
      }
      await page.evaluate(()=>{goHome();startRush();answerChoice(currentOptions.findIndex(x=>!x.correct));completePendingQuestion()});assert.equal(await page.locator('#rushCorrectCount').textContent(),'0');
      await page.evaluate(()=>{goHome();startBattle()});await page.clock.runFor(2300);assert.equal(await page.evaluate(()=>document.getElementById('battleOverlay').getBoundingClientRect().top),47);assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('battleOverlay')).bottom),'34px');
      const a=await page.evaluate(()=>BATTLE_Q[0].answer);await page.locator('.battle-option').nth(a).tap();assert.equal(await page.evaluate(()=>bMy),1);await page.evaluate(()=>closeBattle());await page.clock.runFor(3000);assert.equal(await page.locator('#battleFeedback').isVisible(),false);
      for(const file of ['train_matsu.m4a','after_fanfare_aishu.m4a']){const response=await page.request.get(`${app}${file}`);assert.equal(response.status(),200)}
      assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await context.close();
    });
  }finally{await browser.close()}
});

test('native Preferences ordering, restore, sharing PNG, cancellation and lifecycle adapter',async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.goto(app);await page.waitForFunction(()=>window.NativeGame?.ready);
    const result=await page.evaluate(async()=>{
      const {initializeNative}=await import('./native-bridge.js');
      const store={'norikaeBattleRating':'1024','norikaeRushBest_beginner':JSON.stringify({deviation:70,score:50000,correctCount:5}),'unrelated':'private'};
      const writes=[],files=[],deletes=[],shares=[],callbacks={};
      const state=await initializeNative({native:true,preferences:{keys:async()=>({keys:Object.keys(store)}),get:async({key})=>({value:store[key]??null}),set:async({key,value})=>{await new Promise(r=>setTimeout(r,1));store[key]=value;writes.push([key,value])},remove:async({key})=>{delete store[key]}},filesystem:{writeFile:async data=>{files.push(data);return {uri:'file:///cache/result.png'}},deleteFile:async data=>deletes.push(data)},share:{share:async data=>{shares.push(data);if(window.cancelNativeShare)throw Error('Share canceled')}},app:{addListener:async(name,fn)=>{callbacks[name]=fn;return {remove:async()=>{}}}}});
      const restored=localStorage.getItem('norikaeBattleRating');const unrelated=localStorage.getItem('unrelated');
      localStorage.setItem('norikaeBattleRating','1025');localStorage.setItem('norikaeBattleRating','1026');await state.flushStorage();
      gameType='normal';drawShareCard();const blob=await new Promise(resolve=>document.getElementById('shareCanvas').toBlob(resolve,'image/png'));
      await navigator.share({title:'result',text:'normal',url:'https://norikae-rush.jp/',files:[new File([blob],'result.png',{type:'image/png'})]});
      window.cancelNativeShare=true;let cancelled=false;try{await navigator.share({text:'cancel'})}catch(e){cancelled=e.name==='AbortError'}
      let suspended=false;window.NativeAudio.suspend=()=>{suspended=true};callbacks.appStateChange({isActive:false});
      localStorage.removeItem('norikaeRushBest_beginner');await state.flushStorage();
      return {restored,unrelated,value:store.norikaeBattleRating,deleted:!('norikaeRushBest_beginner'in store),writes,files,deletes,shares,cancelled,suspended,error:state.storageError};
    });
    assert.equal(result.restored,'1024');assert.equal(result.unrelated,null);assert.equal(result.value,'1026');assert(result.deleted);assert(result.files[0].data.startsWith('iVBOR'));assert.equal(result.shares[0].files[0],'file:///cache/result.png');assert.equal(result.shares[0].url,'https://norikae-rush.jp/');assert.equal(result.deletes.length,1);assert(result.cancelled);assert(result.suspended);assert.equal(result.error,null);
  }finally{await browser.close()}
});
