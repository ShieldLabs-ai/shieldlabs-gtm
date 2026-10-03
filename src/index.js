import { load } from '@shieldlabs-ai/js';
import { createAdapter } from './adapter.js';

const adapter = createAdapter(load);
export const version = adapter.version;
export const loadAgent = adapter.load;
export const identify = adapter.identify;
