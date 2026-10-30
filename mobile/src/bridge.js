import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

const gameKey = key => /^norikae(?:Rush|Battle)/.test(key);

// Dependencies can be substituted by browser tests; production uses real Capacitor plugins.
export async function initializeNative({
  native = Capacitor.isNativePlatform(), preferences = Preferences,
  filesystem = Filesystem, share = Share, app = App,
} = {}) {
  const state = { native, ready: false, storageError: null, async flushStorage() {} };
  window.NativeGame = state;
  if (!native) return state;

  const { keys } = await preferences.keys();
  for (const key of keys.filter(gameKey)) {
    const { value } = await preferences.get({ key });
    if (value !== null) localStorage.setItem(key, value);
  }
  let pending = Promise.resolve();
  const persist = task => {
    pending = pending.then(task).catch(error => {
      state.storageError = error.message || String(error);
      document.getElementById('native-status').textContent = '保存に失敗しました';
    });
  };
  state.flushStorage = () => pending;
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(key, value) {
    originalSet.call(this, key, value);
    if (this === localStorage && gameKey(String(key))) persist(() => preferences.set({ key: String(key), value: String(value) }));
  };
  Storage.prototype.removeItem = function(key) {
    originalRemove.call(this, key);
    if (this === localStorage && gameKey(String(key))) persist(() => preferences.remove({ key: String(key) }));
  };
  // Migrate existing game storage once without touching unrelated preferences.
  for (const key of Object.keys(localStorage).filter(gameKey)) {
    const value = localStorage.getItem(key);
    persist(() => preferences.set({ key, value }));
  }

  Object.defineProperty(navigator, 'canShare', { configurable: true, value: data =>
    !data.files || data.files.every(file => file.type === 'image/png') });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
    const files = [];
    const paths = [];
    try {
      for (const [index, file] of (data.files || []).entries()) {
        if (file.type !== 'image/png') throw new TypeError('Only result PNG images are supported');
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const path = `shares/result-${Date.now()}-${index}.png`;
        const { uri } = await filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true });
        paths.push(path); files.push(uri);
      }
      return await share.share({ title: data.title, text: data.text, url: data.url, ...(files.length ? { files } : {}) });
    } catch (error) {
      if (/cancel/i.test(error.message || '')) throw new DOMException('Share cancelled', 'AbortError');
      throw error;
    } finally {
      await Promise.all(paths.map(path => filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {})));
    }
  } });
  await app.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) window.NativeAudio?.suspend();
  });
  return state;
}
