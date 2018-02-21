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
          const functionName = this.naming.getLambdaLogicalId(fn.name);
          const normalizedFn = functionName;
          const resources = compiledTpl.Resources;
          const functionVersion = Object.keys(compiledTpl.Resources).find(el => el.startsWith('HelloLambdaVersion'));  // FIXME
          const deploymentSettings = fn.obj.deploymentPreference;
          const deploymentGroup = this.addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName: normalizedFn });
          this.addFunctionAlias({ deploymentSettings, compiledTpl, functionName, deploymentGroup, functionVersion });
          this.addAliasToEvents({ deploymentSettings, normalizedFn, resources });
          console.log(this.compiledTpl.Resources.HelloLambdaFunctionAliaslive.UpdatePolicy);
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

  addFunctionAlias({ deploymentSettings = {}, compiledTpl, functionName, deploymentGroup, functionVersion }) {
    const logicalName = `${functionName}Alias${deploymentSettings.alias}`;
    const beforeHook = this.naming.getLambdaLogicalId(deploymentSettings.preTrafficHook);
    const afterHook = this.naming.getLambdaLogicalId(deploymentSettings.postTrafficHook);
    const { alias } = deploymentSettings;
    const trafficShiftingSettings = {
      codeDeployApp: this.codeDeployAppName,
      deploymentGroup,
      afterHook,
      beforeHook
    };
    const template = CfGenerators.lambda.buildAlias({
      alias,
      functionName,
      functionVersion,
      trafficShiftingSettings
    });
    compiledTpl.Resources[logicalName] = template;
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
