import { initializeNative } from './bridge.js';

try {
  const state = await initializeNative();
  const response = await fetch('game-scripts.json');
  if (!response.ok) throw new Error('Missing bundled game scripts');
  for (const src of await response.json()) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.onload = resolve; script.onerror = reject;
      document.body.append(script);
    });
  }
  // The original page normally registers these through DOMContentLoaded/load.
  // Native Preferences hydration completes asynchronously, so initialize explicitly too.
  window.syncGameTrainArt(); window.renderHomeBests(); window.renderProfile(); window.renderSoundChoices();
  document.getElementById('native-sound').addEventListener('click', () => {
    window.toggleAllSound(); window.NativeAudio.updateButton();
  });
  window.NativeAudio.updateButton();
  state.ready = true;
  document.documentElement.dataset.nativeReady = 'true';
  document.getElementById('native-loading').remove();
} catch (error) {
  console.error('Native startup failed', error);
  document.getElementById('native-loading').textContent = '起動できませんでした。アプリを開き直してください。';
}
