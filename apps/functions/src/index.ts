/**
 * Cloud Functions entry point. The same handlers also run in the Cloudflare
 * Worker (apps/worker); see docs/ARCHITECTURE.md.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './lib/core';

setGlobalOptions({ region: REGION, maxInstances: 20 });

export * from './callables';
