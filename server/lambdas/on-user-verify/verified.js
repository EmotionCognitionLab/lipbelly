'use strict';

/**
 * Called by Cognito when a user verifies her account. Writes the 
 * user information from Cognito to Dynamo.
 **/

const usersTable = process.env.USERS_TABLE;
import { dynamoDocClient as docClient } from '../common/aws-clients';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

exports.handler = async (event) => {
    // make sure that we don't run this code when the user is 
    // going through the forgot password flow
    if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

    const userRec = buildUserRecord(event);
    try {
        await docClient.send(new PutCommand(userRec));
        return event;
    } catch (err) {
        console.log(err);
        throw new Error('Something went wrong. Please try again later.') // NB this will be seen by the user
    }
};

function buildUserRecord(event) {
    let result = {
        TableName: usersTable,
        Item: {
            userId: event.request.userAttributes["sub"],
            name: event.request.userAttributes["name"],
            email: event.request.userAttributes["email"],
            phone_number: event.request.userAttributes["phone_number"],
            phone_number_verified: event.request.userAttributes["phone_number_verified"] === 'true',
            createdAt: new Date().toISOString()
        }
    };
    return result;
}