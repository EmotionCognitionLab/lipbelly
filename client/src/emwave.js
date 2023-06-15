const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const { ipcMain, app } = require('electron');
const CBuffer = require('CBuffer');
const { epToCoherence } = require('./coherence.js')
const { Logger } = require('../../common/logger/logger.js')

let logger = new Logger(false)
let emWavePid = null;
const client = net.Socket();
const artifactLimit = 60; // we alert if there are more than this many artifacts in 60s
const artifactsToTrack = 120; // we get data every 500ms, so this holds 60s of data
let artifacts = new CBuffer(artifactsToTrack);
let reportSessionEnd = true;
const subscribers = [];
let coherenceValues = [];
let curRegime;
let curSegmentStartMsOffset;
let curSegmentStartTime;
let stage = 0;
let sensorStopped = true;

// sample data string
// <D01 NAME="Pat" LVL="1" SSTAT="2" STIME="2000" S="0" AS="0" EP="0" IBI="1051" ART="FALSE" HR="0" />
// sample real (not interpolated) ibi string
// <IBI> 1139 </IBI>
// sample session ended string
// <CMD ID="3" FROM="::ffff:127.0.0.1:APP" />
function parseIBIData(data) {
    const allDataRegex = /<D01.* STIME="([0-9]+)" .*EP="([0-9]+)" .*IBI="([0-9]+)" ART="(TRUE|FALSE)"/;
    const match = data.match(allDataRegex);
    if (match && match[1] !== "0") { // STIME of 0 means that the there isn't actually an emWave session; ignore those data
        return {stime: match[1], ep: match[2], ibi: match[3], ibiType: 'interpolated', artifact: match[4] === 'TRUE' ? true : false};
    } 
    
    const ibiRegex = /<IBI> ([0-9]+) <\/IBI>/;
    const match2 = data.match(ibiRegex);
    if (match2) {
        return {ibi: match2[1], ibiType: 'real'}
    }

    if (data.match(/<CMD ID="3" FROM="::ffff:127.0.0.1:APP"/)) {
        if (reportSessionEnd) {
            return 'SessionEnded';
        } else {
            reportSessionEnd = true;
            return null;
        }
    }
        
    return null;
}

ipcMain.handle('pacer-regime-changed', (_event, sessionStartTime, regime) => {
    if (sessionStartTime !== 0) notifyAvgCoherence();
    
    curRegime = regime;
    curSegmentStartMsOffset = sessionStartTime;
    curSegmentStartTime = Date.now();
});

ipcMain.on('current-user', (_event, user) => {
    logger = new Logger(false, user)
})

function notifyAvgCoherence() {
    try {
        // we need a minimum of three minutes of data and we get
        // (ideally) two values per second
        const min_values = 2 * 60 * 3;
        if (coherenceValues.length < min_values) {
            logger.error(`Regime ${JSON.stringify(curRegime)} starting at ${curSegmentStartMsOffset} has ended but there are less than three minutes of data (${coherenceValues.length} coherence values). Unable to report average coherence.`);
            return;
        }

        const coherenceSum = coherenceValues.reduce((cur, prev) => cur + prev, 0);
        const coherenceAvg = coherenceSum / coherenceValues.length;
        subscribers.forEach(callback => callback({sessionStartTime: curSegmentStartMsOffset, regime: curRegime, avgCoherence: coherenceAvg}, stage));
    } finally {
        // TODO if there's an error in one of the subscribers (or too little data) are we 100% sure we want to wipe these out?
        coherenceValues = [];
        curRegime = null;
        curSegmentStartMsOffset = null;
        curSegmentStartTime = null;
    }
    
}

