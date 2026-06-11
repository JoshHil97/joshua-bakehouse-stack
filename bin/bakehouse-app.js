#!/usr/bin/env node
import { BakehouseStack } from '../lib/bakehouse-stack.js';
import * as cdk from 'aws-cdk-lib';

const stackName = process.env.BAKEHOUSE_STACK_NAME

if (!stackName || !stackName.trim()) {
  console.error('Environment variable BAKEHOUSE_STACK_NAME is not set')
  process.exit(1)
}

const account =
  process.env.CDK_DEFAULT_ACCOUNT ||
  process.env.AWS_ACCOUNT_ID ||
  process.env.AWS_ACCOUNT ||
  'NOT_SET'

const region =
  process.env.CDK_DEFAULT_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  'NOT_SET'

const settings = {
  env: {
    account,
    region
  },
  stackName: stackName,
  certArn: cdk.Fn.importValue('CTASharedCertArn'), // SSL cert for HTTPS
  permissionsBoundaryPolicyName: 'scopePermissions',
  domainName: 'cta-training.academy', // Root domain
  subDomain: stackName.toLowerCase(),
  dbName: 'dev',
  vpcName: 'CTASharedVPC-vpc'
}

const app = new cdk.App();


new BakehouseStack(app,`${settings.stackName}-stack`,{
  env: settings.env,
  permissionsBoundaryPolicyName: settings.permissionsBoundaryPolicyName,
  subDomain: settings.subDomain,
  stackName: settings.stackName,
  certArn: settings.certArn,
  domainName: settings.domainName,
  dbName: settings.dbName,
  vpcName: settings.vpcName  
});
