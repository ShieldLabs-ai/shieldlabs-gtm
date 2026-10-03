const PUBLIC_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_TIMEOUT = 10000;

function invalid(message) {
  return { code: 'invalid_options', message };
}

function settings(options) {
  if (!options || typeof options !== 'object') throw invalid('Provide tag settings.');
  const { publicKey, environment = 'production', timeout = DEFAULT_TIMEOUT } = options;
  if (typeof publicKey !== 'string' || !PUBLIC_KEY.test(publicKey) || /^(sec_|whsec_)/.test(publicKey)) {
    throw invalid('Use the Public Key of the registered domain.');
  }
  if (environment !== 'production' && environment !== 'development') throw invalid('Select production or development.');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) throw invalid('Timeout must be between 1 and 60000 milliseconds.');
  return { publicKey, environment, timeout };
}

function safeError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'operation_failed';
  const messages = {
    invalid_options: 'Check the Public Key, environment, timeout, and User HID.',
    not_loaded: 'Run a Load tag for the same Public Key and environment first.',
    load_failed: 'The browser agent could not be loaded.',
    timeout: 'The operation timed out.',
    not_initialized: 'The browser agent did not start an identification.',
    unsupported_environment: 'Use an HTTPS browser page.',
  };
  return { code, message: messages[code] || 'ShieldLabs could not complete the operation.' };
}

// Callbacks cross the GTM sandbox boundary; promises stay in this browser adapter.
export function createAdapter(loadAgent) {
  const entries = new Map();
  const keyOf = (config) => JSON.stringify([config.environment, config.publicKey]);

  function callbackOperation(options, success, failure, operation) {
    let complete = false;
    let timer;
    let deadline = Infinity;
    const settle = (callback, value) => {
      if (complete) return;
      if (callback === success && Date.now() >= deadline) {
        callback = failure;
        value = safeError({ code: 'timeout' });
      }
      complete = true;
      clearTimeout(timer);
      if (typeof callback === 'function') callback(value);
    };
    Promise.resolve().then(() => {
      const config = settings(options);
      deadline = Date.now() + config.timeout;
      timer = setTimeout(() => settle(failure, safeError({ code: 'timeout' })), config.timeout);
      return operation(config, options, () => !complete && Date.now() < deadline);
    }).then(
      (result) => settle(success, result),
      (error) => settle(failure, safeError(error)),
    );
  }

  function getAgent(config) {
    const key = keyOf(config);
    let entry = entries.get(key);
    if (!entry) {
      entry = Promise.resolve().then(() => loadAgent(config));
      entries.set(key, entry);
      entry.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
    }
    return entry;
  }

  return Object.freeze({
    version: '1.0.0',
    load(options, success, failure) {
      callbackOperation(options, success, failure, async (config) => {
        await getAgent(config);
        return { environment: config.environment };
      });
    },
    identify(options, success, failure) {
      callbackOperation(options, success, failure, async (config, input, active) => {
        const entry = entries.get(keyOf(config));
        if (!entry) throw { code: 'not_loaded' };
        const agent = await entry;
        if (!active()) throw { code: 'timeout' };
        const userId = input.userHid === '' || input.userHid == null ? undefined : input.userHid;
        const result = await agent.identify({ userId, timeout: config.timeout });
        if (!result || typeof result.requestId !== 'string' || result.requestId === '') throw { code: 'not_initialized' };
        return { requestId: result.requestId };
      });
    },
  });
}
