const AWS = require("aws-sdk");
const region = process.env.REGION;
const usersTable = process.env.USERS_TABLE;
const emopicsTable = process.env.EMOPICS_TABLE;
const dynamoEndpoint = process.env.DYNAMO_ENDPOINT;
const docClient = new AWS.DynamoDB.DocumentClient({endpoint: dynamoEndpoint, apiVersion: "2012-08-10", region: region});
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
import Db from '../../../common/db/db.js';

// For assignment to condition participants are asked their birth sex,
// and, iff the answer is 'Intersex', how they describe their sex.
const validSex = ['Male', 'Female', 'Intersex'];
const validSexDesc = ['Male', 'Female', 'Other'];

// The possible conditions a user can be assigned to
// exported for testing
export const validConditions = ['A', 'B'];

exports.handler = async (event) => {
    const path = event.requestContext.http.path;
    const method = event.requestContext.http.method;
    if (path === "/self") {
        if (method === "GET") {
            return getSelf(event.requestContext.authorizer.jwt.claims.sub);
        }
        if (method === "PUT") {
            return updateSelf(event.requestContext.authorizer.jwt.claims.sub, JSON.parse(event.body));
        }
    }
    if (path.startsWith("/self/earnings") && method === "GET") {
        const earningsType = event.pathParameters.earningsType;
        return getEarnings(event.requestContext.authorizer.jwt.claims.sub, earningsType);
    }
    if (path === "/condition" && method === "POST") {
        return assignToCondition(event.requestContext.authorizer.jwt.claims.sub, JSON.parse(event.body));
    }
    if (path.startsWith("/self/emopics")) {
        if (method === "PUT") {
            return await setEmopics(event.requestContext.authorizer.jwt.claims.sub, JSON.parse(event.body));
        }
        if (method === "GET") {
            const used = event.queryStringParameters && event.queryStringParameters.used === "1";
            const count = event.queryStringParameters && event.queryStringParameters.count ? parseInt(event.queryStringParameters.count) : undefined;
            return await getEmopicsForUser(event.requestContext.authorizer.jwt.claims.sub, used, count);
        }
        if (method === "POST") {
            const op = event.pathParameters.op;
            if (op === "skip") {
                return await markEmopicsSkippedForUser(event.requestContext.authorizer.jwt.claims.sub, JSON.parse(event.body));
            } else if (op === "rate") {
                const params = JSON.parse(event.body);
                return await saveEmopicsRating(event.requestContext.authorizer.jwt.claims.sub, params.order, params.rating, params.rt, params.date);
            } else {
                return errorResponse({statusCode: 400, message: `'${op}' is not a valid operation for POST /self/emopics.`});
            }
        }
    }
    return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
}

