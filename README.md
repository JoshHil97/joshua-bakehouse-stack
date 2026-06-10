# Joshua Hilarion's Bakehouse

This folder contains Joshua Hilarion's Bakehouse CDK stack, Lambda handlers, DynamoDB favourites/users work, and the Vite React client.

## Setup

Install dependencies in both workspaces:

```sh
npm install
cd client
npm install
```

## Verification

Run the backend/unit/CDK tests:

```sh
npm run test:unit
```

Run the full GitHub Actions-style quality gate locally:

```sh
npm run test:ci
```

Run the client production build:

```sh
cd client
npm run build
```

Run Playwright end-to-end smoke tests:

```sh
cd client
npx playwright install
npm run test:e2e
```

Run the k6 load smoke test against a deployed app or local target:

```sh
BASE_URL=https://your-stack.cta-training.academy npm run test:load
```

On PowerShell:

```powershell
$env:BASE_URL='https://your-stack.cta-training.academy'; npm run test:load
```

The k6 test expects `/api/healthcheck` and `/api/products` to be reachable.

## Deploy

Set the stack name, build the client, then synth or deploy:

```powershell
$env:BAKEHOUSE_STACK_NAME='joshua-hilarion-bakehouse'
cd client
npm run build
cd ..
npx cdk synth --profile student
npx cdk deploy
```

Useful commands:

* `npm run test:unit` runs Jest unit and CDK assertion tests
* `npm run test:ci` runs unit tests, client lint, client build, and Playwright E2E
* `npm run synth` emits the synthesized CloudFormation template
* `npx cdk diff` compares deployed stack with current state
* `npx cdk deploy` deploys this stack to your default AWS account and region

## Monitoring

The stack creates a CloudWatch dashboard and alarms:

* Dashboard: `joshua-hilarion-bakehouse-bakehouse-dashboard`
* API 5XX alarm: `joshua-hilarion-bakehouse-api-5xx-errors`
* API latency alarm: `joshua-hilarion-bakehouse-api-latency-high`
* Products Lambda error alarm: `joshua-hilarion-bakehouse-products-lambda-errors`

In AWS, go to:

* CloudWatch > Dashboards > `joshua-hilarion-bakehouse-bakehouse-dashboard`
* CloudWatch > Alarms > All alarms
* API Gateway > APIs > `joshua-hilarion-bakehouse-api`
* Lambda > Functions, then search `joshua-hilarion-bakehouse`

Things that make the dashboard move after deploy:

```powershell
Invoke-WebRequest https://joshua-hilarion-bakehouse.cta-training.academy/api/healthcheck
Invoke-WebRequest https://joshua-hilarion-bakehouse.cta-training.academy/api/products
Invoke-WebRequest https://joshua-hilarion-bakehouse.cta-training.academy/api/bad
```

The `/api/bad` endpoint intentionally returns a 500 response, so it should move the API 5XX graph and can push the API 5XX alarm into `In alarm`.

For more movement, run a small loop:

```powershell
1..30 | ForEach-Object {
  Invoke-WebRequest https://joshua-hilarion-bakehouse.cta-training.academy/api/healthcheck | Out-Null
}
```

Or use the k6 smoke test once k6 is installed:

```powershell
$env:BASE_URL='https://joshua-hilarion-bakehouse.cta-training.academy'; npm run test:load
```
