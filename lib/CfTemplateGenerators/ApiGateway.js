const _ = require('lodash');

function replaceMethodUriWithAlias(apiGatewayMethod, functionAlias) {
  const aliasUri = buildUriForAlias(functionAlias);
  const newMethod = _.cloneDeep(apiGatewayMethod);
  _.set(newMethod, 'Properties.Integration.Uri', aliasUri);
  return newMethod;
}

function buildUriForAlias(functionAlias) {
  const aliasArn = [
    'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${',
    functionAlias,
    '}/invocations'
  ].join('');
  return { 'Fn::Sub': aliasArn };
}

const ApiGateway = {
  replaceMethodUriWithAlias
};

module.exports = ApiGateway;
