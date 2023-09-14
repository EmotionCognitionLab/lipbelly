import { dynamoDocClient as docClient } from "../common/aws-clients.js";
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
dayjs.extend(timezone);

import Db from 'db/db.js';
import dayjs from 'dayjs';
import { earningsTypes } from '../../../common/types/types.js';

const db = new Db();
db.docClient = docClient;

export async function handler() {
    const users = await db.getAllUsers(); // need to include those who have finished b/c we have to pay them for visit 2

    for (const u of users) {
        try {
            // visits
            if (!u.progress || !u.progress[earningsTypes.VISIT1]) continue; // can't do any breathing before visit1

            const earnings = await db.earningsForUser(u.userId);
            for (const visit of [earningsTypes.VISIT1, earningsTypes.VISIT2]) {
                if (u.progress[visit] && !earnings.some(e => e.type === visit)) {
                    // they haven't been paid for this visit yet
                    const visitDate = dayjs(u.progress[visit]).tz('America/Los_Angeles').format('YYYY-MM-DD');
                    await saveVisitEarnings(u.userId, visit, visitDate);
                }
            }
            
            // breathing
            const breathEarnings = earnings.filter(e => e.type === earningsTypes.BREATH1 || e.type === earningsTypes.BREATH2);
            // should be sorted by date asc, so last should be most recent
            const lastBreathEarningsDate = breathEarnings.length > 0 ? breathEarnings.slice(-1)[0].date : '1970-01-01';
            await saveBreathEarnings(u.userId, lastBreathEarningsDate, 2);
        } catch (err) {
            console.error(`Error calculating earnings for user ${u.userId}.`, err);
        }
    }
}

/**
 * Saves earnings for a lab visit.
 * @param {string} userId 
 * @param {string} whichVisit "visit1", "visit2", etc.
 * @param {string} visitDate YYYY-MM-DD string
 */
async function saveVisitEarnings(userId, whichVisit, visitDate) {
    let earnType;
    switch (whichVisit) {
        case "visit1":
            earnType = earningsTypes.VISIT1;
            break;
        case "visit2":
            earnType = earningsTypes.VISIT2;
            break;
        default:
            throw new Error(`Cannot save visit earnings for ${userId} - unrecognized visit earning type ${whichVisit}.`);
    }
    await db.saveEarnings(userId, earnType, visitDate);
}

/**
 * 
 * @param {string} userId 
 * @param {string} lastBreathEarningsDate YYYY-MM-DD date string
 * @param {number} stage 
 */
async function saveBreathEarnings(userId, lastBreathEarningsDate, stage) {
    const yesterday = dayjs().subtract(1, 'day').endOf('day').tz('America/Los_Angeles');
    const startDate = dayjs(lastBreathEarningsDate).tz('America/Los_Angeles');
    const breathSegs = await db.segmentsForUser(userId, stage, startDate.toDate(), yesterday.toDate());
    const breathSegsByDate = {};
    breathSegs.forEach(bs => {
        const date = dayjs(bs.endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        const segs = breathSegsByDate[date] || 0;
        breathSegsByDate[date] = segs + 1;
    });
    for (const [date, segCount] of Object.entries(breathSegsByDate) ) {
        if (segCount >= 2) await db.saveEarnings(userId, earningsTypes.BREATH1, date);
        if (segCount >= 4) await db.saveEarnings(userId, earningsTypes.BREATH2, date);
    }
}