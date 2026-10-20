export interface Env {
  APP_ENV: string;
  WEB_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
      "x-content-type-options": "nosniff",
      "vary": "Origin",
    });
    // Exact-origin allowlist; never reflect arbitrary Origin values.
    if (origin === env.WEB_ORIGIN) {
      headers.set("access-control-allow-origin", origin);
      headers.set("access-control-allow-headers", "Authorization, Content-Type, X-Firebase-AppCheck");
      headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      headers.set("access-control-max-age", "600");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ ok: true, service: "ProfJero Workspace API", environment: env.APP_ENV, timestamp: new Date().toISOString(), requestId }), { status: 200, headers });
    }
    // Fail closed until identity verification, tenant membership, role checks,
    // schema validation, and audit logging are implemented for each route.
    return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId }), { status: 404, headers });
  },
};
