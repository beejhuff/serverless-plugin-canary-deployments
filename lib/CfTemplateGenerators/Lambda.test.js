const { expect } = require('chai');
const Lambda = require('./Lambda');

describe('Lambda', () => {
  describe('.buildAlias', () => {
    const functionName = 'MyFunctionName';
    const functionVersion = 'MyFunctionVersion';
    const alias = 'live';
    const baseAlias = {
      Type: 'AWS::Lambda::Alias',
      Properties: {
        FunctionVersion: { 'Fn::GetAtt': [ functionVersion, 'Version' ] },
        FunctionName: { Ref: functionName },
        Name: alias
      }
    };

    it('should generate a AWS::Lambda::Alias resouce', () => {
      const expected = baseAlias;
      const actual = Lambda.buildAlias({ alias, functionName, functionVersion });
      expect(actual).to.deep.equal(expected);
    });

    context('when traffic shifting settings were provided', () => {
      it('should include the UpdatePolicy', () => {
        const trafficShiftingSettings = {
          codeDeployApp: 'CodeDeployAppName',
          deploymentGroup: 'DeploymentGroup',
          beforeHook: 'BeforeHookLambdaFn',
          afterHook: 'AfterHookLambdaFn'
        };
        const expected = {
          UpdatePolicy: {
            CodeDeployLambdaAliasUpdate: {
              ApplicationName: { Ref: trafficShiftingSettings.codeDeployApp },
              AfterAllowTrafficHook: { Ref: trafficShiftingSettings.afterHook },
              BeforeAllowTrafficHook: { Ref: trafficShiftingSettings.beforeHook },
              DeploymentGroupName: { Ref: trafficShiftingSettings.deploymentGroup }
            }
          }
        };
        const actual = Lambda.buildAlias({ alias, functionName, functionVersion, trafficShiftingSettings });
        expect(actual).to.deep.include(expected);
      });
    });
  });
});
