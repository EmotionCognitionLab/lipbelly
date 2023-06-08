'use strict'

import { app, protocol, BrowserWindow, ipcMain } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
import path from 'path'
const AmazonCognitoIdentity = require('amazon-cognito-auth-js')
import awsSettings from '../../common/aws-settings.json'

const isDevelopment = process.env.NODE_ENV !== 'production'

import emwave from './emwave'

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

async function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }

  return win
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
let mainWin = null
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }

  try {
    await emwave.startEmWave()
    mainWin = await createWindow()
    emwave.createClient(mainWin)
    mainWin.setFullScreen(true)
    mainWin.show()
    emwave.hideEmWave()

  } catch (err) {
    console.error('Error starting emwave', err);
    mainWin.webContents.send('emwave-status', 'ConnectionFailure');
  }

})

app.on('before-quit', () => {
  emwave.stopEmWave()
})

ipcMain.handle('show-login-window', () => {
  const auth = new AmazonCognitoIdentity.CognitoAuth(awsSettings)
  auth.useCodeGrantFlow();
  const url = auth.getFQDNSignIn();
  mainWin.loadURL(url)
  
  mainWin.webContents.on('will-redirect', async (event, oauthRedirectUrl) => {
    if (!oauthRedirectUrl.startsWith(awsSettings.RedirectUriSignIn)) return

    event.preventDefault()
    // depending on how the oauth flow went, the main window may now be showing
    // an Amazon Cognito page. We need to re-load the app and tell it to handle
    // the oauth response.
    // we want the renderer window to load the response from the oauth server
    // so that it gets the session and can store it
    
    // // in prod mode app URLs start with 'app://'
    const query = oauthRedirectUrl.indexOf('?') > 0 ? oauthRedirectUrl.slice(oauthRedirectUrl.indexOf('?')) : ''
    const oauthHandler = process.env.WEBPACK_DEV_SERVER_URL ? `http://localhost:8080/./index.html#/login/index.html${query}` : `app://./index.html#/login/index.html${query}`
    // try {
    await mainWin.loadURL(oauthHandler)  
    // } catch (err) {
    //   // For unknown reasons, the mainWin.loadURL call above reliably triggers
    //   // ERR_ABORTED (or sometimes ERR_FAILED). Wrapping it in a setTimeout 
    //   // (so it happens after the will-redirect handler is over) does not help.
    //   if (!err.message.startsWith("ERR_ABORTED") && !err.message.startsWith("ERR_FAILED")) {
    //     remoteLogger.error(err)
    //     throw(err)
    //   }
    // }
  })
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}