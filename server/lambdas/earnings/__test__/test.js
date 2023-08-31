'use strict';

import { handler } from "../earnings.js"
import { earningsTypes } from '../../../../common/types/types.js';
import dayjs from 'dayjs';

const mockEarningsForUser = jest.fn(() => []);
const mockGetAllUsers = jest.fn(() => []);
const mockSaveEarnings = jest.fn(() => {});
const mockSegmentsForUser = jest.fn(() => []);

const allMocks = [mockEarningsForUser, mockGetAllUsers, mockSaveEarnings, mockSegmentsForUser];

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            earningsForUser: (userId, earnType) => mockEarningsForUser(userId, earnType),
            getAllUsers: () => mockGetAllUsers(),
            saveEarnings: (userId, earningsType, dateDone) => mockSaveEarnings(userId, earningsType, dateDone),
            segmentsForUser: (userId, stage, startDate, endDate) => mockSegmentsForUser(userId, stage, startDate, endDate),
        };
    });
});

describe("Visit earnings calculation", () => {
    afterEach(() => {
        allMocks.forEach(mock => mock.mockClear());
    });

    it("should continue with other users if an error is thrown on one user", async () => {
        const users = [
            {userId: 'error', progress: {visit1: '2023-01-01T09:00:01-07:00'}},
            {userId: 'ok', progress: {visit1: '2023-01-01T09:00:01-07:00'}}
        ];

        mockGetAllUsers.mockReturnValue(users);
        mockEarningsForUser.mockImplementation(userId => {
            if (userId === 'error') {
                throw new Error('Fake error for testing');
            }
            return [];
        });
        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(1);
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[1].userId, earningsTypes.VISIT1, users[1].progress.visit1.substring(0, 10));
    });

    it("should save earnings for each lab visit", async () => {
        const users = [{userId: 'all-visits', progress: {
                visit1: "2022-01-01T13:09:18.221Z",
                visit2: "2022-02-01T13:09:18.221Z",
            },
        }];

        mockGetAllUsers.mockReturnValue(users);
        mockEarningsForUser.mockReturnValue([]);
        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(Object.keys(users[0].progress).length);
        Object.keys(users[0].progress).forEach(v => {
            expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, v, users[0].progress[v].substring(0, 10));
        });    
    });

    it("should not save earnings for a visit they have already received earnings for", async () => {
        const users = [{userId: 'just-started', progress: {
                visit1: "2022-01-01T13:09:18.221Z",
            },
        }];

        mockGetAllUsers.mockReturnValue(users);
        mockEarningsForUser.mockReturnValue([{
            userId: users[0].userId,
            type: earningsTypes.VISIT1,
            date: users[0].progress.visit1.substring(0, 10),
            amount: 2
        }]);
        await handler();
        expect(mockEarningsForUser).toHaveBeenCalled();
        expect(mockSaveEarnings).not.toHaveBeenCalled();
    });

    it("should skip users who have not yet had visit 1", async () => {
        const users = [{userId: 'not-started'}];
        mockGetAllUsers.mockReturnValue(users);
        await handler();
        expect(mockEarningsForUser).not.toHaveBeenCalled();
    });
});

describe("Breathing earnings calculation", () => {

    const users = [
        {
            userId: 'someuser',
            progress: { visit1: '2023-01-01T07:08:09-07:00'}
        }
    ];

    beforeEach(() => {
        mockGetAllUsers.mockReturnValue(users);
        mockEarningsForUser.mockReturnValue([{
            userId: users[0].userId,
            type: earningsTypes.VISIT1,
            date: users[0].progress.visit1.substring(0, 10)
        }]);
    })

    afterEach(() => {
        allMocks.forEach(mock => mock.mockClear());
    });

    it("should save one breath earnings on days with < 4 segments", async () => {
        const segs = makeBreathSegments(users[0].userId, 3);
        mockSegmentsForUser.mockReturnValue(segs);
        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(1);
        const earningsDate = dayjs(segs[0].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, earningsDate);
    });

    it("should save two breath earnings on days with >= 4 segments", async () => {
        const segs = makeBreathSegments(users[0].userId, 4);
        mockSegmentsForUser.mockReturnValue(segs);
        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(2);
        const earningsDate = dayjs(segs[0].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, earningsDate);
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH2, earningsDate);
    });

    it("should only save breath earnings for segments that happened after the last breath earnings date", async () => {
        const earnings = [
            {
                userId: users[0].userId,
                type: earningsTypes.VISIT1,
                date: users[0].progress.visit1.substring(0, 10)
            },
            {
                userId: users[0].userId,
                type: earningsTypes.BREATH1,
                date: "2023-06-19"
            }
        ];
        mockEarningsForUser.mockReturnValue(earnings);
        await handler();
        const yesterday = dayjs().subtract(1, 'day').endOf('day').tz('America/Los_Angeles');
        expect(mockSegmentsForUser).toHaveBeenCalledWith(users[0].userId, 2, dayjs(earnings[1].date).toDate(), yesterday.toDate());
    });

    it("should not save earnings for breathing segments done today", async () => {
        await handler();
        const now = Math.floor(Date.now() / 1000);
        expect(mockSegmentsForUser).toHaveBeenCalledTimes(1);
        const segsForUserEndDate = mockSegmentsForUser.mock.calls[0][3];
        expect(segsForUserEndDate.getTime() / 1000).toBeLessThan(now);
    });

});

function makeBreathSegments(userId, numSegments, baseDate=null) {
    const result = [];
    const baseSegDate = baseDate ? baseDate : dayjs().subtract(1, 'day').tz('America/Los_Angeles').unix();
    for (let i=0; i<numSegments; i++) {
        // NB this date calculation will cause problems if numSegments
        // is high enough that the segments cross into the next day
        // or if the test is run close enough to midnight that they cross into the next day
        result.push({userId: userId, endDateTime: baseSegDate + (i * 22 * 60)}); 
    }
    return result;
}
