import { PreSignUpTriggerHandler } from 'aws-lambda';
import { StringMap } from 'aws-lambda/trigger/cognito-user-pool-trigger/_common';
import { DynamoDB } from 'aws-sdk';

const dynamodb = new DynamoDB({apiVersion: '2012-08-10'});

const TABLE_NAME = process.env.TABLE_NAME;
if(TABLE_NAME === undefined) throw "TABLE_NAME is not defined.";

export const handler: PreSignUpTriggerHandler = (event) => {
    return new Promise((resolve, reject) => {
        const username = (event.request.clientMetadata as StringMap).username;
        const sub = event.request.userAttributes.sub;
        dynamodb.putItem({
            TableName: TABLE_NAME,
            Item: {
                username: {
                    S: username,
                },
                sub: {
                    S: sub,
                }
            },
            ConditionExpression: 'attribute_not_exists(#username)',
            ExpressionAttributeNames: {
                '#username': 'username',
            },
        }, (err) => {
            if(err) {
                console.error(err);
                reject("UsernameAlreadyExists");
                return;
            }
            resolve(event);
        });
    });
};
