const _ = require('lodash');
const omitEmpty = require('omit-empty');

function buildUpdatePolicy({ codeDeployApp, deploymentGroup, afterHook, beforeHook }) {
  const updatePolicy = {
    CodeDeployLambdaAliasUpdate: {
      ApplicationName: { Ref: codeDeployApp },
      AfterAllowTrafficHook: { Ref: afterHook },
      BeforeAllowTrafficHook: { Ref: beforeHook },
      DeploymentGroupName: { Ref: deploymentGroup }
    }
  };
  return omitEmpty({ UpdatePolicy: updatePolicy });
}

function buildAlias({ alias, functionName, functionVersion, trafficShiftingSettings }) {
  const lambdaAlias = {
    Type: 'AWS::Lambda::Alias',
    Properties: {
      FunctionVersion: { 'Fn::GetAtt': [ functionVersion, 'Version' ] },
      FunctionName: { Ref: functionName },
      Name: alias
    }
  };
  if (trafficShiftingSettings) {
    const updatePolicy = buildUpdatePolicy(trafficShiftingSettings);
    Object.assign(lambdaAlias, updatePolicy);
  }
  return lambdaAlias;
}

const Lambda = {
  buildAlias
};

module.exports = Lambda;
