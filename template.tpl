___INFO___

{
  "type": "TAG",
  "id": "cvt_temp_public_id",
  "version": 1,
  "securityGroups": [],
  "containerContexts": [
    "WEB"
  ],
  "displayName": "ShieldLabs",
  "categories": [
    "UTILITY"
  ],
  "description": "Load ShieldLabs and identify visitors. Publishes request IDs and events to the data layer."
}


___TEMPLATE_PARAMETERS___

[
  {
    "type": "SELECT",
    "name": "tagType",
    "displayName": "Tag type",
    "defaultValue": "load_identify",
    "simpleValueType": true,
    "selectItems": [
      {
        "value": "load_identify",
        "displayValue": "Load and identify"
      },
      {
        "value": "load",
        "displayValue": "Load"
      },
      {
        "value": "identify",
        "displayValue": "Identify"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "publicKey",
    "displayName": "Public Key",
    "simpleValueType": true,
    "defaultValue": "",
    "help": "Public Key of the registered domain. Use the same key and environment in Load and Identify tags. Server secrets must stay on your backend.",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "SELECT",
    "name": "environment",
    "displayName": "Environment",
    "defaultValue": "production",
    "simpleValueType": true,
    "selectItems": [
      {
        "value": "production",
        "displayValue": "Production"
      },
      {
        "value": "development",
        "displayValue": "Development"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "userHid",
    "displayName": "User HID (optional)",
    "simpleValueType": true,
    "defaultValue": "",
    "help": "A hashed or pseudonymous account identifier computed on your server. Leave empty for anonymous visits. GTM variables are supported."
  },
  {
    "type": "TEXT",
    "name": "resultName",
    "displayName": "Result variable name",
    "simpleValueType": true,
    "defaultValue": "ShieldLabsResult",
    "help": "The data layer result name. Read ShieldLabsResult.requestId after the ShieldLabs.identified event. The request ID does not mean server scoring is complete.",
    "valueValidators": [
      {
        "type": "NON_EMPTY"
      }
    ]
  },
  {
    "type": "TEXT",
    "name": "timeout",
    "displayName": "Timeout (milliseconds)",
    "simpleValueType": true,
    "defaultValue": "10000",
    "help": "Maximum wait for each load or identification operation, 1–60000 ms. Configure consent requirements in this tag’s Consent Settings. After granting consent, trigger the tag again."
  }
]


___SANDBOXED_JS_FOR_WEB_TEMPLATE___

const injectScript = require('injectScript');
const queryPermission = require('queryPermission');
const callInWindow = require('callInWindow');
const createQueue = require('createQueue');
const getTimestampMillis = require('getTimestampMillis');
const makeNumber = require('makeNumber');
const copyFromWindow = require('copyFromWindow');
const getType = require('getType');
const callLater = require('callLater');

const adapterUrl = 'https://shieldlabs-ai.github.io/shieldlabs-gtm/gtm/v1.0.0/adapter.js';
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


___WEB_PERMISSIONS___

[
  {
    "instance": {
      "key": {
        "publicId": "access_globals",
        "versionId": "1"
      },
      "param": [
        {
          "key": "keys",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "dataLayer"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "ShieldLabsGTM.loadAgent"
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "ShieldLabsGTM.identify"
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": true
                  }
                ]
              },
              {
                "type": 3,
                "mapKey": [
                  {
                    "type": 1,
                    "string": "key"
                  },
                  {
                    "type": 1,
                    "string": "read"
                  },
                  {
                    "type": 1,
                    "string": "write"
                  },
                  {
                    "type": 1,
                    "string": "execute"
                  }
                ],
                "mapValue": [
                  {
                    "type": 1,
                    "string": "ShieldLabsGTM.version"
                  },
                  {
                    "type": 8,
                    "boolean": true
                  },
                  {
                    "type": 8,
                    "boolean": false
                  },
                  {
                    "type": 8,
                    "boolean": false
                  }
                ]
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  },
  {
    "instance": {
      "key": {
        "publicId": "inject_script",
        "versionId": "1"
      },
      "param": [
        {
          "key": "urls",
          "value": {
            "type": 2,
            "listItem": [
              {
                "type": 1,
                "string": "https://shieldlabs-ai.github.io/shieldlabs-gtm/gtm/v1.0.0/adapter.js"
              }
            ]
          }
        }
      ]
    },
    "clientAnnotations": {
      "isEditedByUser": true
    },
    "isRequired": true
  }
]


___TESTS___

scenarios:
  - name: Load and identify publishes request ID
    code: |-
      mock('copyFromWindow', '1.0.0');
      mock('queryPermission', true);
      mock('injectScript', (url, success) => success());
      mock('callInWindow', (name, options, success) => success(name === 'ShieldLabsGTM.identify' ? {requestId: 'test-request'} : {}));
      mock('createQueue', () => (event) => { if (event.event === 'ShieldLabs.identified') assertThat(event.ShieldLabsResult.requestId).isEqualTo('test-request'); });
      runCode({tagType:'load_identify', publicKey:'0123456789abcdef0123456789abcdef', environment:'development', timeout:'10000', resultName:'ShieldLabsResult'});
      assertApi('gtmOnSuccess').wasCalled();
      assertApi('gtmOnFailure').wasNotCalled();
  - name: Load mode does not identify
    code: |-
      mock('copyFromWindow', '1.0.0');
      mock('queryPermission', true);
      mock('injectScript', (url, success) => success());
      mock('callInWindow', (name, options, success) => { assertThat(name).isEqualTo('ShieldLabsGTM.loadAgent'); success({}); });
      runCode({tagType:'load',publicKey:'0123456789abcdef0123456789abcdef'});
      assertApi('gtmOnSuccess').wasCalled();
  - name: Identify mode does not inject a script
    code: |-
      mock('copyFromWindow', '1.0.0');
      mock('queryPermission', true);
      mock('callInWindow', (name, options, success) => success({requestId:'test-request'}));
      runCode({tagType:'identify',publicKey:'0123456789abcdef0123456789abcdef'});
      assertApi('injectScript').wasNotCalled();
      assertApi('gtmOnSuccess').wasCalled();
  - name: Missing permission fails
    code: |-
      mock('copyFromWindow', '1.0.0');
      mock('queryPermission', false);
      runCode({tagType:'load',publicKey:'0123456789abcdef0123456789abcdef'});
      assertApi('injectScript').wasNotCalled();
      assertApi('gtmOnFailure').wasCalled();
  - name: Script load failure fails the tag
    code: |-
      mock('copyFromWindow', '1.0.0');
      mock('queryPermission', true);
      mock('injectScript', (url, success, failure) => failure());
      runCode({tagType:'load',publicKey:'0123456789abcdef0123456789abcdef'});
      assertApi('gtmOnFailure').wasCalled();
      assertApi('gtmOnSuccess').wasNotCalled();


___NOTES___

ShieldLabs GTM integration. Version 1.0.0.
