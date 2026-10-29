const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

test('rush result details are restored after 100-question master celebration',async()=>{
  const browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    args:['--no-sandbox'],
  });
  try{
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.TEST_URL||'http://127.0.0.1:8011');
    const result=await page.evaluate(()=>{
      const ids=['rushCorrectCount','rushResultMessage','rushBestResult'];
      const selectors=['#rushResultArea .result-eyebrow','#rushResultArea .rush-result-main','#rushResultMessage','#rushBestResult'];
      const snapshot=()=>({
        visible:selectors.map(selector=>getComputedStyle(document.querySelector(selector)).display!=='none'),
        values:ids.map(id=>document.getElementById(id).textContent),
        celebration:document.getElementById('masterCelebration').classList.contains('show'),
      });
      rushCorrect=100;
      rushMasterAchieved=true;
      showRushFinal();
      const master=snapshot();
      rushCorrect=3;
      rushMasterAchieved=false;
      records=[];
      showRushFinal();
      const retry=snapshot();
      rushCorrect=0;
      showRushFinal();
      const zero=snapshot();
      return {master,retry,zero};
    });
    assert.deepEqual(result.master.visible,[false,false,false,false]);
    assert.equal(result.master.celebration,true);
    assert.deepEqual(result.retry.visible,[true,true,true,true]);
    assert.equal(result.retry.celebration,false);
    assert.equal(result.retry.values[0],'3');
    assert.equal(result.retry.values[1],'ナイスチャレンジ！');
    assert.match(result.retry.values[2],/100問連続正解/);
    assert.deepEqual(result.zero.visible,[true,true,true,true]);
    assert.equal(result.zero.values[0],'0');
    assert.equal(result.zero.values[1],'ここからリベンジ！');
    assert.deepEqual(errors,[]);
  }finally{
    await browser.close();
  }
});
