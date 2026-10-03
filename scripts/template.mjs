import { readFile, writeFile } from 'node:fs/promises';

const adapterUrl = process.env.SHIELDLABS_GTM_ADAPTER_URL || 'https://shieldlabs-ai.github.io/shieldlabs-gtm/gtm/v1.0.0/adapter.js';
if (!/^https:\/\//.test(adapterUrl)) throw new Error('The adapter URL must use HTTPS.');
const info = {
  type: 'TAG', id: 'cvt_temp_public_id', version: 1, securityGroups: [], containerContexts: ['WEB'],
  displayName: 'ShieldLabs', categories: ['UTILITY'],
  description: 'Load ShieldLabs and identify visitors. Publishes request IDs and events to the data layer.',
};
const text = (name, displayName, defaultValue, help) => ({ type: 'TEXT', name, displayName, simpleValueType: true, defaultValue, help });
const select = (name, displayName, defaultValue, items) => ({ type: 'SELECT', name, displayName, defaultValue, simpleValueType: true, selectItems: items.map(([value, displayValue]) => ({ value, displayValue })) });
const parameters = [
  select('tagType', 'Tag type', 'load_identify', [['load_identify', 'Load and identify'], ['load', 'Load'], ['identify', 'Identify']]),
  { ...text('publicKey', 'Public Key', '', 'Public Key of the registered domain. Use the same key and environment in Load and Identify tags. Server secrets must stay on your backend.'), valueValidators: [{ type: 'NON_EMPTY' }] },
  select('environment', 'Environment', 'production', [['production', 'Production'], ['development', 'Development']]),
  text('userHid', 'User HID (optional)', '', 'A hashed or pseudonymous account identifier computed on your server. Leave empty for anonymous visits. GTM variables are supported.'),
  { ...text('resultName', 'Result variable name', 'ShieldLabsResult', 'The data layer result name. Read ShieldLabsResult.requestId after the ShieldLabs.identified event. The request ID does not mean server scoring is complete.'), valueValidators: [{ type: 'NON_EMPTY' }] },
  text('timeout', 'Timeout (milliseconds)', '10000', 'Maximum wait for each load or identification operation, 1–60000 ms. Configure consent requirements in this tag’s Consent Settings. After granting consent, trigger the tag again.'),
];
const str = (string) => ({ type: 1, string });
const bool = (boolean) => ({ type: 8, boolean });
const list = (listItem) => ({ type: 2, listItem });
const record = (object) => ({ type: 3, mapKey: Object.keys(object).map(str), mapValue: Object.values(object) });
const permission = (publicId, param) => ({ instance: { key: { publicId, versionId: '1' }, param }, clientAnnotations: { isEditedByUser: true }, isRequired: true });
const permissions = [
  permission('access_globals', [{ key: 'keys', value: list([
    record({ key: str('dataLayer'), read: bool(true), write: bool(true), execute: bool(false) }),
    record({ key: str('ShieldLabsGTM.loadAgent'), read: bool(false), write: bool(false), execute: bool(true) }),
    record({ key: str('ShieldLabsGTM.identify'), read: bool(false), write: bool(false), execute: bool(true) }),
    record({ key: str('ShieldLabsGTM.version'), read: bool(true), write: bool(false), execute: bool(false) }),
  ]) }]),
  permission('inject_script', [{ key: 'urls', value: list([str(adapterUrl)]) }]),
];
const code = (await readFile('src/template.js', 'utf8')).replaceAll('__ADAPTER_URL__', adapterUrl);
const tests = [
  { name: 'Load and identify publishes request ID', code: `mock('queryPermission', true);\nmock('injectScript', (url, success) => success());\nmock('callInWindow', (name, options, success) => success(name === 'ShieldLabsGTM.identify' ? {requestId: 'test-request'} : {}));\nmock('createQueue', () => (event) => { if (event.event === 'ShieldLabs.identified') assertThat(event.ShieldLabsResult.requestId).isEqualTo('test-request'); });\nrunCode({tagType:'load_identify', publicKey:'0123456789abcdef0123456789abcdef', environment:'development', timeout:'10000', resultName:'ShieldLabsResult'});\nassertApi('gtmOnSuccess').wasCalled();\nassertApi('gtmOnFailure').wasNotCalled();` },
  { name: 'Load mode does not identify', code: `mock('queryPermission', true);\nmock('injectScript', (url, success) => success());\nmock('callInWindow', (name, options, success) => { assertThat(name).isEqualTo('ShieldLabsGTM.loadAgent'); success({}); });\nrunCode({tagType:'load',publicKey:'0123456789abcdef0123456789abcdef'});\nassertApi('gtmOnSuccess').wasCalled();` },
  { name: 'Identify mode does not inject a script', code: `mock('queryPermission', true);\nmock('callInWindow', (name, options, success) => success({requestId:'test-request'}));\nrunCode({tagType:'identify',publicKey:'0123456789abcdef0123456789abcdef'});\nassertApi('injectScript').wasNotCalled();\nassertApi('gtmOnSuccess').wasCalled();` },
  { name: 'Missing permission fails', code: `mock('queryPermission', false);\nrunCode({tagType:'load',publicKey:'0123456789abcdef0123456789abcdef'});\nassertApi('injectScript').wasNotCalled();\nassertApi('gtmOnFailure').wasCalled();` },
  { name: 'Script load failure fails the tag', code: `mock('queryPermission', true);\nmock('injectScript', (url, success, failure) => failure());\nrunCode({tagType:'load',publicKey:'0123456789abcdef0123456789abcdef'});\nassertApi('gtmOnFailure').wasCalled();\nassertApi('gtmOnSuccess').wasNotCalled();` },
];
const yamlTests = 'scenarios:\n' + tests.map((test) => '  - name: ' + test.name + '\n    code: |-\n' + ("mock('copyFromWindow', '1.0.0');\n" + test.code).split('\n').map((line) => '      ' + line).join('\n')).join('\n');
const sections = [ ['INFO', JSON.stringify(info, null, 2)], ['TEMPLATE_PARAMETERS', JSON.stringify(parameters, null, 2)], ['SANDBOXED_JS_FOR_WEB_TEMPLATE', code], ['WEB_PERMISSIONS', JSON.stringify(permissions, null, 2)], ['TESTS', yamlTests], ['NOTES', 'ShieldLabs GTM integration. Version 1.0.0.'] ];
await writeFile('template.tpl', sections.map(([name, value]) => '___' + name + '___\n\n' + value.trim()).join('\n\n\n') + '\n');
console.log('Built template.tpl for ' + adapterUrl);
