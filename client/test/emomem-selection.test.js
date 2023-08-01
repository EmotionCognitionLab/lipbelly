/**
 * @jest-environment jsdom
 */
import { generateEmotionalImages, emotionalImagesForSession } from '../src/emomem-selection.js'
import imgData from '../src/emopics.json';
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc);
dayjs.extend(timezone);

describe("Generating emotional images", () => {
    it("should yield 84 items", () => {
        const imgs = generateEmotionalImages();
        expect(imgs.length).toBe(84);
    });

    it("should have images from only two groups", () => {
        const imgs = generateEmotionalImages();
        const groups = new Set(imgs.map(i => i.group));
        expect(groups.size).toBe(2);
        expect(['A', 'B', 'C']).toContain(...Array.from(groups));
    });

    it("should have two posititve, two negative and two neutral images in each block of six images", () => {
        const imgs = generateEmotionalImages();
        const neut = imgData['Neutral'];
        const pos = imgData['Positive'];
        const neg = imgData['Negative'];
        for (let i = 0; i<imgs.length - 6; i+=6) {
            const tmp = imgs.slice(i, i+6);
            const neutCount = tmp.filter(i => neut.includes(i)).length;
            expect(neutCount).toBe(2);
            const negCount = tmp.filter(i => neg.includes(i)).length;
            expect(negCount).toBe(2);
            const posCount = tmp.filter(i => pos.includes(i)).length;
            expect(posCount).toBe(2);
        }
    });

    it("should not have pos/neg/neut images in the same order in every group of six", () => {
        const imgs = generateEmotionalImages();

        const neut = imgData['Neutral'];
        const pos = imgData['Positive'];
        const neg = imgData['Negative'];

        const imgValence = (img) => {
            if (neut.includes(img)) {
                return "Neutral"
            } else if (pos.includes(img)) {
                return "Positive"
            } else if (neg.includes(img)) {
                return "Negative"
            } else {
                throw new Error(`img ${JSON.stringify(img)} is not neutral, positive or negative`);
            }
        };

        const valenceArrs = [];
        const valences = imgs.map(imgValence);
        for (let i=0; i<valences.length; i+=6) {
            valenceArrs.push(valences.slice(i, i+6));
        }

        expect(valenceArrs.every((val, idx) => valenceArrs[0][idx] == val[idx])).not.toBeTruthy();        

    });
});

class MockApiClient {
    constructor(subId, data) {
        this.data = data;
        this.subId = subId
    }

    async getEmopics(used, count) {
        if (used) {
            return this.data.filter(d => d.date && d.userId === this.subId);
        }
        // really only unused should be requested with a count
        const unused = this.data.filter(d => d.date === undefined && d.userId === this.subId)
        if (unused.length > count) return unused.slice(0, count);
        return unused;
    }

    async markEmopicsSkipped(emopics) {
        const todayStr = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ssZ[Z]');
        for (const ep of emopics) {
            const toSkip = this.data.find(d => d.order == ep.order && d.userId == ep.userId);
            if (toSkip) {
                toSkip['date'] = todayStr;
                toSkip['skipped'] = true;
            }
        }
    }
}

const makeData = (totalUsedCount, usedTodayCount, subId) => {
    if (totalUsedCount < usedTodayCount) throw new Error('The totalUsedCount must be >= the usedTodayCount');

    const usedPriorCount = totalUsedCount - usedTodayCount;
    const todayStr = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ssZ[Z]');
    const usedPriorDateStr = dayjs().subtract(3, 'days').tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ssZ[Z]');
    const data = [];

    for (let i=0; i<usedPriorCount; i++) {
        data.push({userId: subId, order: i, file: `${i}.jpg`, date: usedPriorDateStr});
    }

    for (let i=0; i<usedTodayCount; i++) {
        const tmp = i + usedPriorCount;
        data.push({userId: subId, order: tmp, file: `${tmp}.jpg`, date: todayStr});
    }

    for (let i=0; i<12; i++) {
        const tmp = i + usedPriorCount + usedTodayCount;
        data.push({userId: subId, order: tmp, file: `${tmp}.jpg`})
    }

    return data;
}

describe("Selecting emotional images for session", () => {

    it("should return six images when none have been done today and the number of total done images % 6 is 0", async () => {
        await testSelectEmotionalImagesForSession(6, 0, 6);
    });

    it("should return six images when six have been done today", async () => {
        await testSelectEmotionalImagesForSession(6, 6, 6);
    });

    it("should return no images when twelve have been done today", async () => {
        await testSelectEmotionalImagesForSession(18, 12, 0);
    });

    it("should return the remaining images when >0 and <6 have been done today", async () => {
        await testSelectEmotionalImagesForSession(16, 4, 6 - 4);
    });

    it("should return the remaining images when >6 and <12 have been done today", async () => {
        await testSelectEmotionalImagesForSession(19, 7, 6 - 1);
    });

    it("should throw an error when >12 images have been done today", async () => {
        const subId = 'ABC123';
        const tooMany = 13;
        const data = makeData(tooMany, tooMany, subId);
        const mockClient = new MockApiClient(subId, data);

        await expect(emotionalImagesForSession(mockClient)).rejects.toThrowError(`Expected a maximum of 12 emotional images to have been displayed today, but found ${tooMany}.`);
    });

    it("should return six images and mark missed images skipped when none have been done today and the number of total done images % 6 > 0", async () => {
        const subId = 'ABC123';
        const totalDone = 15;
        const doneToday = 0;
        const data = makeData(totalDone, doneToday, subId);
        const mockClient = new MockApiClient(subId, data);
        const skipSpy = jest.spyOn(mockClient, 'markEmopicsSkipped');

        const pics = await emotionalImagesForSession(mockClient);
        expect(pics.length).toBe(6);

        const expectedFirstPic = totalDone + totalDone % 6 + doneToday;
        for (let i=expectedFirstPic; i<6 + expectedFirstPic; i++) {
            expect(pics[i - expectedFirstPic].order).toBe(i);
        }

        expect(skipSpy).toHaveBeenCalledTimes(1);
        expect(skipSpy.mock.calls[0][0].length).toBe(totalDone % 6);
        const now = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ss');
        for (let i=totalDone; i<skipSpy.mock.calls[0][0].length + totalDone; i++){
            const skipped = skipSpy.mock.calls[0][0][i-totalDone];
            expect(skipped.order).toBe(i);
            expect(skipped.skipped).toBeTruthy();
            expect(skipped.date.startsWith(now)).toBeTruthy();
        }
    });

    it("should not include images skipped today in the count of images done today", async () => {
        const subId = 'ABC123';
        const totalDone = 7;
        const doneToday = 1;
        const data = makeData(totalDone, doneToday, subId);
        expect(data.length).toBe(19);
        const skippedCount = 4;
        const now =  dayjs().tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ssZ[Z]');
        data.forEach((d, idx) => {
            if (idx > 6 && idx <= 6 + skippedCount) {
                d.skipped = true;
                d.date = now;
            }
        });

        const mockClient = new MockApiClient(subId, data);
        const pics = await emotionalImagesForSession(mockClient);
        expect(pics.length).toBe(6 - doneToday % 6);
        expect(pics.every(p => !p.skipped)).toBeTruthy();
    });

});

const testSelectEmotionalImagesForSession = async (totalDoneCount, doneTodayCount, expectedCount) => {
    const subId = 'ABC123';
    const data = makeData(totalDoneCount, doneTodayCount, subId);
    const mockClient = new MockApiClient(subId, data);
    const pics = await emotionalImagesForSession(mockClient);
    expect(pics.length).toBe(expectedCount);
}