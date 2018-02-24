# Serverless Plugin Canary Deployments

A Serverless plugin to implement canary deployment of Lambda functions

## Installation
`npm i serverless-plugin-canary-deployments`

## Usage

```yaml
service: canary-deployments
provider:
  name: aws
  runtime: nodejs6.10

plugins:
  - serverless-plugin-canary-deployments

functions:
  hello:
    handler: handler.hello
    events:
      - http: GET hello
    deploymentSettings:
      type: Linear10PercentEvery1Minute
      alias: Live
      preTrafficHook: preHook
      postTrafficHook: postHook
      alarms:
        - FooAlarm
        - BarAlarm
  preHook:
    handler: hooks.pre
  postHook:
    handler: hooks.post
```

## Limitations

## License

ISC © [David García](https://github.com/davidgf)
