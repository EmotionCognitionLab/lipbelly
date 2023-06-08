import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('mainAPI', {
    showLoginWindow: () => ipcRenderer.invoke('show-login-window'),
    startPulseSensor: () => ipcRenderer.send('pulse-start'),
    stopPulseSensor: () => ipcRenderer.send('pulse-stop'),
    handleEmWaveIBIEvent: (callback) => ipcRenderer.on('emwave-ibi', callback),
    handleEmWaveStatusEvent: (callback) => ipcRenderer.on('emwave-status', callback)
})
