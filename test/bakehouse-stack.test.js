import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { BakehouseStack } from '../lib/bakehouse-stack.js'

function makeStack () {
  const app = new cdk.App({ outdir: 'cdk.out.test' })

  return new BakehouseStack(app, 'BakehouseTestStack', {
    env: { account: '123456789012', region: 'eu-west-2' },
    permissionsBoundaryPolicyName: 'scopePermissions',
    subDomain: 'test-bakehouse',
    stackName: 'test-bakehouse',
    certArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
    domainName: 'example.com',
    dbName: 'dev',
    vpcName: 'unused-in-tests',
    createTestVpc: true,
    hostedZoneId: 'Z123456789TEST',
    skipBundling: true,
    skipAssetDeployments: true,
    skipClientEnvWrite: true
  })
}

describe('BakehouseStack', () => {
  test('creates DynamoDB tables for users and favourites', () => {
    const template = Template.fromStack(makeStack())

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'test-bakehouse-users-table',
      KeySchema: [
        { AttributeName: 'email', KeyType: 'HASH' }
      ]
    })

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'test-bakehouse-favourites-table',
      KeySchema: [
        { AttributeName: 'email', KeyType: 'HASH' },
        { AttributeName: 'productId', KeyType: 'RANGE' }
      ]
    })
  })

  test('routes the public API through CloudFront', () => {
    const template = Template.fromStack(makeStack())

    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https'
        }),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/api/*',
            ViewerProtocolPolicy: 'redirect-to-https'
          })
        ])
      })
    })
  })

  test('creates monitoring dashboard and alarms', () => {
    const template = Template.fromStack(makeStack())

    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'test-bakehouse-bakehouse-dashboard'
    })

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'test-bakehouse-api-5xx-errors',
      Threshold: 1
    })

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'test-bakehouse-api-latency-high',
      Threshold: 1500
    })
  })

  test('creates a GitHub Actions OIDC deploy role for this repo', () => {
    const template = Template.fromStack(makeStack())

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'github-actions-joshua-hilarion-bakehouse',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com'
              },
              StringLike: {
                'token.actions.githubusercontent.com:sub': 'repo:JoshHil97/joshua-bakehouse-stack:ref:refs/heads/main'
              }
            }
          })
        ])
      }
    })

    template.hasOutput('GitHubActionsRoleArn', {})
  })
})
