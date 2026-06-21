const SYSTEM_PROMPT = `你是奔奔，一名服务于 VC/PE、投行和行研团队的专业投资研究智能体。
你的职责是：行业研究、标的筛选、人物调查、尽调问题设计、财务与估值分析、IC Memo 和投委会材料修改。
回答要求：结论先行；区分事实、推断和待核验事项；涉及投资判断时列出风险；不能虚构数据或来源；信息不足时明确提出需要补充的资料。`;

const DEFAULT_MODEL_PROFILES = [
  { id: "model-1", name: "Doubao-1.5-pro-32k", mode: "chat-completions", apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "ep-20260618215015-wrpv7" },
  { id: "model-2", name: "GLM-4.7", mode: "chat-completions", apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "ep-20260617214752-4thvz" },
  { id: "model-3", name: "DeepSeek-V3.2", mode: "chat-completions", apiUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "ep-20260617144511-8tl99" },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const DEFAULT_RSS_ROUTES = {
  policy: "/gov/policy",
  pbc: "/pbc/news",
  reports_10jqka: "/10jqka/report/latest",
  reports_eastmoney: "/eastmoney/research",
  jiemian: "/jiemian/main",
  aicaijing: "/aicaijing/latest",
  ifeng_stock: "/ifeng/finance/stock",
  "36kr": "/36kr/news/latest",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS_HEADERS, ...extraHeaders } });
}

