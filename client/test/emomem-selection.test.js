/**
 * @jest-environment jsdom
 */
import { generateEmotionalImages } from '../src/emomem-selection.js'
import imgData from '../src/emopics.json';

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