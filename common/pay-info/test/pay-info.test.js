import { earningsTypes } from "../../types/types.js";
import { Payboard } from "../pay-info.js";

const mockClient = (earnings) => ({
    getEarningsForUser: jest.fn(userId => earnings),
    getEarningsForSelf: jest.fn(() => earnings)
});

function expectPayboardMatches(payboard, earnings) {
    const [
        visit1Row,
        breathingRow,
        visit2Row,
        totalRow
    ] = payboard.rootDiv.querySelectorAll("tbody tr");
    const visit1EarnedCell = visit1Row.querySelectorAll("td:last-child")[0];
    const breathingEarnedCell = breathingRow.querySelectorAll("td:last-child")[0];
    const visit2EarnedCell = visit2Row.querySelectorAll("td:last-child")[0];
    const totalEarnedCell = totalRow.querySelectorAll("td:last-child")[0];
   
    // row cells should contain correct text
    if (earnings.some(e => e.type == earningsTypes.VISIT1)) {
        expect(visit1EarnedCell.innerHTML).toContain("$25");
    }

    if (earnings.some(e => e.type == earningsTypes.VISIT2)) {
        expect(visit2EarnedCell.innerHTML).toContain("$25");
    }

    // check sets w/earnings
    if (earnings.some(e => e.type == earningsTypes.BREATH1 || e.type == earningsTypes.BREATH2)) {
        const breathEarnings = earnings
            .filter(e => e.type === earningsTypes.BREATH1 || e.type === earningsTypes.BREATH2)
            .reduce((prev, cur) => prev + cur.amount, 0);
        expect(breathingEarnedCell.innerHTML).toContain(`${breathEarnings}`);
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