function decodeXml(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseFeedItems(xml, sourceName, sourceRoute) {
  const valueOf = (block, tag) => decodeXml(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return [...String(xml).matchAll(/<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0, 30).map((match) => {
    const block = match[1];
    const link = valueOf(block, "link") || decodeXml(block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "");
    return { title: valueOf(block, "title"), url: link, snippet: valueOf(block, "description") || valueOf(block, "summary") || valueOf(block, "content"), publishedAt: valueOf(block, "pubDate") || valueOf(block, "published") || valueOf(block, "updated"), sourceName, sourceRoute };
  }).filter((item) => item.title && item.url);
}

async function getRssRoutes(env) {
  const configured = await resolveValue(env, "RSS_ROUTES");
  if (!configured) return DEFAULT_RSS_ROUTES;
  try { const parsed = JSON.parse(configured); return parsed && typeof parsed === "object" ? { ...DEFAULT_RSS_ROUTES, ...parsed } : DEFAULT_RSS_ROUTES; } catch { return DEFAULT_RSS_ROUTES; }
}

async function fetchPrivateRss(env, routeName) {
  const baseUrl = (await resolveValue(env, "RSS_BASE_URL") || "https://rss.teagent.qzz.io").replace(/\/+$/, "");
  const routes = await getRssRoutes(env);
  let route = routes[routeName] || "";
  if (!route) throw new Error(`未知 RSS 路由：${routeName}`);
  route = `/${String(route).replace(/^\/+/, "").replace(/^rss\//, "")}`;
  const target = `${baseUrl}${route}`;
  const cache = caches.default;
  const cacheKey = new Request(`https://rss-cache.local/${encodeURIComponent(routeName)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(target, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "User-Agent": "TEAgent-RSS/1.0" }, signal: controller.signal });
    const xml = await response.text();
    if (!response.ok) throw new Error(`RSSHub HTTP ${response.status}`);
    const items = parseFeedItems(xml, routeName, route);
    if (!items.length) throw new Error("RSS 返回成功但没有可解析条目，路由可能已失效");
    const result = { ok: true, routeName, route, target, fetchedAt: new Date().toISOString(), items };
    await cache.put(cacheKey, json(result, 200, { "Cache-Control": "public, max-age=600" }));
    return result;
  } finally { clearTimeout(timer); }
}

async function handleRssApi(url, env) {
  const routeName = String(url.searchParams.get("route") || "").trim();
  if (!routeName) return json({ ok: true, routes: await getRssRoutes(env) });
  try { return json(await fetchPrivateRss(env, routeName)); } catch (error) { return json({ ok: false, routeName, error: error.message || "RSS 获取失败" }, 502); }
}

async function handleRssBundle(url, env) {
  const requested = String(url.searchParams.get("routes") || "policy,pbc,reports_10jqka,reports_eastmoney,jiemian,36kr").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8);
  const settled = await Promise.allSettled(requested.map((name) => fetchPrivateRss(env, name)));
  const feeds = settled.map((item, index) => item.status === "fulfilled" ? item.value : { ok: false, routeName: requested[index], error: item.reason?.message || "RSS 获取失败", items: [] });
  const items = [...new Map(feeds.flatMap((feed) => feed.items || []).map((item) => [`${item.title}|${item.url}`, item])).values()].sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)).slice(0, 100);
  return json({ ok: items.length > 0, fetchedAt: new Date().toISOString(), feeds, items }, items.length ? 200 : 502);
}

async function buildRssResearchContext(env, taskType, context = {}) {
  const routeMap = {
    "research-report": ["policy", "pbc", "reports_10jqka", "reports_eastmoney", "jiemian", "36kr"],
    "scheduled-research": ["policy", "pbc", "jiemian", "aicaijing", "ifeng_stock", "36kr"],
    "target-screening": ["reports_10jqka", "reports_eastmoney", "jiemian", "36kr"],
    "people-research": ["jiemian", "aicaijing", "ifeng_stock", "36kr"],
  };
  const routeNames = routeMap[taskType];
  if (!routeNames) return "";
  const settled = await Promise.allSettled(routeNames.map((name) => fetchPrivateRss(env, name)));
  let items = [...new Map(settled
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value.items || [])
    .map((item) => [item.url, item])).values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  if (taskType === "people-research") {
    const query = String(context.query || "").trim().toLowerCase();
    if (!query) return "";
    const terms = [...new Set([query, ...query.split(/[\s,，、;；]+/).filter((term) => term.length >= 2)])];
    items = items.filter((item) => {
      const haystack = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }
  items = items.slice(0, taskType === "people-research" ? 15 : 30);
  return items.map((item, index) =>
    `[RSS-${index + 1}] ${item.title}\nSource: ${item.sourceName}\nDate: ${item.publishedAt || "unknown"}\nURL: ${item.url}\nSummary: ${String(item.snippet || "").slice(0, 500)}`
  ).join("\n\n");
}

function parseRssItems(xml, provider) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 20).map((match) => {
    const block = match[1];
    const value = (tag) => decodeXml(block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
    return { title: value("title").replace(/\s+-\s+[^-]+$/, "").trim(), url: value("link").trim(), snippet: value("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), publishedAt: value("pubDate"), sourceType: provider };
  }).filter((item) => item.title && item.url);
}

async function handleWebSearch(url) {
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return json({ error: "搜索关键词不能为空" }, 400);
  try {
    const upstream = await fetch(`https://www.bing.com/search?format=rss&mkt=zh-CN&setlang=zh-Hans&q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0 Times-Electric-Research-Agent" } });
    if (!upstream.ok) throw new Error(`搜索服务返回 ${upstream.status}`);
    const xml = await upstream.text();
    const results = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 15).map((match) => {
      const block = match[1];
      const value = (tag) => decodeXml(block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
      return { title: value("title"), url: value("link"), snippet: value("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
    }).filter((item) => item.title && item.url);
    return json({ query, results });
  } catch (error) { return json({ error: `联网搜索失败：${error.message || "网络异常"}` }, 502); }
}

async function handleWebSearchAdvanced(url) {
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return json({ error: "搜索关键词不能为空" }, 400);
  const feeds = [
    { provider: "Bing RSS", url: `https://www.bing.com/search?format=rss&mkt=zh-CN&setlang=zh-Hans&q=${encodeURIComponent(query)}` },
    { provider: "Google News RSS", url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans` },
  ];
  const settled = await Promise.allSettled(feeds.map(async (feed) => {
    const response = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 Times-Electric-Research-Agent" } });
    if (!response.ok) throw new Error(`${feed.provider} ${response.status}`);
    return parseRssItems(await response.text(), feed.provider);
  }));
  const results = [...new Map(settled.filter((item) => item.status === "fulfilled").flatMap((item) => item.value).map((item) => [`${item.title}|${item.url}`, item])).values()].slice(0, 30);
  if (!results.length) return json({ error: "免费 RSS 检索暂时没有返回结果" }, 502);
  return json({ query, results, providers: feeds.map((feed, index) => ({ name: feed.provider, status: settled[index].status })) });
}

async function handleAcademicSearch(url) {
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 160);
  if (!query) return json({ error: "学术检索关键词不能为空" }, 400);
  const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=from_publication_date:2021-01-01&per-page=25`;
  const crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&filter=from-pub-date:2021-01-01&rows=20`;
  const [openAlexResult, crossrefResult] = await Promise.allSettled([
    fetch(openAlexUrl, { headers: { Accept: "application/json", "User-Agent": "Times-Electric-Research-Agent/1.0" } }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error(`OpenAlex ${response.status}`))),
    fetch(crossrefUrl, { headers: { Accept: "application/json", "User-Agent": "Times-Electric-Research-Agent/1.0 (research-tool)" } }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error(`Crossref ${response.status}`))),
  ]);
  const results = [];
  if (openAlexResult.status === "fulfilled") {
    for (const work of openAlexResult.value?.results || []) {
      const workTitle = String(work?.display_name || work?.title || "").trim();
      const workUrl = work?.doi || work?.id || "";
      for (const authorship of (work?.authorships || []).slice(0, 8)) {
        const name = String(authorship?.author?.display_name || "").trim();
        if (!name || !workUrl) continue;
        const institution = String(authorship?.institutions?.[0]?.display_name || "").trim();
        results.push({ title: `${name}${institution ? ` · ${institution}` : ""}｜${workTitle}`, url: workUrl, snippet: `${name}${institution ? `，${institution}` : ""}；${work?.publication_year || ""}年论文：${workTitle}`, personName: name, institution, sourceType: "OpenAlex" });
      }
    }
  }
  if (crossrefResult.status === "fulfilled") {
    for (const work of crossrefResult.value?.message?.items || []) {
      const workTitle = String(work?.title?.[0] || "").trim();
      const workUrl = work?.URL || (work?.DOI ? `https://doi.org/${work.DOI}` : "");
      const year = work?.published?.["date-parts"]?.[0]?.[0] || work?.created?.["date-parts"]?.[0]?.[0] || "";
      for (const author of (work?.author || []).slice(0, 8)) {
        const name = `${author?.given || ""} ${author?.family || ""}`.trim();
        if (!name || !workUrl) continue;
        const institution = String(author?.affiliation?.[0]?.name || "").trim();
        results.push({ title: `${name}${institution ? ` · ${institution}` : ""}｜${workTitle}`, url: workUrl, snippet: `${name}${institution ? `，${institution}` : ""}；${year ? `${year}年` : ""}论文：${workTitle}`, personName: name, institution, sourceType: "Crossref" });
      }
    }
  }
  const unique = [...new Map(results.map((item) => [`${item.personName.toLowerCase()}|${item.url}`, item])).values()].slice(0, 60);
  return json({ query, results: unique, providers: { openAlex: openAlexResult.status, crossref: crossrefResult.status } });
}

function envValue(env, ...names) {
  const wanted = names.map((name) => name.toUpperCase());
  const actual = Object.keys(env).find((key) => wanted.includes(key.replace(/^\uFEFF/, "").trim().toUpperCase()));
  return actual ? env[actual] : "";
}

async function resolveValue(env, ...names) {
  const binding = envValue(env, ...names);
  if (binding && typeof binding === "object" && typeof binding.get === "function") {
    try { return String(await binding.get() || "").trim(); } catch { return ""; }
  }
  return String(binding || "").trim();
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
    name: await resolveValue(env, "LLM_MODEL_NAME") || await resolveValue(env, "LLM_MODEL") || "默认模型",
    mode: await resolveValue(env, "LLM_API_MODE") === "responses" ? "responses" : "chat-completions",
    apiUrl: await resolveValue(env, "LLM_API_URL") || "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: await resolveValue(env, "LLM_MODEL") || "ep-20260617144511-8tl99",
    apiKey: await resolveApiKey(env, "LLM_API_KEY", "ARK_API_KEY"),
  };
}

async function profilesFromEnv(env) {
  const combined = await resolveValue(env, "LLM_PROFILES");
  if (combined) {
    try {
      const parsed = JSON.parse(combined);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.slice(0, 3).map((item, index) => ({
          id: String(item.id || `model-${index + 1}`),
          name: String(item.name || item.model || `模型 ${index + 1}`).trim(),
          mode: item.mode === "responses" ? "responses" : "chat-completions",
          apiUrl: String(item.apiUrl || "https://ark.cn-beijing.volces.com/api/v3/chat/completions").trim(),
          model: String(item.model || "").trim(),
          apiKey: cleanApiKey(item.apiKey),
        }));
      }
    } catch {}
  }
  const numbered = [];
  for (let index = 1; index <= 3; index += 1) {
    const prefix = `LLM_${index}`;
    const defaults = DEFAULT_MODEL_PROFILES[index - 1];
    const model = await resolveValue(env, `${prefix}_MODEL`) || defaults.model;
    const keyDetected = Object.keys(env).some((key) => key.trim().toUpperCase() === `${prefix}_API_KEY`);
    if (!keyDetected) continue;
    numbered.push({
      id: `model-${index}`,
      name: await resolveValue(env, `${prefix}_NAME`) || defaults.name,
      mode: (await resolveValue(env, `${prefix}_MODE`) || await resolveValue(env, "LLM_API_MODE") || defaults.mode) === "responses" ? "responses" : "chat-completions",
      apiUrl: await resolveValue(env, `${prefix}_API_URL`) || await resolveValue(env, "LLM_API_URL") || defaults.apiUrl,
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
  const profile = profiles.find((item) => item.id === body.modelProfileId) || profiles.find((item) => item.id === "model-2") || profiles[0];
  if (!profile.apiKey) return json({ error: `当前 Worker 未读取到 ${profile.id === "default" ? "LLM_API_KEY" : profile.id.replace("model-", "LLM_") + "_API_KEY"}` }, 503);
  if (!profile.model) return json({ error: `当前 Worker 未读取到 ${profile.id === "default" ? "LLM_MODEL" : profile.id.replace("model-", "LLM_") + "_MODEL"}` }, 503);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  if (!messages.length) return json({ error: "messages 不能为空" }, 400);
  const normalized = messages.map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 20000) }));
  const currentDate = new Date().toISOString().slice(0, 10);
  let instructions = `${SYSTEM_PROMPT}

当前日期：${currentDate}。所有报告、判断和时间表必须以当前日期为基准；不得把 2024 年当作当前年份。历史数据应明确标注“历史”，预测数据应明确标注“预测/待核验”。优先采用最新可验证信息。

当前工作台上下文：
${JSON.stringify(body.context || {}).slice(0, 30000)}`;
  const taskType = String(body.context?.taskType || "");
  const rssContext = await buildRssResearchContext(env, taskType, body.context || {}).catch(() => "");
  if (rssContext) instructions += `\n\nPrivate RSS research leads follow. Treat them as leads rather than verified facts. Cite the supplied URL for claims based on them, discard irrelevant items, and never invent missing details.\n\n${rssContext}`;
  const maxTokens = taskType === "research-report" ? 6000 : taskType === "target-screening" ? 3500 : 4000;
  const payload = profile.mode === "responses"
    ? { model: profile.model, instructions, input: normalized, max_output_tokens: maxTokens }
    : { model: profile.model, messages: [{ role: "system", content: instructions }, ...normalized], max_tokens: maxTokens };
  let upstream;
  let data = {};
  let message = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      upstream = await fetch(profile.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${profile.apiKey}` },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (attempt === 0) continue;
      return json({ error: `无法连接火山方舟：${error.message || "网络异常"}` }, 502);
    }
    const rawText = await upstream.text();
    try { data = JSON.parse(rawText); } catch { data = { rawText }; }
    if (!upstream.ok) {
      if (attempt === 0 && upstream.status >= 500) continue;
      return json({ error: data?.error?.message || data?.message || `火山方舟返回 HTTP ${upstream.status}`, upstreamStatus: upstream.status }, upstream.status);
    }
    message = extractModelText(data);
    if (message) break;
  }
  if (!message) {
    const finishReason = data?.choices?.[0]?.finish_reason || data?.status || "";
    return json({ error: `模型服务未返回文本内容${finishReason ? `（${finishReason}）` : ""}，已自动重试一次` }, 502);
  }
  const usage = data.usage ? {
    inputTokens: Number(data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0),
    outputTokens: Number(data.usage.completion_tokens ?? data.usage.output_tokens ?? 0),
    totalTokens: Number(data.usage.total_tokens ?? 0),
  } : null;
  if (usage && !usage.totalTokens) usage.totalTokens = usage.inputTokens + usage.outputTokens;
  return json({ message, model: data.model || profile.model, endpointId: profile.model, modelProfileId: profile.id, sessionId: body.sessionId || null, usage });
}

function extractModelText(data) {
  const direct = data?.output_text
    || data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.choices?.[0]?.message?.reasoning_content;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (Array.isArray(direct)) {
    const text = direct.map((item) => typeof item === "string" ? item : item?.text || item?.content || "").filter(Boolean).join("\n");
    if (text.trim()) return text.trim();
  }
  const outputText = (data?.output || [])
    .flatMap((item) => item?.content || [])
    .map((item) => item?.text || item?.content || "")
    .filter(Boolean)
    .join("\n");
  return outputText.trim();
}

function streamChat(request, env, ctx) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const work = (async () => {
    let completed = false;
    const modelRequest = handleChat(request, env).then((response) => { completed = true; return response; });
    while (!completed) {
      await Promise.race([modelRequest, new Promise((resolve) => setTimeout(resolve, 10000))]);
      if (!completed) await writer.write(encoder.encode(" \n"));
    }
    const response = await modelRequest;
    await writer.write(encoder.encode(await response.text()));
    await writer.close();
  })().catch(async (error) => {
    try { await writer.write(encoder.encode(JSON.stringify({ error: error.message || "云端任务执行失败" }))); await writer.close(); } catch {}
  });
  ctx.waitUntil(work);
  return new Response(readable, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...CORS_HEADERS } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    const profiles = await profilesFromEnv(env);
    const profile = profiles.find((item) => item.id === "model-2") || profiles[0];
    if (url.pathname.startsWith("/api/")) console.log(JSON.stringify({ event: "api-request", path: url.pathname, method: request.method, origin: request.headers.get("Origin") || "direct", profiles: profiles.length, configuredProfiles: profiles.filter((item) => item.apiKey && item.model).length }));
    if (url.pathname === "/api/health" && request.method === "GET") {
      const rawKey = envValue(env, "LLM_API_KEY", "ARK_API_KEY");
      const missingBindings = profiles.flatMap((item, index) => {
        const number = item.id === "default" ? "" : String(index + 1);
        return [!item.model ? `LLM${number ? `_${number}` : ""}_MODEL` : "", !item.apiKey ? `LLM${number ? `_${number}` : ""}_API_KEY` : ""].filter(Boolean);
      });
      return json({ ok: true, configured: profiles.some((item) => item.apiKey && item.model), model: profile.model, endpointId: profile.model, mode: profile.mode, activeProfileId: profile.id, profiles: profiles.map(visibleProfile), runtime: "env-v8", configurationSource: await resolveValue(env, "LLM_PROFILES") ? "LLM_PROFILES" : profiles[0]?.id === "default" ? "single" : "numbered", availableBindings: Object.keys(env).sort(), missingBindings, apiKeyBindingDetected: profiles.some((item) => Boolean(item.apiKey)), apiKeyDiagnostics: { bindingType: rawKey && typeof rawKey === "object" ? "secret-store" : "text", cleanedLength: profile.apiKey.length, startsWithArk: profile.apiKey.startsWith("ark-"), containsWhitespace: /\s/.test(profile.apiKey), containsAssignment: /LLM_API_KEY|\$env:|=/.test(profile.apiKey) } });
    }
    if (url.pathname === "/api/rss" && request.method === "GET") return handleRssApi(url, env);
    if (url.pathname === "/api/rss/bundle" && request.method === "GET") return handleRssBundle(url, env);
    if (url.pathname === "/api/academic-search" && request.method === "GET") return handleAcademicSearch(url);
    if (url.pathname === "/api/settings" && request.method === "GET") {
      const visible = visibleProfile(profile);
      return json({ ...visible, profiles: profiles.map(visibleProfile), activeProfileId: profile.id, cloudManaged: true });
    }
    if (url.pathname === "/api/settings" && request.method === "POST") return json({ error: "模型配置由 Cloudflare 环境变量统一管理" }, 403);
    if (url.pathname === "/api/web-search" && request.method === "GET") return handleWebSearch(url);
    if (url.pathname === "/api/chat" && request.method === "POST") return streamChat(request, env, ctx);
    if (url.pathname.startsWith("/api/")) return json({ error: "接口不存在" }, 404);
    return env.ASSETS.fetch(request);
  },
};
