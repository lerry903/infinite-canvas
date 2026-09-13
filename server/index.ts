import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

const PORT = Number(process.env.PORT || 8787);
const AI_BASE_URL = "https://api.smartxai.cn";
mkdirSync(process.env.DB_PATH ? process.env.DB_PATH.replace(/\/[^/]*$/, "") || "." : "./data", { recursive: true });
const db = new Database(process.env.DB_PATH || "./data/app.sqlite");
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (user_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
`);

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers });
const cookie = (token: string, maxAge = 60 * 60 * 24 * 30) => `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const tokenFrom = (request: Request) => request.headers.get("cookie")?.match(/(?:^|;\s*)session=([^;]+)/)?.[1] || "";
const userFor = (request: Request) => {
  const token = tokenFrom(request);
  if (!token) return null;
  const row = db.query("SELECT u.id,u.username,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? ").get(token, Date.now()) as { id: string; username: string; display_name: string } | null;
  return row ? { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: "" } : null;
};
const body = async (request: Request) => {
  try { return await request.json() as Record<string, unknown>; } catch { return {}; }
};
const normalizeSettings = (payload: Record<string, unknown>) => {
  const config = (payload.config && typeof payload.config === "object" ? payload.config : {}) as Record<string, unknown>;
  const channels = Array.isArray(config.channels) ? config.channels.map((item) => {
    const channel = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return { ...channel, baseUrl: AI_BASE_URL };
  }) : [];
  return { ...payload, config: { ...config, baseUrl: AI_BASE_URL, channels, proxyEnabled: false } };
};
const keyForRequest = (user: ReturnType<typeof userFor>, request: Request, requestBody: Record<string, unknown> | null) => {
  if (!user) return "";
  const row = db.query("SELECT payload FROM settings WHERE user_id=?").get(user.id) as { payload: string } | null;
  if (!row) return "";
  try {
    const payload = JSON.parse(row.payload) as { config?: { channels?: Array<{ apiKey?: string; models?: Array<{ name?: string }> }> } };
    const requestedChannelId = request.headers.get("x-channel-id") || "";
    const model = typeof requestBody?.model === "string" ? requestBody.model : "";
    const channels = payload.config?.channels || [];
    const match = requestedChannelId
      ? channels.find((channel) => channel.id === requestedChannelId)
      : channels.find((channel) => channel.models?.some((item) => item.name === model));
    return String((match || channels[0])?.apiKey || "");
  } catch { return ""; }
};

async function handle(request: Request) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": url.origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  if (url.pathname === "/api/session" && request.method === "GET") return json({ user: userFor(request) });
  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    const input = await body(request); const username = String(input.username || "").trim().toLowerCase(); const password = String(input.password || "");
    if (username.length < 3 || password.length < 8) return json({ error: "用户名至少 3 个字符，密码至少 8 个字符" }, 400);
    if (db.query("SELECT 1 FROM users WHERE username=?").get(username)) return json({ error: "用户已存在" }, 409);
    const id = crypto.randomUUID(); db.query("INSERT INTO users VALUES (?,?,?,?,?)").run(id, username, await Bun.password.hash(password), String(input.displayName || username), new Date().toISOString());
    const token = crypto.randomUUID(); db.query("INSERT INTO sessions VALUES (?,?,?)").run(token, id, Date.now() + 30 * 86400000);
    return json({ user: { id, username, displayName: String(input.displayName || username), avatarUrl: "" } }, 201, { "Set-Cookie": cookie(token) });
  }
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const input = await body(request); const username = String(input.username || "").trim().toLowerCase(); const password = String(input.password || "");
    const row = db.query("SELECT * FROM users WHERE username=?").get(username) as { id: string; username: string; password_hash: string; display_name: string } | null;
    if (!row || !(await Bun.password.verify(password, row.password_hash))) return json({ error: "用户名或密码错误" }, 401);
    const token = crypto.randomUUID(); db.query("INSERT INTO sessions VALUES (?,?,?)").run(token, row.id, Date.now() + 30 * 86400000);
    return json({ user: { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: "" } }, 200, { "Set-Cookie": cookie(token) });
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") { const token = tokenFrom(request); if (token) db.query("DELETE FROM sessions WHERE token=?").run(token); return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) }); }
  const user = userFor(request);
  if (url.pathname === "/api/me/settings" && user) {
    if (request.method === "GET") { const row = db.query("SELECT payload FROM settings WHERE user_id=?").get(user.id) as { payload: string } | null; return row ? json(JSON.parse(row.payload)) : json(null); }
    if (request.method === "PUT") { const payload = normalizeSettings(await body(request)); db.query("INSERT INTO settings(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").run(user.id, JSON.stringify(payload), new Date().toISOString()); return json(payload); }
  }
  if (url.pathname.startsWith("/api/ai/")) {
    if (!user) return json({ error: "Authentication required" }, 401);
    const upstreamPath = url.pathname.slice("/api/ai".length) + url.search;
    let requestBody: Record<string, unknown> | null = null;
    let bodyValue: BodyInit | undefined;
    let headersDeleteLater = false;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) { requestBody = await body(request); bodyValue = JSON.stringify(requestBody); }
      else if (contentType.includes("multipart/form-data")) {
        const form = await request.formData();
        requestBody = { model: form.get("model") };
        bodyValue = form;
        headersDeleteLater = true;
      } else bodyValue = await request.arrayBuffer();
    }
    const headers = new Headers(request.headers); headers.delete("host"); headers.delete("content-length"); if (user) headers.delete("authorization");
    if (typeof headersDeleteLater !== "undefined" && headersDeleteLater) headers.delete("content-type");
    const apiKey = keyForRequest(user, request, requestBody);
    if (apiKey) { headers.set("authorization", `Bearer ${apiKey}`); headers.set("x-goog-api-key", apiKey); }
    try {
      const upstream = await fetch(`${AI_BASE_URL}${upstreamPath}`, { method: request.method, headers, body: bodyValue });
      return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "AI service unavailable" }, 502);
    }
  }
  return json({ error: "Not found" }, 404);
}

Bun.serve({ port: PORT, fetch: handle });
console.log(`API listening on :${PORT}`);
