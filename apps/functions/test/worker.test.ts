/**
 * Worker-specific behaviour (runs only when WORKER_URL is set).
 * The shared suites (functions.test.ts, migration.test.ts) exercise every
 * operation through the Worker as well.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { WORKER_URL, callWorker, cleanupApps, createUser, failure, newTenant, rid } from './helpers';

const run = WORKER_URL ? describe : describe.skip;
afterAll(cleanupApps);

run('Cloudflare Worker transport', () => {
  it('rejects unsigned, forged and malformed identities', async () => {
    expect(await failure(callWorker('createTenant', { name: 'X', kind: 'personal', currency: 'GHS', timezone: 'Africa/Accra', requestId: rid() }, null))).toBe('not_authenticated');
    const forged = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ sub: 'attacker', aud: 'some-other-project', iss: 'https://securetoken.google.com/some-other-project' }))}.`;
    expect(await failure(callWorker('createTenant', { name: 'X', kind: 'personal', currency: 'GHS', timezone: 'Africa/Accra', requestId: rid() }, forged))).toBe('not_authenticated');
    expect(await failure(callWorker('createTenant', {}, 'garbage'))).toBe('not_authenticated');
  });

  it('cannot be tricked into acting as another user via the body', async () => {
    const alice = await createUser('w-alice');
    const tenantId = await newTenant(alice);
    const mallory = await createUser('w-mallory');
    // uid/role in the body are ignored; identity comes only from the verified token.
    expect(await failure(mallory.call('createAccount', { tenantId, requestId: rid(), uid: alice.uid, role: 'owner', account: { name: 'x', type: 'cash', currency: 'GHS', openingBalanceMinor: 0 } }))).toBe('not_member');
  });

  it('only exposes known operations, via POST, with CORS limited to allowed origins', async () => {
    expect((await fetch(`${WORKER_URL}/constructor`, { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await fetch(`${WORKER_URL}/__proto__`, { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await fetch(`${WORKER_URL}/createTenant`)).status).toBe(404);
    const evil = await fetch(`${WORKER_URL}/createTenant`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const good = await fetch(`${WORKER_URL}/createTenant`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    expect(good.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const blocked = await fetch(`${WORKER_URL}/createTenant`, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
    expect(blocked.status).toBe(403);
  });

  it('rejects oversized and non-JSON bodies', async () => {
    const big = await fetch(`${WORKER_URL}/portalGetInvoices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'x'.repeat(300_000) }) });
    expect(big.status).toBe(400);
    const bad = await fetch(`${WORKER_URL}/portalGetInvoices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect(bad.status).toBe(400);
  });

  it('serves health and request ids without leaking internals', async () => {
    const res = await fetch(`${WORKER_URL}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/);
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['environment', 'ok', 'requestId', 'service']);
  });
});
