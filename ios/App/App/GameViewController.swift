import UIKit
import WebKit
import Capacitor

final class GameViewController: CAPBridgeViewController {
    #if DEBUG
    private var smokeStarted = false
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard ProcessInfo.processInfo.arguments.contains("--smoke-test"), !smokeStarted else { return }
        smokeStarted = true
        Task { @MainActor in await runSmokeTests() }
    }

    @MainActor private func runSmokeTests() async {
        var output: [String: Any] = ["success": false]
        do {
            guard let webView else { throw NSError(domain: "Smoke", code: 1) }
            // Exercise the installed app with all remote HTTP/S resources blocked.
            let rules = """
            [{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]
            """
            let list: WKContentRuleList = try await withCheckedThrowingContinuation { continuation in
                WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "OfflineSmoke", encodedContentRuleList: rules) { list, error in
                    if let list { continuation.resume(returning: list) }
                    else { continuation.resume(throwing: error ?? NSError(domain: "SmokeRules", code: 1)) }
                }
            }
            webView.configuration.userContentController.add(list)
            webView.reload()
            var ready = false
            for _ in 0..<300 {
                try await Task.sleep(nanoseconds: 100_000_000)
                ready = (try? await webView.evaluateJavaScript("window.NativeGame?.ready === true")) as? Bool ?? false
                if ready { break }
            }
            guard ready else { throw NSError(domain: "Game did not become ready", code: 2) }
            if ProcessInfo.processInfo.arguments.contains("--restore-test") {
                let restored = try await webView.callAsyncJavaScript("""
                if (localStorage.getItem('norikaeRushNativeSmoke') !== 'persisted') throw Error('Preferences restore failed');
                if (bRating !== 824) throw Error('Rating hydration happened too late');
                if (!document.getElementById('best-beginner').textContent.includes('70')) throw Error('Best not restored');
                return {success:true, checks:['Preferences restored before game initialization','rating and best visible after app termination']};
                """, arguments: [:], in: nil, contentWorld: .page)
                output = restored as? [String: Any] ?? [:]
            } else {
                let checks = try await webView.callAsyncJavaScript(Self.smokeScript, arguments: [:], in: nil, contentWorld: .page)
                output = checks as? [String: Any] ?? [:]
                // Verify that the real Capacitor Share plugin presents UIKit's share sheet.
                _ = try await webView.callAsyncJavaScript("""
                window.nativeShareFinished=false;
                const blob=await new Promise(resolve=>document.getElementById('shareCanvas').toBlob(resolve,'image/png'));
                navigator.share({title:'乗り換えRUSH',text:'Simulator test',url:'https://norikae-rush.jp/',files:[new File([blob],'result.png',{type:'image/png'})]}).catch(e=>{if(e.name!=='AbortError')window.nativeShareError=String(e)}).finally(()=>window.nativeShareFinished=true);
                return true;
                """, arguments: [:], in: nil, contentWorld: .page)
                var activity: UIActivityViewController?
                for _ in 0..<100 {
                    try await Task.sleep(nanoseconds: 100_000_000)
                    activity = presentedViewController as? UIActivityViewController
                    if activity != nil { break }
                }
                guard let activity else { throw NSError(domain: "Native share sheet not shown", code: 3) }
                activity.completionWithItemsHandler?(nil, false, nil, nil)
                activity.dismiss(animated: false)
                var finished = false
                for _ in 0..<30 {
                    try await Task.sleep(nanoseconds: 100_000_000)
                    finished = (try? await webView.evaluateJavaScript("window.nativeShareFinished === true && !window.nativeShareError")) as? Bool ?? false
                    if finished { break }
                }
                guard finished else { throw NSError(domain: "Share callback did not complete cleanly", code: 4) }
                output["nativeShareSheet"] = true
                output["success"] = true
            }
        } catch {
            output = ["success": false, "error": String(describing: error)]
        }
        do {
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys]).write(to: documents.appendingPathComponent("smoke-results.json"), options: .atomic)
        } catch { NSLog("Could not write smoke results: %@", String(describing: error)) }
    }

    private static let smokeScript = #"""
    const checks=[];
    const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message)};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    assert(location.protocol==='capacitor:','bundled capacitor scheme');
    assert(window.NativeGame.native,'real native plugins');
    assert(document.querySelector('meta[name=viewport]').content.includes('viewport-fit=cover'),'safe area viewport');
    assert(parseFloat(getComputedStyle(document.body).paddingTop)>=0,'safe area CSS resolved');
    assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
    for(const asset of ['train_matsu.m4a','after_fanfare_aishu.m4a']){const response=await fetch(asset);assert(response.ok&&(await response.arrayBuffer()).byteLength>1000000,'offline bundled audio '+asset)}
    for(const mode of ['beginner','intermediate','extreme']){
      startGame(mode);
      for(let i=0;i<5;i++){assert(currentOptions.length===4,mode+' four options '+i);answerChoice(currentOptions.findIndex(x=>x.correct));completePendingQuestion()}
      assert(records.length===5&&records.every(x=>x.correct),mode+' five correct results');
    }
    startRush();answerChoice(currentOptions.findIndex(x=>!x.correct));completePendingQuestion();assert(rushCorrect===0&&document.querySelector('#final.active'),'rush zero result');
    restartCurrentGame();assert(q===1&&rushCorrect===0,'rush replay');goHome();
    startBattle();await wait(2400);assert(!document.querySelector('.battle-option').disabled,'battle touch choices enabled');
    document.querySelectorAll('.battle-option')[BATTLE_Q[0].answer].click();assert(bMy===1,'battle answer');closeBattle();await wait(2300);assert(!document.getElementById('battleFeedback').classList.contains('show'),'no stale native feedback');
    startBattle();await wait(2400);clearTimeout(bBotTimer);bStart=performance.now()-20000;updateBattleTimer();assert(document.getElementById('battleFeedbackTitle').textContent==='TIME UP','battle timeout');await wait(5200);assert(bRound===1,'five second next question');closeBattle();
    soundPrefs.enabled=true;startBgm('home');await wait(500);assert(!document.getElementById('dovaHomeBgm').paused,'WKWebView media playback');playCorrectSound();playWrongSound();await wait(300);assert(correctAudioCtx.state==='running','WKWebView WebAudio');await NativeAudio.suspend();assert(document.getElementById('dovaHomeBgm').paused&&correctAudioCtx.state==='suspended','native audio suspension');
    saveBest('beginner',70,50000,5);bRating=824;localStorage.setItem('norikaeBattleRating','824');renderHomeBattleRating();localStorage.setItem('norikaeRushNativeSmoke','persisted');await NativeGame.flushStorage();assert(!NativeGame.storageError,'native Preferences writes');
    gameType='normal';drawShareCard();assert(document.getElementById('shareCanvas').getContext('2d').getImageData(0,0,1,1).data[3]===255,'share PNG rendered');
    return {success:true,checks,viewport:{width:innerWidth,height:innerHeight,safeTop:getComputedStyle(document.body).paddingTop},offline:'HTTP/S blocked by WKContentRuleList'};
    """#
    #endif
}
