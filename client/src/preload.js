import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('mainAPI', {
    showLoginWindow: () => ipcRenderer.invoke('show-login-window'),
    loginSucceeded: (session) => ipcRenderer.invoke('login-succeeded', session),
    startPulseSensor: () => ipcRenderer.send('pulse-start'),
    stopPulseSensor: () => ipcRenderer.send('pulse-stop'),
    handleEmWaveIBIEvent: (callback) => ipcRenderer.on('emwave-ibi', callback),
    handleEmWaveStatusEvent: (callback) => ipcRenderer.on('emwave-status', callback),
    uploadEmWaveData: async(session) => ipcRenderer.invoke('upload-emwave-data', session),
    uploadBreathData: async(session) => ipcRenderer.invoke('upload-breath-data', session),
    pacerRegimeChanged: async (startTime, regime) => await ipcRenderer.invoke('pacer-regime-changed', startTime, regime),
    notifyAverageCoherence: () => ipcRenderer.send('notify-average-coherence'),
    getRestBreathingDays: async (stage) => await ipcRenderer.invoke('get-rest-breathing-days', stage),
    getPacedBreathingDays: async (stage) => await ipcRenderer.invoke('get-paced-breathing-days', stage),
    getSegmentsAfterDate: async (date, stage) => await ipcRenderer.invoke('get-segments-after-date', date, stage),
    getKeyValue: async (key) => await ipcRenderer.invoke('get-key-value', key),
    setKeyValue: (key, value) => ipcRenderer.send('set-key-value', key, value),
    setStage: (stage) => ipcRenderer.invoke('set-stage', stage),
    quit: () => ipcRenderer.invoke('quit')
})
