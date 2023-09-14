import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import Db from 'db/db.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

const region = process.env.REGION;
const dynamoEndpoint = process.env.DYNAMO_ENDPOINT;

const noAccess = {
    statusCode: 401,
    body: "You do not have permission to access this information"
};

exports.handler = async(event) => {
    const userRole = event.requestContext.authorizer.jwt.claims['cognito:preferred_role'];
    if (!userRole) return noAccess;

    const path = event.requestContext.http.path;
    const method = event.requestContext.http.method;
    const credentials = await credentialsForRole(userRole);
    const db = dbWithCredentials(credentials);

    if (path === "/admin/participants") {
        return await db.getAllUsers();
    }

    if (path.startsWith("/admin/participant/")) {
        const participantId = event.pathParameters.id;
        if (method === "PUT") {
            const properties = JSON.parse(event.body);
            return await db.updateUser(participantId, properties);
        }
        
        if (method === "GET") {
            if (path.startsWith(`/admin/participant/${participantId}/earnings`)) {
                const earningsType = event.pathParameters.earningsType;
                return await db.earningsForUser(participantId, earningsType);
            }

            if (path === `/admin/participant/${participantId}/status`) {
                return await getUserStatus(participantId, db);
            }

            if (path === `/admin/participant/${participantId}`){
                const consistentRead = event.queryStringParameters && event.queryStringParameters.consistentRead === 'true';
                return await db.getUser(participantId, consistentRead);
            }
        }
            
        return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
    }

    return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
}

/**
 * Returns the number of days the participant has done >=3 breathing segments
 * @param {string}} participantId 
 * @param {*} db 
 * @returns 
 */
async function getUserStatus(participantId, db) {
    const segments = await db.segmentsForUser(participantId, 2);
    const days = segments.map(s => {
        dayjs(s.endDateTime * 1000).tz('America/Los_Angeles').format('YYYYMMDD');
    });
    const countByDay = days.reduce((accum, cur) => {
        let count = accum[cur] ?? 0;
        count++;
        accum[cur] = count;
        return accum
    }, {});
    const daysMeetingThreshold = Object.values(countByDay).filter(v => v >= 3).length;

    return daysMeetingThreshold;
}

async function credentialsForRole(roleArn) {
    const assumeRoleCmd = new AssumeRoleCommand({RoleArn: roleArn, RoleSessionName: "lambdaCognitoUser"});
    const stsClient = new STSClient({ region: region });
    const roleData = await stsClient.send(assumeRoleCmd);
    return {
        accessKeyId: roleData.Credentials.AccessKeyId,
        secretAccessKey: roleData.Credentials.SecretAccessKey,
        sessionToken: roleData.Credentials.SessionToken
    };
}

function dbWithCredentials(credentials) {
    const dynClient = new DynamoDBClient({region: region, endpoint: dynamoEndpoint, apiVersion: "2012-08-10", credentials: credentials});
    const docClient = DynamoDBDocumentClient.from(dynClient);

    const db = new Db();
    db.docClient = docClient;
    db.credentials = credentials;
    return db;
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