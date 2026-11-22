// ecraft launcher - preload
const { ipcRenderer } = require('electron');

window.ecNative = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, cb) => ipcRenderer.on(channel, (e, data) => cb(data))
};
