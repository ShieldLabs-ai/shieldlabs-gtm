import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter } from '../src/adapter.js';

const config = { publicKey: '0123456789abcdef0123456789abcdef', environment: 'development', timeout: 100 };
const invoke = (adapter, method, options = config) => new Promise((resolve, reject) => adapter[method](options, resolve, reject));

test('load-only does not identify; subsequent calls reuse one agent', async () => {
  let loads = 0, calls = 0;
  const adapter = createAdapter(async () => { loads++; return { identify: async () => ({ requestId: 'request-' + ++calls }) }; });
  await Promise.all([invoke(adapter, 'load'), invoke(adapter, 'load')]);
  assert.equal(loads, 1); assert.equal(calls, 0);
  assert.deepEqual(await invoke(adapter, 'identify'), { requestId: 'request-1' });
  assert.deepEqual(await invoke(adapter, 'identify'), { requestId: 'request-2' });
  assert.equal(loads, 1);
});

test('identify-only before loading fails without creating an agent', async () => {
  let loads = 0;
  const adapter = createAdapter(async () => { loads++; });
  await assert.rejects(invoke(adapter, 'identify'), { code: 'not_loaded' });
  assert.equal(loads, 0);
});

test('failed load can be retried', async () => {
  let loads = 0;
  const adapter = createAdapter(async () => { if (++loads === 1) throw { code: 'load_failed' }; return { identify: async () => ({ requestId: 'recovered' }) }; });
  await assert.rejects(invoke(adapter, 'load'), { code: 'load_failed' });
  await invoke(adapter, 'load');
  assert.equal((await invoke(adapter, 'identify')).requestId, 'recovered');
});

test('environment and key isolate agents', async () => {
  const seen = [];
  const adapter = createAdapter(async (options) => { seen.push(options); return { identify: async () => ({ requestId: options.environment }) }; });
  await invoke(adapter, 'load');
  await invoke(adapter, 'load', { ...config, environment: 'production' });
  await invoke(adapter, 'load', { ...config, publicKey: 'a'.repeat(32) });
  assert.equal(seen.length, 3);
  assert.equal((await invoke(adapter, 'identify')).requestId, 'development');
});

test('User HID is passed to SDK without exposing server fields in result', async () => {
  let options;
  const adapter = createAdapter(async () => ({ identify: async (input) => { options = input; return { requestId: 'request', riskScore: 100, userId: input.userId }; } }));
  await invoke(adapter, 'load');
  assert.deepEqual(await invoke(adapter, 'identify', { ...config, userHid: 'account-hash' }), { requestId: 'request' });
  assert.deepEqual(options, { userId: 'account-hash', timeout: 100 });
  await invoke(adapter, 'identify', { ...config, userHid: '' });
  assert.equal(options.userId, undefined);
});

for (const [name, value] of [['server key', { publicKey: 'sec_secret' }], ['webhook key', { publicKey: 'whsec_secret' }], ['missing key', { publicKey: '' }], ['bad environment', { environment: 'EU' }], ['zero timeout', { timeout: 0 }], ['too large timeout', { timeout: 60001 }]]) {
  test('rejects ' + name + ' before loading', async () => {
    const adapter = createAdapter(() => assert.fail('must not load'));
    await assert.rejects(invoke(adapter, 'load', { ...config, ...value }), { code: 'invalid_options' });
  });
}

test('timeout completes once and ignores a late response', async () => {
  let completeLoad;
  const adapter = createAdapter(() => new Promise((resolve) => { completeLoad = resolve; }));
  let success = 0, failure = 0;
  await new Promise((resolve) => adapter.load({ ...config, timeout: 10 }, () => { success++; }, () => { failure++; resolve(); }));
  completeLoad({ identify: async () => ({ requestId: 'late' }) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(success, 0); assert.equal(failure, 1);
});

test('errors do not expose backend response or key-containing messages', async () => {
  const adapter = createAdapter(() => { throw new Error('private data and key'); });
  await assert.rejects(invoke(adapter, 'load'), (error) => error.code === 'operation_failed' && !JSON.stringify(error).includes('private'));
});
test('identify timeout while loading does not start a late billable identification', async () => {
  let resolveLoad, identifications = 0;
  const adapter = createAdapter(() => new Promise((resolve) => { resolveLoad = resolve; }));
  const loading = invoke(adapter, 'load');
  await Promise.resolve(); await Promise.resolve();
  await assert.rejects(invoke(adapter, 'identify', { ...config, timeout: 5 }), { code: 'timeout' });
  resolveLoad({ identify: async () => { identifications++; return { requestId: 'late' }; } });
  await loading; await Promise.resolve();
  assert.equal(identifications, 0);
});

test('missing requestId fails instead of announcing identification', async () => {
  const adapter = createAdapter(async () => ({ identify: async () => ({ requestId: '' }) }));
  await invoke(adapter, 'load');
  await assert.rejects(invoke(adapter, 'identify'), { code: 'not_initialized' });
});
test('throttled timers cannot start identification after its absolute deadline', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout, originalNow = Date.now;
  let now = 0, finishLoad, calls = 0;
  globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {}; Date.now = () => now;
  try {
    const adapter = createAdapter(() => new Promise((resolve) => { finishLoad = resolve; }));
    const loading = invoke(adapter, 'load', { ...config, timeout: 2000 });
    await Promise.resolve(); await Promise.resolve();
    const identification = invoke(adapter, 'identify', { ...config, timeout: 5 });
    await Promise.resolve();
    now = 100;
    finishLoad({ identify: async () => { calls++; return { requestId: 'late' }; } });
    await loading;
    await assert.rejects(identification, { code: 'timeout' });
    assert.equal(calls, 0);
  } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; Date.now = originalNow; }
});
