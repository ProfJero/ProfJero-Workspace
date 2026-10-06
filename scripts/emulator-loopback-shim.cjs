/**
 * Test-harness shim for running the Firebase emulators behind an HTTP proxy.
 *
 * firebase-tools' HTTP client (lib/apiv2.js) routes every request through
 * HTTPS_PROXY and ignores NO_PROXY, so emulator-to-emulator calls on
 * 127.0.0.1 (e.g. Storage rules calling firestore.get()) are sent to the proxy
 * and fail. This makes loopback requests bypass the proxy, matching NO_PROXY.
 * Loaded only by `npm run test:emulator` via NODE_OPTIONS; not used in production.
 */
try {
  const undiciPath = require.resolve('undici', { paths: [require.resolve('firebase-tools/package.json')] });
  const undici = require(undiciPath);
  const Original = undici.ProxyAgent;
  const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  class LoopbackAwareProxyAgent extends undici.Dispatcher {
    constructor(opts) {
      super();
      this.proxy = new Original(opts);
      this.direct = new undici.Agent();
    }
    dispatch(opts, handler) {
      const host = new URL(String(opts.origin)).hostname;
      return (LOOPBACK.has(host) ? this.direct : this.proxy).dispatch(opts, handler);
    }
    async close() {
      await Promise.all([this.proxy.close(), this.direct.close()]);
    }
    async destroy(err) {
      await Promise.all([this.proxy.destroy(err), this.direct.destroy(err)]);
    }
  }
  undici.ProxyAgent = LoopbackAwareProxyAgent;
} catch {
  // firebase-tools/undici not resolvable from this process: nothing to patch.
}
