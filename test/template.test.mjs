import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/template.js', import.meta.url), 'utf8');
function run(input, override = {}) {
  const result = { events: [], injected: 0, success: 0, failure: 0, calls: [] };
  const api = {
    queryPermission: () => true,
    copyFromWindow: () => '1.0.0',
    injectScript: (url, success) => { result.injected++; success(); },
    callInWindow: (name, options, success) => { result.calls.push({ name, options }); success(name.endsWith('.identify') ? { requestId: 'request-id' } : {}); },
    createQueue: () => (event) => result.events.push(JSON.parse(JSON.stringify(event))),
    getTimestampMillis: () => 123,
    makeNumber: Number,
    getType: (value) => typeof value,
    callLater: () => {},
    ...override,
  };
  const data = { publicKey: 'a'.repeat(32), environment: 'development', timeout: '10000', tagType: 'load_identify', ...input,
    gtmOnSuccess: () => result.success++, gtmOnFailure: () => result.failure++ };
  vm.runInNewContext(source, { data, require: (name) => api[name] });
  return result;
}

test('combined mode loads and identifies, producing downstream data', () => {
  const r = run({});
  assert.equal(r.injected, 1); assert.equal(r.success, 1); assert.equal(r.failure, 0);
  assert.deepEqual(r.events.map((e) => e.event), ['ShieldLabs.loaded', 'ShieldLabs.identified']);
  assert.equal(r.events[1].ShieldLabsResult.requestId, 'request-id');
});
test('load mode never identifies', () => {
  const r = run({ tagType: 'load' });
  assert.equal(r.calls.length, 1); assert.equal(r.calls[0].name, 'ShieldLabsGTM.loadAgent');
  assert.equal(r.success, 1);
});
test('identify mode does not inject and passes User HID', () => {
  const r = run({ tagType: 'identify', userHid: 'hash' });
  assert.equal(r.injected, 0); assert.equal(r.calls[0].options.userHid, 'hash'); assert.equal(r.success, 1);
});
test('identify before load reports a usable error', () => {
  const r = run({ tagType: 'identify' }, { copyFromWindow: () => undefined });
  assert.equal(r.failure, 1); assert.equal(r.calls.length, 0); assert.equal(r.events[0].ShieldLabsError.code, 'not_loaded');
});
test('denied permissions do not load or call the agent', () => {
  const r = run({}, { queryPermission: () => false });
  assert.equal(r.injected, 0); assert.equal(r.failure, 1); assert.equal(r.calls.length, 0);
});
test('network failure completes with one failure', () => {
  const r = run({}, { injectScript: (url, success, failure) => failure() });
  assert.equal(r.failure, 1); assert.equal(r.success, 0); assert.equal(r.events[0].event, 'ShieldLabs.error');
});
test('callback errors and duplicate callbacks produce one completion', () => {
  const r = run({ tagType: 'identify' }, { callInWindow: (name, options, success, failure) => { failure({ code: 'timeout' }); success({ requestId: 'late' }); failure({ code: 'timeout' }); } });
  assert.equal(r.failure, 1); assert.equal(r.success, 0); assert.equal(r.events.length, 1);
});
test('custom result name works', () => {
  assert.equal(run({ resultName: 'MyResult' }).events[1].MyResult.requestId, 'request-id');
});
for (const resultName of ['event', '__proto__', 'constructor', 'prototype', 'ShieldLabsError', 'nested.name']) {
  test('rejects reserved result name ' + resultName, () => {
    const r = run({ resultName }); assert.equal(r.failure, 1); assert.equal(r.injected, 0);
  });
}
test('invalid mode fails before injection', () => {
  const r = run({ tagType: 'invalid' }); assert.equal(r.failure, 1); assert.equal(r.injected, 0);
});
test('non-string result variable fails without throwing', () => {
  const r = run({ resultName: 123 }); assert.equal(r.failure, 1); assert.equal(r.injected, 0);
});
test('numeric zero timeout from a GTM variable fails instead of using the default', () => {
  const r = run({ timeout: 0 }); assert.equal(r.failure, 1); assert.equal(r.injected, 0);
});
test('falsy non-string result name is rejected', () => {
  const r = run({ resultName: 0 }); assert.equal(r.failure, 1); assert.equal(r.injected, 0);
});
test('script timeout ignores late injection completion', () => {
  let later, now = 0;
  const r = run({}, { getTimestampMillis: () => now, callLater: (fn, ...args) => { assert.equal(args.length, 0); later = fn; }, injectScript: (url, success) => { now = 10001; later(); success(); } });
  assert.equal(r.failure, 1); assert.equal(r.calls.length, 0);
});
test('callLater checks a deadline rather than timing out on its first turn', () => {
  const pending = []; let now = 0;
  const r = run({}, { getTimestampMillis: () => now, callLater: (fn) => pending.push(fn), injectScript: () => {} });
  pending.shift()(); assert.equal(r.failure, 0); assert.equal(pending.length, 1);
  now = 10001; pending.shift()(); assert.equal(r.failure, 1); assert.equal(pending.length, 0);
});
test('late script callback cannot race a throttled watchdog', () => {
  let now = 0;
  const r = run({}, { getTimestampMillis: () => now, injectScript: (url, success) => { now = 10001; success(); } });
  assert.equal(r.failure, 1); assert.equal(r.calls.length, 0);
});
