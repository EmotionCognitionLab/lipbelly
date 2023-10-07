'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
const { readFileSync } = require('fs');
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);

const postConfirmationEventJson = readFileSync(path.join(__dirname, 'post-confirmation-event.json'));
const postConfirmationEvent = JSON.parse(postConfirmationEventJson);

const verified = require('../verified.js');

describe("Testing with a valid post confirmation trigger event", () => {
    beforeEach(async () => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
    });

    test("should succeed", async() => {
        const result = await verified.handler(postConfirmationEvent);
        expect(result.response).toBeDefined();
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: postConfirmationEvent.request.userAttributes.sub
            }
        };
        const userRec = await docClient.send(new GetCommand(params));
        for (const field in ['email', 'name', 'phone_number', 'sub']) {
            expect(userRec.Item[field]).toBe(postConfirmationEvent.request.userAttributes[field]);
        }
        expect(userRec.Item.createdAt.substring(0, 18)).toBe(new Date().toISOString().substring(0, 18));
        expect(userRec.Item.phone_number_verified).toBeFalsy();
    });

    test("should do nothing if the trigger is not for a signup", async() => {
        const changePwTriggerEvent = JSON.parse(postConfirmationEventJson);
        changePwTriggerEvent.triggerSource = 'PostConfirmation_ConfirmForgotPassword';
        await verified.handler(changePwTriggerEvent);
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: changePwTriggerEvent.request.userAttributes.sub
            }
        };
        const userRec = await docClient.send(new GetCommand(params));
        expect(userRec.Item).not.toBeDefined();
    });

    afterEach(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});

