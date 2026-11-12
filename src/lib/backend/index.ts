export * from './types';
export { demoBackend, demoAnswer, demoPublicQuote, DEMO_USER_ID } from './demo';
export { liveBackend } from './live';

/** admin / admin opens the local demo account. Set VITE_ENABLE_ADMIN_LOGIN=false to turn it off. */
export const adminLoginEnabled = import.meta.env.VITE_ENABLE_ADMIN_LOGIN !== 'false';