export default {
    async createClient(win) {
        let retries = 0;
    
        client.on('error', async function() {
            if (retries > 0) logger.log('network error') // we always get error on 1st try; don't log unless we are past that
            retries++;
            if (retries < 7) {
                await new Promise(r => setTimeout(r, retries * 10000));
                if (retries > 1) logger.log(`doing retry #${retries}`);
                client.connect(20480, '127.0.0.1', function() {
                    win.webContents.send('emwave-status', 'Connected');
                });	
            } else {
                win.webContents.send('emwave-status', 'ConnectionFailure');
            }
        });
    
        client.on('data', function(data) {
            const hrData = parseIBIData(new Buffer.from(data).toString());
            if (hrData === 'SessionEnded' ) {
                win.webContents.send('emwave-status', 'SessionEnded');
            } else if (hrData !== null && !sensorStopped) {  // without sensorStopped check a race can cause us to send data to client after client has told us to stop
                win.webContents.send('emwave-ibi', hrData);

                // we ignore the first 30 seconds of data from each segment
                if (!curSegmentStartTime || curSegmentStartTime + (30 * 1000) > Date.now() ) return;
                    
                if (Object.prototype.hasOwnProperty.call(hrData, 'artifact')) {
                    artifacts.push(hrData.artifact);
                    let artCount = 0;
                    artifacts.forEach(isArtifact => {
                        if (isArtifact) artCount++
                    });
                    if (artCount > artifactLimit) {
                        win.webContents.send('emwave-status', 'SensorError');
                    }
                }
                if (Object.prototype.hasOwnProperty.call(hrData, 'ep')) {
                    coherenceValues.push(epToCoherence(hrData.ep));
                }
            }
        });
    
        client.connect(20480, '127.0.0.1', function() {
            win.webContents.send('emwave-status', 'Connected');
        });	
    
        return client;
    },
 
    async startEmWave() {
        // must set stdio: 'ignore' on spawn options
        // otherwise the stdout buffer will overflow after ~30s of pulse sensor data
        // and emWave will hang
        if (process.platform === 'darwin') {
            const emWaveProc = spawn('/Applications/emWave Pro.app/Contents/MacOS/emWaveMac', [], {stdio: 'ignore'})
            emWavePid = emWaveProc.pid
            return new Promise((resolve, reject) => {
                emWaveProc.on('spawn', () => resolve(true));
                emWaveProc.on('error', (err) => reject(err));
            });
        } else if (process.platform === 'win32') {
            const emWaveProc = spawn('C:\\Program Files\\HeartMath\\emWave\\emWavePC.exe', [], {stdio: 'ignore'});
            emWavePid = emWaveProc.pid;
            return new Promise((resolve, reject) => {
                emWaveProc.on('spawn', () => resolve(true));
                emWaveProc.on('error', (err) => reject(err));
            });
        } else {
            throw `The '${process.platform}' operating system is not supported. Please use either Macintosh OS X or Windows.`
        }
    },

    async hideEmWave() {
        const hideScript = process.env.NODE_ENV === 'production' ? path.join(path.dirname(app.getPath('exe')), 'hide-emwave.ps1') : path.join(app.getAppPath(), '../src/powershell/hide-emwave.ps1')
            if (process.platform === 'win32' && emWavePid) {
                await spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [hideScript, emWavePid], {stdio:'ignore'});
            }
    },

    startPulseSensor() {
        client.write('<CMD ID=2 />'); // tells emWave to start getting data from heartbeat sensor
        artifacts = new CBuffer(artifactsToTrack);
        sensorStopped = false;
        curSegmentStartTime = Date.now();
    },

    stopPulseSensor() {
        reportSessionEnd = false; // we're ending the session, not emWave, so don't tell our listeners about it
        client.write('<CMD ID=3 />'); // tells emWave to stop getting data from heartbeat sensor
        sensorStopped = true;
        notifyAvgCoherence();
    },

    stopEmWave() {
        // TODO should we call notifyAvgCoherence here? (Or just stopPulseSensor()?)
        sensorStopped = true;
        client.destroy();
        if (emWavePid !== null) {
            if (process.kill(emWavePid)) {
                emWavePid = null;
            } else {
                // TODO put in some wait/retry logic?
                logger.log('killing emwave returned false');
            }
        }
    },

    subscribe(callback) {
        subscribers.push(callback);
    },

    setStage(newStage) {
        if (!Number.isInteger(newStage) || newStage < 1 || newStage > 3) {
            throw new Error(`Expected stage to be 1, 2 or 3, but got ${newStage}.`)
        }
        stage = newStage
    }
}
