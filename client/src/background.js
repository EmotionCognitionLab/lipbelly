'use strict'

import { app, protocol, BrowserWindow, ipcMain, Menu } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
import path from 'path'
const AmazonCognitoIdentity = require('amazon-cognito-auth-js')
import awsSettings from '../../common/aws-settings.json'
import { breathDbPath, closeBreathDb, getKeyValue, setKeyValue, getRestBreathingDays, getPacedBreathingDays, getSegmentsAfterDate } from './breath-data'
import { emWaveDbPath, deleteShortSessions as deleteShortEmwaveSessions } from './emwave-data'
import emwave from './emwave'
import { SessionStore } from './session-store.js'
import version from "../version.json"
import s3Utils from './s3utils.js'

const isDevelopment = process.env.NODE_ENV !== 'production'

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

app.setAboutPanelOptions({
  applicationName: "MindBody Study",
  applicationVersion: version.v
})

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

const EARNINGS_MENU_ID = 'earnings'
const TRAINING_MENU_ID = 'training'
const SURVEY_MENU_ID = 'survey'
const LAB_VISIT_MENU_ID = 'lab-visit'
const SHOW_EMWAVE_MENU_ID = 'show-emwave'

function buildMenuTemplate(window) {
  const isMac = process.platform === 'darwin'

  return [
    // { role: 'appMenu' }
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [ ])
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Earnings', id: EARNINGS_MENU_ID, click: () => window.webContents.send('show-earnings')},
        { label: 'Daily Training', id: TRAINING_MENU_ID, click: () => window.webContents.send('show-tasks')},
        { label: 'Lab Visit 2 Survey', id: SURVEY_MENU_ID, click: () => showSurvey(window), visible: false, accelerator: 'CmdOrCtrl+Shift+S'},
        { label: 'Lab Visit 2 Breathing', id: LAB_VISIT_MENU_ID, click: () => showLabVisit2(window), visible: false, accelerator: 'CmdOrCtrl+Shift+L'},
        { label: 'Show emWave', id: SHOW_EMWAVE_MENU_ID, click: () => showEmwave(), visible: false, accelerator: 'CmdOrCtrl+Shift+E'}, // NB the same key sequence triggers the end of in-lab-setup in TrainingComponent.vue
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    // { role: 'helpMenu' }
    ...(isMac ? [] : [{
      label: 'Help',
      submenu: [{role: 'about'}]
    }])
  ]
}

function showSurvey(window) {
  const fullSession = SessionStore.buildSession(SessionStore.session);
  const idToken = fullSession.getIdToken().getJwtToken();
  if (!idToken) {
      throw new Error('No id token found in session')
  }
  const payload = idToken.split('.')[1];
  const tokenobj = JSON.parse(atob(payload));
  const uid = tokenobj.sub;
  window.loadURL(`https://usc.qualtrics.com/jfe/form/SV_4H0l9LJmeR6AlfM?uid=${uid}`)
}

function showLabVisit2(window) {
  const visit2Url = process.env.WEBPACK_DEV_SERVER_URL ? 'http://localhost:8080/#/visit2' : 'app://./index.html#/visit2'
  window.loadURL(visit2Url)
}

function showEmwave() {
  emwave.showOrHideEmwave('SHOW')
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
    const menuTmpl = buildMenuTemplate(mainWin)
    const menu = Menu.buildFromTemplate(menuTmpl)
    Menu.setApplicationMenu(menu)
    emwave.createClient(mainWin)
    mainWin.setFullScreen(true)
    mainWin.show()
    emwave.showOrHideEmwave('HIDE')

  } catch (err) {
    console.error('Error starting emwave', err);
    mainWin.webContents.send('emwave-status', 'ConnectionFailure');
  }

})

app.on('before-quit', () => {
  emwave.stopEmWave()
  closeBreathDb()
})


ipcMain.on('pulse-start', () => {
  emwave.startPulseSensor()
})

ipcMain.on('pulse-stop', () => {
  emwave.stopPulseSensor()
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
    await mainWin.loadURL(oauthHandler)
  })
})

ipcMain.handle('upload-emwave-data', async (event, session) => {
  // give emWave a couple of seconds to save any lingering data before quitting
  await new Promise(resolve => setTimeout(() => {
    emwave.stopEmWave()
    resolve()
  }, 2000))
  deleteShortEmwaveSessions()
  const emWaveDb = emWaveDbPath()
  const fullSession = SessionStore.buildSession(session)
  await s3Utils.uploadFile(fullSession, emWaveDb)
  .catch(err => {
    console.error(err)
    return (err.message)
  })
  return null
})

ipcMain.handle('upload-breath-data', async (event, session) => {
  closeBreathDb();
  const breathDb = breathDbPath();
  const fullSession = SessionStore.buildSession(session);
  await s3Utils.uploadFile(fullSession, breathDb)
  .catch(err => {
    console.error(err);
    return (err.message);
  });
  return null;
});

ipcMain.handle('get-rest-breathing-days', (_event, stage) => {
  return getRestBreathingDays(stage)
})

ipcMain.handle('get-paced-breathing-days', (_event, stage) => {
  return getPacedBreathingDays(stage)
})

ipcMain.handle('get-segments-after-date', (_event, date, stage) => {
  return getSegmentsAfterDate(date, stage)
})

ipcMain.handle('get-key-value', (event, key) => {
  return getKeyValue(key)
})

ipcMain.on('set-key-value', (event, key, value) => {
  setKeyValue(key, value)
})

ipcMain.handle('set-stage', async(_event, stage) => {
  emwave.setStage(stage)
})

ipcMain.handle('disable-menus', () => {
  const m = Menu.getApplicationMenu()
  m.getMenuItemById(EARNINGS_MENU_ID).enabled = false
  m.getMenuItemById(TRAINING_MENU_ID).enabled = false
})

ipcMain.handle('quit', () => {
  app.quit();
});

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