import tableTmpl from "./templates/table.handlebars";
import userDetailsTmpl from "./templates/userDetails.handlebars";
import statusTmpl from "./templates/status.handlebars";
import { DatedCheckbox } from "./DatedCheckbox";

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
            await this.refreshUser(userId);
            const user = this.users[userId];
            const progress = user.progress ?? {};
            if (date) {
                progress[key] = date.format('YYYY-MM-DDTHH:mm:ssZ');
            } else {
                progress[key] = null;
            }
            await this.apiClient.updateUser(userId, {progress});
        } catch (err) {
            DatedCheckbox.undoClick(event, origDateStr);
            console.error(`Error setting date for ${key} for ${userId}`, err);
            window.alert("A problem ocurred. Please try again later.");
            event.preventDefault();
        } finally {
            checkbox.disabled = false;
        }
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