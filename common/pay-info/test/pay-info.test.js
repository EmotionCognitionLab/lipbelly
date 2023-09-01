import { earningsTypes } from "../../types/types.js";
import { Payboard } from "../pay-info.js";

const mockClient = (earnings) => ({
    getEarningsForUser: jest.fn(userId => earnings),
    getEarningsForSelf: jest.fn(() => earnings)
});

function expectPayboardMatches(payboard, earnings) {
    const [
        visit1Row,
        set1Row,
        set2Row,
        set3Row,
        set4Row,
        set5Row,
        set6Row,
        set7Row,
        visit2Row,
        totalRow
    ] = payboard.rootDiv.querySelectorAll("tbody tr");
    const visit1EarnedCell = visit1Row.querySelectorAll("td:last-child")[0];
    const set1EarnedCell = set1Row.querySelectorAll("td:last-child")[0];
    const set2EarnedCell = set2Row.querySelectorAll("td:last-child")[0];
    const set3EarnedCell = set3Row.querySelectorAll("td:last-child")[0];
    const set4EarnedCell = set4Row.querySelectorAll("td:last-child")[0];
    const set5EarnedCell = set5Row.querySelectorAll("td:last-child")[0];
    const set6EarnedCell = set6Row.querySelectorAll("td:last-child")[0];
    const set7EarnedCell = set7Row.querySelectorAll("td:last-child")[0];
    const setEarningsCells = [
        set1EarnedCell,
        set2EarnedCell,
        set3EarnedCell,
        set4EarnedCell,
        set5EarnedCell,
        set6EarnedCell,
        set7EarnedCell,
    ];
    const visit2EarnedCell = visit2Row.querySelectorAll("td:last-child")[0];
    const totalEarnedCell = totalRow.querySelectorAll("td:last-child")[0];
   
    // row cells should contain correct text
    if (earnings.some(e => e.type == earningsTypes.VISIT1)) {
        expect(visit1EarnedCell.innerHTML).toContain("$25");
    }

    if (earnings.some(e => e.type == earningsTypes.VISIT2)) {
        expect(visit2EarnedCell.innerHTML).toContain("$25");
    }

    const breathEarningsByDate = {};
    earnings.filter(e => e.type === earningsTypes.BREATH1 || e.type === earningsTypes.BREATH2).forEach(e => {
        const earningsForDate = breathEarningsByDate[e.date] || 0;
        breathEarningsByDate[e.date] = earningsForDate + e.amount;
    });

    const earningsForSets = Object.keys(breathEarningsByDate).sort().map(k => breathEarningsByDate[k]);
    if (earningsForSets.length > 7) throw new Error('Cannot have more than 7 sets');

    // check sets w/earnings
    for (let i=0; i<earningsForSets.length; i++) {
        expect(setEarningsCells[i].innerHTML).toContain(`${earningsForSets[i]}`);
    }

    // check that sets w/o earnings are blank
    for (let i=earningsForSets.length; i<7; i++) {
        expect(setEarningsCells[i].innerHTML).toBe('');
    }

    // check total
    const total = earnings.reduce((prev, cur) => prev + cur.amount, 0);
    if (total > 0) {
        expect(totalEarnedCell.innerHTML).toContain(`$${total}`);
    } else {
        expect(totalEarnedCell.innerHTML).toBe('');
    }
    

}

describe("Payboard", () => {
    beforeEach(() => {
        const root = document.createElement("div");
        root.id = "root";
        const error = document.createElement("div");
        error.id = "error";
        document.body.appendChild(root);
        document.body.appendChild(error);
    });
    
    afterEach(() => {
        document.querySelectorAll("body > div").forEach(e => {
            e.remove();
        });
    });

    it("should use getEarningsForUser when admin is true", async () => {
        const mc = mockClient([]);
        const {root, error} = getPayboardElements();
        const payboard = new Payboard(root, error, mc, {userId: '123abbc'}, true);
        await payboard.init();
        expect(mc.getEarningsForUser).toHaveBeenCalledTimes(1);
        expect(mc.getEarningsForSelf).not.toHaveBeenCalled();
    });

    it("should use getEarningsForSelf when admin is false", async () => {
        const mc = mockClient([]);
        const {root, error} = getPayboardElements();
        const payboard = new Payboard(root, error, mc, {userId: '123abbc'}, false);
        await payboard.init();
        expect(mc.getEarningsForUser).not.toHaveBeenCalled();
        expect(mc.getEarningsForSelf).toHaveBeenCalledTimes(1);
    });

    it("should work when there are no earnings", async () => {
        await testPayboard([]);
    });

    it("should display visit earnings correctly", async () => {
        const earnings = [
            {type: earningsTypes.VISIT1, date:'2023-01-01', amount: 25},
            {type: earningsTypes.VISIT2, date: '2023-01-08', amount: 25}
        ];
        await testPayboard(earnings);
    });

    it("should sum up multiple breathing session earnings on the same day", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: 2},
            {type: earningsTypes.BREATH2, date: '2023-01-01', amount: 2},
        ];
        await testPayboard(earnings);
    });

    it("should display breath earnings from multiple days correctly", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: 2},
            {type: earningsTypes.BREATH2, date: '2023-01-01', amount: 2},
            {type: earningsTypes.BREATH1, date: '2023-01-02', amount: 2}
        ];
        await testPayboard(earnings);
    });

    it("should display mixed visit and breath earnings correctly", async () => {
        const earnings = [
            {type: earningsTypes.VISIT1, date: '2023-01-01', amount: 25},
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: 2},
            {type: earningsTypes.BREATH2, date: '2023-01-01', amount: 2},
            {type: earningsTypes.BREATH1, date: '2023-01-02', amount: 2}
        ];
        await testPayboard(earnings);
    });

});

function getPayboardElements() {
    return {
        root: document.querySelector("#root"),
        error: document.querySelector("#error"),
    };
}

async function testPayboard(earnings) {
    const mc = mockClient(earnings);
    const {root, error} = getPayboardElements();
    const payboard = new Payboard(root, error, mc, {userId: '123abbc'}, false);
    await payboard.init();
    expectPayboardMatches(payboard, earnings);
}
