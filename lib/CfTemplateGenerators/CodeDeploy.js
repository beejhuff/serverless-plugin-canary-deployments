const _ = require('lodash');

function buildApplication(resourceName) {
  return {
    [resourceName]: {
      Type: 'AWS::CodeDeploy::Application',
      Properties: { ComputePlatform: 'Lambda' }
    }
  };
}

function buildFnDeploymentGroup({ codeDeployAppName, normalizedFnName, deploymentSettings = {} }) {
  const logicalName = `${normalizedFnName}DeploymentGroup`;
  const deploymentGroup = {
    Type: 'AWS::CodeDeploy::DeploymentGroup',
    Properties: {
      ApplicationName: {
        Ref: codeDeployAppName
      },
      AutoRollbackConfiguration: {
        Enabled: true,
        Events: [
          'DEPLOYMENT_FAILURE',
          'DEPLOYMENT_STOP_ON_ALARM',
          'DEPLOYMENT_STOP_ON_REQUEST'
        ]
      },
      ServiceRoleArn: {
        'Fn::GetAtt': [
          'CodeDeployServiceRole',
          'Arn'
        ]
      },
      DeploymentConfigName: {
        'Fn::Sub': [
          'CodeDeployDefault.Lambda${ConfigName}',
          { ConfigName: deploymentSettings.type }
        ]
      },
      DeploymentStyle: {
        DeploymentType: 'BLUE_GREEN',
        DeploymentOption: 'WITH_TRAFFIC_CONTROL'
      }
    }
  };
  if (deploymentSettings.alarms) {
    const alarmConfig = {
      Alarms: deploymentSettings.alarms.map(a => ({ Name: { Ref: a } })),
      Enabled: true
    };
    _.set(deploymentGroup, 'Properties.AlarmConfiguration', alarmConfig);
  }
  return { [logicalName]: deploymentGroup };
}

const CodeDeploy = {
  buildApplication,
  buildFnDeploymentGroup
};

module.exports = CodeDeploy;