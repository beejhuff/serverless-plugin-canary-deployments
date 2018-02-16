const _ = require('lodash');
const omitEmpty = require('omit-empty');

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
    console.log(updatePolicy);
  }
  return lambdaAlias;
}

function buildUpdatePolicy({ codeDeployApp, deploymentGroup, afterHook, beforeHook }) {
  const updatePolicy = {
    CodeDeployLambdaAliasUpdate: {
      ApplicationName: { Ref: codeDeployApp },
      AfterAllowTrafficHook: { Ref: afterHook },
      BeforeAllowTrafficHook: { Ref: beforeHook },
      DeploymentGroupName: { Ref: deploymentGroup }
    }
  };
  return omitEmpty(updatePolicy);
}

const Lambda = {
  buildAlias
};

module.exports = Lambda;
