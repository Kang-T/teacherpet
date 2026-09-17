const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teacherpet', {
  loadState: () => ipcRenderer.invoke('state:load'),
  loadPrices: () => ipcRenderer.invoke('prices:load'),
  pricesPath: () => ipcRenderer.invoke('prices:path'),
  savePrices: (d) => ipcRenderer.invoke('prices:save', d),
  saveState: (s) => ipcRenderer.invoke('state:save', s),
  workArea: () => ipcRenderer.invoke('work-area'),
  info: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.send('app:quit'),
  openExternal: (url) => ipcRenderer.send('app:open-external', url),
  setAutostart: (on) => ipcRenderer.send('app:set-autostart', on),
  on: (ch, fn) => {
    const ok = ['ui:toggle-menu', 'timer:start', 'timer:stop', 'pet:size', 'pet:toggle-visible', 'work-area'];
    if (!ok.includes(ch)) return;
    ipcRenderer.on(ch, (_e, payload) => fn(payload));
  },
});
