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

  canary() {
    if (this.withDeploymentPreferencesFns.length > 0) {
      this.addCodeDeployApp();
      this.addCodeDeployRole();
      this.withDeploymentPreferencesFns
        .forEach((fn) => {
          const functionName = this.naming.getLambdaLogicalId(fn.name);
          const functionVersion = Object.keys(this.compiledTpl.Resources).find(el => el.startsWith('HelloLambdaVersion'));  // FIXME
          const deploymentSettings = fn.obj.deploymentPreference;
          const deploymentGroup = this.addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName: functionName });
          const functionAlias = this.addFunctionAlias({ deploymentSettings, functionName, deploymentGroup, functionVersion });
          this.addAliasToEvents({ functionName, functionAlias });
          // console.log(JSON.stringify(this.compiledTpl.Resources));
        });
    }
  }

  addCodeDeployApp() {
    const resourceName = this.codeDeployAppName;
    const template = CfGenerators.codeDeploy.buildApplication();
    Object.assign(this.compiledTpl.Resources, { [resourceName]: template });
  }

  addCodeDeployRole() {
    const logicalName = 'CodeDeployServiceRole';
    const template = CfGenerators.iam.buildCodeDeployRole();
    Object.assign(this.compiledTpl.Resources, { [logicalName]: template });
  }

  addFunctionDeploymentGroup({ deploymentSettings, normalizedFnName }) {
    const logicalName = `${normalizedFnName}DeploymentGroup`;
    const params = {
      codeDeployAppName: this.codeDeployAppName,
      deploymentSettings
    };
    const template = CfGenerators.codeDeploy.buildFnDeploymentGroup(params);
    Object.assign(this.compiledTpl.Resources, { [logicalName]: template });
    return logicalName;
  }

  addFunctionAlias({ deploymentSettings = {}, functionName, deploymentGroup }) {
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
    this.getVersionNameFor(functionName);
    this.compiledTpl.Resources[logicalName] = template;
    return logicalName;
  }

  addAliasToEvents({ functionName, functionAlias }) {
    const functionEvents = this.getEventsFor(functionName);
    const functionEventsEntries = Object.entries(functionEvents);
    const eventsWithAlias = functionEventsEntries.map(([logicalName, event]) => {
      const evt = CfGenerators.apiGateway.replaceMethodUriWithAlias(event, functionAlias);
      return { [logicalName]: evt };
    });
    Object.assign(this.compiledTpl.Resources, ...eventsWithAlias);
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
