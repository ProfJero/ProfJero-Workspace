/**
 * Cloud Functions entry point. Every privileged or financial write in
 * ProfJero Workspace happens here; see docs/ARCHITECTURE.md.
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './lib/core';

setGlobalOptions({ region: REGION, maxInstances: 20 });

export * from './tenants';
export * from './finance';
export * from './invoices';
export * from './migration';
