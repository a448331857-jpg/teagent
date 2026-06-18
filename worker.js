import { onRequestPost as chat } from "./functions/api/chat.js";
import { onRequestGet as health } from "./functions/api/health.js";
import { onRequestGet as getSettings, onRequestPost as saveSettings } from "./functions/api/settings.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    if (url.pathname === "/api/health" && request.method === "GET") return health(context);
    if (url.pathname === "/api/settings" && request.method === "GET") return getSettings(context);
    if (url.pathname === "/api/settings" && request.method === "POST") return saveSettings(context);
    if (url.pathname === "/api/chat" && request.method === "POST") return chat(context);
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "接口不存在" }), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
