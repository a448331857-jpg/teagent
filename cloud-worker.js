const SYSTEM_PROMPT = `你是奔奔，一名服务于 VC/PE、投行和行研团队的专业投资研究智能体。
你的职责是：行业研究、标的筛选、人物调查、尽调问题设计、财务与估值分析、IC Memo 和投委会材料修改。
回答要求：结论先行；区分事实、推断和待核验事项；涉及投资判断时列出风险；不能虚构数据或来源；信息不足时明确提出需要补充的资料。`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function modelProfiles(env) {
  if (env.LLM_PROFILES) {
    try {
      const parsed = JSON.parse(env.LLM_PROFILES);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }
  return [{
    id: "default",
    name: env.LLM_MODEL_NAME || env.LLM_MODEL || "默认模型",
    mode: env.LLM_API_MODE === "responses" ? "responses" : "chat-completions",
    apiUrl: env.LLM_API_URL || "https://ark.cn-beijing.volces.com/api/v1/chat/completions",
    model: env.LLM_MODEL || "ep-20260617144511-8tl99",
    apiKey: env.LLM_API_KEY || "",
  }];
}

function publicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name || profile.model,
    mode: profile.mode,
    apiUrl: profile.apiUrl,
    model: profile.model,
    resolvedModel: "",
    keyConfigured: Boolean(profile.apiKey),
    maskedKey: profile.apiKey ? `${profile.apiKey.slice(0, 4)}••••${profile.apiKey.slice(-4)}` : "",
  };
}

async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求格式无效" }, 400); }
  const list = modelProfiles(env);
  const profile = list.find((item) => item.id === body.modelProfileId) || list[0];
  if (!profile.apiKey) return json({ error: "云端 LLM_API_KEY 尚未配置" }, 503);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!messages.length) return json({ error: "messages 不能为空" }, 400);
  const normalized = messages.map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 20000) }));
  const instructions = `${SYSTEM_PROMPT}\n\n当前工作台上下文：\n${JSON.stringify(body.context || {}).slice(0, 30000)}`;
  const payload = profile.mode === "responses"
    ? { model: profile.model, instructions, input: normalized }
    : { model: profile.model, messages: [{ role: "system", content: instructions }, ...normalized] };
  let upstream;
  try {
    upstream = await fetch(profile.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${profile.apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return json({ error: `无法连接模型服务：${error.message || "网络异常"}` }, 502);
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ error: data?.error?.message || data?.message || `模型服务返回 ${upstream.status}` }, upstream.status);
  const message = profile.mode === "responses"
    ? (data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").filter(Boolean).join("\n"))
    : data?.choices?.[0]?.message?.content;
  if (!message) return json({ error: "模型服务未返回文本内容" }, 502);
  return json({ message, model: data.model || profile.model, endpointId: profile.model, modelProfileId: profile.id, sessionId: body.sessionId || null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const list = modelProfiles(env);
    const active = list[0];
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, configured: Boolean(active.apiKey && active.model), model: active.model, endpointId: active.model, mode: active.mode, activeProfileId: active.id, profiles: list.map(publicProfile) });
    }
    if (url.pathname === "/api/settings" && request.method === "GET") {
      const visible = publicProfile(active);
      return json({ ...visible, profiles: list.map(publicProfile), activeProfileId: active.id, cloudManaged: true });
    }
    if (url.pathname === "/api/settings" && request.method === "POST") return json({ error: "模型配置由 Cloudflare 加密变量统一管理" }, 403);
    if (url.pathname === "/api/chat" && request.method === "POST") return handleChat(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404);
    return env.ASSETS.fetch(request);
  },
};
