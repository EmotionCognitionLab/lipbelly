'use strict';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});

import { handler } from '../reminders';

const defaultUser =  { userId: '123abc', humanId: 'BigIdea', email: 'nobody@example.com' };
const mockGetAllUsers = jest.fn(() => [ defaultUser ]);
const mockSegmentsForUser = jest.fn(() => []);

const mockSendEmail = jest.fn(() => ({ promise: () => new Promise(resolve => resolve())}));
const mockSnsPublish = jest.fn(() => ({ promise: () => Promise.resolve() }));

const allMocks = [
    mockGetAllUsers, 
    mockSegmentsForUser, 
    mockSendEmail, mockSnsPublish,
];

jest.mock('aws-sdk/clients/ses', () => {
    return jest.fn().mockImplementation(() => {
        return {
            sendEmail: (params) => mockSendEmail(params)
        };
    });
});

jest.mock('aws-sdk/clients/sns', () => {
    return jest.fn().mockImplementation(() => {
        return {
            publish: (params) => mockSnsPublish(params)
        };
    });
});

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getAllUsers: () => mockGetAllUsers(),
            segmentsForUser: (humanId, startDate, endDate) => mockSegmentsForUser(humanId, startDate, endDate),
        };
    });
});

describe("reminders", () => {
    afterEach(() => {
        allMocks.forEach(mock => mock.mockClear());
    });

    it("should throw an error if no commType is provided", async () => {
        await expect(() => handler({reminderType: 'homeTraining'})).rejects.toEqual(Error("A commType of either 'email' or 'sms' was expected, but 'undefined' was received."));
    });

    it("should throw an error if an unexpected commType is provided", async () => {
        await expect(() => handler({commType: 'pigeon', reminderType: 'homeTraining'})).rejects.toEqual(Error("A commType of either 'email' or 'sms' was expected, but 'pigeon' was received."));
    });

    it("should throw an error if no reminderType is provided", async () => {
        await expect(() => handler({commType: 'email'})).rejects.toEqual(Error("A reminderType of 'homeTraining' was expected, but 'undefined' was received."));
    });

    it("should throw an error if an unexpected reminderType is provided", async () => {
        await expect(() => handler({commType: 'email', reminderType: 'make your bed'})).rejects.toEqual(Error("A reminderType of 'homeTraining' was expected, but 'make your bed' was received."));
    });

    it("should send an email when the commType is email", async () => {
        await handler({commType: 'email', reminderType: 'homeTraining'});
        expect(mockSendEmail).toHaveBeenCalled();
        expect(mockSendEmail.mock.calls[0][0].Destination.ToAddresses).toStrictEqual([defaultUser.email]);
        expect(mockSnsPublish).not.toHaveBeenCalled();
    });

    it("should send an sms when the commType is sms", async () => {
        const phoneUser =  { userId: '123abc', email: 'nobody@example.com', phone_number: '+10123456789', phone_number_verified: true};
        mockGetAllUsers.mockImplementationOnce(() => [phoneUser]);
        await handler({commType: 'sms', reminderType: 'homeTraining'});
        expect(mockSnsPublish).toHaveBeenCalled();
        expect(mockSnsPublish.mock.calls[0][0].PhoneNumber).toBe(phoneUser.phone_number);
        expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should not not send an sms to people whose phone numbers are not verified", async () => {
        const phoneUser =  { userId: '123abc', email: 'nobody@example.com', phone_number: '+10123456789', phone_number_verified: false};
        mockGetAllUsers.mockImplementationOnce(() => [phoneUser]);
        await handler({commType: 'sms', reminderType: 'homeTraining'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSnsPublish).not.toHaveBeenCalled();
        expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should not send a reminder to someone who has dropped out", async () => {
        const droppedUser = { userId: '123abc', email: 'nobody@example.com', progress: { dropped: true }};
        mockGetAllUsers.mockImplementationOnce(() => [droppedUser]);
        await handler({commType: 'email', reminderType: 'homeTraining'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSnsPublish).not.toHaveBeenCalled();
        expect(mockSendEmail).not.toHaveBeenCalled();
    });
});

describe("home training reminders", () => {

    afterEach(() => {
        mockSegmentsForUser.mockClear();
        mockGetAllUsers.mockClear();
        mockSendEmail.mockClear();
        mockSnsPublish.mockClear();
    });

    it("should be sent if <3 segments have been done today", async () => {
        await testWithSegments(['fake', 'segments']);
        expect(mockSendEmail).toHaveBeenCalled();
        expect(mockSnsPublish).not.toHaveBeenCalled();
        expect(mockSendEmail.mock.calls[0][0].Destination.ToAddresses[0]).toBe(defaultUser.email);
    });

    it("should not be sent if 3 segments have been done today", async () => {
        await testWithSegments([1, 2, 3]);
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockSnsPublish).not.toHaveBeenCalled();
    })

    async function testWithSegments(segments) {
        mockSegmentsForUser.mockImplementationOnce((hId, day) => segments);
        await handler({commType: 'email', reminderType: 'homeTraining'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSegmentsForUser.mock.calls[0][2].toString().substring(0, 15)).toBe(dayjs().tz('America/Los_Angeles').toDate().toString().substring(0, 15));
    }

    it("should not be sent if the participant has dropped out", async () => {
        const droppedUser =  { userId: '123abc', humanId: 'BigText', email: 'nobody@example.com', progress: { dropped: true }};
        mockGetAllUsers.mockImplementationOnce(() => [droppedUser]);
        await handler({commType: 'email', reminderType: 'homeTraining'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(droppedUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSegmentsForUser.mock.calls[0][2].toString().substring(0, 15)).toBe(dayjs().tz('America/Los_Angeles').toDate().toString().substring(0, 15));
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockSnsPublish).not.toHaveBeenCalled();
    });
});