const getSelf = async (userId) => {
    try {
       return await getUserById(userId);
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const updateSelf = async(userId, updates) => {
    try {
        if (!updates) {
            return errorResponse({statusCode: 400, message: "No updates found"});
        }

        const notModifiable = ['userId', 'createdAt', 'email'];
        const allowedKeys = Object.keys(updates).filter(k => !notModifiable.includes(k));
        if (allowedKeys.length === 0) {
            return errorResponse({statusCode: 400, message: "No updates for allowed fields found"});
        }

        const expressionAttrVals = {};
        const expressionAttrNames = {};
        let updateExpression = 'set';
        for (const prop of allowedKeys) {
            const propName = `#${prop}`;
            const propVal = `:${prop}`
            expressionAttrNames[propName] = prop;
            expressionAttrVals[propVal] = updates[prop];
            updateExpression += ` ${propName} = ${propVal}`
        }
        const params = {
            TableName: usersTable,
            Key: { userId: userId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttrNames,
            ExpressionAttributeValues: expressionAttrVals
        };
        await docClient.update(params).promise();
        return successResponse({msg: "update successful"});
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const assignToCondition = async(userId, data) => {
    const bornSex = data['bornSex'];
    const sexDesc = data['sexDesc'] ? data['sexDesc'] : '';
    if (!validSex.includes(bornSex)) {
        return errorResponse({
            message: `${bornSex} is not a valid option.`,
            statusCode: 400
        });
    }
    if (bornSex === 'Intersex' && !validSexDesc.includes(sexDesc)) {
        return errorResponse({
            message: `${sexDesc} is not a valid option.`,
            statusCode: 400
        });
    }

    const user = await getUserById(userId);
    if (user.condition) {
        return errorResponse({
            message: `User ${userId} has already been assigned to condition`,
            statusCode: 500
        });
    }
    
    // per the spec, assign sex to be Male if they were born
    // Intersex and identify as Other
    let assignedSex;
    if (bornSex !== 'Intersex') {
        assignedSex = bornSex;
    } else if (sexDesc === 'Other') {
        assignedSex = 'Male'
    } else {
        assignedSex = sexDesc;
    }

    // get all the users (we expect max # of total users to be ~200)
    // and filter for those with the same assignedSex
    try {
        const params = {
            TableName: usersTable,
            FilterExpression: '#condition.assignedSex = :as',
            ExpressionAttributeNames: {'#condition': 'condition' },
            ExpressionAttributeValues: {':as': assignedSex }
        };

        const result = await docClient.scan(params).promise();
        let condition;
        if (result.Count % 2 === 0) {
            // randomly assign to condition
            if (Math.random() <= 0.5) {
                condition = validConditions[0];
            } else {
                condition = validConditions[1];
            }

        } else {
            // sort results by assignedDate and assign to the opposite of
            // the most recently assigned person
            result.Items.sort((a, b) => {
                if (a.condition.assignedDate > b.condition.assignedDate) return -1;
                if (a.condition.assignedDate < b.condition.assignedDate) return 1;
                return 0;
            });
            const lastAssigned = result.Items[0];
            if (lastAssigned.condition.assigned === validConditions[0]) {
                condition = validConditions[1];
            } else if (lastAssigned.condition.assigned === validConditions[1]) {
                condition = validConditions[0]
            } else {
                return errorResponse({
                    message: `Unexpected condition '${lastAssigned.condition.assigned}' found; unable to assign ${userId} to condition`,
                    statusCode: 500
                });
            }
        }

        // save the data
        const conditionData = {
            bornSex: bornSex,
            sexDesc: sexDesc,
            assignedSex: assignedSex,
            assigned: condition,
            assignedDate: new Date().toISOString()
        };
        const conditionParams = {
            TableName: usersTable,
            Key: { userId: userId },
            UpdateExpression: 'set #condition = :condition',
            ExpressionAttributeNames: { '#condition': 'condition' },
            ExpressionAttributeValues: { ':condition': conditionData }
        };
        await docClient.update(conditionParams).promise();
        return successResponse({condition: condition});
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const getEarnings = async (userId, earningsType = null) => {
    try {
        const db = new Db();
        db.docClient = docClient;
        return await db.earningsForUser(userId, earningsType);
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const setEmopics = async(userId, emopics) => {
    try {
        if (emopics.length != 84) {
            return errorResponse({
                message: `Expected 84 emotional pictures, but received ${emopics.length}.`,
                statusCode: 400
            });
        }

        const putRequests = emopics.map((p, idx) => {
            return {
                PutRequest: {
                    Item: {
                        userId: userId,
                        order: idx,
                        file: p.file,
                        group: p.group
                    }
                }
            }
        });

        // slice into arrays of no more than 25 PutRequests due to DynamoDB limits
        const chunks = [];
        for (let i = 0; i < putRequests.length; i += 25) {
            chunks.push(putRequests.slice(i, i + 25));
        }

        for (let i=0; i<chunks.length; i++) {
            const chunk = chunks[i];
            const params = { RequestItems: {} };
            params['RequestItems'][emopicsTable] = chunk;
            await docClient.batchWrite(params).promise();
        }

        return successResponse({msg: "Save successful"});

    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const getEmopicsForUser = async (userId, used, count) => {
    try {
        const maxItems = count == undefined ? Number.MAX_SAFE_INTEGER : count;
        let ExclusiveStartKey, dynResults
        const allResults = [];

        do {
            const params = {
                TableName: emopicsTable,
                ExclusiveStartKey,
                KeyConditionExpression: `userId = :uidKey`,
                ExpressionAttributeValues: { ':uidKey': userId }
            };
            if (used) {
                params['FilterExpression'] = "attribute_exists(#date)";
                params['ExpressionAttributeNames'] = {"#date": 'date'};
            }
            dynResults = await docClient.query(params).promise();
            ExclusiveStartKey = dynResults.LastEvaluatedKey;
            allResults.push(...dynResults.Items.map(i => ({file: i.file, order: i.order, date: i.date})));
        } while (dynResults.LastEvaluatedKey && allResults.length < maxItems)
        
        if (allResults.length > maxItems) return allResults.slice(0, maxItems);

        return allResults;

    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const markEmopicsSkippedForUser = async (userId, emopics) => {
    let lastErr;

    const fullDate = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ssZ[Z]');
    for (const p of emopics) {
        const order = p.order; 
        try {
            const params = {
                TableName: emopicsTable,
                Key: { userId: userId, order: order },
                UpdateExpression: 'set skipped = :true, #date = :date',
                ExpressionAttributeNames: {'#date': 'date'},
                ExpressionAttributeValues: {':true': true, ':date': fullDate}
            };
            await docClient.update(params).promise();
        } catch (err) {
            console.error(`Failed to set skipped=true, date=${date} for emopic with userId ${userId}, order: ${order}.`, err);
            lastErr = err;
        }
    }
    if (lastErr) {
        // This will just return the last error encountered;
        // you'll have to look in the logs to find any others
        if (!(lastErr instanceof HttpError)) {
            lastErr = new HttpError(lastErr.message);
        }
        return errorResponse(lastErr);
    }
    return successResponse({msg: "Update successful"});
}

const saveEmopicsRating = async(userId, order, rating, responseTime, date) => {
    if (!Number.isInteger(rating) || rating < 1 || rating > 9) return errorResponse(new HttpError('Rating must be between 1 and 9', 400));
    if (!Number.isInteger(order) || order < 0 || order > 83) return errorResponse(new HttpError('Order must be between 0 and 83', 400));
    if (!Number.isInteger(responseTime) || responseTime <= 0) return errorResponse(new HttpError('Response time must be a number > 0', 400))
    if (!dayjs.tz(date, 'YYYY-MM-DDTHH:mm:ssZ[Z]', 'America/Los_Angeles', true).isValid()) return errorResponse(new HttpError('You must provide a valid date', 400));

    const params = {
        TableName: emopicsTable,
        Key: { userId: userId, order: order },
        UpdateExpression: 'set rating = :rating, rt = :responseTime, #date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':rating': rating, ':date': date, ':responseTime': responseTime }
    };
    try {
        await docClient.update(params).promise();
        return successResponse({msg: "Update successful"});
    } catch (err) {
        console.error(`Failed to set rating=${rating}, date=${date} for emopic with userId ${userId}, order: ${order}.`, err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

async function getUserById(userId) {
    const params = {
        TableName: usersTable,
        KeyConditionExpression: "userId = :idKey",
        ExpressionAttributeValues: { ":idKey": userId }
    };
    const dynResults = await docClient.query(params).promise();
    if (dynResults.Items.length === 0) {
        return {};
    }
    if (dynResults.Items.length > 1) {
        throw new HttpError(`Found multiple users with userId ${userId}.`, 409);
    }
    return dynResults.Items[0];
}

function successResponse(data) {
    return {
        "statusCode": 200,
        "body": JSON.stringify(data)
    }
}

function errorResponse(err) {
    const resp = {
        "body": JSON.stringify(err.message)
    } 

    if (err.statusCode) {
        resp["statusCode"] = err.statusCode;
    }

    if (err.code) {
        resp["headers"]["x-amzn-ErrorType"] = err.code;
        resp["body"] = `${err.code}: ${JSON.stringify(err.message)}`;
    }

    return resp;
}

class HttpError extends Error {
    constructor(message, statusCode=500) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}

