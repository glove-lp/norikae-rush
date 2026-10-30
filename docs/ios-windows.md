# WindowsからiOS公開へ進むための準備（Issue #10）

## 今回の範囲

既存 `index.html` とWebのOGG音声は変更していません。通常・ラッシュ・BOTバトル・採点・問題データは同一です。
`npm run build:ios` は同じHTMLから4つのゲームスクリプトを無改変で抽出し、画像を含むHTMLと音声を
`mobile/dist` に同梱します。`server.url` は設定せず、iOSでは `capacitor://localhost` から起動します。
ゲームに外部接続は不要です（SNS共有の送信先アプリ等は別）。

アプリ専用の変更:
- safe area、縦画面（iPhone）、44px以上の音声ボタン、オフライン表示。
- iOS標準共有シート。PNGをCacheに一時保存して共有し、完了/キャンセル後に削除。
- Preferences/UserDefaultsへゲーム記録・レーティング・音声設定を保存。起動時にゲームスクリプトより先に復元。
  `localStorage` の一時データが消えても復元できる構成。アンインストールでは記録も消えます。クラウド同期はありません。
- Appの非アクティブ化時にBGM・WebAudioを停止。復帰後の音声操作はユーザーが行います。
- Vorbisの古いiOSでの互換性に依存しないAAC/M4A音声。元WebのOGGは維持。

Bundle ID `jp.norikae.rush` は未登録の仮値です。App Store Connectで利用可能か確認してから確定してください。
最低OSは生成プロジェクトのiOS 15。現行Simulatorでの検証は最低OS/全OS版での動作保証ではありません。

## Windowsでの開発

Node.js 24 LTS、GitをインストールしてPowerShellで実行します（Mac不要）。

```powershell
npm ci
npm ci --prefix tests
npm run build:ios
npm run sync:ios
# Webゲームのブラウザーテスト用Chromium
cd tests
npx playwright install chromium
cd ..
python -m http.server 8014 --bind 127.0.0.1
```

別のPowerShell:

```powershell
$env:TEST_URL = 'http://127.0.0.1:8014'
$env:CHROMIUM_PATH = node -p "require('./tests/node_modules/playwright').chromium.executablePath()"
node --test tests/*.cjs
```

Web版はルート、アプリ用HTMLは `/mobile/dist/` で表示できます。通常のブラウザーではネイティブAPIの実機検証にはなりません。
`mobile/dist` とiOSのpublicは生成物です。HTMLを2か所編集せず、ゲーム変更後に `npm run sync:ios` で更新します。
Apple向けコンパイルはWindows上では実行できず、GitHubのmacOSジョブが担当します。

## macOS CI（アカウント・証明書不要）

`.github/workflows/ios-simulator.yml` はpush/PRで実行します。

1. macos-15上のXcode 26以降を選択、lockfileどおりにnpmをインストール。
2. `npm run sync:ios` でWeb資産とSPMプラグインを同期。
3. `xcodebuild` の `iphonesimulator` / Debug / `CODE_SIGNING_ALLOWED=NO` でビルド。
4. iPhone Simulatorへインストール・起動。Debug限定の `--smoke-test` で実際のWKWebViewを検証。
5. 外部HTTP/SをWKContentRuleListで遮断し、ローカル音声・ゲーム・レイアウト・タイマー・共有PNGを検証。
   実際のUIActivityViewControllerの表示/キャンセルも確認します。SNSへの投稿はしません。
6. アプリを終了してこのSimulatorアプリのWebKitデータだけを削除し、再起動してPreferencesからの復元を確認。
7. ビルドログ、JSON結果、Simulatorスクリーンショット、署名なしSimulator用 `.app.zip` を7日間保存。

この `.app` はWindows/iPhoneに直接インストールするためのIPAではなく、Simulator専用です。
Debug用自己検証はReleaseビルドに含まれません。実機・TestFlightを実施したと扱わないでください。
既存の全Web回帰テストはLinux CIでも継続実行し、アプリ専用のプラグインアダプターはブラウザーでモック検証します。

## 音声変換・ライセンス

`mobile/assets/*.m4a` はリポジトリ内の音声から次の方法で作成しました。通常のビルドでは再変換不要です。

```text
ffmpeg -i train_matsu.ogg -c:a aac -b:a 160k -movflags +faststart mobile/assets/train_matsu.m4a
ffmpeg -i after_fanfare_aishu.ogg -c:a aac -b:a 160k -movflags +faststart mobile/assets/after_fanfare_aishu.m4a
```

元HTMLに記載されている DOVA-SYNDROME / MATSU「Train」、藍舟「アフター・ファンファーレ」の表示を維持します。
音源のアプリ再配布・変換が各ライセンスに適合するか、公開前に権利者の最新条件を確認してください。
変換は配布ライセンスの確認完了を意味しません。

## Phase 2: 承認とApple Developer登録後に必要なこと（未実施）

- Bundle IDの確定、App Store向けアイコン・起動画面の作成。現在のCapacitor生成アイコン/起動画面は仮です。
- Apple Developer Program登録、App Store Connect登録、証明書・プロビジョニング・APIキーの安全な設定。
  秘密鍵をGitに置かずGitHub Secrets等へ登録します。今回は登録・課金・証明書作成をしていません。
- 署名付きArchive/IPA、TestFlight配布、実機のノッチ・音声・バックグラウンド復帰・共有・保存・各OS版を確認。
- プライバシーポリシー/サポートURL、年齢区分、プライバシー申告、スクリーンショット、説明文、輸出コンプライアンス。
- PrivacyInfo.xcprivacyにはPreferencesとFilesystemの理由を記載済みですが、最終SDKと収集実態に対して再確認してください。
- 世界ランキングは既存ビルドで無効。端末内レーティングのみです。対人オンライン機能を追加したものではありません。
- App Store審査4.2のため、同梱オフラインゲーム・OS共有・保存・safe area等のアプリとしての操作体験を整理。
  Capacitor採用だけで審査通過が保証されるわけではありません。

## 費用

- 今回はApple契約不要、Macの購入費用不要。Capacitor/ローカル開発ツールは無償。
- 公開リポジトリの標準GitHub-hosted runner（このmacos-15を含む）は通常無料。非公開化、larger runner、
  保存量超過等では課金条件が変わるため、GitHubのBillingと利用枠を確認してください。有料サービスは契約していません。
- TestFlight/App Store段階ではApple Developer Programが通常年99 USD相当（地域・税で異なる）。
  個人登録では販売元が個人名になります。最新の地域料金は登録前に確認してください。
- プライバシー/サポートページのホスティングは既存サイト等を使えます。音源・素材の権利条件次第では別途対応が必要です。

参考: https://capacitorjs.com/docs/ios / https://developer.apple.com/app-store/review/guidelines/#minimum-functionality
/ https://developer.apple.com/programs/enroll/
