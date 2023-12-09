import tableTmpl from "./templates/table.handlebars";
import userDetailsTmpl from "./templates/userDetails.handlebars";
import statusTmpl from "./templates/status.handlebars";
import { DatedCheckbox } from "./DatedCheckbox";
import { Payboard } from "../../../common/pay-info/pay-info";
import { FutureDateField } from "./FutureDateField";

export class Dashboard {
    constructor(tbody, userDetailsDiv, apiClient) {
        this.tbody = tbody;
        this.userDetailsDiv = userDetailsDiv;
        this.apiClient = apiClient;
        this.users = {};
    }

    async init() {
        const allUsers = await this.apiClient.getAllParticipants();
        const displayInfo = [];
        for (const u of allUsers) {
            this.users[u.userId] = u;
            displayInfo.push(
                {
                    userId: u.userId,
                    name: u.name,
                    email: u.email,
                    phone: u.phone,
                    visit1: new DatedCheckbox('visit1', u.progress ? u.progress.visit1 : null),
                    visit2Scheduled: new FutureDateField('visit2Scheduled', u.progress ? u.progress.visit2Scheduled : null ),
                    visit2: new DatedCheckbox('visit2', u.progress ? u.progress.visit2 : null),
                    dropped: new DatedCheckbox('dropped', u.progress ? u.progress.dropped : null),
                }
            );
        }
        
        this.tbody.innerHTML = tableTmpl({users: displayInfo});

        this.tbody.addEventListener("click", async event => {
            const target = event.target;
            if (target.type == "checkbox") {
                await this.handleCheckboxEvent(event);
            } else if (target.className == "username") {
               await this.handleUserEvent(event);
            }
            return;
        });

        this.tbody.addEventListener("change", async event => {
            const target = event.target;
            if (target.type == "datetime-local") {
                await this.handleDateFieldEvent(event);
            }
        });

        this.userDetailsDiv.addEventListener("click", async event => {
            await this.handleDetailsClickEvent(event)
        });

        this.fetchStatusForUsers();
    }

    async handleCheckboxEvent(event) {
        const {key, date, origDateStr} = DatedCheckbox.handleClick(event);
        const checkbox = event.target;
        checkbox.disabled = true;
        const userId = checkbox.closest("tr")?.dataset.userId;
        try {
            const dateStr = date ? date.format("YYYY-MM-DDTHH:mm:ssZ") : null;
            await this.updateUserProgress(userId, key, dateStr);
        } catch (err) {
            DatedCheckbox.undoClick(event, origDateStr);
            console.error(`Error setting date for ${key} for ${userId}`, err);
            window.alert("A problem ocurred. Please try again later.");
            event.preventDefault();
        } finally {
            checkbox.disabled = false;
        }
    }

    async handleDateFieldEvent(event) {
        const dateField = event.target;

        const {key, datetime} = FutureDateField.handleChange(event);
        const userId = dateField.closest("tr")?.dataset.userId;
        dateField.disabled = true;
        try {
            await this.updateUserProgress(userId, key, datetime.format("YYYY-MM-DDTHH:mm:ssZ"));
        } catch (err) {
            event.preventDefault();
            console.error(`Error setting visit 2 scheduled date for ${userId}`, err);
            window.alert("A problem ocurred. Please try again later.");
            const user = this.users[userId];
            const origDateStr = user.progress ? user.progress.visit2Scheduled : null;

            // this is stupid, but for some reason (webpack bug?)
            // setting dateField.value directly here will trigger
            // a new change event
            setTimeout(() => dateField.value = origDateStr, 100)
        } finally {
            dateField.disabled = false;
        }
    }

    async updateUserProgress(userId, key, value) {
        await this.refreshUser(userId);
        const user = this.users[userId];
        const progress = user.progress ?? {};
        if (value) {
            progress[key] = value;
        } else {
            progress[key] = null;
        }
        await this.apiClient.updateUser(userId, {progress});
    }

    async handleUserEvent(event) {
        const parentRow = event.target.closest("[data-user-id]");
        const userId = parentRow.dataset.userId;
        const user = this.users[userId];
        const dispUser = {
            userId: user.userId,
            phone: user.phone_number,
            email: user.email
        };

        this.userDetailsDiv.innerHTML = userDetailsTmpl({user: dispUser});
        const payInfoDiv = document.getElementById("pay-info");
        const payErrsDiv = document.getElementById("pay-errors");
        const payboard = new Payboard(payInfoDiv, payErrsDiv, this.apiClient, userId, true);
        await payboard.init();
        this.userDetailsDiv.classList.remove("hidden");
    }

    async handleDetailsClickEvent(event) {
        if (event.target.id !== "close-button") {
            event.stopPropagation();
            return false;
        }
        if (!this.userDetailsDiv.classList.contains("hidden")) {
            this.userDetailsDiv.classList.add("hidden");
        }
    }

    async refreshUser(userId) {
        this.users[userId] = await this.apiClient.getUser(userId, true);
    }

    async fetchStatusForUsers() {
        for (const userId of Object.keys(this.users)) {
            const status = await this.apiClient.getUserStatus(userId);
            const userRow = document.querySelectorAll(`[data-user-id="${userId}"]`)[0]; // TODO handle case where we don't find the user row
            const statusCell = userRow.querySelectorAll(".status")[0];
            statusCell.innerHTML = statusTmpl({status: status});
        }
    }

}