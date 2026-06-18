const SYSTEM_PROMPT = `你是奔奔，一名服务于 VC/PE、投行和行研团队的专业投资研究智能体。
你的职责是：行业研究、标的筛选、人物调查、尽调问题设计、财务与估值分析、IC Memo 和投委会材料修改。
回答要求：结论先行；区分事实、推断和待核验事项；涉及投资判断时列出风险；不能虚构数据或来源；信息不足时明确提出需要补充的资料。`;
const CONFIG_KEY = "model-config";
const SESSION_COOKIE = "te_admin_session";

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

function envProfile(env) {
  return { id: "default", name: env.LLM_MODEL_NAME || env.LLM_MODEL || "默认模型", mode: env.LLM_API_MODE === "responses" ? "responses" : "chat-completions", apiUrl: env.LLM_API_URL || "https://ark.cn-beijing.volces.com/api/v1/chat/completions", model: env.LLM_MODEL || "ep-20260617144511-8tl99", apiKey: env.LLM_API_KEY || "" };
}

async function loadConfig(env) {
  if (env.MODEL_CONFIG) {
    try {
      const saved = await env.MODEL_CONFIG.get(CONFIG_KEY, "json");
      if (saved?.profiles?.length) return saved;
    } catch {}
  }
  if (env.LLM_PROFILES) {
    try {
      const profiles = JSON.parse(env.LLM_PROFILES);
      if (Array.isArray(profiles) && profiles.length) return { profiles, activeProfileId: profiles[0].id };
    } catch {}
  }
  const profile = envProfile(env);
  return { profiles: [profile], activeProfileId: profile.id };
}

function visibleProfile(profile, reveal = false) {
  return { id: profile.id, name: profile.name || profile.model, mode: profile.mode, apiUrl: profile.apiUrl, model: profile.model, resolvedModel: "", keyConfigured: Boolean(profile.apiKey), maskedKey: profile.apiKey ? `${profile.apiKey.slice(0, 4)}••••${profile.apiKey.slice(-4)}` : "", ...(reveal ? { apiKey: profile.apiKey || "" } : {}) };
}

function bytesToBase64Url(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signature(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function createSession(secret) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return `${payload}.${await signature(payload, secret)}`;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = (request.headers.get("Cookie") || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return false;
  const [payload, provided] = token.split(".");
  if (!payload || !provided || provided !== await signature(payload, env.ADMIN_PASSWORD)) return false;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0))));
    return decoded.exp > Date.now();
  } catch { return false; }
}

async function handleAdmin(request, env, pathname) {
  if (pathname === "/api/admin/login" && request.method === "POST") {
    if (!env.ADMIN_PASSWORD) return json({ error: "尚未配置 ADMIN_PASSWORD", availableBindings: Object.keys(env).sort(), deployment: "admin-kv-v2" }, 503);
    const body = await request.json().catch(() => ({}));
    if (String(body.password || "") !== String(env.ADMIN_PASSWORD)) return json({ error: "管理员密码错误" }, 401);
    const token = await createSession(env.ADMIN_PASSWORD);
    return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` });
  }
  if (pathname === "/api/admin/logout" && request.method === "POST") return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  return json({ authenticated: await isAdmin(request, env), passwordConfigured: Boolean(env.ADMIN_PASSWORD), storageReady: Boolean(env.MODEL_CONFIG), availableBindings: Object.keys(env).sort(), deployment: "admin-kv-v2" });
}

async function handleSettings(request, env) {
  const admin = await isAdmin(request, env);
  const config = await loadConfig(env);
  if (request.method === "GET") {
    const profiles = config.profiles.map((item) => visibleProfile(item, admin));
    const active = profiles.find((item) => item.id === config.activeProfileId) || profiles[0];
    return json({ ...active, profiles, activeProfileId: active.id, adminAuthenticated: admin, cloudManaged: !admin, storageReady: Boolean(env.MODEL_CONFIG) });
  }
  if (!admin) return json({ error: "请先以管理员身份登录" }, 401);
  if (!env.MODEL_CONFIG) return json({ error: "请先在 Cloudflare 为 Worker 绑定名为 MODEL_CONFIG 的 KV Namespace" }, 503);
  const body = await request.json().catch(() => ({}));
  if (body.action === "delete") {
    if (config.profiles.length <= 1) return json({ error: "至少保留一个模型配置" }, 400);
    config.profiles = config.profiles.filter((item) => item.id !== body.profileId);
    if (config.activeProfileId === body.profileId) config.activeProfileId = config.profiles[0].id;
  } else {
    const existing = config.profiles.find((item) => item.id === body.profileId);
    const next = { id: existing?.id || `model-${Date.now()}`, name: String(body.profileName || body.model || "新模型").trim(), mode: body.mode === "responses" ? "responses" : "chat-completions", apiUrl: String(body.apiUrl || existing?.apiUrl || "").trim(), model: String(body.model || existing?.model || "").trim(), apiKey: String(body.apiKey || existing?.apiKey || "").trim() };
    if (!next.apiUrl || !next.model || !next.apiKey) return json({ error: "API 地址、模型和 API Key 不能为空" }, 400);
    if (existing) Object.assign(existing, next); else config.profiles.push(next);
    config.activeProfileId = next.id;
  }
  await env.MODEL_CONFIG.put(CONFIG_KEY, JSON.stringify(config));
  return json({ ok: true, activeProfileId: config.activeProfileId });
}

async function handleChat(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "请求格式无效" }, 400);
  const config = await loadConfig(env);
  const profile = config.profiles.find((item) => item.id === body.modelProfileId) || config.profiles.find((item) => item.id === config.activeProfileId) || config.profiles[0];
  if (!profile?.apiKey) return json({ error: "云端模型 Key 尚未配置" }, 503);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!messages.length) return json({ error: "messages 不能为空" }, 400);
  const normalized = messages.map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 20000) }));
  const instructions = `${SYSTEM_PROMPT}\n\n当前工作台上下文：\n${JSON.stringify(body.context || {}).slice(0, 30000)}`;
  const payload = profile.mode === "responses" ? { model: profile.model, instructions, input: normalized } : { model: profile.model, messages: [{ role: "system", content: instructions }, ...normalized] };
  let upstream;
  try { upstream = await fetch(profile.apiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${profile.apiKey}` }, body: JSON.stringify(payload) }); }
  catch (error) { return json({ error: `无法连接模型服务：${error.message || "网络异常"}` }, 502); }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ error: data?.error?.message || data?.message || `模型服务返回 ${upstream.status}` }, upstream.status);
  const message = profile.mode === "responses" ? (data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").filter(Boolean).join("\n")) : data?.choices?.[0]?.message?.content;
  if (!message) return json({ error: "模型服务未返回文本内容" }, 502);
  return json({ message, model: data.model || profile.model, endpointId: profile.model, modelProfileId: profile.id, sessionId: body.sessionId || null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env, url.pathname);
    if (url.pathname === "/api/settings") return handleSettings(request, env);
    if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env);
    if (url.pathname === "/api/health" && request.method === "GET") {
      const config = await loadConfig(env); const active = config.profiles.find((item) => item.id === config.activeProfileId) || config.profiles[0];
      return json({ ok: true, configured: Boolean(active?.apiKey && active?.model), model: active?.model, endpointId: active?.model, mode: active?.mode, activeProfileId: active?.id, profiles: config.profiles.map((item) => visibleProfile(item)) });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404);
    return env.ASSETS.fetch(request);
  },
};
