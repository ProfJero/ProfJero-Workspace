// Runs the emulator test suite. See scripts/emulator-loopback-shim.cjs for why NODE_OPTIONS is set.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const shim = fileURLToPath(new URL('./emulator-loopback-shim.cjs', import.meta.url));
const args = ['firebase', 'emulators:exec', '--only', 'auth,firestore,functions,storage', '--project', 'demo-profjero',
  `npm run test:emulator -w @profjero/functions -- ${process.argv.slice(2).join(' ')}`];
const result = spawnSync('npx', args, {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${shim}`.trim() },
});
process.exit(result.status ?? 1);
