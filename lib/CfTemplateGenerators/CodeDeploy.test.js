const { expect } = require('chai');
const _ = require('lodash');
const CodeDeploy = require('./CodeDeploy');

const cloneObject = o => JSON.parse(JSON.stringify(o));

describe('CodeDeploy', () => {
  describe('.buildApplication', () => {
    it('generates a CodeDeploy::Application resouce', () => {
      const resourceName = 'CodeDeployAppLogicalName';
      const expected = {
        [resourceName]: {
          Type: 'AWS::CodeDeploy::Application',
          Properties: { ComputePlatform: 'Lambda' }
        }
      };
      const actual = CodeDeploy.buildApplication(resourceName);
      expect(actual).to.deep.equal(expected);
    });
  });

  describe('.buildFnDeploymentGroup', () => {
    const normalizedFnName = 'MyFunction';
    const codeDeployAppName = 'MyCDApp';
    const expectedDGName = `${normalizedFnName}DeploymentGroup`;
    const baseDeploymentGroup = {
      [expectedDGName]: {
        Type: 'AWS::CodeDeploy::DeploymentGroup',
        Properties: {
          ApplicationName: {
            Ref: ''
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
              { ConfigName: '' }
            ]
          },
          DeploymentStyle: {
            DeploymentType: 'BLUE_GREEN',
            DeploymentOption: 'WITH_TRAFFIC_CONTROL'
          }
        }
      }
    };

    it('should generate a CodeDeploy::DeploymentGroup resouce for the provided function', () => {
      const deploymentSettings = {
        type: 'Linear10PercentEvery1Minute',
        alarms: [ 'Alarm1', 'Alarm2' ]
      };
      const expectedAlarms = {
        Alarms: [ { Name: { Ref: 'Alarm1' } }, { Name: { Ref: 'Alarm2' } }],
        Enabled: true
      };
      const expected = cloneObject(baseDeploymentGroup);
      const propertiesPath = `${expectedDGName}.Properties`;
      _.set(expected, `${propertiesPath}.ApplicationName`, { Ref: codeDeployAppName });
      _.set(expected, `${propertiesPath}.AlarmConfiguration`, expectedAlarms);
      _.set(expected, `${propertiesPath}.DeploymentConfigName.Fn::Sub[1].ConfigName`, deploymentSettings.type);
      const actual = CodeDeploy.buildFnDeploymentGroup({ normalizedFnName, codeDeployAppName, deploymentSettings });
      expect(actual).to.deep.equal(expected);
    });

    context('when no alarms were provided', () => {
      it('should not include the AlarmConfiguration property', () => {
        const deploymentSettings = { type: 'Linear10PercentEvery1Minute' };
        const expected = cloneObject(baseDeploymentGroup);
        const propertiesPath = `${expectedDGName}.Properties`;
        _.set(expected, `${propertiesPath}.ApplicationName`, { Ref: codeDeployAppName });
        _.set(expected, `${propertiesPath}.DeploymentConfigName.Fn::Sub[1].ConfigName`, deploymentSettings.type);
        const actual = CodeDeploy.buildFnDeploymentGroup({ normalizedFnName, codeDeployAppName, deploymentSettings });
        expect(actual).to.deep.equal(expected);
      });
    });
  });
});
