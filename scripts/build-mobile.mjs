import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'mobile/dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let html = await readFile(path.join(root, 'index.html'), 'utf8');
const scripts = [];
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (_, source) => {
  scripts.push(source); return '';
});
if (scripts.length !== 4) throw new Error(`Expected four game scripts, found ${scripts.length}; review the native build extractor`);
for (const [index, source] of scripts.entries()) await writeFile(path.join(out, `game-${index}.js`), source);
// Runs in the game's classic-script global lexical environment. Web source remains unchanged.
await writeFile(path.join(out, 'native-audio.js'), `window.NativeAudio={
  async suspend(){stopBgm();stopQuizBgm();await Promise.all([correctAudioCtx,uxCtx,bAudio].filter(Boolean).map(ctx=>ctx.suspend().catch(()=>{})))},
  updateButton(){const b=document.getElementById('native-sound');b.textContent=soundPrefs.enabled?'音声 ON':'音声 OFF';b.setAttribute('aria-pressed',String(soundPrefs.enabled))}
};`);
await writeFile(path.join(out, 'game-scripts.json'), JSON.stringify([...scripts.map((_, i) => `game-${i}.js`), 'native-audio.js']));
html = html.replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
html = html.replaceAll('train_matsu.ogg', 'train_matsu.m4a').replaceAll('after_fanfare_aishu.ogg', 'after_fanfare_aishu.m4a');
html = html.replace('</head>', '<link rel="stylesheet" href="native.css"></head>');
html = html.replace('<body>', '<body><div id="native-loading" role="status">読み込み中…</div><div class="native-bar"><span id="native-status">オフラインでプレイ可能</span><button id="native-sound" type="button" aria-pressed="true">音声 ON</button></div>');
html = html.replace('</body>', '<script type="module" src="native.js"></script></body>');
await writeFile(path.join(out, 'index.html'), html);
await copyFile(path.join(root, 'mobile/src/native.css'), path.join(out, 'native.css'));
for (const file of ['train_matsu.m4a', 'after_fanfare_aishu.m4a']) await copyFile(path.join(root, 'mobile/assets', file), path.join(out, file));
await build({ entryPoints: [path.join(root, 'mobile/src/bootstrap.js')], outfile: path.join(out, 'native.js'), bundle: true, format: 'esm', target: 'es2022' });
// A separate export allows tests to exercise the same native adapter with plugin substitutes.
await build({ entryPoints: [path.join(root, 'mobile/src/bridge.js')], outfile: path.join(out, 'native-bridge.js'), bundle: true, format: 'esm', target: 'es2022' });
console.log(`Bundled ${scripts.length} unchanged game scripts and two iOS-compatible local AAC assets into mobile/dist`);
