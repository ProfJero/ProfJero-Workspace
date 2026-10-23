// Runs the server test suites against the Cloudflare Worker (wrangler dev)
// backed by the Firebase emulators. Usage: npm run test:worker
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shim = fileURLToPath(new URL('./emulator-loopback-shim.cjs', import.meta.url));
const PORT = 8787;

// Inner mode: runs inside `firebase emulators:exec`, so the emulator env vars are set.
if (process.argv[2] === '--inner') {
  const wrangler = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1',
      '--var', 'FIREBASE_PROJECT_ID:demo-profjero',
      '--var', 'FIRESTORE_EMULATOR_HOST:127.0.0.1:8080',
      '--var', 'FIREBASE_AUTH_EMULATOR_HOST:127.0.0.1:9099'],
    { cwd: `${root}/apps/worker`, stdio: ['ignore', 'ignore', 'inherit'], detached: true },
  );
  const stop = () => {
    try {
      process.kill(-wrangler.pid, 'SIGTERM');
    } catch {
      /* already stopped */
    }
  };
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    ready = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.ok, () => false);
  }
  if (!ready) {
    stop();
    console.error('wrangler dev did not start');
    process.exit(1);
  }
  const tests = spawnSync(
    'npx',
    ['vitest', 'run', '--config', 'vitest.emulator.config.ts', 'test/functions.test.ts', 'test/migration.test.ts', 'test/worker.test.ts'],
    { cwd: `${root}/apps/functions`, stdio: 'inherit', env: { ...process.env, WORKER_URL: `http://127.0.0.1:${PORT}` } },
  );
  stop();
  process.exit(tests.status ?? 1);
}

const result = spawnSync(
  'npx',
  ['firebase', 'emulators:exec', '--only', 'auth,firestore', '--project', 'demo-profjero', `node ${fileURLToPath(import.meta.url)} --inner`],
  { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${shim}`.trim() } },
);
process.exit(result.status ?? 1);
