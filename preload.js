// Preload script runs in a context that has access to both
// the DOM and Node.js APIs, but cannot directly access the main process
// This is a security best practice in Electron

const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// the APIs you need. This is where you can add custom APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Add your custom APIs here
  // Example:
  // getVersion: () => process.versions.electron
});
