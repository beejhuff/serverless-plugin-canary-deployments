const _ = require('lodash/fp');
const CfGenerators = require('./lib/CfTemplateGenerators');

class ServerlessCanaryDeployments {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.awsProvider = this.serverless.getProvider('aws');
    this.naming = this.awsProvider.naming;
    this.service = this.serverless.service;
    this.withDeploymentPreferencesFns = this.serverless.service.getAllFunctions()
      .map(name => ({ name, obj: this.serverless.service.getFunction(name) }))
      .filter(fn => !!fn.obj.deploymentPreference);
    this.hooks = {
      'before:package:finalize': this.canary.bind(this)
    };
  }

  get codeDeployAppName() {
    const stackName = this.naming.getStackName();
    const normalizedStackName = this.naming.normalizeNameToAlphaNumericOnly(stackName);
    return `${normalizedStackName}DeploymentApplication`;
  }

  get compiledTpl() {
    return this.service.provider.compiledCloudFormationTemplate;
  }

  canary() {
    if (this.withDeploymentPreferencesFns.length > 0) {
      const compiledTpl = this.service.provider.compiledCloudFormationTemplate;
      this.addCodeDeployApp();
      this.addCodeDeployRole();
      this.withDeploymentPreferencesFns
        .forEach((fn) => {
          const normalizedFn = this.naming.getLambdaLogicalId(fn.name);
          const resources = compiledTpl.Resources;
          const fnVersion = Object.keys(compiledTpl.Resources).find(el => el.startsWith('HelloLambdaVersion'));  // FIXME
          const deploymentSettings = fn.obj.deploymentPreference;
          const deploymentGroupName = this.addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName: normalizedFn });
          console.log(this.compiledTpl);
          this.addFunctionAlias({ deploymentSettings, compiledTpl, normalizedFn, deploymentGroupName, fnVersion });
          this.addAliasToEvents({ deploymentSettings, normalizedFn, resources });
        });
    }
  }

  addCodeDeployApp() {
    const resourceName = this.codeDeployAppName;
    const template = CfGenerators.codeDeploy.buildApplication(resourceName);
    Object.assign(this.compiledTpl.Resources, template);
  }

  addCodeDeployRole() {
    const template = CfGenerators.iam.buildCodeDeployRole();
    Object.assign(this.compiledTpl.Resources, template);
  }

  addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName }) {
    const logicalName = `${normalizedFnName}DeploymentGroup`;
    const params = {
      normalizedFnName,
      codeDeployAppName: this.codeDeployAppName,
      deploymentSettings
    };
    const template = CfGenerators.codeDeploy.buildFnDeploymentGroup(params);
    Object.assign(this.compiledTpl.Resources, template);
    return logicalName;
  }

  addFunctionAlias({ deploymentSettings = {}, compiledTpl, normalizedFn, appName, deploymentGroupName, fnVersion }) {
    const logicalName = `${normalizedFn}Alias${deploymentSettings.alias}`;
    const beforeHookFn = this.naming.getLambdaLogicalId(deploymentSettings.preTrafficHook);
    const afterHookFn = this.naming.getLambdaLogicalId(deploymentSettings.postTrafficHook);
    const fnAlias = {
      Type: 'AWS::Lambda::Alias',
      UpdatePolicy: {
        CodeDeployLambdaAliasUpdate: {
          ApplicationName: { Ref: this.codeDeployAppName },
          AfterAllowTrafficHook: { Ref: afterHookFn },
          BeforeAllowTrafficHook: { Ref: beforeHookFn },
          DeploymentGroupName: { Ref: deploymentGroupName }
        }
      },
      Properties: {
        FunctionVersion: { 'Fn::GetAtt': [ fnVersion, 'Version' ] },
        FunctionName: { Ref: normalizedFn },
        Name: deploymentSettings.alias
      }
    };
    compiledTpl.Resources[logicalName] = fnAlias;
  }

  addAliasToEvents({ deploymentSettings, normalizedFn, resources }) {
    const fnAlias = '${HelloLambdaFunctionAliaslive}';  // FIXME: parametrize alias
    const uri = {
      'Fn::Sub': 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${HelloLambdaFunctionAliaslive}/invocations'
    };
    const getIntegrationUriParts = _.prop('Properties.Integration.Uri.Fn::Join[1]');
    const getFnPart = _.find(_.has('Fn::GetAtt'));
    const extractFnName = _.prop('Fn::GetAtt[0]');
    const entries = Object.values(resources)
      .filter(resource => resource.Type === 'AWS::ApiGateway::Method')
    entries[0].Properties.Integration.Uri = uri;
  }
}

module.exports = ServerlessCanaryDeployments
