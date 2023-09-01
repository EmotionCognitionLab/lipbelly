import payboardTempl from "./payboard.handlebars";
import { earningsTypes } from "../types/types.js";

export class Payboard {
    constructor(rootDiv, errorDiv, client, userId, admin = false) {
        this.rootDiv = rootDiv;
        this.errorDiv = errorDiv;
        this.client = client;
        this.userId = userId;
        this.admin = admin;
    }

    async init() {
        await this.refresh();
        // set class of root div
        this.rootDiv.classList.add("pay-info");
    }

    async refresh() {
        try {
            // get data
            let earnings;
            if (this.admin) {
                earnings = await this.client.getEarningsForUser(this.userId);
            } else {
                earnings = await this.client.getEarningsForSelf();
            }
            const data = {};

            const earningsForVisit = (earningType) => {
                const earned = earnings.filter(e => e.type === earningType);
                if (earned.length === 0) return 0;

                if (earned.length > 1) throw new Error(`Expected only one earnings result of type ${earningType} for user ${this.userId}, but found ${earned.length}.`);
                return earned[0].amount;
            }
            
            const earningsForBreath = () => {
                // sum up all of the breath earnings by day
                const earnByDay = {};
                for (const e of earnings) {
                    if (e.type !== earningsTypes.BREATH1 && e.type !== earningsTypes.BREATH2) continue;
                    const dayEarnings = earnByDay[e.date] || 0;
                    earnByDay[e.date] = dayEarnings + e.amount;
                };

                // return the sum of amounts earned each day, ordered from least to most recent
                return Object.keys(earnByDay).sort().map(k => earnByDay[k]);
            }

            data.visit1Earned = earningsForVisit(earningsTypes.VISIT1);
            data.visit2Earned = earningsForVisit(earningsTypes.VISIT2);
            const breathEarnings = earningsForBreath();
            if (breathEarnings.length > 7) throw new Error (`Expected a maximum of seven days of breath earnings but found ${breathEarnings.length}.`);
            for (let i = 1; i <= breathEarnings.length; i++) {
                data[`set${i}BreathingEarned`] = breathEarnings[i - 1];
            } 

            data.totalEarned = earnings.reduce((prev, cur) => prev + cur.amount, 0);
            this.rootDiv.innerHTML = payboardTempl(data);
        } catch (err) {
            this.handleError(err);
        }
    }

    handleError(err) {
        console.error(`error: ${err}`);
        this.errorDiv.textContent = `error: ${err.message ?? err}`;
    }
}
