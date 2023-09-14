import Db from 'db/db.js';
import awsSettings from "../../../common/aws-settings.json";
import { dynamoDocClient as docClient } from '../common/aws-clients';

const region = process.env.REGION;
const dynamoEndpoint = process.env.DYNAMO_ENDPOINT;

exports.handler = async (event, context, callback) => {
    let canProceed = false;

    if (event.request.clientMetadata && 
        event.request.clientMetadata.envelopeId) {
            const db = new Db();
            db.docClient = docClient;
            
            const envId = event.request.clientMetadata.envelopeId;
            const signingInfo = await db.getDsSigningInfo(envId);
            canProceed = signingInfo.Items.length == 1;
    }

    if (awsSettings.RequireConsentToRegister && !canProceed) {
        callback(new Error(": No signed consent form found."), event);
        return;
    }

    // verify email - to get to this point it must have already been 
    // verified by Docusign
    if (awsSettings.RequireConsentToRegister && event.request.userAttributes.hasOwnProperty("email")) {
        event.response.autoVerifyEmail = true;
        event.response.autoConfirmUser = true;
    }

    callback(null, event);
}