const SYSTEM_PROMPT = `你是奔奔，一名服务于 VC/PE、投行和行研团队的专业投资研究智能体。
你的职责是：行业研究、标的筛选、人物调查、尽调问题设计、财务与估值分析、IC Memo 和投委会材料修改。
回答要求：结论先行；区分事实、推断和待核验事项；涉及投资判断时列出风险；不能虚构数据或来源；信息不足时明确提出需要补充的资料。`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function envValue(env, ...names) {
  const wanted = names.map((name) => name.toUpperCase());
  const actual = Object.keys(env).find((key) => wanted.includes(key.replace(/^\uFEFF/, "").trim().toUpperCase()));
  return actual ? env[actual] : "";
}

function cleanApiKey(value) {
  return String(value || "")
    .trim()
    .replace(/^\$env:LLM_API_KEY\s*=\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

async function resolveApiKey(env, ...names) {
  const binding = envValue(env, ...names);
  if (binding && typeof binding === "object" && typeof binding.get === "function") {
    try { return cleanApiKey(await binding.get()); } catch { return ""; }
  }
  return cleanApiKey(binding);
}

async function profileFromEnv(env) {
  return {
    id: "default",
    name: envValue(env, "LLM_MODEL_NAME") || envValue(env, "LLM_MODEL") || "默认模型",
    mode: envValue(env, "LLM_API_MODE") === "responses" ? "responses" : "chat-completions",
    apiUrl: envValue(env, "LLM_API_URL") || "https://ark.cn-beijing.volces.com/api/v1/chat/completions",
    model: envValue(env, "LLM_MODEL") || "ep-20260617144511-8tl99",
    apiKey: await resolveApiKey(env, "LLM_API_KEY", "ARK_API_KEY"),
  };
}

async function profilesFromEnv(env) {
  const numbered = [];
  for (let index = 1; index <= 3; index += 1) {
    const prefix = `LLM_${index}`;
    const model = envValue(env, `${prefix}_MODEL`);
    const keyDetected = Object.keys(env).some((key) => key.trim().toUpperCase() === `${prefix}_API_KEY`);
    if (!model && !keyDetected) continue;
    numbered.push({
      id: `model-${index}`,
      name: envValue(env, `${prefix}_NAME`) || model || `模型 ${index}`,
      mode: envValue(env, `${prefix}_MODE`) === "responses" ? "responses" : "chat-completions",
      apiUrl: envValue(env, `${prefix}_API_URL`) || "https://ark.cn-beijing.volces.com/api/v1/chat/completions",
      model: model || "",
      apiKey: await resolveApiKey(env, `${prefix}_API_KEY`),
    });
  }
  return numbered.length ? numbered : [await profileFromEnv(env)];
}

function visibleProfile(profile) {
  return { id: profile.id, name: profile.name, mode: profile.mode, apiUrl: profile.apiUrl, model: profile.model, resolvedModel: "", keyConfigured: Boolean(profile.apiKey), maskedKey: profile.apiKey ? `${profile.apiKey.slice(0, 4)}••••${profile.apiKey.slice(-4)}` : "" };
}

async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "请求格式无效" }, 400); }
  const profiles = await profilesFromEnv(env);
  const profile = profiles.find((item) => item.id === body.modelProfileId) || profiles[0];
  if (!profile.apiKey) return json({ error: `当前 Worker 未读取到 ${profile.id === "default" ? "LLM_API_KEY" : profile.id.replace("model-", "LLM_") + "_API_KEY"}` }, 503);
  if (!profile.model) return json({ error: `当前 Worker 未读取到 ${profile.id === "default" ? "LLM_MODEL" : profile.id.replace("model-", "LLM_") + "_MODEL"}` }, 503);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!messages.length) return json({ error: "messages 不能为空" }, 400);
  const normalized = messages.map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 20000) }));
  const instructions = `${SYSTEM_PROMPT}\n\n当前工作台上下文：\n${JSON.stringify(body.context || {}).slice(0, 30000)}`;
  const taskType = String(body.context?.taskType || "");
  const maxTokens = taskType === "research-report" ? 6000 : taskType === "target-screening" ? 5000 : 4000;
  const payload = profile.mode === "responses"
    ? { model: profile.model, instructions, input: normalized, max_output_tokens: maxTokens }
    : { model: profile.model, messages: [{ role: "system", content: instructions }, ...normalized], max_tokens: maxTokens };
  let upstream;
  try {
    upstream = await fetch(profile.apiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${profile.apiKey}` }, body: JSON.stringify(payload) });
  } catch (error) {
    return json({ error: `无法连接火山方舟：${error.message || "网络异常"}` }, 502);
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ error: data?.error?.message || data?.message || `火山方舟返回 HTTP ${upstream.status}`, upstreamStatus: upstream.status }, upstream.status);
  const message = profile.mode === "responses"
    ? (data.output_text || (data.output || []).flatMap((item) => item.content || []).map((item) => item.text || "").filter(Boolean).join("\n"))
    : data?.choices?.[0]?.message?.content;
  if (!message) return json({ error: "模型服务未返回文本内容" }, 502);
  const usage = data.usage ? {
    inputTokens: Number(data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0),
    outputTokens: Number(data.usage.completion_tokens ?? data.usage.output_tokens ?? 0),
    totalTokens: Number(data.usage.total_tokens ?? 0),
  } : null;
  if (usage && !usage.totalTokens) usage.totalTokens = usage.inputTokens + usage.outputTokens;
  return json({ message, model: data.model || profile.model, endpointId: profile.model, modelProfileId: profile.id, sessionId: body.sessionId || null, usage });
}

function streamChat(request, env, ctx) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const work = (async () => {
    let completed = false;
    const modelRequest = handleChat(request, env).then((response) => { completed = true; return response; });
    while (!completed) {
      await Promise.race([modelRequest, new Promise((resolve) => setTimeout(resolve, 15000))]);
      if (!completed) await writer.write(encoder.encode(" \n"));
    }
    const response = await modelRequest;
    await writer.write(encoder.encode(await response.text()));
    await writer.close();
  })().catch(async (error) => {
    try { await writer.write(encoder.encode(JSON.stringify({ error: error.message || "云端任务执行失败" }))); await writer.close(); } catch {}
  });
  ctx.waitUntil(work);
  return new Response(readable, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const profiles = await profilesFromEnv(env);
    const profile = profiles[0];
    if (url.pathname === "/api/health" && request.method === "GET") {
      const rawKey = envValue(env, "LLM_API_KEY", "ARK_API_KEY");
      return json({ ok: true, configured: profiles.some((item) => item.apiKey && item.model), model: profile.model, endpointId: profile.model, mode: profile.mode, activeProfileId: profile.id, profiles: profiles.map(visibleProfile), runtime: "env-v5", availableBindings: Object.keys(env).sort(), apiKeyBindingDetected: profiles.some((item) => Boolean(item.apiKey)), apiKeyDiagnostics: { bindingType: rawKey && typeof rawKey === "object" ? "secret-store" : "text", cleanedLength: profile.apiKey.length, startsWithArk: profile.apiKey.startsWith("ark-"), containsWhitespace: /\s/.test(profile.apiKey), containsAssignment: /LLM_API_KEY|\$env:|=/.test(profile.apiKey) } });
    }
    if (url.pathname === "/api/settings" && request.method === "GET") {
      const visible = visibleProfile(profile);
      return json({ ...visible, profiles: profiles.map(visibleProfile), activeProfileId: profile.id, cloudManaged: true });
    }
    if (url.pathname === "/api/settings" && request.method === "POST") return json({ error: "模型配置由 Cloudflare 环境变量统一管理" }, 403);
    if (url.pathname === "/api/chat" && request.method === "POST") return streamChat(request, env, ctx);
    if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404);
    return env.ASSETS.fetch(request);
  },
};
