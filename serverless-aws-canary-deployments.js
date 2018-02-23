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

  get withDeploymentPreferencesFns() {
    return this.serverless.service.getAllFunctions()
      .map(name => ({ name, obj: this.serverless.service.getFunction(name) }))
      .filter(fn => !!fn.obj.deploymentPreference);
  }

  addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName }) {
    const dpGroup = this.buildFunctionDeploymentGroup({ deploymentSettings, normalizedFnName});
    Object.assign(this.compiledTpl.Resources, dpGroup);
    return Object.keys(dpGroup)[0];
  }

  addFunctionAlias({ deploymentSettings = {}, functionName, deploymentGroup }) {
    const alias = this.buildFunctionAlias({ deploymentSettings, functionName, deploymentGroup });
    Object.assign(this.compiledTpl.Resources, alias);
    return Object.keys(alias)[0];
  }

  canary() {
    if (this.withDeploymentPreferencesFns.length > 0) {
      const codeDeployApp = this.buildCodeDeployApp();
      const codeDeployRole = this.buildCodeDeployRole();
      Object.assign(this.compiledTpl.Resources, codeDeployApp, codeDeployRole);
      this.buildFunctionsResources();
      console.log(JSON.stringify(this.compiledTpl.Resources));
    }
  }

  buildFunctionsResources() {
    return this.withDeploymentPreferencesFns
      .forEach(fn => this.buildFunctionResources(fn.name, fn.obj));
  }

  buildFunctionResources(serverlessFnName, serverlessFnProperties = {}) {
    const functionName = this.naming.getLambdaLogicalId(serverlessFnName);
    const deploymentSettings = serverlessFnProperties.deploymentPreference;
    const deploymentGroup = this.addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName: functionName });
    const functionAlias = this.addFunctionAlias({ deploymentSettings, functionName, deploymentGroup });
    const eventsWithAlias = this.buildEventsForAlias({ functionName, functionAlias});
    Object.assign(this.compiledTpl.Resources, ...eventsWithAlias);
  }

  buildCodeDeployApp() {
    const logicalName = this.codeDeployAppName;
    const template = CfGenerators.codeDeploy.buildApplication();
    return { [logicalName]: template };
  }

  buildCodeDeployRole() {
    const logicalName = 'CodeDeployServiceRole';
    const template = CfGenerators.iam.buildCodeDeployRole();
    return { [logicalName]: template };
  }

  buildFunctionDeploymentGroup({ deploymentSettings, normalizedFnName }) {
    const logicalName = `${normalizedFnName}DeploymentGroup`;
    const params = {
      codeDeployAppName: this.codeDeployAppName,
      deploymentSettings
    };
    const template = CfGenerators.codeDeploy.buildFnDeploymentGroup(params);
    return { [logicalName]: template };
  }

  buildFunctionAlias({ deploymentSettings = {}, functionName, deploymentGroup }) {
    const { alias } = deploymentSettings;
    const functionVersion = this.getVersionNameFor(functionName);
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
    return { [logicalName]: template };
  }

  buildEventsForAlias({ functionName, functionAlias }) {
    const functionEvents = this.getEventsFor(functionName);
    const functionEventsEntries = Object.entries(functionEvents);
    const eventsWithAlias = functionEventsEntries.map(([logicalName, event]) => {
      const evt = CfGenerators.apiGateway.replaceMethodUriWithAlias(event, functionAlias);
      return { [logicalName]: evt };
    });
    return eventsWithAlias;
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
      _.pickBy(isApiGMethod),
      _.pickBy(isMethodForFunction)
    );
    return getMethodsForFunction(this.compiledTpl.Resources);
  }

  getVersionNameFor(functionName) {
    const isLambdaVersion = _.matchesProperty('Type', 'AWS::Lambda::Version');
    const isVersionForFunction = _.matchesProperty('Properties.FunctionName.Ref', functionName);
    const getVersionNameForFunction = _.pipe(
      _.pickBy(isLambdaVersion),
      _.findKey(isVersionForFunction),
    );
    return getVersionNameForFunction(this.compiledTpl.Resources);
  }
}

module.exports = ServerlessCanaryDeployments;
