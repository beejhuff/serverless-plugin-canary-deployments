const _ = require('lodash/fp');
const flatten = require('flat');
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
          const functionAlias = this.addFunctionAlias({ deploymentSettings, compiledTpl, functionName, deploymentGroup, functionVersion });
          this.getEventsFor(functionName);
          this.addAliasToEvents({ functionAlias, resources, functionName });
          // console.log(JSON.stringify(this.compiledTpl.Resources));
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
    const { alias } = deploymentSettings;
    const logicalName = `${functionName}Alias${alias}`;
    const beforeHook = this.naming.getLambdaLogicalId(deploymentSettings.preTrafficHook);
    const afterHook = this.naming.getLambdaLogicalId(deploymentSettings.postTrafficHook);
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
    return logicalName;
  }

  addAliasToEvents({ resources, functionAlias, functionName }) {
    const uriWithAwsVariables = [
      'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${',
      functionAlias,
      '}/invocations'
    ].join('');
    const uri = { 'Fn::Sub': uriWithAwsVariables };
    const entries = Object.values(resources)
      .filter(resource => resource.Type === 'AWS::ApiGateway::Method');
    entries[0].Properties.Integration.Uri = uri;
  }

  getEventsFor(functionName) {
    return this.getApiGatewayMethodsFor(functionName);
  }

  getApiGatewayMethodsFor(functionName) {
    const isApiGMethod = _.matchesProperty('Type', 'AWS::ApiGateway::Method');
    const isMethodForFunction = _.pipe(
      _.prop('Properties.Integration'),
      flatten,
      _.includes(functionName)
    );
    const getMethodsForFunction = _.pipe(
      _.filter(isApiGMethod),
      _.filter(isMethodForFunction)
    );
    console.log('lol¡', JSON.stringify(_.filter(isApiGMethod, this.compiledTpl.Resources)));
    return getMethodsForFunction(this.compiledTpl.Resources);
  }
}

module.exports = ServerlessCanaryDeployments;
