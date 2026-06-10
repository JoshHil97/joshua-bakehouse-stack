import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import { join } from 'path'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as cdk from 'aws-cdk-lib'
import { Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigw from 'aws-cdk-lib/aws-apigateway'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Defines the custom settings our Bakehouse stack accepts
 */
export class BakehouseSettings {
  constructor ({
    permissionsBoundaryPolicyName,
    subDomain,
    domainName,
    certArn,
    env,
    stackName,
    dbName,
    vpcName
  }) {
    this.permissionsBoundaryPolicyName = permissionsBoundaryPolicyName
    this.subDomain = subDomain
    this.domainName = domainName
    this.certArn = certArn
    this.env = env
    this.stackName = stackName
    this.dbName = dbName
    this.vpcName = vpcName
  }
}

export class BakehouseStack extends Stack {
  constructor (scope, id, props) {
    super(scope, id, props)

    // ----------------------------------
    // Domains
    // ----------------------------------
    const fullDomain = `${props.subDomain}.${props.domainName}`
    const productCardsDomain = `product-cards-${props.subDomain}.${props.domainName}`

    // ----------------------------------
    // Tags
    // ----------------------------------
    cdk.Tags.of(this).add('Owner', props.stackName)
    cdk.Tags.of(this).add('Project', 'Bakehouse')

    // ----------------------------------
    // Permissions boundary
    // ----------------------------------
    const boundary = iam.ManagedPolicy.fromManagedPolicyName(
      this,
      'Boundary',
      props.permissionsBoundaryPolicyName
    )

    iam.PermissionsBoundary.of(this).apply(boundary)

    // ----------------------------------
    // Networking
    // ----------------------------------

    // Look up the shared VPC to place our database in
    // Other services can then join the same network
    const sharedVpc = props.createTestVpc
      ? new ec2.Vpc(this, 'test-vpc', {
          maxAzs: 2,
          natGateways: 0,
          subnetConfiguration: [
            {
              name: 'isolated',
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED
            }
          ]
        })
      : ec2.Vpc.fromLookup(this, 'sharedVpc', {
          vpcName: props.vpcName,
          region: props.env.region
        })

    // ----------------------------------
    // Databases
    // ----------------------------------
    // Db configuration – Postgres engine and parameter group

    // Choose the Aurora Postgres engine version
    const postgresVersion = rds.AuroraPostgresEngineVersion.VER_15_14;

    const postgresEngine = rds.DatabaseClusterEngine.auroraPostgres({
      version: postgresVersion,
    });

    // Create a parameter group that forces SSL
    const postgresParameterGroup = new rds.ParameterGroup(
      this,
      'postgres-parameter-group',
      {
        name: `${props.subDomain}-ParameterGroup`,
        engine: postgresEngine,
        description: `${props.subDomain} parameter group with SSL enforced`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        parameters: {
          'rds.force_ssl': '1' // require SSL for database connections
        }
      }
    )

    const cluster = new rds.DatabaseCluster(this, 'rds-cluster', {
      // Use the Postgres engine we defined above
      engine: postgresEngine,
      // Attach our parameter group so SSL is enforced
      parameterGroup: postgresParameterGroup,
      // Name of the default database in this cluster
      defaultDatabaseName: props.dbName,
      // Put the cluster into the shared CTA VPC
      vpc: sharedVpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
    
      // Aurora Serverless v2 configuration
      writer: rds.ClusterInstance.serverlessV2('writer'),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 1,
    
      // Needed for the Data API from our Lambdas
      enableDataApi: true,
    
      // Tear the database down with the stack (fine for a lab, not for prod)
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })


    // ----------------------------------
    // DynamoDB (Users)
    // ----------------------------------
    const usersTableName = `${props.subDomain}-users-table`

    const usersTable = new dynamodb.Table(this, 'users-table', {
      tableName: usersTableName,

      partitionKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING
      },

      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    // ----------------------------------
    // DynamoDB (Favourites)
    // ----------------------------------
    const favouritesTable = new dynamodb.Table(this, "favourites-table", {
      tableName: `${props.subDomain}-favourites-table`,
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "productId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // ----------------------------------
    // S3 buckets
    // ----------------------------------
    const productCardsBucket = new s3.Bucket(this, 'product-cards', {
      bucketName: `${props.subDomain}-product-cards`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false
      })
    })

    const clientBucket = new s3.Bucket(this, 'client-bucket', {
      bucketName: `${props.subDomain}-client-bucket`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      websiteIndexDocument: 'index.html',
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,
        restrictPublicBuckets: false
      })
    })

    clientBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['s3:*'],
        resources: [
          clientBucket.bucketArn,
          clientBucket.arnForObjects('*')
        ],
        conditions: {
          Bool: { 'aws:SecureTransport': 'false' }
        },
        principals: [new iam.AnyPrincipal()]
      })
    )

    clientBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [clientBucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()]
      })
    )

    // ----------------------------------
    // Certificate
    // ----------------------------------
    const cert = acm.Certificate.fromCertificateArn(
      this,
      'BakehouseCert',
      props.certArn
    )

    // ----------------------------------
    // CloudFront function
    // ----------------------------------
    const redirectsFunction = new cloudfront.Function(this, 'redirects-function', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: 'functions/redirects.js'
      })
    })

    const clientQueryPolicy = new cloudfront.OriginRequestPolicy(
      this,
      'client-query-policy',
      {
        queryStringBehavior:
          cloudfront.OriginRequestQueryStringBehavior.all()
      }
    )

    // ----------------------------------
    // Lambda bundling
    // ----------------------------------
    const bundling = {
      externalModules: ['aws-sdk']
    }

    
    const lambdaEnvVars = {
      NODE_ENV: 'production',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      DB_NAME: props.dbName,
      CLUSTER_ARN: cluster.clusterArn,
      SECRET_ARN: cluster.secret?.secretArn || 'NOT_SET',
      PRODUCT_CARDS_BUCKET: productCardsBucket.bucketName,
      PRODUCT_CARDS_BASE_URL: `https://${productCardsDomain}`,
      DYNAMO_TABLE_NAME: usersTableName,
      DYNAMO_REGION: props.env.region,
      FAVOURITES_TABLE_NAME: favouritesTable.tableName
    }

    const createLambda = (id, options) => {
      if (!props.skipBundling) {
        return new nodejs.NodejsFunction(this, id, options)
      }

      const { entry, bundling, handler, ...lambdaOptions } = options
      return new lambda.Function(this, id, {
        ...lambdaOptions,
        handler: 'index.handler',
        code: lambda.Code.fromInline(
          'exports.handler = async () => ({ statusCode: 200, body: "{}" })'
        )
      })
    }

    // ----------------------------------
    // Lambdas
    // ----------------------------------
    
    const badLambda = createLambda('bad-lambda', {
      functionName: `${props.subDomain}-bad-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'badHandler'
    })

    const healthcheckLambda = createLambda('health-check-lambda', {
      functionName: `${props.subDomain}-health-check-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/health-check.js',
      handler: 'healthcheckHandler'
    })

    // PRODUCTS LIST
    const productsListLambda = createLambda('products-list-lambda', {
      functionName: `${props.subDomain}-products-list-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'productsListHandler',
      bundling,
      environment: {
        ...lambdaEnvVars,
        FEATURED_PRODUCT: 'cinnamon_bun'
      }
    })

    // POST PRODUCT
    const postProductsLambda = createLambda('post-products-lambda', {
      functionName: `${props.subDomain}-post-products-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'postProductHandler',
      bundling,
      environment: lambdaEnvVars
    })

    // CUSTOMERS
    const getCustomersLambda = createLambda('get-customers-lambda', {
      functionName: `${props.subDomain}-get-customers-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'getCustomersHandler',
      bundling,
      environment: lambdaEnvVars
    })

    const postCustomersLambda = createLambda('post-customers-lambda', {
      functionName: `${props.subDomain}-post-customers-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'postCustomersHandler',
      bundling,
      environment: lambdaEnvVars
    })

    // ORDERS
    const getOrdersLambda = createLambda('get-orders-lambda', {
      functionName: `${props.subDomain}-get-orders-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'getOrdersHandler',
      bundling,
      environment: lambdaEnvVars
    })

    const postOrdersLambda = createLambda('post-orders-lambda', {
      functionName: `${props.subDomain}-post-orders-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'postOrdersHandler',
      bundling,
      environment: lambdaEnvVars
    })

    // FAVOURITES
    const postFavouritesLambda = createLambda("post-favourites-lambda", {
      functionName: `${props.subDomain}-post-favourites-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: "functions/favourites.js",
      handler: "postFavouritesHandler",
      bundling,
      environment: lambdaEnvVars
    });

    const getFavouritesLambda = createLambda("get-favourites-lambda", {
      functionName: `${props.subDomain}-get-favourites-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: "functions/favourites.js",
      handler: "getFavouritesHandler",
      bundling,
      environment: lambdaEnvVars
    });

    const deleteFavouritesLambda = createLambda("delete-favourites-lambda", {
      functionName: `${props.subDomain}-delete-favourites-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: "functions/favourites.js",
      handler: "deleteFavouritesHandler",
      bundling,
      environment: lambdaEnvVars
    });

    // -----------------------------
    // USERS (DynamoDB) - Sign up
    // -----------------------------
    const postUsersLambda = createLambda('post-users-lambda', {
      functionName: `${props.subDomain}-post-users-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/users.js',
      handler: 'postUsersHandler',
      bundling,
      environment: lambdaEnvVars

    })

    // -----------------------------
    // USERS (DynamoDB) - Login
    // -----------------------------
    const loginLambda = createLambda('login-lambda', {
      functionName: `${props.subDomain}-login-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/users.js',
      handler: 'loginHandler',
      bundling,
      environment: lambdaEnvVars
    })

    const bootstrapLambda = createLambda('bootstrap-lambda', {
      functionName: `${props.subDomain}-bootstrap-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: 'functions/utility-functions.js',
      handler: 'bootstrapHandler',
      bundling,
      environment: lambdaEnvVars
    })
    
    // Grant Lambdas access to the Aurora Data API
    cluster.grantDataApiAccess(productsListLambda)
    cluster.grantDataApiAccess(postProductsLambda)

    cluster.grantDataApiAccess(getCustomersLambda)
    cluster.grantDataApiAccess(postCustomersLambda)

    cluster.grantDataApiAccess(getOrdersLambda)
    cluster.grantDataApiAccess(postOrdersLambda)
    cluster.grantDataApiAccess(bootstrapLambda)
    productCardsBucket.grantReadWrite(postProductsLambda)

    // Allow users lambdas to access DynamoDB
    usersTable.grantReadWriteData(postUsersLambda)
    usersTable.grantReadData(loginLambda)
    favouritesTable.grantReadWriteData(postFavouritesLambda);
    favouritesTable.grantReadData(getFavouritesLambda);
    favouritesTable.grantReadWriteData(deleteFavouritesLambda);


    // ----------------------------------
    // API Gateway
    // ----------------------------------
    const api = new apigw.RestApi(this, 'apigw', {
      restApiName: `${props.subDomain}-api`,
      description: `${props.subDomain} api gateway`,
      deploy: true,
      deployOptions: {
        stageName: 'api'
      },
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'Access-Control-Allow-Origin',
          'Access-Control-Request-Method',
          'Access-Control-Request-Headers'
        ],
        allowMethods: ['*'],
        allowOrigins: ['*'],
        allowCredentials: true
      }
    })

    api.addUsagePlan('apigw-rate-limits', {
      name: `${props.subDomain}-apigw-rate-limits`,
      throttle: {
        rateLimit: 10,
        burstLimit: 5
      }
    })

    api.root.addResource('healthcheck').addMethod(
      'GET',
      new apigw.LambdaIntegration(healthcheckLambda)
    )

    api.root.addResource('bad').addMethod(
      'GET',
      new apigw.LambdaIntegration(badLambda)
    )

    const productsApi = api.root.addResource('products')
    productsApi.addMethod('GET', new apigw.LambdaIntegration(productsListLambda))
    productsApi.addMethod('POST', new apigw.LambdaIntegration(postProductsLambda))

    const customersApi = api.root.addResource('customers')
    customersApi.addMethod('GET', new apigw.LambdaIntegration(getCustomersLambda))
    customersApi.addMethod('POST', new apigw.LambdaIntegration(postCustomersLambda))

    const ordersApi = api.root.addResource('orders')
    ordersApi.addMethod('GET', new apigw.LambdaIntegration(getOrdersLambda))
    ordersApi.addMethod('POST', new apigw.LambdaIntegration(postOrdersLambda))

    // USERS
    const usersApi = api.root.addResource('users')
    usersApi.addMethod('POST', new apigw.LambdaIntegration(postUsersLambda))
    // LOGIN
    const loginApi = api.root.addResource('login')
    loginApi.addMethod('POST', new apigw.LambdaIntegration(loginLambda))

    const favouritesApi = api.root.addResource("favourites");
    favouritesApi.addMethod("GET", new apigw.LambdaIntegration(getFavouritesLambda));
    favouritesApi.addMethod("POST", new apigw.LambdaIntegration(postFavouritesLambda));
    favouritesApi.addMethod("DELETE", new apigw.LambdaIntegration(deleteFavouritesLambda));

    // ----------------------------------
    // Monitoring
    // ----------------------------------
    const oneMinute = cdk.Duration.minutes(1)
    const api5xxMetric = api.metricServerError({
      period: oneMinute,
      statistic: 'Sum'
    })
    const api4xxMetric = api.metricClientError({
      period: oneMinute,
      statistic: 'Sum'
    })
    const apiCountMetric = api.metricCount({
      period: oneMinute,
      statistic: 'Sum'
    })
    const apiLatencyMetric = api.metricLatency({
      period: oneMinute,
      statistic: 'Average'
    })

    const api5xxAlarm = new cloudwatch.Alarm(this, 'api-5xx-alarm', {
      alarmName: `${props.subDomain}-api-5xx-errors`,
      alarmDescription: 'API Gateway returned at least one 5XX response in a minute. Hit /api/bad to demo it.',
      metric: api5xxMetric,
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'api-latency-alarm', {
      alarmName: `${props.subDomain}-api-latency-high`,
      alarmDescription: 'Average API latency is above 1.5 seconds for one minute.',
      metric: apiLatencyMetric,
      threshold: 1500,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    const productLambdaErrorAlarm = new cloudwatch.Alarm(this, 'products-lambda-error-alarm', {
      alarmName: `${props.subDomain}-products-lambda-errors`,
      alarmDescription: 'Products Lambda reported at least one unhandled error in a minute.',
      metric: productsListLambda.metricErrors({
        period: oneMinute,
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    })

    const dashboard = new cloudwatch.Dashboard(this, 'monitoring-dashboard', {
      dashboardName: `${props.subDomain}-bakehouse-dashboard`
    })

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: [
          `# ${props.stackName} Bakehouse`,
          '',
          `App: https://${fullDomain}`,
          `Health check: https://${fullDomain}/api/healthcheck`,
          `Alarm demo: https://${fullDomain}/api/bad`
        ].join('\n'),
        width: 24,
        height: 3
      })
    )

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway traffic and errors',
        left: [apiCountMetric],
        right: [api4xxMetric, api5xxMetric],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway latency',
        left: [apiLatencyMetric],
        width: 12,
        height: 6
      })
    )

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda invocations',
        left: [
          healthcheckLambda.metricInvocations({ period: oneMinute, statistic: 'Sum' }),
          productsListLambda.metricInvocations({ period: oneMinute, statistic: 'Sum' }),
          loginLambda.metricInvocations({ period: oneMinute, statistic: 'Sum' }),
          postFavouritesLambda.metricInvocations({ period: oneMinute, statistic: 'Sum' }),
          badLambda.metricInvocations({ period: oneMinute, statistic: 'Sum' })
        ],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda errors and duration',
        left: [
          healthcheckLambda.metricErrors({ period: oneMinute, statistic: 'Sum' }),
          productsListLambda.metricErrors({ period: oneMinute, statistic: 'Sum' }),
          loginLambda.metricErrors({ period: oneMinute, statistic: 'Sum' })
        ],
        right: [
          productsListLambda.metricDuration({ period: oneMinute, statistic: 'Average' }),
          loginLambda.metricDuration({ period: oneMinute, statistic: 'Average' })
        ],
        width: 12,
        height: 6
      })
    )

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB read/write capacity',
        left: [
          usersTable.metricConsumedReadCapacityUnits({ period: oneMinute, statistic: 'Sum' }),
          usersTable.metricConsumedWriteCapacityUnits({ period: oneMinute, statistic: 'Sum' }),
          favouritesTable.metricConsumedReadCapacityUnits({ period: oneMinute, statistic: 'Sum' }),
          favouritesTable.metricConsumedWriteCapacityUnits({ period: oneMinute, statistic: 'Sum' })
        ],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'Aurora cluster CPU and connections',
        left: [
          cluster.metricCPUUtilization({ period: oneMinute, statistic: 'Average' })
        ],
        right: [
          cluster.metricDatabaseConnections({ period: oneMinute, statistic: 'Average' })
        ],
        width: 12,
        height: 6
      })
    )

    // ----------------------------------
    // CloudFront distributions
    // ----------------------------------
    const clientDistribution = new cloudfront.Distribution(this, 'client-distribution', {
      defaultBehavior: {
        origin: new origins.S3BucketOrigin(clientBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: clientQueryPolicy,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: redirectsFunction
          }
        ]
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${api.restApiId}.execute-api.${props.env.region}.amazonaws.com`
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          //This is new as our clientQueryPolicy wasn't working 
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
        }
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0)
        }
      ],
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      domainNames: [fullDomain],
      certificate: cert
    })

    if (!props.skipAssetDeployments) {
      new s3Deployment.BucketDeployment(this, 'client-deployment', {
        destinationBucket: clientBucket,
        sources: [
          s3Deployment.Source.asset(
            path.resolve(__dirname, '../client/dist')
          )
        ],
        prune: true,
        memoryLimit: 256,
        distribution: clientDistribution,
        distributionPaths: ['/*']
      })
    }

    const productCardsDistribution = new cloudfront.Distribution(
      this,
      'product-cards-distribution',
      {
        defaultBehavior: {
          origin: new origins.S3BucketOrigin(productCardsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations: [
            {
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              function: redirectsFunction
            }
          ]
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        domainNames: [productCardsDomain],
        certificate: cert
      }
    )

    if (!props.skipAssetDeployments) {
      new s3Deployment.BucketDeployment(this, 'product-cards-deployment', {
        destinationBucket: productCardsBucket,
        sources: [
          s3Deployment.Source.asset(
            path.resolve(__dirname, '../product-cards')
          )
        ],
        prune: true,
        memoryLimit: 256,
        distribution: productCardsDistribution,
        distributionPaths: ['/*']
      })
    }

    // ----------------------------------
    // Route 53
    // ----------------------------------
    const zone = props.hostedZoneId
      ? route53.HostedZone.fromHostedZoneAttributes(this, 'zone', {
          hostedZoneId: props.hostedZoneId,
          zoneName: props.domainName
        })
      : route53.HostedZone.fromLookup(this, 'zone', {
          domainName: props.domainName
        })

    new route53.CnameRecord(this, 'product-cards-record', {
      zone,
      recordName: productCardsDomain,
      domainName: productCardsDistribution.distributionDomainName
    })

    new route53.CnameRecord(this, 'client-record', {
      zone,
      recordName: fullDomain,
      domainName: clientDistribution.distributionDomainName
    })

    // ----------------------------------
    // Client env file
    // ----------------------------------
    if (!props.skipClientEnvWrite) {
      writeFileSync(
        join(__dirname, '../client/.env.production'),
        `VITE_PRODUCT_CARDS_DOMAIN=https://${productCardsDomain}\nVITE_API_BASE_URL=https://${fullDomain}/api\n`
      )
    }
    
    // ----------------------------------
    // Outputs
    // ----------------------------------
    new cdk.CfnOutput(this, 'ClientUrl', {
      value: `https://${fullDomain}`
    })

    new cdk.CfnOutput(this, 'ProductCardsSamplePdfUrl', {
      value: `https://${productCardsDomain}/chocolate_brownie.pdf`,
    })

    new cdk.CfnOutput(this, 'PrettyApiUrlHealthcheck', {
      value: `https://${fullDomain}/api/healthcheck`,
    })

    new cdk.CfnOutput(this, 'BadApiUrlForAlarmDemo', {
      value: `https://${fullDomain}/api/bad`,
    })

    new cdk.CfnOutput(this, 'MonitoringDashboardName', {
      value: dashboard.dashboardName,
    })

    new cdk.CfnOutput(this, 'Api5xxAlarmName', {
      value: api5xxAlarm.alarmName,
    })

    new cdk.CfnOutput(this, 'ApiLatencyAlarmName', {
      value: apiLatencyAlarm.alarmName,
    })

    new cdk.CfnOutput(this, 'ProductsLambdaErrorAlarmName', {
      value: productLambdaErrorAlarm.alarmName,
    })

    // Users Lambda name
    new cdk.CfnOutput(this, 'PostUsersLambdaName', {
      value: postUsersLambda.functionName,
    })

    new cdk.CfnOutput(this, 'LoginLambdaName', {
      value: loginLambda.functionName,
    })
  }
}
