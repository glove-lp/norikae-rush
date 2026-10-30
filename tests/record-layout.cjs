const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

// Measure actual text glyph ranges, not just the width of a block containing text.
async function recordGeometry(page){
  return page.locator('.game-record-box').evaluate(box=>{
    const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom});
    const textRects=el=>{
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const bounds=[];
      while(walker.nextNode()){
        if(!walker.currentNode.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(walker.currentNode);
        bounds.push(...[...range.getClientRects()].map(rect));
      }
      return bounds;
    };
    return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,box:rect(box.getBoundingClientRect()),cards:[...box.querySelectorAll('.best-item')].map(card=>{
      const r=card.getBoundingClientRect(),style=getComputedStyle(card);
      const content={left:r.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft),right:r.right-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight),top:r.top+parseFloat(style.borderTopWidth)+parseFloat(style.paddingTop),bottom:r.bottom-parseFloat(style.borderBottomWidth)-parseFloat(style.paddingBottom)};
      return {rect:rect(r),content,text:card.textContent,label:card.querySelector('.bmode').textContent,value:card.querySelector('.bscore').textContent,ranges:textRects(card),scoreOverflow:getComputedStyle(card.querySelector('.bscore')).overflow,textOverflow:getComputedStyle(card.querySelector('.bscore')).textOverflow};
    })};
  });
}
function assertFits(g){
  assert.equal(g.overflow,false);assert.equal(g.cards.length,4);
  for(const card of g.cards){
    assert(card.rect.left>=0&&card.rect.right<=g.viewport);
    assert(card.rect.left>=g.box.left&&card.rect.right<=g.box.right);
    assert(card.ranges.length>=2);
    for(const r of card.ranges){
      assert(r.left>=card.content.left-1&&r.right<=card.content.right+1,`${card.text}: horizontal text overflow ${JSON.stringify({r,content:card.content})}`);
      assert(r.top>=card.content.top-1&&r.bottom<=card.content.bottom+1,`${card.text}: vertical text overflow`);
    }
    assert.notEqual(card.scoreOverflow,'hidden');assert.notEqual(card.scoreOverflow,'clip');assert.notEqual(card.textOverflow,'ellipsis');
  }
  // Cards in the same row keep a common top and height, including RUSH.
  for(let i=0;i<g.cards.length;i++)for(let j=i+1;j<g.cards.length;j++){
    const a=g.cards[i].rect,b=g.cards[j].rect;
    if(Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)){
      assert(Math.abs(a.top-b.top)<1);assert(Math.abs(a.bottom-b.bottom)<1);
      assert(a.right<=b.left||b.right<=a.left);
    }
  }
}

test('Issue 8 record text and all cards fit at mobile and desktop widths',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.TEST_URL||'http://127.0.0.1:8015');
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const width of [320,375,390,430,601,768,1280]){
      await t.test(`${width}px: empty and saved records fit without clipping`,async()=>{
        await page.setViewportSize({width,height:900});
        await page.evaluate(()=>{for(const mode of Object.keys(modeConfig))localStorage.removeItem(storageKey(mode));localStorage.removeItem('norikaeRushBest_rush');renderHomeBests()});
        let g=await recordGeometry(page);assertFits(g);assert.deepEqual(g.cards.map(x=>x.value),['—','—','—','0問']);
        await page.evaluate(()=>{saveBest('beginner',20,10000,0);saveBest('intermediate',50,30000,3);saveBest('extreme',70,50000,5);saveRushBest(100);renderHomeBests()});
        g=await recordGeometry(page);assertFits(g);assert.deepEqual(g.cards.map(x=>x.label),['初級','中級','上級','RUSH']);assert.deepEqual(g.cards.map(x=>x.value),['偏差値 20','偏差値 50','偏差値 70','100問']);
        // Re-rendering and persistence keep the complete strings and geometry.
        await page.reload();assertFits(await recordGeometry(page));assert.equal(await page.locator('#best-extreme').textContent(),'偏差値 70');
      });
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
