import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('mainAPI', {
    showLoginWindow: () => ipcRenderer.invoke('show-login-window')
})