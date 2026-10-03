const injectScript = require('injectScript');
const queryPermission = require('queryPermission');
const callInWindow = require('callInWindow');
const createQueue = require('createQueue');
const getTimestampMillis = require('getTimestampMillis');
const makeNumber = require('makeNumber');
const copyFromWindow = require('copyFromWindow');
const getType = require('getType');
const callLater = require('callLater');

const adapterUrl = '__ADAPTER_URL__';
const push = createQueue('dataLayer');
const mode = data.tagType;
const resultName = data.resultName === undefined || data.resultName === '' ? 'ShieldLabsResult' : data.resultName;
const timeout = makeNumber(data.timeout === undefined || data.timeout === '' ? 10000 : data.timeout);
const options = { publicKey: data.publicKey, environment: data.environment || 'production', timeout: timeout };
let completed = false;
let scriptLoaded = false;
let scriptDeadline = 0;

const fail = (error) => {
  if (completed) return;
  completed = true;
  const code = error && error.code ? error.code : 'operation_failed';
  push({ event: 'ShieldLabs.error', ShieldLabsError: { code: code } });
  data.gtmOnFailure();
};

const succeed = () => {
  if (completed) return;
  completed = true;
  data.gtmOnSuccess();
};

const identify = () => {
  if (completed) return;
  if (!copyFromWindow('ShieldLabsGTM.version')) { fail({ code: 'not_loaded' }); return; }
  if (!queryPermission('access_globals', 'execute', 'ShieldLabsGTM.identify')) {
    fail({ code: 'permission_denied' });
    return;
  }
  const startedAt = getTimestampMillis();
  const identifyOptions = { publicKey: options.publicKey, environment: options.environment, timeout: options.timeout, userHid: data.userHid };
  callInWindow('ShieldLabsGTM.identify', identifyOptions, (result) => {
    if (completed) return;
    if (!result || getType(result.requestId) !== 'string' || !result.requestId) { fail({ code: 'not_initialized' }); return; }
    const event = { event: 'ShieldLabs.identified' };
    event[resultName] = { requestId: result.requestId, timeToIdentifyMs: getTimestampMillis() - startedAt };
    push(event);
    succeed();
  }, fail);
};

const loadAgent = () => {
  if (scriptDeadline && getTimestampMillis() >= scriptDeadline) { fail({ code: 'timeout' }); return; }
  scriptLoaded = true;
  if (completed) return;
  if (!queryPermission('access_globals', 'execute', 'ShieldLabsGTM.loadAgent')) {
    fail({ code: 'permission_denied' });
    return;
  }
  callInWindow('ShieldLabsGTM.loadAgent', options, () => {
    if (completed) return;
    push({ event: 'ShieldLabs.loaded' });
    if (mode === 'load_identify') identify();
    else succeed();
  }, fail);
};

if (getType(resultName) !== 'string' || resultName === 'event' || resultName === 'ShieldLabsError' || resultName === '__proto__' || resultName === 'constructor' || resultName === 'prototype' || resultName.indexOf('.') !== -1 || timeout !== timeout || timeout < 1 || timeout > 60000 || timeout % 1 !== 0) {
  fail({ code: 'invalid_options' });
} else if (mode !== 'load' && mode !== 'identify' && mode !== 'load_identify') {
  fail({ code: 'invalid_options' });
} else if (mode === 'identify') {
  identify();
} else if (!queryPermission('inject_script', adapterUrl)) {
  fail({ code: 'permission_denied' });
} else {
  scriptDeadline = getTimestampMillis() + timeout;
  const checkScriptDeadline = () => {
    if (completed || scriptLoaded) return;
    if (getTimestampMillis() >= scriptDeadline) fail({ code: 'timeout' });
    else callLater(checkScriptDeadline);
  };
  callLater(checkScriptDeadline);
  injectScript(adapterUrl, loadAgent, () => fail({ code: 'load_failed' }), 'shieldlabs-gtm-adapter-v1');
}
