import awsSettings from '../aws-settings.json';

export default class ApiClient {
    constructor(session) {
        this.idToken = session.getIdToken().getJwtToken();
    }

    async getEarningsForUser(userId, earningsType) {
        let url = `${awsSettings.AdminApiUrl}/participant/${userId}/earnings/`;
        if (earningsType) url += earningsType;
        return await this.doFetch(url, "get", "There was an error retrieving earnings for the user");
    }

    /**
     * Fetches the user record for the logged-in user.
     * @returns {object} A user record
     */
    async getSelf() {
        const url = `${awsSettings.UserApiUrl}`;
        return await this.doFetch(url, "get", "There was an error getting the user record");
    }

    /**
     * Assigns the user to one of two experimental conditions: Random-paced or resonance-frequency-paced breathing.
     * @param {object} conditionData {bornSex: value, sexDesc: value}
     * @returns JSON object with "condition" field
     */
     async assignToCondition(conditionData) {
        const url = `${awsSettings.ConditionApiUrl}`;
        return await this.doFetch(url, "post", "There was an error assigning the user to condition", conditionData);
    }

    /**
     * Fetches a user record.
     * @param {string} userId The id of the user whose record is to be fetched.
     * @param {boolean} consistentRead Should the fetch use a consistent read?
     * @returns {object} A user record
     */
    async getUser(userId, consistentRead = false) {
        let url =  `${awsSettings.AdminApiUrl}/participant/${userId}`;
        if (consistentRead) {
            url += "?consistentRead=true";
        }
        return await this.doFetch(url, "get", "There was an error retrieving the user data");
    }

    async getEarningsForSelf(earningsType) {
        let url = `${awsSettings.UserApiUrl}/earnings/`;
        if (earningsType) url += earningsType;
        return await this.doFetch(url, "get", "There was an error retrieving the earnings for the user");
    }

    async setEmopics(pics) {
        const url =  `${awsSettings.EmopicsApiUrl}`;
        return await this.doFetch(url, "put", "There was an error saving the emotional picture set.", pics);
    }

    async getEmopics(used, count=0) {
        let url =  `${awsSettings.EmopicsApiUrl}`;
        if (used || count) url += '?'
        if (used) url += 'used=1'
        if (used && count) url += '&'
        if (count) url += `count=${count}`
        return await this.doFetch(url, "get", "There was an error getting the emotional pictures.");
    }

    async markEmopicsSkipped(pics) {
        const url =  `${awsSettings.EmopicsApiUrl}/skip`;
        return await this.doFetch(url, "post", "There was an error marking the emotional pictures skipped.", pics);
    }

    /**
     * 
     * @param {*} order The order of the emopic in the overall list of emopics. Must be 0 >= order <= 83.
     * @param {*} rating The rating given to the picture. 1 >= rating <= 9.
     * @param {*} responseTime The time (in ms) it took the participant to rate the image.
     * @param {*} dateTime The date/time (in YYYY-MM-DDTHH:mm:ssZ[Z] format) the participant rated the image.
     * @returns 
     */
    async saveEmopicsRating(order, rating, responseTime, dateTime) {
        const url = `${awsSettings.EmopicsApiUrl}/rate`;
        const body = {order: order, rating: rating, rt: responseTime, date: dateTime};
        return await this.doFetch(url, "post", "There was an error saving an emotional picture rating", body);
    }

    /**
     * Updates the record of the logged-in user.
     * @param {object} updates An object with the fields you want to update and the values you want to set them to
     * @returns {object} DynamoDb.DocumentClient.update response. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#update-property)
     */
    async updateSelf(updates) {
        const url = `${awsSettings.UserApiUrl}`;
        return await this.doFetch(url, "put", "There was an error updating the user record", updates );
    }

    /**
     * Updates an existing user record.
     * @param {string} userId The id of the user whose record is to be updated
     * @param {object} updates An object with the fields you want to update and the values you want to set them to
     * @returns {object} DynamoDb.DocumentClient.update response. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#update-property)
     */
    async updateUser(userId, updates) {
        const url = `${awsSettings.AdminApiUrl}/participant/${userId}`;
        return await this.doFetch(url, "put", `There was an error updating user ${userId}`, updates);
    }

    /**
     * 
     * @returns All non-staff (isStaff=false or does not exist) participants in the database
     */
    async getAllParticipants() {

        const url = `${awsSettings.AdminApiUrl}/participants`;
        return await this.doFetch(url, "get", "There was an error fetching particiapnts");
    }

    /**
     * Returns the status of the user, which describes how well they're keeping up with the study.
     * Status will be one of:
     *  * {status: 'red'} - user is behind
     *  * {status: 'yellow'} - at risk of falling behind
     *  * {status: 'green'} - on track
     *  * {status: 'gray'} - waiting on something from the lab
     *  * {status: 'black'} - status for this stage not implemented
     * There may also be subfields describing components of the overall status, e.g.:
     *   { status: 'yellow', lumosity: 'green', breathing: 'yellow' }
     * @param {string} userId 
     * @param {string} humanId 
     * @param {boolean} preComplete User has completed the pre-experiment cognitive baseline tasks
     * @param {boolean} stage2Completed has completed stage 2
     * @param {string} stage2CompletedOn YYYYMMDD string for the date the user completed stage 2
     * @param {boolean} homeComplete has completed the home training
     * @param {boolean} postComplete has completed the post-experiement cognitive baseline tasks
     */
    async getUserStatus(userId, humanId, preComplete, stage2Completed, stage2CompletedOn, homeComplete, postComplete) {
        const b2p = (name, b) => b === undefined || b === null || !b ? `${name}=0` : `${name}=1`;
        const url = `${awsSettings.AdminApiUrl}/participant/${userId}/status?hId=${humanId}&${b2p('preComplete', preComplete)}&${b2p('stage2Completed', stage2Completed)}&stage2CompletedOn=${stage2CompletedOn}&${b2p('homeComplete', homeComplete)}&${b2p('postComplete', postComplete)}`
        return await this.doFetch(url, "get", `There was an error getting the status for user ${userId}`);
    }

    async doDocusignCallback(code) {
        const url = `${awsSettings.DsTokenUri}?code=${code}`;
        return await this.doFetch(url, "get", "There was an error completing the Docusign authentication process");
    }

    async getDsSigningInfo(envelopeId) {
        const url = `${awsSettings.DsApiUrl}?envelopeId=${envelopeId}`;
        return await this.doFetch(url, "get", "There was an error fetching the consent form details");
    }

    async registerUser(envelopeId, phone, password) {
        const url = `${awsSettings.RegistrationApiUrl}`;
        const params = {
            envelopeId: envelopeId,
            phone: phone,
            password: password
        };
        return await this.doFetch(url, "post", "An error occurred during registration", params);
    }

    async doFetch(url, method, errPreamble, body = null) {
        const init = {
            method: method,
            mode: "cors",
            cache: "no-cache",
            headers: {
                "Content-type": "application/json",
                "Authorization": this.idToken,
            },
        };
        if (body) init.body = JSON.stringify(body);

        try {
            const response = await fetch(url, init);

            if (!response.ok) {
                const respText = await response.text();
                throw new Error(`${errPreamble}: ${respText} (status code: ${response.status})`);
            }
            return await response.json();
        } catch (err) {
            console.error(errPreamble, err);
            throw err;
        }
        
    }
}

