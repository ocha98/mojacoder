import * as cdk from '@aws-cdk/core';
import { join } from 'path';
import { Queue } from '@aws-cdk/aws-sqs';
import { AuthorizationType, CfnDataSource, CfnFunctionConfiguration, CfnResolver, GraphqlApi, MappingTemplate, Resolver, Schema } from '@aws-cdk/aws-appsync';
import { CfnAccessKey, PolicyStatement, Role, ServicePrincipal, User } from '@aws-cdk/aws-iam';
import { Cluster, ContainerImage, FargateService, FargateTaskDefinition } from '@aws-cdk/aws-ecs';
import { UserPool, UserPoolOperation, VerificationEmailStyle } from '@aws-cdk/aws-cognito';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { Table, AttributeType, BillingMode } from '@aws-cdk/aws-dynamodb';
import { SubnetType, Vpc } from '@aws-cdk/aws-ec2';
import { Bucket } from '@aws-cdk/aws-s3'

export class MojacoderBackendStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const pool = new UserPool(this, 'mojacoder-users', {
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
            },
            standardAttributes: {
                preferredUsername: {
                    mutable: false,
                    required: true,
                },
            },
            userVerification: {
                emailStyle: VerificationEmailStyle.LINK,
            },
        });
        pool.addClient("mojacoder-frontend-app");
        pool.addDomain('mojacoder-users-domain', {
            cognitoDomain: {
                domainPrefix: 'mojacoder',
            }
        });
        const userTable = new Table(this, 'user-table', {
            billingMode: BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: 'username',
                type: AttributeType.STRING,
            }
        });
        userTable.addGlobalSecondaryIndex({
            indexName: 'idIndex',
            partitionKey: {
                name: 'id',
                type: AttributeType.STRING,
            }
        });
        const signupTrigger = new NodejsFunction(this, 'signup-trigger', {
            entry: join(__dirname, '../cognito-triggers/pre-signup/index.ts'),
            handler: 'handler',
            environment: {
                TABLE_NAME: userTable.tableName,
            },
        });
        pool.addTrigger(UserPoolOperation.PRE_SIGN_UP, signupTrigger);
        signupTrigger.addToRolePolicy(new PolicyStatement({
            resources: [userTable.tableArn],
            actions: ['dynamodb:PutItem'],
        }));
        const problemTable = new Table(this, 'problem-table', {
            billingMode: BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: 'id',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'datetime',
                type: AttributeType.NUMBER,
            },
        });
        const authorTable = new Table(this, 'author-table', {
            billingMode: BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: 'problemID',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'userID',
                type: AttributeType.STRING,
            },
        });
        authorTable.addGlobalSecondaryIndex({
            indexName: 'userID-index',
            partitionKey: {
                name: 'userID',
                type: AttributeType.STRING,
            },
            sortKey: {
                name: 'datetime',
                type: AttributeType.NUMBER,
            },
        });
        // const postedProblems = new Bucket(this, 'posted_problems');
        // postedProblems.addObjectCreatedNotification()

        const JudgeQueue = new Queue(this, 'JudgeQueue');
        const api = new GraphqlApi(this, 'API', {
            name: 'mojacoder-api',
            schema: Schema.fromAsset(join(__dirname, '../graphql/schema.graphql')),
            authorizationConfig: {
                additionalAuthorizationModes: [
                    {
                        authorizationType: AuthorizationType.IAM,
                    },
                    {
                        authorizationType: AuthorizationType.USER_POOL,
                        userPoolConfig: {
                            userPool: pool,
                        },
                    }
                ]
            }
        });
        const JudgeQueueDataSourceRole = new Role(this, 'JudgeQueueDataSourceRole', {
            assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
        });
        JudgeQueueDataSourceRole.addToPolicy(new PolicyStatement({
            resources: [JudgeQueue.queueArn],
            actions: ['sqs:SendMessage'],
        }));
        const JudgeQueueDataSource = new CfnDataSource(this, 'JudgeQueueDataSource',
            {
                apiId: api.apiId,
                name: 'JudgeQueue',
                serviceRoleArn: JudgeQueueDataSourceRole.roleArn,
                type: 'HTTP',
                httpConfig: {
                    endpoint: "https://sqs.ap-northeast-1.amazonaws.com",
                    authorizationConfig: {
                        authorizationType: 'AWS_IAM',
                        awsIamConfig: {
                            signingRegion: 'ap-northeast-1',
                            signingServiceName: 'sqs',
                        }
                    },
                },
            },
        );
        const runPlayground = new CfnResolver(this, 'runPlayground', {
            apiId: api.apiId,
            typeName: 'Mutation',
            dataSourceName: JudgeQueueDataSource.name,
            fieldName: 'runPlayground',
            requestMappingTemplate:
                MappingTemplate.fromFile(join(__dirname, '../graphql/runPlayground/request.vtl'))
                    .renderTemplate().replace(/%QUEUE_URL%/g, JudgeQueue.queueUrl),
            responseMappingTemplate:
                MappingTemplate.fromFile(join(__dirname, '../graphql/runPlayground/response.vtl'))
                    .renderTemplate(),
        });
        runPlayground.addDependsOn(JudgeQueueDataSource);
        const PlaygroundDataSource = api.addNoneDataSource('Playground');
        PlaygroundDataSource.createResolver({
            typeName: 'Mutation',
            fieldName: 'responsePlayground',
            requestMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/responsePlayground/request.vtl')),
            responseMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/responsePlayground/response.vtl')),
        });
        PlaygroundDataSource.createResolver({
            typeName: 'Subscription',
            fieldName: 'onResponsePlayground',
            requestMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/onResponsePlayground/request.vtl')),
            responseMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/onResponsePlayground/response.vtl')),
        });
        const userTableDataSource = api.addDynamoDbDataSource('userTable', userTable);
        userTableDataSource.createResolver({
            typeName: 'Query',
            fieldName: 'user',
            requestMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/user/request.vtl')),
            responseMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/user/response.vtl')),
        });
        const problemTableDataSource = api.addDynamoDbDataSource('problem_table', problemTable);
        const authorTableDataSource = api.addDynamoDbDataSource('author_table', authorTable);
        const postProblemRegisterProblemFunction = new CfnFunctionConfiguration(this, 'postProblem-registerProblem', {
            apiId: api.apiId,
            name: 'postProblemRegisterProblem',
            dataSourceName: problemTableDataSource.name,
            functionVersion: '2018-05-29',
            requestMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/postProblem/registerProblem/request.vtl')).renderTemplate(),
            responseMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/postProblem/registerProblem/response.vtl')).renderTemplate(),
        });
        postProblemRegisterProblemFunction.addDependsOn(problemTableDataSource.ds);
        const postProblemRegisterAuthorFunction = new CfnFunctionConfiguration(this, 'postProblem-registerAuthor', {
            apiId: api.apiId,
            name: 'postProblemRegisterAuthor',
            dataSourceName: authorTableDataSource.name,
            functionVersion: '2018-05-29',
            requestMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/postProblem/registerAuthor/request.vtl')).renderTemplate(),
            responseMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/postProblem/registerAuthor/response.vtl')).renderTemplate(),
        });
        postProblemRegisterAuthorFunction.addDependsOn(authorTableDataSource.ds);
        new Resolver(this, 'postProblem', {
            api,
            typeName: 'Mutation',
            fieldName: 'postProblem',
            pipelineConfig: [
                postProblemRegisterProblemFunction.attrFunctionId,
                postProblemRegisterAuthorFunction.attrFunctionId,
            ],
            requestMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/postProblem/request.vtl')),
            responseMappingTemplate: MappingTemplate.fromFile(join(__dirname, '../graphql/postProblem/response.vtl')),
        });

        const vpc = new Vpc(this, 'vpc', {
            natGateways: 0,
            subnetConfiguration: [
                {
                    name: 'judge-subnet',
                    subnetType: SubnetType.PUBLIC,
                }
            ],
        });
        const JudgeUser = new User(this, 'JudgeUser');
        JudgeUser.addToPolicy(new PolicyStatement({
            resources: [api.arn + '/*'],
            actions: ['appsync:GraphQL'],
        }));
        JudgeUser.addToPolicy(new PolicyStatement({
            resources: [JudgeQueue.queueArn],
            actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage'],
        }));
        const accessKey = new CfnAccessKey(this, 'JudgeUserAccessKey', {
            userName: JudgeUser.userName,
        });
        const approximateNumberOfMessagesVisible = JudgeQueue.metricApproximateNumberOfMessagesVisible();
        const judgeCluster = new Cluster(this, 'judge-cluster', {
            vpc,
        });
        const judgeTask = new FargateTaskDefinition(this, 'judge-task');
        judgeTask.addContainer('judge-container', {
            image: ContainerImage.fromAsset(join(__dirname, '../judge-image')),
            environment: {
                AWS_ACCESS_KEY_ID: accessKey.ref,
                AWS_SECRET_ACCESS_KEY: accessKey.attrSecretAccessKey,
                API_ENDPOINT: api.graphqlUrl,
                JUDGEQUEUE_URL: JudgeQueue.queueUrl,
            },
        });
        const judgeService = new FargateService(this, 'judge-service', {
            cluster: judgeCluster,
            taskDefinition: judgeTask,
            assignPublicIp: true,
        });
        const judgeScale = judgeService.autoScaleTaskCount({
            maxCapacity: 2,
        });
        judgeScale.scaleOnMetric('judge-scale-by-queue', {
            metric: approximateNumberOfMessagesVisible,
            scalingSteps: [
                {
                    upper: 0,
                    change: -1,
                },
                {
                    lower: 100,
                    change: 1,
                },
            ],
        });
    }
}
