# 时代电气智能投研助手（云端双端版）

这是从原本地 Node.js 软件迁移而来的云端 PWA。部署完成后，用户只需要一个网址：电脑浏览器和手机浏览器均可直接使用，也可以安装到桌面或手机主屏幕。本机不需要 Node.js、Python 或其他运行环境。

## 已迁移能力

- Ask 奔奔多轮对话、会话创建、切换、搜索、删除和导出
- 投研助手、人物调查、标的搜索和报告中心
- 投资项目、看板、定时任务、Skill 与历史记录
- Word、Excel、PPT 投研模板和编辑界面
- 响应式电脑/手机布局
- PWA 安装、自动更新及基础壳缓存
- 云端模型代理，API Key 不下发到浏览器
- 多模型列表、模型切换与按模型执行对话

## 部署到 Cloudflare Workers

1. 将本目录提交到 GitHub 或 GitLab 仓库。
2. 在 Cloudflare 控制台创建 Workers Builds 项目并连接该仓库。
3. 部署命令使用 `node deploy.mjs`，无需构建命令。该脚本会把 Builds 中的模型名称、接口和模型 ID 自动注入 Worker 运行时；不会处理或输出 API Key。
4. 在 Worker 的“设置 → 变量和机密”中添加：
   - `LLM_API_MODE`：`chat-completions` 或 `responses`
   - `LLM_API_URL`：模型服务 API 地址
   - `LLM_MODEL`：模型名或推理接入点 ID
   - `LLM_API_KEY`：模型服务密钥（必须设为加密变量）
5. 重新部署。访问 Cloudflare 分配的 HTTPS 域名即可使用。

程序已经内置 `chat-completions`、火山方舟接口地址和默认推理接入点 ID；生产部署最少只需配置加密变量 `LLM_API_KEY`。其他变量仍可用于覆盖内置默认值。

配置多模型时，可以增加加密变量 `LLM_PROFILES`，值为 JSON 数组；其字段为 `id`、`name`、`mode`、`apiUrl`、`model` 和 `apiKey`。设置后会优先使用多模型配置。

`LLM_PROFILES` 是推荐的一键配置方式：一个 Secret 即可保存最多三个模型，优先级高于所有 `LLM_1_*`、`LLM_2_*`、`LLM_3_*` 编号变量。不要把包含 API Key 的 JSON 写入源码或提交到 Git。

`worker.js` 是唯一 Worker 入口，`app.js` 等文件只作为浏览器静态资源发布。本机不需要运行 Node 服务器。

## 安装到设备

- Windows/macOS：使用 Edge 或 Chrome 打开网址，点击地址栏的“安装应用”。
- Android：Chrome 菜单中选择“安装应用”或“添加到主屏幕”。
- iPhone/iPad：Safari 的分享菜单中选择“添加到主屏幕”。

## 安全提示

不要把真实 API Key 写进任何前端文件、Git 仓库或 `.dev.vars` 示例文件。生产密钥只配置在云平台的加密环境变量中。公开上线前建议继续增加账号登录、调用限额、审计日志和服务端数据存储。

## 手机打不开的检查方法

1. 手机直接访问 `https://你的域名/api/health`。能看到 JSON 表示网络和云函数正常。
2. 如果 `/api/health` 也打不开，问题在域名、DNS 或移动网络，不是页面代码。中国大陆网络建议绑定已备案且连通性稳定的自定义域名，或使用面向大陆用户的云服务。
3. 如果接口能打开但首页异常，清除该站点的浏览器缓存和网站数据，再重新打开；新版 Service Worker 会主动检查更新。
4. Cloudflare 环境变量修改后必须重新部署 Production，旧部署不会自动继承新配置。
