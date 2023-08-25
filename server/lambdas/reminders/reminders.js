
'use strict';

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

import Db from 'db/db.js';

const sesEndpoint = process.env.SES_ENDPOINT;
const snsEndpoint = process.env.SNS_ENDPOINT;
const emailSender = process.env.EMAIL_SENDER;
const region = process.env.REGION;

const homeTrainingMsg = {
    subject: "A friendly reminder",
    html: "Have you done your training today? If you don't have time right now, put a reminder in your calendar to train later today.",
    text: "Have you done your training today? If you don't have time right now, put a reminder in your calendar to train later today.",
    sms: "Have you done your training today? If you don't have time right now, put a reminder in your calendar to train later today."
}

const ses = new SESClient({endpoint: sesEndpoint, apiVersion: '2010-12-01', region: region});
const sns = new SNSClient({endpoint: snsEndpoint, apiVersion: '2010-03-31', region: region});
const db = new Db();

export async function handler (event) {
    const commType = event.commType;
    if (commType !== "email" && commType !== "sms"){
        const errMsg = `A commType of either 'email' or 'sms' was expected, but '${commType}' was received.`;
        console.error(errMsg);
        throw new Error(errMsg);
    }

    const reminderType = event.reminderType;
    if (reminderType === 'homeTraining') {
        await sendHomeTraininingReminders(commType);
    } else {
        const errMsg = `A reminderType of 'homeTraining' was expected, but '${reminderType}' was received.`;
        console.error(errMsg);
        throw new Error(errMsg);
    }
}

async function sendHomeTraininingReminders(commType) {
    let sentCount = 0;
    const usersToRemind = [];

    try {
        const allUsers = await db.getAllUsers();
        for (const u of allUsers.filter(u => !u.progress || (u.progress && !u.progress.visit2))) { // visit 2 marks study completion
            const todayStart = dayjs().tz('America/Los_Angeles').startOf('day').toDate();
            const todayEnd = dayjs().tz('America/Los_Angeles').endOf('day').toDate();
            const segments = await db.segmentsForUser(u.userId, 2, todayStart, todayEnd);
            if (segments.length < 3) {
                usersToRemind.push(u);
            }
        }
        sentCount = await deliverReminders(usersToRemind, commType, homeTrainingMsg);
    } catch (err) {
        console.error(`Error sending ${commType} reminders for home training tasks: ${err.message}`, err);
    }
    console.log(`Done sending ${sentCount} home training reminders via ${commType}.`);
}

async function deliverReminders(recipients, commType, msg) {
    let sentCount = 0;
    let sends;

    const validRecipients = recipients.filter(r => !r.progress || (r.progress && !r.progress.dropped));

    if (commType === "email") {
        sends = validRecipients.map(async u => {
            await sendEmail(u.email, msg);
            sentCount++;
        });
    } else if (commType === "sms") {
        sends = validRecipients.filter(u => u.phone_number_verified).map(async u => {
            await sendSMS(u.phone_number, msg);
            sentCount++;
        });
    }
    await Promise.all(sends);

    return sentCount;
}

/**
 * Sends email message msg to a single recipient
 * @param {string} recip Email address of the recipient
 * @param {object} msg msg object with html, text, subject fields
 */
 async function sendEmail(recip, msg) {
    const params = {
        Destination: {
            ToAddresses: [recip]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: msg.html
                },
                Text: {
                    Charset: "UTF-8",
                    Data: msg.text
                }
            },
            Subject: {
                Charset: "UTF-8",
                Data: msg.subject
            }
        },
        Source: emailSender
    }
    try {
        await ses.send(new SendEmailCommand(params));
    } catch (err) {
        console.error(`Error sending email to ${recip}. (Message: ${msg.text})`, err);
    }
}

/**
 * Sends msg to one phone number.
 * @param {string} The e164 formatted phone number we're sending the message to 
 * @param {object} msg An object with an sms field containing the text we're sending
 */
 async function sendSMS(recip, msg) {
    const params = {
        Message: msg.sms,
        PhoneNumber: recip,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': {
                DataType: 'String',
                StringValue: 'Transactional'
            }
        }
    }
    try {
        await sns.send(new PublishCommand(params));
    } catch (err) {
        console.error(`Error sending sms to ${recip}. (Message: ${msg.sms})`, err);
    }
}
