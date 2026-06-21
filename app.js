const STORAGE_KEY = "investment-agent-mvp-state-v2";
const JOB_HISTORY_KEY = "times-electric-agent-job-history-v1";
const WORKER_ORIGIN = /^https?:$/.test(location.protocol) ? location.origin : "https://teagent.tankoagent.workers.dev";
const apiUrl = (path) => `${WORKER_ORIGIN}${path}`;
const AI_CONFIG = {
  endpoint: apiUrl("/api/chat"),
  timeoutMs: 600000,
};

const sampleCompanies = [
  {
    name: "灵构机器人",
    sector: "人形机器人",
    round: "B轮",
    region: "华东",
    revenue: "5000万-1亿",
    tags: ["关节模组", "量产爬坡", "产业链卡位"],
    intro: "聚焦高扭矩关节模组和整机控制，已进入两家头部制造客户测试线。",
    financing: "2026年Q1完成2.8亿元B轮融资，投资方包括产业资本与人民币基金。",
  },
  {
    name: "钠启能源",
    sector: "固态电池",
    round: "A轮",
    region: "华南",
    revenue: "3000万-5000万",
    tags: ["硫化物路线", "中试线", "车企验证"],
    intro: "固态电解质材料和软包样品同步推进，核心团队来自电池龙头和高校实验室。",
    financing: "2025年Q4完成A轮融资，资金用于中试线扩产。",
  },
  {
    name: "刻蚀微科",
    sector: "半导体设备",
    round: "C轮",
    region: "华东",
    revenue: "1亿-3亿",
    tags: ["国产替代", "刻蚀设备", "订单验证"],
    intro: "面向成熟制程刻蚀设备，客户覆盖多家晶圆厂，具备稳定复购订单。",
    financing: "2026年Q2获得C轮融资，由国资平台和产业基金联合投资。",
  },
  {
    name: "云诊智联",
    sector: "AI医疗",
    round: "B轮",
    region: "华北",
    revenue: "5000万-1亿",
    tags: ["影像AI", "三甲医院", "合规准入"],
    intro: "提供肺部和心血管影像辅助诊断系统，已在多省医院部署。",
    financing: "2025年完成B轮融资，用于医疗器械注册和渠道扩张。",
  },
  {
    name: "星源触觉",
    sector: "人形机器人",
    round: "A轮",
    region: "华东",
    revenue: "1000万-3000万",
    tags: ["灵巧手", "传感器", "供应链稀缺"],
    intro: "研发高密度触觉传感器和灵巧手模组，适配服务和工业机器人场景。",
    financing: "2026年Q1完成数千万元A轮融资。",
  },
  {
    name: "川算智药",
    sector: "AI医疗",
    round: "天使轮",
    region: "西南",
    revenue: "1000万以下",
    tags: ["AI制药", "早期管线", "算法平台"],
    intro: "以生成式模型辅助小分子药物发现，已有两个合作研发项目。",
    financing: "2025年完成天使轮融资。",
  },
];

const defaultState = {
  projects: [],
  reports: [],
  tasks: [
    {
      id: makeId(),
      name: "人形机器人赛道周更",
      cadence: "每周一 09:00",
      prompt: "关注关节模组、灵巧手、整机量产节奏和新融资事件。",
      lastResult: "等待首次执行",
      active: true,
      createdAt: new Date().toISOString(),
    },
  ],
  risks: [],
  favorites: [],
  screenings: [],
  currentScreeningResults: [],
  researchRecords: [],
  peopleRecords: [],
  history: [],
  memories: [
    {
      id: makeId(),
      name: "IC Memo 框架",
      scene: "投委会前投资备忘录",
      content: "结论先行：一句话建议、投资亮点、核心风险、估值与条款、下一步尽调动作。",
      createdAt: new Date().toISOString(),
    },
  ],
  chatSessionId: makeId(),
  chatSessions: [],
  activeChatSessionId: "",
  chatMessages: [
    {
      id: makeId(),
      role: "assistant",
      content: "你好，我是奔奔。你可以让我分析项目、梳理赛道、检查报告、生成尽调问题或安排下一步工作。",
      createdAt: new Date().toISOString(),
      mode: "local",
    },
  ],
};

let state = loadState();
let researchDocs = [];
let currentReport = null;
let currentPeopleReport = null;
let lastAskAnswer = "";
let reportFilter = "全部";
let reportMode = "mine";
let activeTemplateFormat = "DOCX";
let editingReportId = null;
let currentView = "ask";
let preserveSourcingResultOnce = false;
let evaMinimized = true;
let pendingChatFiles = [];
let chatRequestInFlight = false;
let activeChatController = null;
let chatStoppedByUser = false;
let boardMode = "kanban";
let bpDocument = null;
let activeProjectId = null;
let taskSchedulerBusy = false;
let launcherWasDragged = false;
const activeAgentJobs = new Map();
let completedAgentJobs = loadJobHistory();
let jobCenterMinimized = true;
let jobLauncherWasDragged = false;
let editingProjectId = null;
const DEFAULT_MODEL_PROFILE_ID = "model-2";
const GLM_DEFAULT_MIGRATION_KEY = "times-electric-default-model-glm-v1";
let selectedModelProfileId = localStorage.getItem("times-electric-selected-model") || DEFAULT_MODEL_PROFILE_ID;
if (!localStorage.getItem(GLM_DEFAULT_MIGRATION_KEY)) {
  selectedModelProfileId = DEFAULT_MODEL_PROFILE_ID;
  localStorage.setItem("times-electric-selected-model", selectedModelProfileId);
  localStorage.setItem(GLM_DEFAULT_MIGRATION_KEY, "1");
}
let peopleMode = "direction";
let favoriteFilter = "全部";
let favoriteSort = "time";
let researchMode = "professional";

const reportTemplates = {
  DOCX: [
    {
      id: "ic-memo",
      title: "投资备忘录 (IC Memo)",
      subtitle: "投决会用 · 一句话评价 + 9 节",
      description: "适用于投委会前的标准投资判断，覆盖公司、市场、产品、团队、财务、估值、风险与建议。",
      html: `
        <h1>投资备忘录：【公司名】</h1>
        <blockquote>一句话评价：</blockquote>
        <h2>1. 核心结论与建议</h2>
        <ul><li><b>投资建议：</b>投 / 不投 / 观察</li><li><b>拟投金额：</b></li><li><b>拟投估值：</b></li><li><b>占股比例：</b></li><li><b>关键决策依据：</b></li></ul>
        <h2>2. 公司概况</h2>
        <ul><li>成立时间 / 创始团队背景</li><li>总部 / 主要市场</li><li>商业模式一句话描述</li><li>历史融资轮次</li></ul>
        <h2>3. 市场与机会</h2>
        <ul><li>行业规模与增速</li><li>目标客户画像</li><li>竞争格局（直接 / 间接 / 替代）</li><li>公司在产业链中的位置</li></ul>
        <h2>4. 产品与技术</h2>
        <ul><li>核心产品 / 服务</li><li>技术壁垒（专利 / 数据 / 算法 / 工艺）</li><li>产品迭代节奏</li></ul>
        <h2>5. 团队评估</h2>
        <ul><li>创始人核心能力 + 履历</li><li>关键岗位完整度</li><li>股权结构与激励池</li></ul>
        <h2>6. 商业化与财务</h2>
        <table><tr><th>指标</th><th>2025A</th><th>2026E</th><th>2027E</th></tr><tr><td>收入</td><td></td><td></td><td></td></tr><tr><td>毛利率</td><td></td><td></td><td></td></tr><tr><td>经营现金流</td><td></td><td></td><td></td></tr></table>
        <h2>7. 估值与交易结构</h2>
        <ul><li>本轮估值与同业对比</li><li>投资金额、股权比例、条款要点</li><li>后续融资需求与稀释测算</li></ul>
        <h2>8. 核心风险</h2>
        <ul><li>市场风险</li><li>技术风险</li><li>客户集中度 / 回款风险</li><li>治理与合规风险</li></ul>
        <h2>9. 下一步尽调清单</h2>
        <ol><li>客户合同、订单与回款核验</li><li>财务报表与收入确认政策核验</li><li>知识产权与核心人员访谈</li></ol>
      `,
    },
    {
      id: "dd-report",
      title: "尽职调查报告 (DD Report)",
      subtitle: "业务 / 财务 / 法律 / 技术 / HR 全维度",
      description: "适用于项目进入深度尽调后，对资料、访谈、风险和补充核验事项进行结构化归档。",
      html: `
        <h1>尽职调查报告：【项目名称】</h1>
        <h2>1. 尽调范围与资料清单</h2><ul><li>资料室文件清单</li><li>访谈对象与日期</li><li>尚缺资料</li></ul>
        <h2>2. 业务尽调</h2><ul><li>商业模式</li><li>客户结构</li><li>销售管线</li><li>竞争优势</li></ul>
        <h2>3. 财务尽调</h2><ul><li>收入真实性</li><li>毛利率与费用结构</li><li>现金流与应收账款</li><li>预算与实际偏差</li></ul>
        <h2>4. 法律与合规</h2><ul><li>股权结构</li><li>重大合同</li><li>诉讼仲裁</li><li>资质许可</li></ul>
        <h2>5. 技术与产品</h2><ul><li>技术路线</li><li>专利与知识产权</li><li>研发团队稳定性</li></ul>
        <h2>6. 风险矩阵</h2><table><tr><th>风险</th><th>等级</th><th>证据</th><th>缓释方案</th></tr><tr><td></td><td></td><td></td><td></td></tr></table>
      `,
    },
    {
      id: "industry-report",
      title: "行业研究报告",
      subtitle: "规模 / 驱动 / 竞争 / 布局图谱",
      description: "适用于赛道研究、专题研究和项目 sourcing 前置分析。",
      html: `
        <h1>行业研究报告：【赛道名称】</h1>
        <h2>1. 核心摘要</h2><p>用 3-5 条说明行业判断、投资机会和关键风险。</p>
        <h2>2. 市场规模与增长驱动</h2><ul><li>TAM/SAM/SOM</li><li>政策、技术、成本、需求侧驱动</li><li>渗透率和价格趋势</li></ul>
        <h2>3. 产业链拆解</h2><table><tr><th>环节</th><th>核心玩家</th><th>利润分布</th><th>投资观点</th></tr><tr><td>上游</td><td></td><td></td><td></td></tr><tr><td>中游</td><td></td><td></td><td></td></tr><tr><td>下游</td><td></td><td></td><td></td></tr></table>
        <h2>4. 竞争格局</h2><ul><li>头部公司</li><li>新进入者</li><li>替代路线</li><li>护城河判断</li></ul>
        <h2>5. 标的池与筛选标准</h2><ul><li>优先环节</li><li>核心筛选指标</li><li>可跟进标的列表</li></ul>
      `,
    },
    {
      id: "post-investment",
      title: "投后月报",
      subtitle: "KPI / 业务 / 财务 / 风险 / 规划",
      description: "适用于已投项目月度复盘，跟踪经营进展、预算偏差和风险事项。",
      html: `
        <h1>投后月报：【项目名称】</h1>
        <h2>1. 本月经营摘要</h2><ul><li>收入、毛利、现金流</li><li>客户新增与续约</li><li>产品/研发里程碑</li></ul>
        <h2>2. KPI 看板</h2><table><tr><th>指标</th><th>本月</th><th>上月</th><th>预算</th><th>偏差原因</th></tr><tr><td>收入</td><td></td><td></td><td></td><td></td></tr><tr><td>现金余额</td><td></td><td></td><td></td><td></td></tr></table>
        <h2>3. 重大事项</h2><ul><li>融资进展</li><li>关键客户</li><li>组织变化</li></ul>
        <h2>4. 风险与支持需求</h2><ul><li>现金流风险</li><li>客户集中度</li><li>需要投资方协助事项</li></ul>
      `,
    },
    {
      id: "exit-analysis",
      title: "退出分析",
      subtitle: "IPO / M&A / 回购 多路径",
      description: "适用于成熟项目退出路径、估值区间和执行风险评估。",
      html: `
        <h1>退出分析：【项目名称】</h1>
        <h2>1. 当前持仓与回报测算</h2><ul><li>投资成本</li><li>持股比例</li><li>账面估值</li><li>MOIC / IRR</li></ul>
        <h2>2. 退出路径比较</h2><table><tr><th>路径</th><th>时间窗口</th><th>估值方法</th><th>关键障碍</th></tr><tr><td>IPO</td><td></td><td></td><td></td></tr><tr><td>M&A</td><td></td><td></td><td></td></tr><tr><td>股权转让/回购</td><td></td><td></td><td></td></tr></table>
        <h2>3. 潜在买方/承接方</h2><ul><li>产业买方</li><li>财务投资人</li><li>管理层/原股东</li></ul>
        <h2>4. 建议动作</h2><ol><li>更新财务预测和估值底稿</li><li>建立买方清单</li><li>准备信息备忘录</li></ol>
      `,
    },
  ],
  XLSX: [
    {
      id: "dcf",
      title: "DCF 估值",
      subtitle: "5 年显性 + 终值",
      description: "包含收入预测、自由现金流、WACC、终值和敏感性分析。",
      html: `
        <h1>DCF 估值模型</h1>
        <table><tr><th>项目</th><th>2025A</th><th>2026E</th><th>2027E</th><th>2028E</th><th>2029E</th></tr><tr><td>收入</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>收入增长率</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>EBITDA Margin</td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>自由现金流</td><td></td><td></td><td></td><td></td><td></td></tr></table>
        <h2>估值假设</h2>
        <table><tr><th>WACC</th><td>12.0%</td></tr><tr><th>永续增长率</th><td>3.0%</td></tr><tr><th>终值倍数</th><td>12.0x EBITDA</td></tr><tr><th>净现金/债务</th><td>填写</td></tr></table>
        <h2>敏感性分析</h2>
        <table><tr><th>WACC / g</th><th>2.0%</th><th>3.0%</th><th>4.0%</th></tr><tr><td>11%</td><td></td><td></td><td></td></tr><tr><td>12%</td><td></td><td></td><td></td></tr><tr><td>13%</td><td></td><td></td><td></td></tr></table>
      `,
    },
    {
      id: "three-statements",
      title: "三表模型",
      subtitle: "利润 / 资产 / 现金流",
      description: "适用于投前财务预测、预算偏差分析和投后经营跟踪。",
      html: `
        <h1>三表财务模型</h1>
        <table><tr><th>利润表</th><th>2025A</th><th>2026E</th><th>2027E</th></tr><tr><td>收入</td><td></td><td></td><td></td></tr><tr><td>毛利</td><td></td><td></td><td></td></tr><tr><td>EBITDA</td><td></td><td></td><td></td></tr><tr><td>净利润</td><td></td><td></td><td></td></tr></table>
        <table><tr><th>资产负债表</th><th>2025A</th><th>2026E</th><th>2027E</th></tr><tr><td>现金</td><td></td><td></td><td></td></tr><tr><td>应收账款</td><td></td><td></td><td></td></tr><tr><td>存货</td><td></td><td></td><td></td></tr></table>
        <table><tr><th>现金流量表</th><th>2025A</th><th>2026E</th><th>2027E</th></tr><tr><td>经营现金流</td><td></td><td></td><td></td></tr><tr><td>资本开支</td><td></td><td></td><td></td></tr><tr><td>自由现金流</td><td></td><td></td><td></td></tr></table>
      `,
    },
    {
      id: "sensitivity",
      title: "敏感性分析",
      subtitle: "WACC × g 矩阵",
      description: "用于估值区间、关键假设变化和投委会压力测试。",
      html: `
        <h1>敏感性分析</h1>
        <table><tr><th>变量</th><th>低情景</th><th>基准情景</th><th>高情景</th></tr><tr><td>收入增长</td><td></td><td></td><td></td></tr><tr><td>毛利率</td><td></td><td></td><td></td></tr><tr><td>WACC</td><td></td><td></td><td></td></tr><tr><td>退出倍数</td><td></td><td></td><td></td></tr></table>
        <h2>估值矩阵</h2><table><tr><th>WACC / 终值增长</th><th>2%</th><th>3%</th><th>4%</th></tr><tr><td>11%</td><td></td><td></td><td></td></tr><tr><td>12%</td><td></td><td></td><td></td></tr><tr><td>13%</td><td></td><td></td><td></td></tr></table>
      `,
    },
    {
      id: "comps",
      title: "可比公司",
      subtitle: "EV/Rev · EV/EBITDA · P/E",
      description: "用于公开市场可比公司估值、同行对标和估值区间判断。",
      html: `
        <h1>可比公司估值</h1>
        <table><tr><th>公司</th><th>市值</th><th>收入</th><th>EBITDA</th><th>EV/Rev</th><th>EV/EBITDA</th><th>P/E</th></tr><tr><td>可比公司 A</td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>可比公司 B</td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>目标公司</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>
        <h2>估值结论</h2><ul><li>低位估值：</li><li>中位估值：</li><li>高位估值：</li></ul>
      `,
    },
    {
      id: "cap-table",
      title: "Cap Table",
      subtitle: "股权 / 轮次 / 估值",
      description: "用于投资前后股权结构、期权池和稀释测算。",
      html: `
        <h1>Cap Table</h1>
        <table><tr><th>股东</th><th>投资前股数</th><th>投资前比例</th><th>本轮新增</th><th>投资后比例</th></tr><tr><td>创始团队</td><td></td><td></td><td></td><td></td></tr><tr><td>员工期权池</td><td></td><td></td><td></td><td></td></tr><tr><td>老股东</td><td></td><td></td><td></td><td></td></tr><tr><td>本轮投资人</td><td></td><td></td><td></td><td></td></tr></table>
      `,
    },
  ],
  PPTX: [
    {
      id: "ic-deck",
      title: "投决会 PPT",
      subtitle: "项目摘要 + 估值 + 风险 + 投决建议",
      description: "面向投委会，强调结论、证据、估值和关键风险。",
      html: `
        <h1>投决会 PPT：【项目名称】</h1>
        <h2>Slide 1 · 投资结论</h2><ul><li>一句话结论</li><li>投资金额 / 估值 / 占股</li><li>建议：通过 / 有条件通过 / 暂缓</li></ul>
        <h2>Slide 2 · 公司与产品</h2><ul><li>公司定位</li><li>核心产品</li><li>客户与收入来源</li></ul>
        <h2>Slide 3 · 市场机会</h2><ul><li>市场规模</li><li>增长驱动</li><li>产业链位置</li></ul>
        <h2>Slide 4 · 商业化与财务</h2><ul><li>收入与订单</li><li>毛利率</li><li>现金流</li></ul>
        <h2>Slide 5 · 估值与交易结构</h2><ul><li>估值方法</li><li>可比公司</li><li>条款要点</li></ul>
        <h2>Slide 6 · 风险与缓释</h2><ul><li>核心风险</li><li>补充尽调</li><li>投后支持</li></ul>
      `,
    },
    {
      id: "industry-deck",
      title: "行业分析 PPT",
      subtitle: "行业概况 + 驱动 + 竞争 + 投资机会",
      description: "适用于赛道汇报、专题研究和内部策略会。",
      html: `
        <h1>行业分析 PPT：【赛道名称】</h1>
        <h2>Slide 1 · 核心结论</h2><ul><li>行业阶段</li><li>投资机会</li><li>关键风险</li></ul>
        <h2>Slide 2 · 市场规模与增长</h2><ul><li>TAM/SAM/SOM</li><li>渗透率曲线</li><li>价格趋势</li></ul>
        <h2>Slide 3 · 产业链地图</h2><ul><li>上游</li><li>中游</li><li>下游</li><li>利润分布</li></ul>
        <h2>Slide 4 · 竞争格局</h2><ul><li>头部玩家</li><li>新进入者</li><li>替代路线</li></ul>
        <h2>Slide 5 · 投资地图</h2><ul><li>优先环节</li><li>标的池</li><li>筛选标准</li></ul>
      `,
    },
    {
      id: "roadshow",
      title: "路演 PPT",
      subtitle: "项目亮点 + 数据 + 团队 + 资金需求",
      description: "适用于被投企业融资材料诊断和对外路演版本搭建。",
      html: `
        <h1>路演 PPT：【公司名】</h1>
        <h2>Slide 1 · 公司使命</h2><p>一句话说明公司为什么存在。</p>
        <h2>Slide 2 · 痛点与解决方案</h2><ul><li>客户痛点</li><li>现有方案不足</li><li>公司方案优势</li></ul>
        <h2>Slide 3 · 产品与技术</h2><ul><li>产品形态</li><li>技术壁垒</li><li>产品路线图</li></ul>
        <h2>Slide 4 · 市场与商业模式</h2><ul><li>市场规模</li><li>定价模式</li><li>渠道策略</li></ul>
        <h2>Slide 5 · 牵引力与客户</h2><ul><li>收入</li><li>客户案例</li><li>复购/留存</li></ul>
        <h2>Slide 6 · 团队与融资计划</h2><ul><li>核心团队</li><li>融资金额</li><li>资金用途</li></ul>
      `,
    },
    {
      id: "post-deck",
      title: "投后月报 PPT",
      subtitle: "KPI 仪表板 + 业务进展 + 风险",
      description: "适用于投后例会和月度经营复盘。",
      html: `
        <h1>投后月报 PPT：【项目名称】</h1>
        <h2>Slide 1 · 本月摘要</h2><ul><li>经营亮点</li><li>核心风险</li><li>需要投资方支持</li></ul>
        <h2>Slide 2 · KPI 仪表板</h2><ul><li>收入</li><li>毛利率</li><li>现金余额</li><li>客户数量</li></ul>
        <h2>Slide 3 · 业务进展</h2><ul><li>客户</li><li>产品</li><li>渠道</li></ul>
        <h2>Slide 4 · 财务与预算偏差</h2><ul><li>预算 vs 实际</li><li>费用变化</li><li>现金流预测</li></ul>
        <h2>Slide 5 · 风险与下月计划</h2><ul><li>风险事项</li><li>缓释动作</li><li>下月目标</li></ul>
      `,
    },
  ],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const icons = {
  message: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 14 0"/><path d="m17 11 4 4"/><circle cx="16" cy="10" r="3"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>',
  report: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  memory: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.8 2.9 8.1 7 10 4.1-1.9 7-5.2 7-10V6l-7-3Z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 3h9v10H3z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  database: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8"/><path d="M8 21v-7h8v7"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
  filter: '<svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7v5l-4 2v-7z"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 7V4h3"/><path d="M17 4h3v3"/><path d="M20 17v3h-3"/><path d="M7 20H4v-3"/><path d="M7 12h10"/></svg>',
  empty: '<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4z"/><path d="M8 7l2-3h4l2 3"/><path d="M9 14h6"/></svg>',
};

function boot() {
  if (redirectFileLaunchToServer()) return;
  renderIcons();
  bindNavigation();
  bindLayoutControls();
  bindJobCenter();
  bindAsk();
  bindResearch();
  bindPeople();
  bindSourcing();
  bindReports();
  bindTasks();
  bindMemory();
  bindBoard();
  bindFavorites();
  bindSettings();
  bindProjects();
  bindHistory();
  bindGlobalActions();
  renderAll();
  renderChat();
  updateEvaVisibility();
  checkModelHealth();
  window.setTimeout(checkDueTasks, 60000);
  window.setInterval(checkDueTasks, 60000);
}

// Mobile browsers occasionally lose a direct click binding after restoring an
// older PWA page from memory. Delegation keeps the primary navigation usable.
document.addEventListener("click", (event) => {
  const navButton = event.target.closest(".nav-item[data-view]");
  if (navButton) switchView(navButton.dataset.view);
});

function redirectFileLaunchToServer() {
  if (location.protocol !== "file:") return false;
  document.body.innerHTML = `<main class="launch-redirect"><strong>正在打开已连接大模型的投研 Agent...</strong><p>正确入口：http://127.0.0.1:8787</p></main>`;
  window.setTimeout(() => location.replace("http://127.0.0.1:8787"), 150);
  return true;
}

function bindJobCenter() {
  $("#minimizeJobCenterBtn").addEventListener("click", () => {
    jobCenterMinimized = true;
    renderJobCenter();
  });
  $("#jobCenterLauncher").addEventListener("click", () => {
    if (jobLauncherWasDragged) return;
    jobCenterMinimized = false;
    renderJobCenter();
  });
  $("#clearJobHistoryBtn").addEventListener("click", () => {
    completedAgentJobs = [];
    localStorage.removeItem(JOB_HISTORY_KEY);
    renderJobCenter();
    toast("任务历史已清空。");
  });
  $("#jobCenterList").addEventListener("click", (event) => {
    const item = event.target.closest("[data-job-id]");
    if (!item) return;
    const job = activeAgentJobs.get(item.dataset.jobId) || completedAgentJobs.find((row) => row.id === item.dataset.jobId);
    if (job) openJobTarget(job);
  });
  window.setInterval(() => {
    if (activeAgentJobs.size) renderJobCenter();
  }, 1000);
  const launcher = $("#jobCenterLauncher");
  let launcherDrag = null;
  const savedPosition = JSON.parse(localStorage.getItem("times-electric-job-launcher-position") || "null");
  if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
    launcher.style.left = `${savedPosition.left}px`;
    launcher.style.top = `${savedPosition.top}px`;
    launcher.style.right = "auto";
  }
  launcher.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    launcherDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    launcher.style.left = `${rect.left}px`;
    launcher.style.top = `${rect.top}px`;
    launcher.style.right = "auto";
    launcher.setPointerCapture(event.pointerId);
  });
  launcher.addEventListener("pointermove", (event) => {
    if (!launcherDrag || launcherDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - launcherDrag.x;
    const dy = event.clientY - launcherDrag.y;
    if (Math.hypot(dx, dy) > 4) launcherDrag.moved = true;
    const maxLeft = Math.max(8, window.innerWidth - launcher.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - launcher.offsetHeight - 8);
    launcher.style.left = `${Math.min(maxLeft, Math.max(8, launcherDrag.left + dx))}px`;
    launcher.style.top = `${Math.min(maxTop, Math.max(8, launcherDrag.top + dy))}px`;
  });
  const stopLauncherDrag = (event) => {
    if (!launcherDrag || launcherDrag.pointerId !== event.pointerId) return;
    if (launcherDrag.moved) {
      jobLauncherWasDragged = true;
      localStorage.setItem("times-electric-job-launcher-position", JSON.stringify({ left: launcher.offsetLeft, top: launcher.offsetTop }));
      window.setTimeout(() => { jobLauncherWasDragged = false; }, 0);
    }
    launcherDrag = null;
  };
  launcher.addEventListener("pointerup", stopLauncherDrag);
  launcher.addEventListener("pointercancel", stopLauncherDrag);
  renderJobCenter();
}

function loadJobHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(JOB_HISTORY_KEY) || "[]");
    return Array.isArray(rows) ? rows.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function saveJobHistory() {
  localStorage.setItem(JOB_HISTORY_KEY, JSON.stringify(completedAgentJobs.slice(0, 30)));
}

function getJobLabel(context = {}) {
  const labels = {
    "research-report": "生成投研报告",
    "target-screening": "标的搜集 · 最多100条",
    "target-search-planning": "规划标的检索词",
    "skill-generation": "生成智能体 Skill",
    "people-research": "联网人物调查",
    "scheduled-research": context.taskName ? `执行：${context.taskName}` : "执行定时任务",
    "bp-analysis": context.projectName ? `分析 BP：${context.projectName}` : "分析 BP",
    "due-diligence": context.project ? `生成尽调：${context.project}` : "生成尽调产物",
    "connection-test": "测试模型连接",
  };
  return labels[context.taskType] || "奔奔正在处理任务";
}

function getJobTarget(context = {}) {
  const views = {
    "research-report": "research",
    "target-screening": "sourcing",
    "skill-generation": "memory",
    "people-research": "people",
    "scheduled-research": "tasks",
    "bp-analysis": "bpAnalysis",
    "due-diligence": "projectDetail",
    "connection-test": "settings",
  };
  return { view: views[context.taskType] || currentView, targetId: context.taskId || "", targetName: context.project || context.projectName || context.taskName || "" };
}

function openJobTarget(job) {
  const label = String(job.label || "");
  const inferredView = /标的搜集|筛选候选/.test(label) ? "sourcing"
    : /投研报告/.test(label) ? "research"
      : /Skill|技能/.test(label) ? "memory"
        : /执行：|定时任务/.test(label) ? "tasks"
          : /BP/.test(label) ? "bpAnalysis"
            : /尽调/.test(label) ? "projectDetail"
              : /模型连接/.test(label) ? "settings" : "tasks";
  const targetView = job.view && document.querySelector(`#${job.view}View`) ? job.view : inferredView;
  const inferredName = job.targetName || (label.includes("：") ? label.split("：").slice(1).join("：").trim() : "");
  jobCenterMinimized = true;
  renderJobCenter();
  if (targetView === "sourcing" && job.targetId) {
    const screening = state.screenings.find((item) => item.id === job.targetId);
    if (screening) {
      state.currentScreeningResults = screening.results || [];
      saveState();
      renderCompanies();
    }
  }
  if (targetView === "research" && job.targetId) {
    const record = state.researchRecords.find((item) => item.id === job.targetId);
    if (record) {
      currentReport = record.report;
      $("#industryInput").value = record.industry || "";
      $("#deliverableInput").value = record.deliverable || "行业研究报告";
      $("#depthInput").value = record.depth || "标准研究";
      $("#focusInput").value = record.focus || "";
      $("#researchPromptInput").value = record.requirement || "";
      renderResearchOutput(currentReport);
    }
  }
  if (targetView === "projectDetail" && inferredName) {
    const project = state.projects.find((item) => item.name === inferredName);
    if (project) return openProjectDetail(project.id);
  }
  switchView(targetView === "projectDetail" ? "projects" : targetView);
  if (targetView === "tasks") {
    window.setTimeout(() => {
      const task = state.tasks.find((item) => item.id === job.targetId || item.name === inferredName);
      const target = task ? document.querySelector(`[data-task-card-id="${CSS.escape(task.id)}"]`) : null;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.classList.add("job-target-highlight");
      window.setTimeout(() => target?.classList.remove("job-target-highlight"), 1800);
    }, 50);
  }
}

function startAgentJob(context) {
  const id = makeId();
  activeAgentJobs.set(id, { id, label: getJobLabel(context), ...getJobTarget(context), status: "running", startedAt: Date.now() });
  renderJobCenter();
  return id;
}

function finishAgentJob(id, status, detail = "") {
  const job = activeAgentJobs.get(id);
  if (!job) return;
  Object.assign(job, { status, detail, finishedAt: Date.now() });
  completedAgentJobs = [{ ...job }, ...completedAgentJobs.filter((item) => item.id !== id)].slice(0, 30);
  saveJobHistory();
  renderJobCenter();
  window.setTimeout(() => {
    activeAgentJobs.delete(id);
    renderJobCenter();
  }, status === "success" ? 6000 : 12000);
}

function renderJobCenter() {
  const activeJobs = [...activeAgentJobs.values()];
  const activeIds = new Set(activeJobs.map((job) => job.id));
  const jobs = [...activeJobs, ...completedAgentJobs.filter((job) => !activeIds.has(job.id))];
  const running = activeJobs.filter((job) => job.status === "running");
  $("#jobCenter").hidden = jobCenterMinimized;
  $("#jobCenterLauncher").hidden = !jobCenterMinimized || jobs.length === 0;
  $("#jobCenterSummary").textContent = running.length ? `${running.length} 个任务正在执行` : "任务已完成";
  $("#jobLauncherText").textContent = running.length ? `${running.length} 个任务执行中` : `任务记录 ${completedAgentJobs.length}`;
  $(".job-spinner").hidden = running.length === 0;
  $("#jobCenterList").innerHTML = jobs.map((job) => {
    const elapsed = Math.max(0, Date.now() - job.startedAt);
    const progress = job.status === "running" ? Math.min(90, 10 + Math.floor(elapsed / 1800)) : 100;
    const statusText = job.status === "running" ? `处理中 · ${Math.floor(elapsed / 1000)} 秒` : job.status === "success" ? "已完成" : "执行失败";
    const time = job.finishedAt || job.startedAt;
    return `<article class="job-progress-item ${job.status}" data-job-id="${job.id}" title="打开对应任务"><div><strong>${escapeHtml(job.label)}</strong><span>${statusText}</span></div><div class="job-progress-track"><i style="width:${progress}%"></i></div>${job.detail ? `<p>${escapeHtml(job.detail)}</p>` : ""}<small>${formatDate(new Date(time).toISOString())}</small></article>`;
  }).join("") || '<p class="sidebar-empty-light">暂无任务记录</p>';
}

async function checkModelHealth() {
  try {
    const health = await getModelHealth();
    if (!health?.configured) throw new Error("模型未配置");
    const selected = health.profiles?.find((item) => item.id === selectedModelProfileId);
    setModelStatus(`当前模型 · ${selected?.name || "默认模型"}`);
  } catch {
    setModelStatus("本地智能回复");
  }
}

async function getModelHealth() {
  const response = await fetch(apiUrl("/api/health"), { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-view-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewJump)));
  $("#newResearchBtn").addEventListener("click", () => switchView("research"));
}

function bindLayoutControls() {
  const shell = $(".app-shell");
  const toggle = $("#sidebarToggleBtn");
  $$(".nav-item").forEach((item) => { item.title = item.querySelector("span:last-child")?.textContent || ""; });
  const applySidebarState = (collapsed) => {
    shell.classList.toggle("sidebar-collapsed", collapsed);
    toggle.textContent = collapsed ? "›" : "‹";
    toggle.title = collapsed ? "展开侧栏" : "收起侧栏";
    toggle.setAttribute("aria-label", toggle.title);
  };
  applySidebarState(localStorage.getItem("times-electric-sidebar-collapsed") === "1");
  toggle.addEventListener("click", () => {
    const collapsed = !shell.classList.contains("sidebar-collapsed");
    applySidebarState(collapsed);
    localStorage.setItem("times-electric-sidebar-collapsed", collapsed ? "1" : "0");
  });

  const makeDraggable = (element, handle, storageKey, onDragged) => {
    let drag = null;
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      element.style.left = `${saved.left}px`;
      element.style.top = `${saved.top}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
    }
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const pressedButton = event.target.closest("button");
      if (pressedButton && pressedButton !== element) return;
      const rect = element.getBoundingClientRect();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      const maxLeft = Math.max(8, window.innerWidth - element.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - element.offsetHeight - 8);
      element.style.left = `${Math.min(maxLeft, Math.max(8, drag.left + dx))}px`;
      element.style.top = `${Math.min(maxTop, Math.max(8, drag.top + dy))}px`;
    });
    const stopDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) {
        localStorage.setItem(storageKey, JSON.stringify({ left: element.offsetLeft, top: element.offsetTop }));
        onDragged?.();
      }
      drag = null;
    };
    handle.addEventListener("pointerup", stopDrag);
    handle.addEventListener("pointercancel", stopDrag);
  };

  makeDraggable($("#floatingEva"), $(".floating-eva-head"), "times-electric-floating-panel-position");
  makeDraggable($("#evaLauncher"), $("#evaLauncher"), "times-electric-launcher-position", () => {
    launcherWasDragged = true;
    window.setTimeout(() => { launcherWasDragged = false; }, 0);
  });
}

function switchView(view) {
  if (view === "history") view = "favorites";
  if (view === "settings" && window.matchMedia("(max-width: 820px)").matches) view = "ask";
  if (view === "sourcing" && currentView !== "sourcing" && !preserveSourcingResultOnce) {
    state.currentScreeningResults = [];
    renderCompanies();
  }
  preserveSourcingResultOnce = false;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((panel) => panel.classList.remove("active"));
  const activeView = $(`#${view}View`);
  if (!activeView) return;
  activeView.classList.add("active");
  $("#viewTitle").textContent = activeView.dataset.title;
  currentView = view;
  if (view === "settings") loadModelSettings();
  updateEvaVisibility();
  addHistory(`打开 ${activeView.dataset.title}`, "导航");
}

function bindSettings() {
  $("#saveModelSettingsBtn").addEventListener("click", saveModelSettings);
  $("#testModelSettingsBtn").addEventListener("click", testModelSettings);
  $("#settingsProfileSelect").addEventListener("change", () => {
    const profileId = $("#settingsProfileSelect").value;
    if (!profileId) return loadModelProfile(profileId);
    $("#askModelSelect").value = profileId;
    syncAskModelSelection();
  });
  $("#newModelProfileBtn").addEventListener("click", () => {
    $("#settingsProfileSelect").value = "";
    $("#settingsProfileName").value = "";
    $("#settingsModel").value = "";
    $("#settingsApiKey").value = "";
    $("#settingsModelStatus").textContent = "新模型配置";
  });
  $("#deleteModelProfileBtn").addEventListener("click", deleteCurrentModelProfile);
  const askModelSelect = $("#askModelSelect");
  ["input", "change"].forEach((eventName) => askModelSelect.addEventListener(eventName, syncAskModelSelection));
  loadModelSettings();
}

let availableModelProfiles = [];
let cloudManagedSettings = true;

function syncAskModelSelection() {
  const select = $("#askModelSelect");
  const nextId = select?.value || "";
  if (!nextId) return selectedModelProfileId;
  const changed = nextId !== selectedModelProfileId;
  selectedModelProfileId = nextId;
  localStorage.setItem("times-electric-selected-model", nextId);
  const settingsSelect = $("#settingsProfileSelect");
  if (settingsSelect && settingsSelect.value !== nextId) settingsSelect.value = nextId;
  if (availableModelProfiles.length) loadModelProfile(nextId);
  const option = select.selectedOptions?.[0];
  setModelStatus(`当前模型 · ${option?.textContent || "未知模型"}`);
  if (changed) toast(`已切换到 ${option?.textContent || "所选模型"}。`);
  return nextId;
}

function currentAskModelProfileId() {
  return syncAskModelSelection() || selectedModelProfileId;
}

function loadModelProfile(profileId) {
  const profile = availableModelProfiles.find((item) => item.id === profileId);
  if (!profile) return;
  $("#settingsProfileName").value = profile.name || "";
  $("#settingsMode").value = profile.mode;
  $("#settingsApiUrl").value = profile.apiUrl;
  $("#settingsModel").value = profile.model;
  $("#settingsApiKey").value = "";
  const ready = Boolean(profile.keyConfigured && profile.model);
  $("#settingsApiKey").placeholder = profile.keyConfigured ? `云端已配置 ${profile.maskedKey}` : "未配置 API Key";
  $("#settingsModelStatus").textContent = ready ? `已连接 · ${profile.name || "未命名配置"}` : profile.keyConfigured ? "待配置模型 ID" : "待配置 Key";
}

async function loadModelSettings() {
  try {
    const response = await fetch(apiUrl("/api/settings"), { cache: "no-store" });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || "读取配置失败");
    cloudManagedSettings = Boolean(settings.cloudManaged);
    availableModelProfiles = settings.profiles || [settings];
    const options = availableModelProfiles.map((profile) => `<option value="${profile.id}">${escapeHtml(profile.name || "未命名配置")}</option>`).join("");
    $("#settingsProfileSelect").innerHTML = `<option value="">新增模型...</option>${options}`;
    $("#askModelSelect").innerHTML = options;
    const activeId = selectedModelProfileId && availableModelProfiles.some((item) => item.id === selectedModelProfileId) ? selectedModelProfileId : settings.activeProfileId || availableModelProfiles[0]?.id;
    selectedModelProfileId = activeId || "";
    localStorage.setItem("times-electric-selected-model", selectedModelProfileId);
    $("#settingsProfileSelect").value = activeId;
    $("#askModelSelect").value = selectedModelProfileId;
    loadModelProfile(activeId);
    if (cloudManagedSettings) {
      ["#settingsProfileName", "#settingsMode", "#settingsApiUrl", "#settingsModel", "#settingsApiKey", "#newModelProfileBtn", "#deleteModelProfileBtn", "#saveModelSettingsBtn"].forEach((selector) => { const element = $(selector); if (element) element.disabled = true; });
      $("#saveModelSettingsBtn").textContent = "云端统一管理";
    }
  } catch (error) {
    $("#settingsModelStatus").textContent = "读取失败";
  }
}

async function saveModelSettings() {
  const button = $("#saveModelSettingsBtn");
  button.disabled = true;
  try {
    const response = await fetch(apiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: $("#settingsMode").value,
        profileId: $("#settingsProfileSelect").value,
        profileName: $("#settingsProfileName").value.trim(),
        apiUrl: $("#settingsApiUrl").value.trim(),
        model: $("#settingsModel").value.trim(),
        apiKey: $("#settingsApiKey").value.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "保存失败");
    toast("模型配置已保存并立即生效。");
    await loadModelSettings();
    await checkModelHealth();
    return true;
  } catch (error) {
    toast(`保存失败：${error.message}`);
    return false;
  } finally {
    button.disabled = false;
  }
}

async function deleteCurrentModelProfile() {
  const profileId = $("#settingsProfileSelect").value;
  if (!profileId || !window.confirm("确定删除当前模型配置吗？")) return;
  const response = await fetch(apiUrl("/api/settings"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", profileId }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return toast(data.error || "删除失败");
  selectedModelProfileId = data.activeProfileId || "";
  await loadModelSettings();
  await checkModelHealth();
  toast("模型配置已删除。");
}

async function testModelSettings() {
  const button = $("#testModelSettingsBtn");
  button.disabled = true;
  button.textContent = "测试中...";
  try {
    if (!cloudManagedSettings) {
      const saved = await saveModelSettings();
      if (!saved) throw new Error("配置未保存");
    }
    const reply = await callAgentTask("仅回复：连接成功", { taskType: "connection-test" });
    const health = await getModelHealth();
    const profile = health?.profiles?.find((item) => item.id === selectedModelProfileId) || health?.profiles?.find((item) => item.id === health.activeProfileId);
    const modelName = profile?.name || $("#settingsProfileName").value.trim() || "未命名配置";
    $("#settingsModelStatus").textContent = `连接成功 · ${modelName}`;
    setModelStatus(`大模型已连接 · ${modelName}`);
    toast(reply ? "模型连接测试成功。" : "模型已响应。");
  } catch (error) {
    $("#settingsModelStatus").textContent = "连接失败";
    toast(`连接失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span data-icon="play"></span>测试连接';
    renderIcons();
  }
}

function bindAsk() {
  $$(".quick-chip").forEach((button) => {
    button.addEventListener("click", () => {
      $("#askChatInput").value = button.dataset.ask;
      sendChatMessage(button.dataset.ask);
    });
  });
  $("#askChatSendBtn").addEventListener("click", () => chatRequestInFlight ? stopChatGeneration() : sendChatFromInput("#askChatInput"));
  $("#floatingChatSendBtn").addEventListener("click", () => chatRequestInFlight ? stopChatGeneration() : sendChatFromInput("#floatingChatInput"));
  $("#askChatInput").addEventListener("keydown", handleChatEnter);
  $("#floatingChatInput").addEventListener("keydown", handleChatEnter);
  $("#newChatBtn").addEventListener("click", startNewChat);
  $("#floatingNewChatBtn").addEventListener("click", startNewChat);
  $("#exportChatBtn").addEventListener("click", exportChat);
  $("#minimizeEvaBtn").addEventListener("click", () => {
    evaMinimized = true;
    updateEvaVisibility();
  });
  $("#evaLauncher").addEventListener("click", () => {
    if (launcherWasDragged) return;
    evaMinimized = false;
    updateEvaVisibility();
  });
  $("#askChatFiles").addEventListener("change", async (event) => {
    pendingChatFiles = await readFiles(event.target.files);
    $("#askAttachmentHint").textContent = pendingChatFiles.length ? `已添加 ${pendingChatFiles.length} 个资料` : "";
  });
  $("#conversationSearch").addEventListener("input", renderConversationList);
  $("#conversationList").addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-session-id]");
    const deleteButton = event.target.closest("[data-delete-session]");
    if (deleteButton) return deleteChatSession(deleteButton.dataset.deleteSession);
    if (openButton) selectChatSession(openButton.dataset.sessionId);
  });
}

function bindResearch() {
  $$('[data-research-mode]').forEach((button) => button.addEventListener("click", () => {
    researchMode = button.dataset.researchMode;
    $$('[data-research-mode]').forEach((item) => item.classList.toggle("active", item === button));
    $("#depthInput").value = researchMode === "deep" ? "深度尽调前置" : "标准研究";
  }));
  $("#researchRecordSearch").addEventListener("input", renderResearchRecords);
  $("#researchRecordList").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-research]");
    if (deleteButton) {
      const record = state.researchRecords.find((item) => item.id === deleteButton.dataset.deleteResearch);
      if (!record || !window.confirm(`确定删除研究记录“${record.title}”吗？`)) return;
      state.researchRecords = state.researchRecords.filter((item) => item.id !== record.id);
      saveState();
      renderResearchRecords();
      toast("研究记录已删除。");
      return;
    }
    const button = event.target.closest("[data-research-id]");
    if (!button) return;
    const record = state.researchRecords.find((item) => item.id === button.dataset.researchId);
    if (!record) return;
    currentReport = record.report;
    $("#industryInput").value = record.industry || "";
    $("#deliverableInput").value = record.deliverable || "行业研究报告";
    $("#depthInput").value = record.depth || "标准研究";
    $("#focusInput").value = record.focus || "";
    $("#researchPromptInput").value = record.requirement || "";
    renderResearchOutput(currentReport);
    toast("已打开研究记录。");
  });
  $("#researchFiles").addEventListener("change", async (event) => {
    researchDocs = await readFiles(event.target.files);
    renderFileChips(researchDocs, $("#researchFileChips"));
  });
  $("#runResearchBtn").addEventListener("click", async () => {
    const button = $("#runResearchBtn");
    button.disabled = true;
    button.textContent = "正在生成报告...";
    try {
      currentReport = await generateResearchReport();
      renderResearchOutput(currentReport);
      const record = {
        id: makeId(), title: currentReport.title, industry: currentReport.industry, deliverable: currentReport.deliverable,
        depth: currentReport.depth, focus: currentReport.focus, requirement: currentReport.requirement,
        report: currentReport, createdAt: new Date().toISOString(),
      };
      state.researchRecords.unshift(record);
      state.researchRecords = state.researchRecords.slice(0, 30);
      const researchJob = completedAgentJobs.find((job) => job.label === "生成投研报告" && !job.targetId);
      if (researchJob) {
        researchJob.targetId = record.id;
        researchJob.view = "research";
        saveJobHistory();
      }
      saveState();
      renderResearchRecords();
      addHistory(`生成 ${currentReport.title}`, "报告");
      toast("完整投研报告已生成，可保存或导出。");
    } catch (error) {
      toast(`生成失败：${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = '<span class="button-icon" data-icon="play"></span>开始研究';
      renderIcons();
    }
  });
  $("#clearResearchBtn").addEventListener("click", () => {
    researchDocs = [];
    currentReport = null;
    $("#researchFiles").value = "";
    $("#researchFileChips").innerHTML = "";
    $("#researchPromptInput").value = "";
    $("#memoOutput").innerHTML = "";
    $("#mapOutput").innerHTML = "";
    $("#actionsOutput").innerHTML = "";
    toast("研究输入已清空。");
  });
  $("#saveReportBtn").addEventListener("click", () => {
    if (!currentReport) return toast("请先生成一份研究报告。");
    saveReport(currentReport.title, "DOCX", currentReport.exportHtml, currentReport.industry, currentReport.deliverable);
    toast("报告已保存到报告中心。");
  });
  $("#exportReportBtn").addEventListener("click", () => {
    if (!currentReport) return toast("请先生成一份研究报告。");
    downloadReport({ title: currentReport.title, format: "DOCX", html: currentReport.exportHtml });
  });
  $$("[data-output-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-output-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $$(".output-tab").forEach((tab) => tab.classList.remove("active"));
      $(`#${button.dataset.outputTab}Output`).classList.add("active");
    });
  });
}

function bindPeople() {
  $$('[data-people-mode]').forEach((button) => button.addEventListener("click", () => setPeopleMode(button.dataset.peopleMode)));
  $("#peopleRecordSearch").addEventListener("input", renderPeopleRecords);
  $("#peopleRecordList").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-person-record]");
    if (deleteButton) {
      const record = state.peopleRecords.find((item) => item.id === deleteButton.dataset.deletePersonRecord);
      if (!record || !window.confirm(`确定删除人物调查记录“${record.name}”吗？`)) return;
      state.peopleRecords = state.peopleRecords.filter((item) => item.id !== record.id);
      saveState();
      renderPeopleRecords();
      toast("人物调查记录已删除。");
      return;
    }
    const button = event.target.closest("[data-person-record-id]");
    if (!button) return;
    const record = state.peopleRecords.find((item) => item.id === button.dataset.personRecordId);
    if (!record) return;
    setPeopleMode(record.mode || "person");
    $("#personDirectionInput").value = record.direction || "";
    $("#personNameInput").value = record.name || "";
    $("#personCompanyInput").value = record.company || "";
    $("#personRoleInput").value = record.role || "";
    $("#personFocusInput").value = record.focus || "";
    $("#personNotesInput").value = record.notes || "";
    currentPeopleReport = record.report;
    $("#peopleOutput").innerHTML = currentPeopleReport?.html || "";
    toast("已打开人物调查记录。");
  });
  $("#runPeopleBtn").addEventListener("click", async () => {
    const button = $("#runPeopleBtn");
    const direction = $("#personDirectionInput").value.trim();
    const name = $("#personNameInput").value.trim();
    const company = $("#personCompanyInput").value.trim();
    const role = peopleMode === "person" ? $("#personRoleInput").value.trim() : "";
    const focus = peopleMode === "person" ? $("#personFocusInput").value.trim() : "";
    if (peopleMode === "direction" && !direction) return toast("请描述要寻找的人才方向。");
    if (peopleMode === "person" && !name) return toast("请输入要调查的人物姓名。");
    button.disabled = true;
    button.textContent = peopleMode === "direction" ? "联网找人中..." : "联网调查中...";
    try {
      const query = peopleMode === "direction" ? direction : `${name} ${company} ${role}`;
      const personAliases = peopleMode === "person" ? getPersonAliases(name) : [];
      const looksLikeName = peopleMode === "direction" && /^[\u4e00-\u9fa5]{2,4}$/.test(direction);
      const plannedQueries = looksLikeName ? await planPersonQueries(direction) : [];
      const queries = looksLikeName
        ? [`"${direction}" site:edu.cn`, `"${direction}" site:gov.cn`, `"${direction}" site:org.cn`, `"${direction}" 董事长 创始人`, `"${direction}" 教授 博士 研究员`, ...plannedQueries].slice(0, 10)
        : peopleMode === "direction"
          ? [`"${direction}" 创始人 CEO 融资 -招聘`, `"${direction}" 教授 专家 课题组 论文 -招聘`, `"${direction}" 投资人 演讲 峰会 -招聘`, `"${direction}" 专利 技术负责人`, `"${direction}" site:edu.cn OR site:gov.cn`, `"${direction}" 行业协会 专家委员会`]
        : [`${name} ${company} 人物 履历 任职`, `${name} ${company} 创始人 CEO 新闻`, `${name} ${company} 访谈 演讲`, `${name} ${company} 工商 股东`, `${name} 论文 专利 学位`, `${name} ${company} 诉讼 处罚 风险`, ...personAliases.flatMap((alias) => [`${alias} ${company} biography`, `${alias} ${company} profile`])];
      const requiredPersonName = peopleMode === "person" ? name : looksLikeName ? direction : "";
      const webSources = await searchPeopleSourcesAdvanced(queries, requiredPersonName, peopleMode === "person", personAliases, query);
      const privateRssSources = await fetchRelevantPrivateRss(query, ["jiemian", "aicaijing", "ifeng_stock", "36kr", "weibo", "zhihu", "wechat", "xueqiu"], requiredPersonName);
      const sources = [...new Map([...privateRssSources, ...webSources].map((item) => [item.url, item])).values()]
        .sort((a, b) => Number(isPeopleNewsSource(b)) - Number(isPeopleNewsSource(a)))
        .slice(0, 30);
      const sourceText = `Source policy: build the main narrative and timeline from directly relevant news first. Use official profiles, academic, corporate and registry materials only as supporting evidence. Search snippets are leads, not final facts. If sources conflict, show the conflict and mark it for verification.\n\n${sources.map((item, index) => `[${index + 1}] [${isPeopleNewsSource(item) ? "NEWS" : "SUPPORT"}] ${item.title}\n${item.snippet}\n${item.url}`).join("\n\n")}`;
      const prompt = peopleMode === "direction"
        ? `你是一级市场投资机构的首席人才研究分析师。${looksLikeName ? `“${direction}”看起来是姓名：先完成同名人物消歧，严禁把不同人的经历、机构和成果合并。` : `围绕“${direction}”建立可用于投资发现的人物图谱。`}
自动执行以下深度调查要求：
1. 先解释领域结构，并按“学术权威/核心技术领军者/产业创业者与高管/投资人与产业组织者”等合理子方向分组。
2. 每位候选必须给出当前机构与角色、可核验核心成果、产业影响或投资价值；优先列出有论文、专利、产品、创业、融资或产业落地证据的人。
3. 尽量提供 12-20 位高相关候选；来源不足时宁缺毋滥，不能用常识补写。
4. 同名人物按机构分别成行；不确定身份标记“待核验”，不得将推断写成事实。
5. 结尾总结关键人才集群、值得持续跟踪的人物及调查盲区。
只能使用下方联网来源。严格返回 JSON：{"title":"标题","summary":"领域结构与检索结论","groups":[{"title":"分组名称","description":"该组在产业或学术体系中的作用","people":[{"name":"姓名","institution":"国家/机构","role":"当前角色","contribution":"核心成果、产业贡献与匹配理由","sourceIds":[1,2],"verification":"已核验/交叉核验/待核验"}]}],"notes":["关键人才集群、风险或待核验事项"]}。

联网来源：
${sourceText}`
        : `你是一级市场投资机构的资深人物尽调分析师。调查对象是自然人，不是动物、宠物、物种、产品、影视角色或其他同名实体。人物姓名：${name}；公司/机构：${company || "待核验"}；角色：${role || "待核验"}；用户关注：${focus || "履历真实性、融资历史、产业资源与潜在风险"}。
请自动执行深度人物调查，并输出专业报告：
1. 身份确认与同名消歧：说明确认依据，列出仍可能混淆的同名人物，绝不合并不同人的经历。
2. 核心结论：用一段话概括其真实身份、影响力、投资相关性和最重要风险。
3. 履历时间线：教育、任职、创业、关键职位变化；逐项标注年份、机构和[来源序号]。
4. 专业成果与产业贡献：论文、专利、产品、项目、奖项、商业化结果；区分本人贡献与所在机构成果。
5. 商业与资本关系：创办/任职企业、股东或融资关系、合作伙伴、共同投资人及可能的利益关联。
6. 人物关系网络：重要导师、合伙人、联合创始人、核心团队及产业联系，只写有来源支持的关系。
7. 公开表达与行为风格：基于访谈、演讲和公开材料归纳观点，并标明这是“基于公开材料的分析”。
8. 争议与风险核验：诉讼、处罚、履历冲突、关联交易、舆情与信息缺口；没有证据时明确写“未在本次来源中发现”，不能写“无风险”。
9. 投资判断与待核验清单：给出可信度分级、红旗事项、后续访谈对象和至少10个针对性访谈问题。
每项事实尽量用[序号]引用来源；区分“事实、来源主张、分析推断”；不得虚构，不得把搜索摘要当作最终事实。

联网来源：
${sourceText}`;
      const answer = await callAgentTask(prompt, { taskType: "people-research", peopleMode, query });
      const sourceHtml = `<h3>联网来源（新闻为主，资料为辅）</h3><ol>${sources.map((item) => `<li><strong>${isPeopleNewsSource(item) ? "新闻" : "辅助资料"}</strong> · <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a><p>${escapeHtml(item.snippet)}</p></li>`).join("")}</ol>`;
      const title = peopleMode === "direction" ? `${direction} 人才搜集` : `${company || ""}-${name}人物调查`;
      let resultHtml;
      if (peopleMode === "direction") {
        try { resultHtml = renderPeopleDiscovery(parseJsonPayload(answer), sources); } catch { resultHtml = markdownToHtml(answer); }
      } else {
        resultHtml = markdownToHtml(answer);
      }
      currentPeopleReport = { title, html: `${resultHtml}${sourceHtml}` };
      $("#peopleOutput").innerHTML = currentPeopleReport.html;
    const record = {
      id: makeId(),
      mode: peopleMode,
      direction,
      name: peopleMode === "direction" ? direction : name || "未命名人物",
      company: peopleMode === "person" ? company || "未标注公司" : "",
      role,
      focus,
      notes: $("#personNotesInput").value.trim(),
      report: currentPeopleReport,
      createdAt: new Date().toISOString(),
    };
    state.peopleRecords.unshift(record);
    state.peopleRecords = state.peopleRecords.slice(0, 30);
    saveState();
    renderPeopleRecords();
    addHistory(`生成人物调查：${currentPeopleReport.title}`, "人物调查");
      toast("联网人物调查已完成。");
    } catch (error) {
      const reason = friendlyRequestError(error);
      const failedName = peopleMode === "direction" ? direction : name;
      const failedRecord = {
        id: makeId(), mode: peopleMode, direction: peopleMode === "direction" ? direction : "",
        name: failedName || "未命名调查", company: peopleMode === "person" ? company || "未标注公司" : "",
        role: "", focus: peopleMode === "person" ? focus : "", notes: "",
        status: "failed", failureReason: reason,
        report: { title: `${failedName || "人物"}调查失败`, html: `<h2>调查未完成</h2><p><strong>失败原因：</strong>${escapeHtml(reason)}</p><p>可以缩小调查范围、补充公司/机构信息后重新执行。</p>` },
        createdAt: new Date().toISOString(),
      };
      state.peopleRecords.unshift(failedRecord);
      state.peopleRecords = state.peopleRecords.slice(0, 30);
      saveState();
      renderPeopleRecords();
      toast(`人物调查失败：${reason}`);
    } finally {
      button.disabled = false;
      button.textContent = peopleMode === "direction" ? "开始找人" : "开始调查";
    }
  });
  $("#savePeopleBtn").addEventListener("click", () => {
    if (!currentPeopleReport) return toast("请先生成一份人物调查。");
    saveReport(currentPeopleReport.title, "DOCX", currentPeopleReport.html, "人物调查", "人物调查");
    toast("人物调查已保存为报告。");
  });
}

function setPeopleMode(mode) {
  peopleMode = mode === "person" ? "person" : "direction";
  if (peopleMode === "direction") {
    $("#personNameInput").value = "";
    $("#personCompanyInput").value = "";
    $("#personRoleInput").value = "";
  } else {
    $("#personDirectionInput").value = "";
    $("#personNameInput").value = "";
    $("#personCompanyInput").value = "";
    $("#personRoleInput").value = "";
  }
  $$('[data-people-mode]').forEach((button) => button.classList.toggle("active", button.dataset.peopleMode === peopleMode));
  $("#peopleDirectionFields").hidden = peopleMode !== "direction";
  $("#peopleSpecificFields").hidden = peopleMode !== "person";
  $("#personNotesInput").hidden = peopleMode !== "person";
  $("#runPeopleBtn").textContent = peopleMode === "direction" ? "开始找人" : "开始调查";
}

async function planPersonQueries(name) {
  const prompt = `你是人物检索规划助手。用户只输入了中文姓名“${name}”。请生成 6 条用于公开网页检索同名人物的精确查询词，覆盖企业负责人、投资人、高校教授、科研人员和公众人物。查询词必须包含完整姓名，并尽量加入可能的机构、职务或专业方向。这里只生成检索假设，不把身份当作事实。严格返回 JSON 数组，例如：["${name} 某机构 董事长","${name} 某大学 教授"]。`;
  try {
    const answer = await callAgentTask(prompt, { taskType: "people-research", peopleMode: "query-planning" });
    const parsed = parseJsonPayload(answer);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.includes(name)).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function getPersonAliases(name) {
  const aliases = {
    "马斯克": ["Elon Musk", "埃隆·马斯克", "埃隆马斯克"],
    "贝索斯": ["Jeff Bezos", "杰夫·贝索斯"],
    "比尔盖茨": ["Bill Gates", "比尔·盖茨"],
    "黄仁勋": ["Jensen Huang"],
    "扎克伯格": ["Mark Zuckerberg", "马克·扎克伯格"],
  };
  return aliases[String(name || "").replace(/[·\s]/g, "")] || [];
}

function buildPeopleTopicTerms(topic) {
  const value = String(topic || "").trim().toLowerCase();
  const cleaned = value
    .replace(/[“”"'（）()]/g, " ")
    .replace(/技术专家|行业专家|产业专家|专家人物|人物图谱|核心人才|领军人才|寻找|搜索|调研|方向|领域|产业|行业/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = [cleaned, ...cleaned.split(/\s+/)].filter((item) => item.length >= 2);
  const aliases = {
    光伏: ["光伏", "太阳能", "solar", "photovoltaic", "pv"],
    半导体: ["半导体", "芯片", "semiconductor", "chip"],
    人工智能: ["人工智能", "ai", "machine learning"],
    机器人: ["机器人", "robot", "robotics"],
    新能源: ["新能源", "new energy", "clean energy"],
    电池: ["电池", "battery"],
  };
  Object.entries(aliases).forEach(([key, values]) => {
    if (value.includes(key)) terms.push(...values);
  });
  return [...new Set(terms.map((item) => item.toLowerCase()).filter(Boolean))];
}

function peopleSourceRelevance(item, topicTerms, requiredName = "") {
  const text = `${item.title || ""} ${item.snippet || ""} ${item.url || ""}`.toLowerCase();
  if (requiredName && !text.includes(requiredName.toLowerCase())) return 0;
  const matched = topicTerms.filter((term) => text.includes(term));
  const professional = /教授|研究员|院士|博士|创始人|董事长|总经理|首席|专家|学者|实验室|研究院|大学|协会|专利|论文|professor|researcher|founder|scientist|engineer/.test(text);
  const noise = /dance|tiktok|youtube|娱乐|舞蹈|游戏|招聘|课程广告|购物/.test(text);
  return (matched.length * 3) + (professional ? 2 : 0) - (noise ? 8 : 0);
}

function isPeopleNewsSource(item) {
  const text = `${item?.sourceType || ""} ${item?.title || ""} ${item?.url || ""}`.toLowerCase();
  return /rsshub|news|36kr|jiemian|weibo|wechat|xueqiu|zhihu|ifeng|sina|qq\.com|163\.com|thepaper|caixin|eastmoney/.test(text);
}

async function fetchRelevantPrivateRss(query, routes, requiredExact = "") {
  const routeList = Array.isArray(routes) ? routes.filter(Boolean).join(",") : "";
  const response = await fetch(apiUrl(`/api/rss/bundle?routes=${encodeURIComponent(routeList)}`), { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return [];
  const data = await response.json().catch(() => ({}));
  const terms = buildPeopleTopicTerms(query);
  const exact = String(requiredExact || "").trim().toLowerCase();
  return (Array.isArray(data.items) ? data.items : [])
    .map((item) => {
      const text = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
      const matchedTerms = terms.filter((term) => text.includes(term));
      const exactMatch = exact && text.includes(exact);
      return {
        title: item.title,
        url: item.url,
        snippet: item.snippet || "",
        publishedAt: item.publishedAt || "",
        sourceType: `RSSHub/${item.sourceName || "feed"}`,
        relevance: (exactMatch ? 10 : 0) + matchedTerms.length * 3,
      };
    })
    .filter((item) => item.url && item.title && item.relevance >= (exact ? 10 : 3))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 20)
    .map(({ relevance, ...item }) => item);
}

async function searchPeopleSources(queries, requiredName = "", personOnly = false, aliases = []) {
  const responses = await Promise.allSettled(queries.map(async (query) => {
    const response = await fetch(apiUrl(`/api/web-search?q=${encodeURIComponent(query)}`), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "联网搜索失败");
    return data.results || [];
  }));
  const rows = responses.filter((item) => item.status === "fulfilled").flatMap((item) => item.value);
  let unique = [...new Map(rows.map((item) => [item.url, item])).values()];
  if (requiredName) {
    const identityTerms = [requiredName, ...aliases].filter(Boolean);
    unique = unique.filter((item) => identityTerms.some((term) => `${item.title} ${item.snippet}`.toLowerCase().includes(term.toLowerCase())));
  }
  if (personOnly) {
    const excluded = /动物|宠物|犬|猫|物种|饲养|兽医|影视角色|游戏角色|动漫角色|小说人物/;
    const humanSignals = /公司|集团|大学|学院|研究院|教授|博士|研究员|院士|董事|总经理|创始人|投资人|任职|履历|简历|访谈|演讲|先生|女士|法定代表人/;
    unique = unique.filter((item) => {
      const text = `${item.title} ${item.snippet}`;
      return !excluded.test(text) && (humanSignals.test(text) || text.includes(requiredName));
    });
  }
  unique = unique.slice(0, 24);
  if (!unique.length) throw new Error("联网搜索没有找到可用来源，请调整关键词");
  return unique;
}

async function searchPeopleSourcesAdvanced(queries, requiredName = "", personOnly = false, aliases = [], topic = "") {
  const academicRequest = fetch(apiUrl(`/api/academic-search?q=${encodeURIComponent(topic || requiredName || queries[0] || "")}`), { cache: "no-store" })
    .then(async (response) => response.ok ? (await response.json()).results || [] : [])
    .catch(() => []);
  const responses = await Promise.allSettled(queries.map(async (query) => {
    const response = await fetch(apiUrl(`/api/web-search?q=${encodeURIComponent(query)}`), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "联网搜索失败");
    return data.results || [];
  }));
  const academicRows = await academicRequest;
  const rows = [...academicRows, ...responses.filter((item) => item.status === "fulfilled").flatMap((item) => item.value)];
  let unique = [...new Map(rows.map((item) => [item.url, item])).values()];
  const topicTerms = buildPeopleTopicTerms(topic || requiredName);
  if (requiredName) {
    const identityTerms = [requiredName, ...aliases].filter(Boolean);
    const exact = unique.filter((item) => identityTerms.some((term) => `${item.title} ${item.snippet}`.toLowerCase().includes(term.toLowerCase())));
    unique = exact;
  }
  if (personOnly) {
    const excluded = /动物|宠物|犬|猫|物种|饲养|兽医|影视角色|游戏角色|动漫角色|小说人物/;
    const humanSignals = /公司|集团|大学|学院|研究院|教授|博士|研究员|院士|董事|总经理|创始人|投资人|任职|履历|简历|访谈|演讲|先生|女士|法定代表人/;
    unique = unique.filter((item) => {
      const text = `${item.title} ${item.snippet}`;
      return !excluded.test(text) && (humanSignals.test(text) || text.includes(requiredName));
    });
  }
  unique = unique
    .map((item) => ({ ...item, relevance: peopleSourceRelevance(item, topicTerms) }))
    .filter((item) => item.relevance >= 3)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 24)
    .map(({ relevance, ...item }) => item);
  if (unique.length < 3) throw new Error("联网搜索没有找到至少 3 条与目标领域直接相关的可靠来源，已停止生成空报告。请补充更具体的技术方向、机构或人物名称");
  return unique;
}

function renderPeopleDiscovery(data, sources) {
  const groups = (Array.isArray(data?.groups) ? data.groups : [])
    .map((group) => ({ ...group, people: (Array.isArray(group.people) ? group.people : []).filter((person) => person?.name && Array.isArray(person.sourceIds) && person.sourceIds.some((id) => sources[Number(id) - 1])) }))
    .filter((group) => group.people.length);
  const peopleCount = groups.reduce((total, group) => total + group.people.length, 0);
  if (!peopleCount) throw new Error("模型没有返回任何带有效来源编号的人物，已停止生成空报告");
  const groupHtml = groups.map((group) => {
    const people = Array.isArray(group.people) ? group.people : [];
    const rows = people.map((person) => {
      const sourceLinks = (person.sourceIds || []).map((id) => {
        const source = sources[Number(id) - 1];
        return source ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">[${Number(id)}]</a>` : "";
      }).join(" ");
      return `<tr><td><strong>${escapeHtml(person.name || "待核验")}</strong></td><td>${escapeHtml(person.institution || "待核验")}<br><small>${escapeHtml(person.role || "")}</small></td><td>${escapeHtml(person.contribution || "待核验")} ${sourceLinks}</td><td><span class="verification-badge">${escapeHtml(person.verification || "待核验")}</span></td></tr>`;
    }).join("");
    return `<section class="people-discovery-group"><h3>${escapeHtml(group.title || "人物分组")}</h3><p>${escapeHtml(group.description || "")}</p><div class="table-scroll"><table class="people-discovery-table"><thead><tr><th>姓名</th><th>国家/机构与角色</th><th>核心贡献</th><th>核验</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂无有来源支持的人物</td></tr>'}</tbody></table></div></section>`;
  }).join("");
  const notes = Array.isArray(data?.notes) ? `<h3>待核验事项</h3><ul>${data.notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  return `<h2>${escapeHtml(data?.title || "人物图谱与综述")}</h2><p>${escapeHtml(data?.summary || "")}</p>${groupHtml}${notes}`;
}

function bindSourcing() {
  const open = () => { $("#screeningModal").hidden = false; $("#nlSearchInput").focus(); };
  const close = () => { $("#screeningModal").hidden = true; };
  $("#openScreeningModalBtn").addEventListener("click", open);
  $("#sidebarNewScreeningBtn").addEventListener("click", open);
  $("#newScreeningBtn").addEventListener("click", open);
  $("#closeScreeningModalBtn").addEventListener("click", close);
  $("#cancelScreeningBtn").addEventListener("click", close);
  $("#screeningModal").addEventListener("click", (event) => { if (event.target.id === "screeningModal") close(); });
  $("#runSourcingBtn").addEventListener("click", runTargetScreening);
  $("#exportScreeningBtn").addEventListener("click", exportScreeningResults);
  $("#shareScreeningBtn").addEventListener("click", shareScreeningResults);
  $("#screeningSearch").addEventListener("input", renderSavedScreenings);
  $("#screeningSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); executeQuickScreening(); }
  });
  $("#screeningQuickSearchBtn").addEventListener("click", executeQuickScreening);
  $("#savedScreeningList").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-screening]");
    if (deleteButton) {
      const screening = state.screenings.find((item) => item.id === deleteButton.dataset.deleteScreening);
      if (!screening || !window.confirm(`确定删除筛选记录“${screening.query.slice(0, 30)}”吗？`)) return;
      state.screenings = state.screenings.filter((item) => item.id !== screening.id);
      saveState();
      renderSavedScreenings();
      toast("筛选记录已删除。");
      return;
    }
    const button = event.target.closest("[data-screening-id]");
    if (!button) return;
    const screening = state.screenings.find((item) => item.id === button.dataset.screeningId);
    if (!screening) return;
    state.currentScreeningResults = screening.results || [];
    $("#nlSearchInput").value = screening.query || "";
    saveState();
    renderCompanies();
  });
  $("#companyGrid").addEventListener("click", (event) => {
    const deepButton = event.target.closest("[data-deep-company]");
    const addButton = event.target.closest("[data-add-company]");
    const contactButton = event.target.closest("[data-contact-company]");
    if (deepButton) {
      const company = state.currentScreeningResults.find((item) => item.name === deepButton.dataset.deepCompany);
      if (!company) return;
      return openCompanyDeepResearch(company);
    }
    if (addButton) return addCompanyProject(addButton.dataset.addCompany);
    if (contactButton) toast(`已记录联系需求：${contactButton.dataset.contactCompany}。请在投资项目中补充联系人。`);
  });
  $("#screeningRecommendations").addEventListener("click", (event) => {
    const button = event.target.closest("[data-deep-company]");
    if (!button) return;
    const company = state.currentScreeningResults.find((item) => item.name === button.dataset.deepCompany);
    if (!company) return;
    openCompanyDeepResearch(company);
  });
}

function openCompanyDeepResearch(company) {
  switchView("research");
  researchMode = "deep";
  $$('[data-research-mode]').forEach((button) => button.classList.toggle("active", button.dataset.researchMode === "deep"));
  $("#industryInput").value = `${company.name}深度分析`;
  $("#deliverableInput").value = "行业研究报告";
  $("#depthInput").value = "深度尽调前置";
  $("#focusInput").value = "商业模式、融资历史、核心团队、竞争优势、客户与供应链、财务质量、潜在风险";
  $("#researchPromptInput").value = `请对${company.name}开展深度投资研究。已知信息：${company.intro || "待核验"}。请联网核验公司主体、产品技术、市场空间、竞争格局、融资与股东、核心团队、客户供应链、经营质量及风险，并给出投资判断与后续尽调清单。`;
  $("#researchPromptInput").focus();
}

function executeQuickScreening() {
  const query = $("#screeningSearch").value.trim();
  if (!query) return toast("请输入筛选要求。");
  const saved = state.screenings.find((item) => item.query.toLowerCase() === query.toLowerCase());
  if (saved) {
    state.currentScreeningResults = saved.results || [];
    $("#nlSearchInput").value = saved.query;
    saveState();
    renderCompanies();
    return toast("已打开历史筛选。");
  }
  $("#nlSearchInput").value = query;
  runTargetScreening();
}

function bindReports() {
  $$("[data-create-report]").forEach((button) => {
    button.addEventListener("click", () => openTemplateModal(button.dataset.createReport));
  });
  $$("[data-report-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      reportFilter = button.dataset.reportFilter;
      $$("[data-report-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderReportCenter();
    });
  });
  $$("[data-report-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportMode = button.dataset.reportMode;
      $$("[data-report-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderReportCenter();
    });
  });
  $("#closeTemplateModalBtn").addEventListener("click", closeTemplateModal);
  $("#templateModal").addEventListener("click", (event) => {
    if (event.target.id === "templateModal") closeTemplateModal();
  });
  $("#backToReportsBtn").addEventListener("click", () => switchView("reports"));
  $("#saveEditorBtn").addEventListener("click", saveEditorReport);
  $("#exportEditorDocBtn").addEventListener("click", () => {
    const report = getEditingReport();
    if (report) downloadReport({ ...report, format: report.format === "PPTX" ? "DOCX" : report.format });
  });
  $("#exportEditorPptBtn").addEventListener("click", () => {
    const report = getEditingReport();
    if (report) downloadReport({ ...report, format: "PPTX" });
  });
  $("#askEvaInEditorBtn").addEventListener("click", askEvaInEditor);
  $$(".editor-toolbar [data-editor-command]").forEach((button) => {
    button.addEventListener("click", () => runEditorCommand(button.dataset.editorCommand, button.dataset.commandValue));
  });
}

function formatTaskCadence(type, weekday, hour) {
  const time = `${String(hour).padStart(2, "0")}:00`;
  const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
  return type === "weekly" ? `每周${weekdayNames[weekday]} ${time}` : `每日 ${time}`;
}

function getTaskSchedule(task) {
  if (task.scheduleType) {
    return { type: task.scheduleType, weekday: Number(task.weekday ?? 1), hour: Number(task.hour ?? 9) };
  }
  const hour = Number(task.cadence?.match(/(\d{1,2}):/)?.[1] || 9);
  const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdayNames.findIndex((name) => task.cadence?.includes(`周${name}`));
  return { type: task.cadence?.includes("每周") ? "weekly" : "daily", weekday: weekday < 0 ? 1 : weekday, hour };
}

function isTaskDue(task, now = new Date()) {
  const schedule = getTaskSchedule(task);
  const scheduledAt = new Date(now);
  scheduledAt.setMinutes(0, 0, 0);
  scheduledAt.setHours(schedule.hour);
  if (schedule.type === "weekly") {
    const daysSinceScheduledWeekday = (now.getDay() - schedule.weekday + 7) % 7;
    scheduledAt.setDate(now.getDate() - daysSinceScheduledWeekday);
  }
  if (now < scheduledAt) {
    scheduledAt.setDate(scheduledAt.getDate() - (schedule.type === "weekly" ? 7 : 1));
  }
  const lastRunAt = task.lastRunAt ? new Date(task.lastRunAt) : null;
  const createdAt = task.createdAt ? new Date(task.createdAt) : new Date(0);
  return createdAt <= scheduledAt && (!lastRunAt || lastRunAt < scheduledAt);
}

function friendlyRequestError(error) {
  const message = String(error?.message || error || "未知错误");
  if (/aborted|aborterror/i.test(message)) return "任务已由用户停止";
  if (/failed to fetch|networkerror|load failed|signal is aborted/i.test(message)) {
    return "无法连接本地大模型服务，请确认 server.mjs 正在运行且 8787 端口可访问";
  }
  if (/api key|401|unauthorized/i.test(message)) return "大模型 API Key 无效或已过期，请在模型设置中更新";
  if (/timeout|timed out|超过.*秒|超过.*分钟/i.test(message)) return "任务执行超时：联网检索或大模型在限定时间内未完成，请缩小调查范围后重试";
  return message;
}

function bindTasks() {
  const templates = {
    weekly: ["每周行业动态", "每周一 09:00", "跟踪指定行业的政策、市场、技术、竞争格局和融资事件，生成一页周报。"],
    target: ["标的定时跟踪", "每日 09:00", "跟踪关注公司的融资、新闻、产品、客户和经营变化，标记新增事项。"],
    competitor: ["竞品实时监控", "每日 09:00", "监控竞品公司的公开信息、产品发布、招投标、融资和关键人员变化。"],
    financing: ["投融资讯息", "每日 09:00", "追踪指定赛域的最新投融资事件，输出轮次、金额、投资方和产业信号。"],
    post: ["投后追踪", "每月 1 日 09:00", "跟踪被投企业运营指标、重大事项、风险变化和下月关键动作。"],
    custom: ["自定义投研任务", "每周一 09:00", "描述需要奔奔定期执行的研究任务、信息范围和输出格式。"],
  };
  const hourInput = $("#taskHourInput");
  hourInput.innerHTML = Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">${String(hour).padStart(2, "0")}:00</option>`).join("");
  const updateScheduleFields = () => {
    $("#taskWeekdayField").hidden = $("#taskCadenceInput").value !== "weekly";
  };
  $("#taskCadenceInput").addEventListener("change", updateScheduleFields);
  const open = (key = "custom") => {
    const template = templates[key] || templates.custom;
    $("#taskModalTitle").textContent = template[0];
    $("#taskNameInput").value = template[0];
    const subjectLabels = { weekly: "行业/赛道", target: "公司列表", competitor: "竞品公司列表", financing: "赛道/技术方向", post: "被投企业列表", custom: "任务主题" };
    $("#taskSubjectLabel").textContent = subjectLabels[key] || "任务主题";
    $("#taskSubjectInput").value = "";
    const weekly = template[1].includes("每周");
    $("#taskCadenceInput").value = weekly ? "weekly" : "daily";
    $("#taskWeekdayInput").value = "1";
    $("#taskHourInput").value = String(Number(template[1].match(/(\d{1,2}):/)?.[1] || 9));
    updateScheduleFields();
    $("#taskPromptInput").value = "";
    $("#taskModal").dataset.templateKey = key;
    $("#taskModal").hidden = false;
  };
  $$('[data-task-template]').forEach((button) => button.addEventListener("click", () => open(button.dataset.taskTemplate)));
  const close = () => { $("#taskModal").hidden = true; };
  $("#closeTaskModalBtn").addEventListener("click", close);
  $("#cancelTaskBtn").addEventListener("click", close);
  $("#taskModal").addEventListener("click", (event) => { if (event.target.id === "taskModal") close(); });
  $("#addTaskBtn").addEventListener("click", () => {
    const subjects = $("#taskSubjectInput").value.trim();
    if (!subjects) return toast(`请填写${$("#taskSubjectLabel").textContent}。`);
    const focusDimensions = $$("#taskFocusGrid input:checked").map((input) => input.value);
    const basePrompt = templates[$("#taskModal").dataset.templateKey]?.[2] || templates.custom[2];
    const extraPrompt = $("#taskPromptInput").value.trim();
    const resultMode = document.querySelector('input[name="taskResultMode"]:checked')?.value || "report";
    const task = {
      id: makeId(),
      name: $("#taskNameInput").value.trim() || "未命名任务",
      scheduleType: $("#taskCadenceInput").value,
      weekday: Number($("#taskWeekdayInput").value),
      hour: Number($("#taskHourInput").value),
      cadence: formatTaskCadence($("#taskCadenceInput").value, Number($("#taskWeekdayInput").value), Number($("#taskHourInput").value)),
      subjects,
      focusDimensions,
      resultMode,
      prompt: `${basePrompt}\n对象：${subjects}\n关注维度：${focusDimensions.join("、") || "综合跟踪"}${extraPrompt ? `\n其他要求：${extraPrompt}` : ""}\n结果处理：${resultMode === "email" ? "发送邮件" : "保存到报告中心"}`,
      lastResult: "等待执行",
      active: true,
      createdAt: new Date().toISOString(),
    };
    state.tasks.unshift(task);
    saveState();
    addHistory(`新增定时任务：${task.name}`, "定时任务");
    renderAll();
    close();
    toast("任务已保存。");
  });
}

function bindMemory() {
  $("#addMemoryBtn").addEventListener("click", () => {
    const memory = {
      id: makeId(),
      name: $("#memoryNameInput").value.trim() || "未命名技能",
      scene: $("#memorySceneInput").value.trim() || "通用",
      content: $("#memoryContentInput").value.trim(),
      createdAt: new Date().toISOString(),
    };
    state.memories.unshift(memory);
    saveState();
    addHistory(`保存技能记忆：${memory.name}`, "技能记忆");
    renderAll();
    toast("技能已保存，可在奔奔回答和研究建议中复用。");
  });
  $("#generateSkillBtn").addEventListener("click", async () => {
    const requirement = $("#skillPromptInput").value.trim();
    if (!requirement) return toast("请先描述希望创建的 Skill。");
    const button = $("#generateSkillBtn");
    button.disabled = true;
    button.textContent = "正在构建 Skill...";
    try {
      const prompt = `你是企业投研智能体的 Skill 架构师。根据用户要求生成一个可执行的投研 Skill。
用户要求：${requirement}
请只返回 JSON，结构为：{"name":"技能名称","scene":"适用场景","triggers":["触发条件"],"workflow":["步骤1"],"output":"输出规范","instructions":"完整执行指令"}。步骤必须具体、可验证，强调来源、事实与推断区分、风险核验。`;
      const answer = await callAgentTask(prompt, { taskType: "skill-generation" });
      const skill = parseSkillResponse(answer, requirement);
      state.memories.unshift({ ...skill, id: makeId(), createdAt: new Date().toISOString(), generated: true });
      $("#memoryNameInput").value = skill.name;
      $("#memorySceneInput").value = skill.scene;
      $("#memoryContentInput").value = skill.content;
      saveState();
      addHistory(`AI 生成 Skill：${skill.name}`, "技能记忆");
      renderAll();
      toast("Skill 已生成并加入技能库。");
    } catch (error) {
      toast(`Skill 生成失败：${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = '<span data-icon="spark"></span>AI 生成 Skill';
      renderIcons();
    }
  });
}

function parseSkillResponse(answer, fallbackRequirement) {
  try {
    const jsonText = answer.replace(/```json|```/gi, "").trim();
    const data = JSON.parse(jsonText);
    const workflow = Array.isArray(data.workflow) ? data.workflow : [];
    const triggers = Array.isArray(data.triggers) ? data.triggers : [];
    return {
      name: data.name || "AI 投研 Skill",
      scene: data.scene || "智能投研",
      triggers,
      workflow,
      output: data.output || "结构化投研结论",
      instructions: data.instructions || fallbackRequirement,
      content: `触发条件：${triggers.join("；") || "用户主动调用"}\n执行步骤：\n${workflow.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n输出规范：${data.output || "结构化投研结论"}\n完整指令：${data.instructions || fallbackRequirement}`,
    };
  } catch {
    return { name: "AI 投研 Skill", scene: "智能投研", triggers: [], workflow: [], output: "结构化结果", instructions: fallbackRequirement, content: answer };
  }
}

function bindBoard() {
  const applyBoardMode = () => {
    $("#boardKanbanView").hidden = boardMode !== "kanban";
    $("#boardTableView").hidden = boardMode !== "table";
  };
  $$('[data-board-mode]').forEach((button) => button.addEventListener("click", () => {
    boardMode = button.dataset.boardMode;
    $$('[data-board-mode]').forEach((item) => item.classList.toggle("active", item === button));
    applyBoardMode();
    renderInvestmentTable();
  }));
  $("#boardSearchInput").addEventListener("input", () => {
    renderProjectBoard();
    renderInvestmentTable();
  });
  $("#investmentTableBody").addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-open-board-project]");
    if (detailButton) openProjectDetail(detailButton.dataset.openBoardProject);
  });
  applyBoardMode();
}

function bindFavorites() {
  $("#favoriteSearchInput").addEventListener("input", renderFavorites);
  $("#favoriteList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-kind]");
    if (button) openHistoryCenterItem(button.dataset.historyKind, button.dataset.historyId);
  });
  $$('[data-favorite-filter]').forEach((button) => button.addEventListener("click", () => {
    favoriteFilter = button.dataset.favoriteFilter;
    $$('[data-favorite-filter]').forEach((item) => item.classList.toggle("active", item === button));
    renderFavorites();
  }));
  $$('[data-favorite-sort]').forEach((button) => button.addEventListener("click", () => {
    favoriteSort = button.dataset.favoriteSort;
    $$('[data-favorite-sort]').forEach((item) => item.classList.toggle("active", item === button));
    renderFavorites();
  }));
}

function openHistoryCenterItem(kind, id) {
  if (kind === "chat") {
    selectChatSession(id);
    return switchView("ask");
  }
  if (kind === "screening") {
    const item = state.screenings.find((row) => row.id === id);
    if (item) state.currentScreeningResults = item.results || [];
    saveState(); renderCompanies(); return switchView("sourcing");
  }
  if (kind === "report") return openReportEditor(id);
  if (kind === "task") {
    switchView("tasks");
    return window.setTimeout(() => document.querySelector(`[data-task-card-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }
  if (kind === "project") return openProjectDetail(id);
  if (kind === "research") {
    const record = state.researchRecords.find((row) => row.id === id);
    if (record) {
      currentReport = record.report;
      $("#industryInput").value = record.industry || "";
      $("#deliverableInput").value = record.deliverable || "行业研究报告";
      $("#depthInput").value = record.depth || "标准研究";
      $("#focusInput").value = record.focus || "";
      $("#researchPromptInput").value = record.requirement || "";
      renderResearchOutput(currentReport);
    }
    return switchView("research");
  }
  if (kind === "person") {
    const record = state.peopleRecords.find((row) => row.id === id);
    if (record) {
      setPeopleMode(record.mode || "person");
      $("#personDirectionInput").value = record.direction || "";
      $("#personNameInput").value = record.name || "";
      $("#personCompanyInput").value = record.company || "";
      $("#personRoleInput").value = record.role || "";
      $("#personFocusInput").value = record.focus || "";
      currentPeopleReport = record.report;
      $("#peopleOutput").innerHTML = currentPeopleReport?.html || "";
    }
    return switchView("people");
  }
  if (kind === "favorite") {
    const item = state.favorites.find((row) => row.id === id);
    const view = item?.type === "标的" ? "sourcing" : item?.type === "报告" ? "reports" : item?.type === "项目" ? "projects" : "favorites";
    return switchView(view);
  }
}

function bindProjects() {
  const openModal = (project = null) => {
    editingProjectId = project?.id || null;
    $("#projectModalTitle").textContent = project ? "编辑投资项目" : "新建投资项目";
    $("#addProjectBtn").textContent = project ? "保存修改" : "创建项目";
    $("#projectNameInput").value = project?.name || "";
    $("#projectSectorInput").value = project?.sector || "";
    $("#projectStageInput").value = project?.stage || "初筛";
    $("#projectOwnerInput").value = project?.owner === "待分配" ? "" : project?.owner || "";
    $("#projectRoundInput").value = project?.round || "种子轮";
    $("#projectAmountInput").value = project?.amount || "";
    $("#projectEquityInput").value = project?.equity || "";
    $("#projectNoteInput").value = project?.note || "";
    const templateInput = document.querySelector(`input[name="projectTemplate"][value="${CSS.escape(project?.ddTemplate || "少数股权投资")}"]`) || document.querySelector('input[name="projectTemplate"]');
    if (templateInput) templateInput.checked = true;
    $$("[data-project-sector]").forEach((button) => button.classList.toggle("active", button.dataset.projectSector === (project?.sectorCategory || "")));
    $("#projectModal").hidden = false;
    $("#projectNameInput").focus();
  };
  const closeModal = () => { $("#projectModal").hidden = true; editingProjectId = null; };
  $("#openProjectModalBtn").addEventListener("click", () => openModal());
  $("#closeProjectModalBtn").addEventListener("click", closeModal);
  $("#cancelProjectBtn").addEventListener("click", closeModal);
  $("#projectModal").addEventListener("click", (event) => { if (event.target.id === "projectModal") closeModal(); });
  $$("[data-project-sector]").forEach((button) => button.addEventListener("click", () => {
    $$("[data-project-sector]").forEach((item) => item.classList.toggle("active", item === button));
    if (button.dataset.projectSector) $("#projectSectorInput").value = button.dataset.projectSector;
  }));
  $("#openBpAnalysisBtn").addEventListener("click", () => switchView("bpAnalysis"));
  $("#openDdProjectBtn").addEventListener("click", () => state.projects.length ? openProjectDetail(state.projects[0].id) : openModal());
  $("#bpFileInput").addEventListener("change", async (event) => {
    [bpDocument] = await readFiles(event.target.files);
    $("#bpFileHint").textContent = bpDocument ? `已选择：${bpDocument.name}` : "请先上传 BP 文件";
  });
  $("#bpDimensionGrid").addEventListener("change", () => {
    const selected = $$("#bpDimensionGrid input:checked").length;
    const counter = $(".bp-section-head span", $("#bpAnalysisView"));
    if (counter) counter.textContent = `已选 ${selected}/7`;
  });
  $("#runBpAnalysisBtn").addEventListener("click", runBpAnalysis);
  $("#saveTargetCompanyBtn").addEventListener("click", saveTargetCompany);
  $("#generateDdBtn").addEventListener("click", generateDdOutput);
  $("#addProjectBtn").addEventListener("click", () => {
    const existing = state.projects.find((item) => item.id === editingProjectId);
    const values = {
      name: $("#projectNameInput").value.trim() || "未命名项目",
      sector: $("#projectSectorInput").value.trim() || "未标注赛道",
      stage: $("#projectStageInput").value,
      owner: $("#projectOwnerInput").value.trim() || "待分配",
      round: $("#projectRoundInput").value,
      amount: $("#projectAmountInput").value.trim(),
      equity: $("#projectEquityInput").value.trim(),
      note: $("#projectNoteInput").value.trim(),
      ddTemplate: document.querySelector('input[name="projectTemplate"]:checked')?.value || "少数股权投资",
      sectorCategory: $("[data-project-sector].active")?.dataset.projectSector || "",
    };
    if (existing) {
      Object.assign(existing, values, { updatedAt: new Date().toISOString() });
    } else {
      state.projects.unshift({ id: makeId(), ...values, targetCompany: "", ddOutputs: [], createdAt: new Date().toISOString() });
    }
    saveState();
    addHistory(`${existing ? "更新" : "新增"}投资项目：${values.name}`, "项目");
    renderAll();
    closeModal();
    toast(existing ? "项目信息已更新。" : "项目已加入项目池。");
  });
  $("#projectList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-project]");
    if (!editButton) return;
    const project = state.projects.find((item) => item.id === editButton.dataset.editProject);
    if (project) openModal(project);
  });
}

function bindHistory() {
  $("#clearHistoryBtn")?.addEventListener("click", () => {
    state.history = [];
    favoriteFilter = "操作";
    $$('[data-favorite-filter]').forEach((button) => button.classList.toggle("active", button.dataset.favoriteFilter === "操作"));
    saveState();
    renderFavorites();
    toast("操作历史已清空。其他聊天、报告和任务记录仍保留。");
  });
}

function bindGlobalActions() {
  $("#seedDemoBtn").addEventListener("click", () => {
    seedDemoData();
    renderAll();
    toast("已载入演示数据。");
  });
  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    await handleAction(action.dataset.action, action.dataset.id);
  });
}

async function handleAction(action, id) {
  const report = state.reports.find((item) => item.id === id);
  const project = state.projects.find((item) => item.id === id);
  const task = state.tasks.find((item) => item.id === id);
  const memory = state.memories.find((item) => item.id === id);
  if (action === "download-report" && report) downloadReport(report);
  if (action === "favorite-report" && report) addFavorite("报告", report.title, report.html);
  if (action === "rename-report" && report) renameReport(report);
  if (action === "open-report" && report) openReportEditor(report.id);
  if (action === "delete-report") deleteById("reports", id);
  if (action === "delete-favorite") deleteById("favorites", id);
  if (action === "delete-project") deleteById("projects", id);
  if (action === "delete-memory") deleteById("memories", id);
  if (action === "favorite-project" && project) addFavorite("项目", project.name, project.note);
  if (action === "advance-project" && project) advanceProject(project);
  if (action === "run-task" && task) await runTask(task);
  if (action === "toggle-task" && task) {
    task.active = !task.active;
    saveState();
  }
  if (action === "open-project" && project) openProjectDetail(project.id);
  if (action === "delete-task") deleteById("tasks", id);
  if (action === "delete-task-result" && task) {
    task.lastResult = "等待执行";
    task.lastRunAt = "";
    task.changeSummary = "";
    saveState();
    toast("任务执行结果已删除，任务本身仍保留。");
  }
  if (action === "use-memory" && memory) {
    $("#askChatInput").value = `使用「${memory.name}」框架，帮我生成一份投研建议`;
    switchView("ask");
    sendChatMessage($("#askChatInput").value);
  }
  renderAll();
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(stored || defaultState);
  } catch {
    return normalizeState(defaultState);
  }
}

function normalizeState(raw) {
  const legacyMessages = Array.isArray(raw.chatMessages) && raw.chatMessages.length
    ? raw.chatMessages
    : structuredClone(defaultState.chatMessages);
  const chatSessions = Array.isArray(raw.chatSessions) && raw.chatSessions.length
    ? raw.chatSessions.map((session) => ({
        id: session.id || makeId(),
        title: session.title || "未命名交流",
        messages: Array.isArray(session.messages) ? session.messages.map(normalizeChatMessage) : [],
        createdAt: session.createdAt || new Date().toISOString(),
        updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
      }))
    : [{
        id: raw.chatSessionId || makeId(),
        title: "投研工作对话",
        messages: legacyMessages.map(normalizeChatMessage),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
  const activeSession = chatSessions.find((session) => session.id === raw.activeChatSessionId) || chatSessions[0];
  return {
    projects: Array.isArray(raw.projects) ? raw.projects.map((project) => ({ ...project, stage: normalizeProjectStage(project.stage), ddOutputs: Array.isArray(project.ddOutputs) ? project.ddOutputs : [] })) : [],
    reports: Array.isArray(raw.reports) ? raw.reports.map(normalizeReport) : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks.map((task) => ({ ...task, prompt: replaceAssistantName(task.prompt), lastResult: replaceAssistantName(task.lastResult) })) : structuredClone(defaultState.tasks),
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    favorites: Array.isArray(raw.favorites) ? raw.favorites.map((item) => ({ ...item, title: replaceAssistantName(item.title), content: replaceAssistantName(item.content) })) : [],
    screenings: Array.isArray(raw.screenings) ? raw.screenings : [],
    currentScreeningResults: Array.isArray(raw.currentScreeningResults) ? raw.currentScreeningResults : [],
    researchRecords: Array.isArray(raw.researchRecords) ? raw.researchRecords : [],
    peopleRecords: Array.isArray(raw.peopleRecords) ? raw.peopleRecords : [],
    history: Array.isArray(raw.history) ? raw.history.map((item) => ({ ...item, title: replaceAssistantName(item.title) })) : [],
    memories: Array.isArray(raw.memories) ? raw.memories : structuredClone(defaultState.memories),
    chatSessions,
    activeChatSessionId: activeSession.id,
    chatSessionId: activeSession.id,
    chatMessages: activeSession.messages,
  };
}

function normalizeChatMessage(message) {
  return { ...message, content: replaceAssistantName(message.content), displayContent: replaceAssistantName(message.displayContent) };
}

function replaceAssistantName(value) {
  return typeof value === "string" ? value.replace(/Ask Eva/gi, "Ask 奔奔").replace(/EVA|Eva/g, "奔奔") : value;
}

function normalizeReport(report) {
  return {
    id: report.id || makeId(),
    title: report.title || "未命名报告",
    format: report.format || formatFromType(report.type) || "DOCX",
    source: report.source || "manual",
    type: report.type || "投研报告",
    sector: report.sector || "未标注",
    html: report.html || "<p>暂无内容</p>",
    templateName: report.templateName || "",
    favorite: Boolean(report.favorite),
    status: report.status || "已完成",
    createdAt: report.createdAt || new Date().toISOString(),
    updatedAt: report.updatedAt || report.createdAt || new Date().toISOString(),
  };
}

function normalizeProjectStage(stage = "") {
  const mapping = { 跟进中: "初筛", 尽调中: "尽调", 投决中: "立项", 已搁置: "初筛" };
  return mapping[stage] || (['初筛', '立项', '尽调', '投后'].includes(stage) ? stage : "初筛");
}

function saveState() {
  const activeSession = state.chatSessions.find((session) => session.id === state.activeChatSessionId);
  if (activeSession) {
    activeSession.messages = state.chatMessages;
    activeSession.updatedAt = new Date().toISOString();
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderMetrics();
  renderProjectBoard();
  renderSidebar();
  renderCompanies();
  renderReportCenter();
  renderSectorBoard();
  renderFavorites();
  renderTasks();
  renderTaskResults();
  renderMemory();
  renderProjects();
  renderSavedScreenings();
  renderResearchRecords();
  renderPeopleRecords();
  renderHistory();
  renderChat();
  renderConversationList();
  renderInvestmentTable();
  renderIcons();
}

function renderMetrics() {
  $("#projectCount").textContent = state.projects.length;
  $("#reportCount").textContent = state.reports.length;
  $("#taskCount").textContent = state.tasks.length;
  $("#riskCount").textContent = state.risks.length;
}

function renderSidebar() {
  $("#sidebarProjects").innerHTML = state.projects.length
    ? state.projects.slice(0, 4).map((p) => `<button class="side-row" data-view-jump="projects"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.stage)}</span></button>`).join("")
    : `<div class="sidebar-empty">暂无项目</div>`;
  $("#sidebarHistory").innerHTML = state.history.length
    ? state.history.slice(0, 7).map((h) => `<button class="side-row" data-view-jump="favorites"><b>${escapeHtml(h.type)} ${escapeHtml(h.title)}</b><span>${formatDate(h.createdAt)}</span></button>`).join("")
    : `<div class="sidebar-empty">暂无历史</div>`;
  $$("[data-view-jump]").forEach((button) => {
    button.onclick = () => switchView(button.dataset.viewJump);
  });
}

function renderProjectBoard() {
  const stages = ["初筛", "立项", "尽调", "投后"];
  const keyword = ($("#boardSearchInput")?.value || "").trim().toLowerCase();
  $("#projectBoard").innerHTML = stages
    .map((stage) => {
      const projects = state.projects.filter((project) => project.stage === stage && (!keyword || `${project.name} ${project.sector}`.toLowerCase().includes(keyword)));
      const cards = projects.length
        ? projects.map((project) => `<article class="project-card"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.sector)} · ${escapeHtml(project.owner || "待分配")}</small><p class="meta-line">${escapeHtml(project.note || "待补充跟进记录")}</p></article>`).join("")
        : emptyState("暂无项目");
      return `<div class="lane"><div class="lane-title"><span>${stage}</span><span>${projects.length}</span></div>${cards}</div>`;
    })
    .join("");
}

function renderInvestmentTable() {
  const root = $("#investmentTableBody");
  if (!root) return;
  const keyword = ($("#boardSearchInput")?.value || "").trim().toLowerCase();
  const projects = state.projects.filter((project) => !keyword || `${project.name} ${project.sector}`.toLowerCase().includes(keyword));
  root.innerHTML = projects.length ? projects.map((project) => `<tr>
    <td><strong>${escapeHtml(project.name)}</strong></td>
    <td>${escapeHtml(project.sector || "待补充")}</td>
    <td><span class="stage-badge">${escapeHtml(project.stage || "初筛")}</span></td>
    <td>${escapeHtml(project.owner || "待分配")}</td>
    <td>${escapeHtml(project.round || "待补充")}</td>
    <td>${escapeHtml(project.amount || "待补充")}</td>
    <td>${escapeHtml(project.equity || "待补充")}</td>
    <td>${formatDate(project.updatedAt || project.createdAt)}</td>
    <td><button class="text-button" data-open-board-project="${project.id}">详情</button></td>
  </tr>`).join("") : '<tr><td colspan="9" class="table-empty">暂无项目，请先在投资项目中创建</td></tr>';
}

function renderSectorBoard() {
  const counts = state.projects.reduce((acc, project) => {
    acc[project.sector] = (acc[project.sector] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  $("#sectorBoard").innerHTML = entries.length
    ? entries.map(([sector, count]) => `<article class="report-item"><strong>${escapeHtml(sector)}</strong><small>${count} 个项目在池</small><div class="score-bar"><span style="width:${Math.min(100, count * 28)}%"></span></div></article>`).join("")
    : emptyState("暂无赛道分布");
}

function renderCompanies() {
  const sector = $("#sectorFilter").value;
  const round = $("#roundFilter").value;
  const region = $("#regionFilter").value;
  const nl = $("#nlSearchInput").value;
  const candidates = state.currentScreeningResults.length ? state.currentScreeningResults : [];
  const rows = candidates
    .map((company) => ({ ...company, score: company.score || scoreCompany(company, { sector, round, region, nl }) }))
    .sort((a, b) => b.score - a.score);
  $("#companyGrid").innerHTML = rows.length ? `<table class="sourcing-result-table"><thead><tr><th>#</th><th>公司名</th><th>简介</th><th>行业</th><th>注册地</th><th>融资轮次</th><th>融资额</th><th>投资方/来源</th><th>融资日期</th><th>操作</th></tr></thead><tbody>${rows.map((company, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(company.name)}</strong></td><td>${escapeHtml(company.intro || "待核验")}</td><td>${escapeHtml(company.sector || "待核验")}</td><td>${escapeHtml(company.registeredLocation || company.region || "待核验")}</td><td>${escapeHtml(company.round || "待核验")}</td><td>${escapeHtml(company.financingAmount || company.revenue || "待核验")}</td><td>${escapeHtml(company.investors || company.sourceName || "待核验")}</td><td>${escapeHtml(company.financingDate || "待核验")}</td><td><div class="sourcing-row-actions"><button data-deep-company="${escapeHtml(company.name)}">深度分析</button><button class="primary-button" data-add-company="${escapeHtml(company.name)}">加入看板</button><button data-contact-company="${escapeHtml(company.name)}">联系</button></div></td></tr>`).join("")}</tbody></table>` : "";
  $("#sourcingEmpty").hidden = rows.length > 0;
  $(".sourcing-result-head").hidden = rows.length === 0;
  const verifiedCount = rows.filter((item) => item.verificationStatus === "已核验").length;
  $("#screeningSummary").textContent = rows.length ? `找到 ${rows.length} 家候选公司；${verifiedCount} 家附有核验来源，其余需进一步核验。` : "尚未执行筛选";
  $("#screeningConditionBar").hidden = rows.length === 0;
  $("#screeningResultCount").textContent = `${rows.length} 条结果`;
  const latest = state.screenings[0];
  $("#screeningResultTitle").textContent = ($("#nlSearchInput").value || latest?.query || "筛选结果").slice(0, 30);
  $("#screeningAiSummary").hidden = rows.length === 0;
  $("#screeningAiSummaryText").textContent = rows.length ? `本次共获得 ${rows.length} 家候选标的，重点集中在${[...new Set(rows.map((item) => item.sector))].slice(0, 3).join("、")}；建议优先核验融资、客户与核心团队。` : "";
  $("#screeningRecommendations").innerHTML = rows.slice(0, 3).map((item) => `<button data-deep-company="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.sector)}</span></button>`).join("");
}

async function runTargetScreening() {
  const query = $("#nlSearchInput").value.trim();
  if (!query) return toast("请描述你想寻找的公司。");
  const button = $("#runSourcingBtn");
  button.disabled = true;
  button.textContent = "AI 筛选中...";
  const filters = { sector: $("#sectorFilter").value, round: $("#roundFilter").value, region: $("#regionFilter").value, recency: $("#recencyFilter").value };
  try {
    button.textContent = "正在搜集候选标的...";
    const rows = await requestScreeningCandidates(query, filters);
    const uniqueRows = dedupeScreeningRows(rows).slice(0, 100);
    state.currentScreeningResults = uniqueRows.map((item) => normalizeScreeningCompany(item, filters));
    if (!state.currentScreeningResults.length) throw new Error("没有找到符合结构化条件的候选公司，请放宽筛选条件");
    const savedScreening = { id: makeId(), query, filters, results: state.currentScreeningResults, createdAt: new Date().toISOString() };
    state.screenings.unshift(savedScreening);
    state.screenings = state.screenings.slice(0, 30);
    const screeningJob = completedAgentJobs.find((job) => /标的搜集/.test(job.label) && !job.targetId);
    if (screeningJob) {
      screeningJob.targetId = savedScreening.id;
      screeningJob.view = "sourcing";
      saveJobHistory();
    }
    saveState();
    addHistory(`执行标的筛选：${query.slice(0, 20)}`, "筛选");
    $("#screeningModal").hidden = true;
    renderCompanies();
    renderSavedScreenings();
    toast(`已生成并去重 ${state.currentScreeningResults.length} 家有效候选，未使用虚构公司补足。`);
  } catch (error) {
    const screeningJob = completedAgentJobs.find((job) => /标的搜集/.test(job.label) && !job.targetId);
    if (screeningJob) {
      screeningJob.status = "error";
      screeningJob.detail = `结果未形成：${friendlyRequestError(error)}`;
      screeningJob.finishedAt = Date.now();
      saveJobHistory();
      renderJobCenter();
    }
    toast(`筛选失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "执行筛选";
  }
}

async function planTargetSearchQueries(query, filters) {
  const prompt = `你是企业情报检索规划助手。根据筛选要求生成6条用于寻找真实公司、融资新闻、政府公示、投资机构项目和公司官网的中文搜索词。
要求：${query}
行业：${filters.sector || "不限"}；地区：${filters.region || "不限"}；轮次：${filters.round || "不限"}
查询词应覆盖：公司官网、融资新闻、投资机构 portfolio、政府/园区项目公示、产品或技术发布。严格返回JSON字符串数组，不要解释。`;
  try {
    const answer = await callAgentTask(prompt, { taskType: "target-search-planning", timeoutMs: 180000, minimalContext: true });
    const parsed = parseJsonPayload(answer);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function companyMatchesSource(companyName, source) {
  const normalizedName = String(companyName || "").toLowerCase().replace(/[（）()\s]/g, "").replace(/股份有限公司|有限责任公司|有限公司|集团/g, "");
  const sourceText = `${source?.title || ""} ${source?.snippet || ""}`.toLowerCase().replace(/[（）()\s]/g, "");
  return normalizedName.length >= 2 && sourceText.includes(normalizedName);
}

async function requestScreeningCandidatesRss(query, filters) {
  const plannedQueries = await planTargetSearchQueries(query, filters);
  const fallbackQueries = [
    `${query} ${filters.sector || ""} 公司 融资`,
    `${query} ${filters.region || ""} 企业 项目`,
    `${filters.sector || query} 创业公司 投资`,
    `${query} 公司 官网 产品`,
    `${query} 投资机构 portfolio 项目`,
    `${query} 政府 园区 企业 公示`,
  ];
  const rssQueries = [...new Set([...plannedQueries, ...fallbackQueries])].slice(0, 10);
  const rssResponses = await Promise.allSettled(rssQueries.map(async (rssQuery) => {
    const response = await fetch(apiUrl(`/api/web-search?q=${encodeURIComponent(rssQuery)}`), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    return response.ok ? data.results || [] : [];
  }));
  const privateRssSources = await fetchRelevantPrivateRss(query, ["reports_10jqka", "reports_eastmoney", "jiemian", "aicaijing", "ifeng_stock", "36kr", "wechat", "xueqiu"]);
  const rssSources = [...new Map([...privateRssSources, ...rssResponses.filter((item) => item.status === "fulfilled").flatMap((item) => item.value)].map((item) => [item.url, item])).values()].slice(0, 40);
  if (rssSources.length < 3) throw new Error("免费 RSS 没有找到至少 3 条相关企业或融资来源，已停止生成未经核验的标的");
  const rssText = rssSources.map((item, index) => `[${index + 1}] ${item.title}\n${item.snippet}\n${item.url}\n来源：${item.sourceType || "RSS"}`).join("\n\n");
  const prompt = `你是严谨的一级市场标的筛选分析师。只能从下方 RSS 联网来源中识别真实存在的候选公司，不得使用模型记忆补充未在来源中出现的公司。最多返回100家，实际找到多少就返回多少，不得凑数、虚构或使用占位名称。
筛选要求：${query}
行业：${filters.sector || "不限"}；轮次：${filters.round || "不限"}；地区：${filters.region || "不限"}；最近融资：${filters.recency}
严格输出JSON数组，不要解释。每项字段：name、sector、round、region、registeredLocation、intro、financingAmount、investors、financingDate、reason、score、sourceId。sourceId必须对应下方来源编号；没有有效来源编号的公司不得输出。无法确认的字段填写“待核验”，禁止猜测精确数字。

RSS联网来源：
${rssText}`;
  const answer = await callAgentTask(prompt, { taskType: "target-screening", query, filters, timeoutMs: 600000, minimalContext: true });
  let parsed;
  try { parsed = parseJsonPayload(answer); } catch { parsed = recoverJsonArray(answer); }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.companies) ? parsed.companies : Array.isArray(parsed?.results) ? parsed.results : null;
  if (!rows) throw new Error("模型返回格式不正确，请重新执行筛选");
  const verified = rows.map((item) => {
    const source = rssSources[Number(item?.sourceId) - 1];
    return source && companyMatchesSource(item?.name, source)
      ? { ...item, sourceName: source.sourceType || "RSS", sourceUrl: source.url, verificationStatus: "公司名称与来源匹配" }
      : null;
  }).filter(Boolean);
  if (!verified.length) throw new Error("候选公司名称未出现在对应网页来源中，已全部删除，未生成未经核验的标的");
  return verified;
}

async function requestScreeningCandidates(query, filters) {
  const prompt = `你是严谨的一级市场标的筛选分析师。请返回符合条件且真实存在、名称可公开检索的候选公司，最多100家。按实际可靠结果返回，不得为了凑数补足，不得虚构公司，不得使用“某公司”等占位名称，不得重复。
筛选要求：${query}
行业：${filters.sector || "不限"}；轮次：${filters.round || "不限"}；地区：${filters.region || "不限"}；最近融资：${filters.recency}
请兼顾产业链核心、技术创新、成长性和产业协同，使用尽可能紧凑的 JSON。严格输出 JSON 数组，不要输出解释。每项字段：name（公司公开全称）、sector、round、region、registeredLocation、intro（限80字）、financingAmount、investors、financingDate、reason（限50字）、score（0-100）、sourceName、sourceUrl。无法确认的字段填写“待核验”，禁止猜测精确数字。接近输出上限时立即停止增加公司，并正确闭合当前对象和数组，完整格式优先于数量。`;
  const answer = await callAgentTask(prompt, { taskType: "target-screening", filters, timeoutMs: 600000, minimalContext: true });
  let parsed;
  try {
    parsed = parseJsonPayload(answer);
  } catch {
    parsed = recoverJsonArray(answer);
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.companies)) return parsed.companies;
  if (Array.isArray(parsed?.results)) return parsed.results;
  throw new Error("模型返回格式不正确，请重新执行筛选");
}

function dedupeScreeningRows(rows) {
  const seen = new Set();
  return rows.filter((item) => {
    const name = String(item?.name || "").replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "").trim();
    if (name.length < 2 || /^(某|一家|未命名|候选)/.test(name)) return false;
    const key = name.toLowerCase().replace(/股份有限公司|有限责任公司|有限公司/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeScreeningCompany(item, filters) {
  return {
    name: String(item.name).trim(),
    sector: item.sector || filters.sector || "待核验",
    round: item.round || filters.round || "待核验",
    region: item.region || filters.region || "待核验",
    revenue: item.revenue || "待核验",
    intro: item.intro || item.reason || "候选信息待核验",
    financing: item.financing || "待核验",
    registeredLocation: item.registeredLocation || item.region || "待核验",
    financingAmount: item.financingAmount || "待核验",
    investors: item.investors || "待核验",
    financingDate: item.financingDate || "待核验",
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : ["待核验"],
    reason: item.reason || "符合筛选条件，需进一步核验",
    score: Math.max(0, Math.min(100, Number(item.score) || 70)),
    sourceName: item.sourceName || "未提供公开来源",
    sourceUrl: item.sourceUrl || "",
    verificationStatus: "待核验",
  };
}

function exportScreeningResults() {
  const rows = state.currentScreeningResults;
  if (!rows.length) return toast("请先执行标的筛选。");
  const columns = ["公司名称", "行业", "轮次", "地区", "营收", "融资情况", "匹配理由", "评分", "核验状态", "公开来源", "来源链接"];
  const values = rows.map((item) => [item.name, item.sector, item.round, item.region, item.revenue, item.financing, item.reason, item.score, item.verificationStatus || "待核验", item.sourceName || "", item.sourceUrl || ""]);
  const table = `<table><tr>${columns.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr>${values.map((row) => `<tr>${row.map((item) => `<td>${escapeHtml(String(item ?? ""))}</td>`).join("")}</tr>`).join("")}</table>`;
  const blob = new Blob(["\ufeff", table], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `标的筛选-${new Date().toISOString().slice(0, 10)}-${rows.length}条.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`已导出 ${rows.length} 条筛选结果。`);
}

async function shareScreeningResults() {
  const rows = state.currentScreeningResults;
  if (!rows.length) return toast("请先执行标的筛选。");
  const text = `标的筛选结果（${rows.length}家）\n${rows.map((item, index) => `${index + 1}. ${item.name}｜${item.sector}｜${item.round}`).join("\n")}`;
  if (navigator.share) {
    try { await navigator.share({ title: "标的筛选结果", text }); return; } catch {}
  }
  await navigator.clipboard.writeText(text);
  toast("筛选结果已复制，可直接分享。");
}

function parseJsonPayload(text) {
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  const arrayStart = cleaned.indexOf("[");
  const objectStart = cleaned.indexOf("{");
  const start = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart) ? arrayStart : objectStart;
  const end = arrayStart === start ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned);
}

function recoverJsonArray(text) {
  const source = String(text || "").replace(/```json|```/gi, "");
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try { objects.push(JSON.parse(source.slice(start, index + 1))); } catch {}
        start = -1;
      }
    }
  }
  if (!objects.length) throw new Error("模型返回内容被截断，未能恢复完整公司数据");
  return objects;
}

function renderReportCenter() {
  const filterWrap = $(".tabs-row", $("#reportsView"));
  filterWrap.style.display = reportMode === "mine" ? "inline-flex" : "none";
  if (reportMode === "templates") {
    renderTemplateManager();
    return;
  }
  const reports = state.reports.filter((report) => reportFilter === "全部" || report.format === reportFilter);
  $("#reportCenterList").innerHTML = reports.length
    ? reports.map(renderReportRow).join("")
    : emptyState("暂无报告");
}

function renderReportRow(report) {
  return `
    <article class="list-row">
      <div class="row-main">
        <span class="file-badge">${escapeHtml(report.format)}</span>
        <div><strong>${escapeHtml(report.title)}</strong><small>${escapeHtml(report.source)} · ${formatDate(report.createdAt)}${report.templateName ? ` · ${escapeHtml(report.templateName)}` : ""}</small></div>
      </div>
      <span class="status-pill">${escapeHtml(report.status)}</span>
      <div class="row-actions">
        <button class="icon-button" title="收藏" data-action="favorite-report" data-id="${report.id}"><span data-icon="star"></span></button>
        <button class="icon-button" title="编辑正文" data-action="open-report" data-id="${report.id}">✎</button>
        <button class="icon-button" title="下载" data-action="download-report" data-id="${report.id}"><span data-icon="download"></span></button>
        <button class="icon-button" title="删除" data-action="delete-report" data-id="${report.id}">×</button>
      </div>
    </article>`;
}

function renderTemplateManager() {
  const formats = reportFilter === "全部" ? ["DOCX", "XLSX", "PPTX"] : [reportFilter];
  $("#reportCenterList").innerHTML = `
    <div class="template-manager">
      ${formats
        .map(
          (format) => `
          <section class="template-section">
            <div class="template-section-head">
              <div><strong>${formatLabel(format)} 模板</strong><small>${templateHint(format)}</small></div>
              <button class="secondary-button" data-create-report="${format}">+ 从模板新建</button>
            </div>
            <div class="template-card-grid">
              ${reportTemplates[format]
                .map(
                  (template) => `
                  <button class="template-card" data-template-id="${template.id}" data-template-format="${format}">
                    <strong>${escapeHtml(template.title)}</strong>
                    <span>${escapeHtml(template.subtitle)}</span>
                    <small>${escapeHtml(template.description)}</small>
                  </button>`,
                )
                .join("")}
            </div>
          </section>`,
        )
        .join("")}
    </div>`;
  $$("[data-create-report]", $("#reportCenterList")).forEach((button) => {
    button.addEventListener("click", () => openTemplateModal(button.dataset.createReport));
  });
  $$("[data-template-id]", $("#reportCenterList")).forEach((button) => {
    button.addEventListener("click", () => createReportFromTemplate(button.dataset.templateFormat, button.dataset.templateId));
  });
}

function renderFavorites() {
  const keyword = ($("#favoriteSearchInput")?.value || "").trim().toLowerCase();
  const now = Date.now();
  const items = [
    ...state.favorites.map((item) => ({ ...item, kind: "favorite", isFavorite: true })),
    ...state.history.map((item) => ({ ...item, kind: "history", type: "操作", content: item.type || "操作记录" })),
    ...state.chatSessions.map((item) => ({ id: item.id, kind: "chat", type: "聊天", title: item.title, content: item.messages?.at(-1)?.content || "", createdAt: item.updatedAt || item.createdAt })),
    ...state.screenings.map((item) => ({ id: item.id, kind: "screening", type: "标的", title: item.query, content: `${item.results?.length || 0} 条筛选结果`, createdAt: item.createdAt })),
    ...state.reports.map((item) => ({ id: item.id, kind: "report", type: "报告", title: item.title, content: stripHtml(item.html || ""), createdAt: item.updatedAt || item.createdAt })),
    ...state.researchRecords.map((item) => ({ id: item.id, kind: "research", type: "报告", title: item.title, content: item.requirement || "投研助手生成记录", createdAt: item.createdAt })),
    ...state.peopleRecords.map((item) => ({ id: item.id, kind: "person", type: "人物调查", title: item.report?.title || item.name, content: item.focus || item.direction || "人物调查记录", createdAt: item.createdAt })),
    ...state.tasks.map((item) => ({ id: item.id, kind: "task", type: "定时任务", title: item.name, content: `${item.cadence} · ${item.lastRunAt ? "已执行" : "等待执行"}`, createdAt: item.lastRunAt || item.createdAt })),
    ...state.projects.map((item) => ({ id: item.id, kind: "project", type: "项目", title: item.name, content: `${item.sector} · ${item.stage} · ${item.owner || "待分配"}`, createdAt: item.updatedAt || item.createdAt })),
  ];
  const rows = items
    .filter((item) => !keyword || `${item.title} ${item.type} ${stripHtml(item.content || "")}`.toLowerCase().includes(keyword))
    .filter((item) => favoriteFilter === "全部" || (favoriteFilter === "收藏" ? item.isFavorite : favoriteFilter === "最近" ? item.isFavorite && now - new Date(item.createdAt).getTime() <= 7 * 86400e3 : item.type === favoriteFilter))
    .sort((a, b) => favoriteSort === "type" ? a.type.localeCompare(b.type, "zh-CN") : favoriteSort === "title" ? a.title.localeCompare(b.title, "zh-CN") : new Date(b.createdAt) - new Date(a.createdAt));
  $("#favoriteList").innerHTML = rows.length
    ? rows.map((item) => `<article class="list-row favorite-row"><button class="history-center-open" data-history-kind="${item.kind}" data-history-id="${item.id}"><div><strong>${escapeHtml(item.title)}</strong><small>${formatDate(item.createdAt)}</small></div></button>${item.isFavorite ? `<button class="icon-button" data-action="delete-favorite" data-id="${item.id}" title="取消收藏">×</button>` : '<span class="history-open-arrow">›</span>'}</article>`).join("")
    : emptyState("暂无收藏");
}

function renderTasks() {
  $("#taskList").innerHTML = state.tasks.length
    ? state.tasks.map((task) => `<article class="list-row" data-task-card-id="${task.id}"><div class="row-main"><span class="file-badge">${task.active ? "ON" : "OFF"}</span><div><strong>${escapeHtml(task.name)}</strong><small>${escapeHtml(task.cadence)} · ${task.lastRunAt ? "已执行" : "等待执行"}</small></div></div><div class="row-actions"><button class="secondary-button" data-action="toggle-task" data-id="${task.id}">${task.active ? "暂停" : "启用"}</button><button class="secondary-button" data-action="run-task" data-id="${task.id}">立即执行</button><button class="icon-button" data-action="delete-task" data-id="${task.id}">×</button></div></article>`).join("")
    : emptyState("暂无任务");
}

function renderTaskResults() {
  const root = $("#taskResultList");
  if (!root) return;
  const completed = state.tasks.filter((task) => task.lastResult && task.lastResult !== "等待首次执行" && task.lastResult !== "等待执行");
  root.innerHTML = completed.length ? completed.map((task) => `<article class="task-result-card"><div><strong>✓ ${escapeHtml(task.name)}</strong><div class="task-result-actions"><time>${formatDate(task.lastRunAt || task.createdAt)}</time><button class="icon-button" data-action="delete-task-result" data-id="${task.id}" title="删除执行结果" aria-label="删除执行结果">×</button></div></div><p>${escapeHtml(task.lastResult)}</p><span>${escapeHtml(task.changeSummary || "已生成最新摘要")}</span></article>`).join("") : emptyState("暂无执行结果");
}

function renderMemory() {
  $("#memoryList").innerHTML = state.memories.length
    ? state.memories.map((memory) => `<article class="list-row memory-row"><div class="row-main"><span class="file-badge">${memory.generated ? "AI Skill" : "技能"}</span><div><strong>${escapeHtml(memory.name)}</strong><small>${escapeHtml(memory.scene)} · ${formatDate(memory.createdAt)}</small><p class="meta-line">${escapeHtml(memory.content)}</p></div></div><div class="row-actions"><button class="secondary-button" data-action="use-memory" data-id="${memory.id}">使用</button><button class="icon-button" data-action="delete-memory" data-id="${memory.id}">×</button></div></article>`).join("")
    : emptyState("暂无技能");
}

function renderProjects() {
  $("#projectsEmpty").hidden = state.projects.length > 0;
  $("#projectList").innerHTML = state.projects.length
    ? state.projects.map((project) => `<article class="project-work-card"><button data-action="open-project" data-id="${project.id}"><span class="file-badge">${escapeHtml(project.stage)}</span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.sector)} · ${escapeHtml(project.owner || "待分配")}</small><p>${escapeHtml(project.note || "待补充项目简介")}</p><div><span>${project.ddOutputs?.length || 0} 个 DD 产物</span><span>${escapeHtml(project.round || "融资轮次待补充")}</span></div></button><div class="project-card-actions"><button class="secondary-button" data-edit-project="${project.id}">编辑</button><button class="icon-button" data-action="delete-project" data-id="${project.id}">×</button></div></article>`).join("")
    : "";
}

function renderSavedScreenings() {
  const root = $("#savedScreeningList");
  if (!root) return;
  const keyword = ($("#screeningSearch")?.value || "").trim().toLowerCase();
  const rows = state.screenings.filter((item) => item.query.toLowerCase().includes(keyword));
  root.innerHTML = rows.length ? rows.map((item) => `<article class="saved-screening-row"><button class="saved-screening-open" data-screening-id="${item.id}"><strong>${escapeHtml(item.query.slice(0, 24))}</strong><small>${item.results?.length || 0} 条结果 · ${formatDate(item.createdAt)}</small></button><button class="saved-screening-delete" data-delete-screening="${item.id}" title="删除筛选记录" aria-label="删除筛选记录">×</button></article>`).join("") : '<p class="sidebar-empty-light">暂无已保存筛选</p>';
}

function renderResearchRecords() {
  const root = $("#researchRecordList");
  if (!root) return;
  const keyword = ($("#researchRecordSearch")?.value || "").trim().toLowerCase();
  const rows = state.researchRecords.filter((item) => `${item.title} ${item.industry} ${item.requirement || ""}`.toLowerCase().includes(keyword));
  root.innerHTML = rows.length ? rows.map((item) => `<article class="research-record-row"><button class="research-record-open" data-research-id="${item.id}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.depth || "标准研究")} · ${formatDate(item.createdAt)}</small></button><button class="research-record-delete" data-delete-research="${item.id}" title="删除研究记录" aria-label="删除研究记录">×</button></article>`).join("") : '<p class="sidebar-empty-light">暂无研究记录</p>';
}

function renderPeopleRecords() {
  const root = $("#peopleRecordList");
  if (!root) return;
  const keyword = ($("#peopleRecordSearch")?.value || "").trim().toLowerCase();
  const rows = state.peopleRecords.filter((item) => `${item.name} ${item.direction || ""} ${item.company || ""}`.toLowerCase().includes(keyword));
  const renderRow = (item) => {
    const isDirection = item.mode === "direction";
    const title = isDirection ? (item.direction || item.name) : item.name;
    const context = isDirection ? "人才图谱" : (item.company && item.company !== "未标注公司" ? item.company : "机构待核验");
    const meta = `${isDirection ? "按方向找人" : "指定人物调查"}${item.status === "failed" ? ` · 失败：${item.failureReason || "未知原因"}` : ""}`;
    return `<article class="people-record-row"><button class="people-record-open" data-person-record-id="${item.id}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(context)}</span><small>${meta} · ${formatDate(item.createdAt)}</small></button><button class="people-record-delete" data-delete-person-record="${item.id}" title="删除调查记录" aria-label="删除调查记录">×</button></article>`;
  };
  const directionRows = rows.filter((item) => item.mode === "direction");
  const personRows = rows.filter((item) => item.mode !== "direction");
  root.innerHTML = rows.length
    ? `${directionRows.length ? `<h3 class="people-record-group-title">按方向找人</h3>${directionRows.map(renderRow).join("")}` : ""}${personRows.length ? `<h3 class="people-record-group-title">指定人物调查</h3>${personRows.map(renderRow).join("")}` : ""}`
    : '<p class="sidebar-empty-light">暂无调查记录</p>';
}

function renderHistory() {
  const root = $("#historyList");
  if (!root) return;
  root.innerHTML = state.history.length
    ? state.history.map((item) => `<article class="list-row"><div class="row-main"><span class="file-badge">${escapeHtml(item.type)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${formatDate(item.createdAt)}</small></div></div></article>`).join("")
    : emptyState("暂无历史");
}

function handleChatEnter(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  sendChatFromInput(`#${event.currentTarget.id}`);
}

function sendChatFromInput(selector) {
  const input = $(selector);
  const text = input.value.trim();
  if (!text || chatRequestInFlight) return;
  input.value = "";
  sendChatMessage(text);
}

async function sendChatMessage(text) {
  if (!text || chatRequestInFlight) return;
  const attachmentText = pendingChatFiles
    .map((file) => `\n【附件：${file.name}】\n${file.text || "该文件在本地原型中仅记录文件名"}`)
    .join("");
  const userMessage = {
    id: makeId(),
    role: "user",
    content: `${text}${attachmentText}`,
    displayContent: text,
    createdAt: new Date().toISOString(),
  };
  state.chatMessages.push(userMessage);
  const activeSession = getActiveChatSession();
  if (activeSession && !activeSession.messages.some((message) => message.role === "user" && message.id !== userMessage.id)) {
    activeSession.title = text.slice(0, 28) || "新交流";
    $("#askSessionTitle").textContent = activeSession.title;
  }
  pendingChatFiles = [];
  $("#askAttachmentHint").textContent = "";
  $("#askChatFiles").value = "";
  chatRequestInFlight = true;
  chatStoppedByUser = false;
  updateChatSendButtons();
  saveState();
  renderChat(true);

  const thinking = {
    id: "eva-thinking",
    role: "assistant",
    content: "奔奔正在分析项目上下文...",
    createdAt: new Date().toISOString(),
    pending: true,
  };
  state.chatMessages.push(thinking);
  renderChat(true);

  let answer;
  let mode = "model";
  try {
    const result = await callChatApi();
    answer = result.message;
    var usage = result.usage;
    setModelStatus("大模型已连接");
  } catch (error) {
    if (chatStoppedByUser || error?.name === "AbortError") {
      answer = "已停止生成。";
      mode = "stopped";
    } else {
    const health = await getModelHealth().catch(() => null);
    if (health?.configured) {
      answer = buildModelFailureReply(error);
      mode = "error";
      const selected = health.profiles?.find((item) => item.id === selectedModelProfileId);
      setModelStatus(`大模型已配置 · ${selected?.name || "默认模型"}`);
    } else {
      answer = buildLocalEvaReply(text, error);
      mode = "local";
      setModelStatus("本地智能回复");
    }
    }
  }

  state.chatMessages = state.chatMessages.filter((message) => message.id !== thinking.id);
  state.chatMessages.push({
    id: makeId(),
    role: "assistant",
    content: answer,
    createdAt: new Date().toISOString(),
    mode,
    usage,
  });
  state.chatMessages = state.chatMessages.slice(-80);
  lastAskAnswer = answer;
  chatRequestInFlight = false;
  activeChatController = null;
  updateChatSendButtons();
  saveState();
  addHistory(`Ask 奔奔：${text.slice(0, 24)}`, "问答");
  renderChat(true);
}

function stopChatGeneration() {
  if (!chatRequestInFlight || !activeChatController) return;
  chatStoppedByUser = true;
  activeChatController.abort();
}

function updateChatSendButtons() {
  [$("#askChatSendBtn"), $("#floatingChatSendBtn")].forEach((button) => {
    if (!button) return;
    button.textContent = chatRequestInFlight ? "停止" : "发送";
    button.classList.toggle("stop-generation", chatRequestInFlight);
  });
}

function normalizeTokenUsage(usage) {
  if (!usage) return null;
  const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? 0);
  const output = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? 0);
  const total = Number(usage.total_tokens ?? usage.totalTokens ?? input + output);
  return { input, output, total };
}

function formatTokenUsage(usage) {
  return usage?.total ? ` · ${usage.total.toLocaleString("zh-CN")} Token` : "";
}

async function callChatApi() {
  if (location.protocol === "file:") throw new Error("请通过 server.mjs 启动后连接模型");
  const controller = new AbortController();
  activeChatController = controller;
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_CONFIG.timeoutMs);
  try {
    const response = await fetch(AI_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.chatSessionId,
        modelProfileId: currentAskModelProfileId(),
        messages: state.chatMessages
          .filter((message) => !message.pending)
          .slice(-24)
          .map(({ role, content }) => ({ role, content })),
        context: buildAgentContext(),
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `模型接口返回 ${response.status}`);
    if (!data.message) throw new Error("模型接口没有返回 message");
    return { message: data.message, usage: normalizeTokenUsage(data.usage) };
  } catch (error) {
    if (timedOut) throw new Error("模型响应超过 10 分钟，请重试");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function callAgentTask(prompt, context = {}) {
  const jobId = startAgentJob(context);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Math.max(15000, Number(context.timeoutMs) || AI_CONFIG.timeoutMs);
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const requestBody = JSON.stringify({ sessionId: makeId(), modelProfileId: currentAskModelProfileId(), messages: [{ role: "user", content: prompt }], context: context.minimalContext ? { ...context, minimalContext: undefined } : { ...buildAgentContext(), ...context } });
    let response;
    let lastNetworkError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { response = await fetch(AI_CONFIG.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody, signal: controller.signal }); break; }
      catch (error) { lastNetworkError = error; if (timedOut || attempt === 1) throw error; await new Promise((resolve) => window.setTimeout(resolve, 1500)); }
    }
    if (!response) throw lastNetworkError || new Error("云端模型接口没有响应");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `模型接口返回 ${response.status}`);
    if (!data.message) throw new Error("模型没有返回内容");
    const usage = normalizeTokenUsage(data.usage);
    finishAgentJob(jobId, "success", usage ? `Token：输入 ${usage.input} / 输出 ${usage.output} / 合计 ${usage.total}` : "");
    return data.message;
  } catch (error) {
    if (timedOut) {
      finishAgentJob(jobId, "error", "模型响应超时");
      throw new Error(`模型响应超过 ${Math.ceil(timeoutMs / 1000)} 秒，请重试`);
    }
    finishAgentJob(jobId, "error", friendlyRequestError(error));
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function buildAgentContext() {
  const activeView = $(`#${currentView}View`);
  const editingReport = getEditingReport();
  return {
    currentView,
    currentViewTitle: activeView?.dataset.title || currentView,
    projects: state.projects.slice(0, 12).map(({ name, sector, stage, owner, note, targetCompany, ddOutputs }) => ({ name, sector, stage, owner, note, targetCompany, latestDd: ddOutputs?.[0]?.content?.slice(0, 4000) || "" })),
    reports: state.reports.slice(0, 12).map(({ title, format, sector, type, status }) => ({ title, format, sector, type, status })),
    tasks: state.tasks.slice(0, 8).map(({ name, cadence, prompt, lastResult }) => ({ name, cadence, prompt, lastResult })),
    risks: state.risks.slice(0, 12),
    memories: state.memories.slice(0, 8).map(({ name, scene, content }) => ({ name, scene, content })),
    editingReport: currentView === "reportEditor" && editingReport
      ? { title: editingReport.title, format: editingReport.format, text: stripHtml($("#reportEditor").innerHTML).slice(0, 12000) }
      : null,
  };
}

function buildLocalEvaReply(question, error) {
  const projectHint = state.projects.length
    ? `当前项目池有 ${state.projects.length} 个项目，建议优先推进「${state.projects[0].name}」，并核验客户、订单、毛利率和现金流。`
    : "当前项目池为空，建议先从标的搜索加入 3-5 个候选项目。";
  const riskHint = state.risks.length
    ? `当前记录了 ${state.risks.length} 个风险点，应先补充合同、订单台账、审计报表和访谈纪要。`
    : "目前没有结构化风险项，建议先建立尽调风险矩阵。";
  return `我已收到你的问题：“${question}”\n\n${projectHint}\n\n${riskHint}\n\n下一步建议：\n1. 明确这次需要形成的决策或交付物。\n2. 把关键判断拆成证据、假设和待核验事项。\n3. 在报告中心沉淀成 IC Memo 或行业研究报告。\n\n当前未连接外部大模型，正在使用本地降级回答。${error?.message ? `（${error.message}）` : ""}`;
}

function buildModelFailureReply(error) {
  const detail = error?.message || "未知请求错误";
  return `外部大模型已经配置，但本次请求没有完成（${detail}）。请稍后重试；如果连续出现，可新建对话以减少历史上下文。`;
}

function renderChat(scrollToEnd = false) {
  const html = state.chatMessages.map(renderChatMessage).join("");
  $("#askChatMessages").innerHTML = html;
  $("#floatingChatMessages").innerHTML = html;
  const activeSession = getActiveChatSession();
  if (activeSession) $("#askSessionTitle").textContent = activeSession.title;
  renderConversationList();
  if (scrollToEnd) {
    [$("#askChatMessages"), $("#floatingChatMessages")].forEach((root) => {
      root.scrollTop = root.scrollHeight;
    });
  }
}

function renderChatMessage(message) {
  const content = escapeHtml(message.displayContent || message.content).replace(/\n/g, "<br>");
  return `<article class="chat-message ${message.role} ${message.pending ? "pending" : ""}">
    ${message.role === "assistant" ? '<span class="chat-avatar">TE</span>' : ""}
    <div class="chat-bubble"><p>${content}</p><small>${formatDate(message.createdAt)}${message.mode === "local" ? " · 本地" : message.mode === "error" ? " · 请求失败" : message.mode === "stopped" ? " · 已停止" : ""}${formatTokenUsage(message.usage)}</small></div>
  </article>`;
}

function updateEvaVisibility() {
  const onAskPage = currentView === "ask";
  $("#floatingEva").hidden = onAskPage || evaMinimized;
  $("#evaLauncher").hidden = onAskPage || !evaMinimized;
  const title = $(`#${currentView}View`)?.dataset.title || currentView;
  $("#floatingContextLabel").textContent = `正在查看：${title}`;
  if (!onAskPage) renderChat(true);
}

function setModelStatus(text) {
  $("#askModelStatus").textContent = text;
  $("#floatingModelStatus").textContent = text;
}

function startNewChat() {
  const session = {
    id: makeId(),
    title: "新交流",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [{
    id: makeId(),
    role: "assistant",
    content: "已开始新交流。请输入研究问题，我会结合项目、报告和 Skill 上下文协助你。",
    createdAt: new Date().toISOString(),
    mode: "local",
    }],
  };
  state.chatSessions.unshift(session);
  state.activeChatSessionId = session.id;
  state.chatSessionId = session.id;
  state.chatMessages = session.messages;
  saveState();
  renderChat(true);
  $("#askChatInput").focus();
}

function getActiveChatSession() {
  return state.chatSessions.find((session) => session.id === state.activeChatSessionId) || state.chatSessions[0];
}

function selectChatSession(sessionId) {
  if (chatRequestInFlight) return toast("请等待当前回答完成。");
  const session = state.chatSessions.find((item) => item.id === sessionId);
  if (!session) return;
  state.activeChatSessionId = session.id;
  state.chatSessionId = session.id;
  state.chatMessages = session.messages;
  saveState();
  renderChat(true);
}

function deleteChatSession(sessionId) {
  if (chatRequestInFlight) return toast("请等待当前回答完成。");
  state.chatSessions = state.chatSessions.filter((session) => session.id !== sessionId);
  if (!state.chatSessions.length) return startNewChat();
  if (state.activeChatSessionId === sessionId) selectChatSession(state.chatSessions[0].id);
  else {
    saveState();
    renderConversationList();
  }
}

function renderConversationList() {
  const root = $("#conversationList");
  if (!root) return;
  const keyword = ($("#conversationSearch")?.value || "").trim().toLowerCase();
  const rows = state.chatSessions.filter((session) => session.title.toLowerCase().includes(keyword));
  root.innerHTML = rows.length ? rows.map((session) => {
    const last = [...session.messages].reverse().find((message) => !message.pending);
    return `<article class="conversation-item ${session.id === state.activeChatSessionId ? "active" : ""}">
      <button data-session-id="${session.id}"><strong>${escapeHtml(session.title)}</strong><span>${escapeHtml((last?.displayContent || last?.content || "暂无内容").slice(0, 44))}</span><small>${formatDate(session.updatedAt)}</small></button>
      <button class="conversation-delete" data-delete-session="${session.id}" title="删除交流">×</button>
    </article>`;
  }).join("") : emptyState("没有匹配的交流记录");
}

function exportChat() {
  const text = state.chatMessages.map((message) => `${message.role === "user" ? "我" : "奔奔"}：${message.content}`).join("\n\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `奔奔对话-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildResearchReport() {
  const industry = $("#industryInput").value.trim() || "未命名赛道";
  const deliverable = $("#deliverableInput").value;
  const depth = $("#depthInput").value;
  const focus = $("#focusInput").value.trim();
  const corpus = researchDocs.map((doc) => doc.text).join("\n");
  const keywords = extractKeywords(`${industry} ${focus} ${corpus}`).slice(0, 8);
  const sources = researchDocs.length ? researchDocs.map((doc) => doc.name) : ["内置行业框架", ...state.memories.slice(0, 2).map((m) => m.name)];
  const opportunities = inferOpportunities(industry, keywords);
  const risks = inferRisks(industry, corpus);
  const actions = [
    `补齐${industry}市场规模、价格链、竞争格局三张底表。`,
    `筛选3-5家${industry}细分环节标的，优先验证客户、订单、毛利率和产能。`,
    "所有关键判断绑定资料来源、页码或访谈纪要，无法溯源的结论暂不进入上会材料。",
  ];
  const title = `${industry}${deliverable}`;
  const memoHtml = `<h3>核心结论</h3><p>${escapeHtml(industry)}当前适合作为“主题跟踪 + 标的池建设”的研究任务。${escapeHtml(depth)}阶段应先确定利润分布、可验证订单和技术壁垒，再进入单项目深度尽调。</p><h3>投资关注点</h3><ul>${opportunities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>风险提示</h3><ul>${risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>资料溯源</h3><ul>${sources.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`;
  const mapHtml = `<div class="chain-map"><div class="chain-node"><b>上游</b><p>${escapeHtml(buildChainText(industry, "上游", keywords))}</p></div><div class="chain-node"><b>中游</b><p>${escapeHtml(buildChainText(industry, "中游", keywords))}</p></div><div class="chain-node"><b>下游</b><p>${escapeHtml(buildChainText(industry, "下游", keywords))}</p></div></div>`;
  const actionHtml = `<ol>${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
  const exportHtml = `<h1>${escapeHtml(title)}</h1><p><b>研究深度：</b>${escapeHtml(depth)}　<b>关注重点：</b>${escapeHtml(focus || "未指定")}</p>${memoHtml}<h2>产业链拆解</h2>${mapHtml}<h2>下一步行动</h2>${actionHtml}`;
  return { title, industry, deliverable, memoHtml, mapHtml, actionHtml, exportHtml };
}

async function generateResearchReport() {
  const reportDate = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  const industry = $("#industryInput").value.trim() || "未命名赛道";
  const deliverable = $("#deliverableInput").value;
  const depth = $("#depthInput").value;
  const focus = $("#focusInput").value.trim();
  const requirement = $("#researchPromptInput").value.trim();
  if (!requirement) throw new Error("请先输入研究要求或提示词");
  const sourceText = researchDocs.map((doc) => `【${doc.name}】\n${doc.text || "仅记录文件名"}`).join("\n\n").slice(0, 30000);
  const searchQueries = researchMode === "deep"
    ? [`${industry} 行业政策 监管`, `${industry} 市场规模 增长率`, `${industry} 产业链 核心环节`, `${industry} 竞争格局 头部公司`, `${industry} 投资 风险 融资`]
    : [`${industry} 行业研究 市场 产业链`, `${industry} 投融资 竞争格局`];
  const searchedSources = await searchPeopleSourcesAdvanced(searchQueries, "", false, [], industry);
  const privateRssSources = await fetchRelevantPrivateRss(`${industry} ${requirement}`, ["policy", "pbc", "reports_10jqka", "reports_eastmoney", "jiemian", "aicaijing", "ifeng_stock", "36kr", "wechat", "xueqiu"]);
  const webSources = [...new Map([...privateRssSources, ...searchedSources].map((item) => [item.url, item])).values()].slice(0, researchMode === "deep" ? 40 : 24);
  const webText = webSources.map((item, index) => `[${index + 1}] ${item.title}\n${item.snippet}\n${item.url}`).join("\n\n").slice(0, researchMode === "deep" ? 50000 : 24000);
  const prompt = `你是时代电气投研助手。请根据以下要求生成一份专业、完整、可提交给投资管理者的${deliverable}。
报告基准日期：${reportDate}。所有“当前、最新、近期”判断必须以该日期为准，不得把 2024 年当作当前年份；历史数据和预测数据必须明确区分。

研究赛道：${industry}
研究深度：${depth}
关注重点：${focus || "由你根据任务判断"}
用户要求：${requirement}
参考资料：${sourceText || "暂无附件，请明确标注需要外部核验的数据"}
研究模式：${researchMode === "deep" ? "深度研究（政策、市场、产业链、竞争与风险多维交叉验证）" : "专业研究（快速联网研究与多源验证）"}
联网来源：\n${webText}

报告必须包含：执行摘要、核心结论、行业定义与边界、市场空间与驱动因素、产业链、竞争格局、重点公司或标的、商业模式与关键指标、投资机会、主要风险、待核验事项、下一步行动。联网事实必须用[序号]引用来源；区分事实、推断和待核验项；不得虚构数据或来源。使用清晰的中文 Markdown 标题和列表。`;
  const answer = await callAgentTask(prompt, { taskType: "research-report", industry, deliverable, depth, researchMode, timeoutMs: 600000, minimalContext: true });
  const reportHtml = markdownToHtml(answer);
  const webSourceHtml = `<h2>联网来源</h2><ol>${webSources.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></li>`).join("")}</ol>`;
  const local = buildResearchReport();
  const title = `${industry}${deliverable}`;
  return {
    title,
    industry,
    deliverable,
    depth,
    focus,
    requirement,
    memoHtml: `${reportHtml}${webSourceHtml}`,
    mapHtml: local.mapHtml,
    actionHtml: `<p>报告中的“待核验事项”和“下一步行动”已作为执行清单生成。</p>${local.actionHtml}`,
    exportHtml: `<h1>${escapeHtml(title)}</h1>${reportHtml}${webSourceHtml}`,
  };
}

function markdownToHtml(text) {
  const escaped = escapeHtml(text || "");
  return escaped
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split(/\n{2,}/)
    .map((block) => /^<(h\d|li)/.test(block) ? block : `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function buildPeopleReport() {
  const name = $("#personNameInput").value.trim() || "未命名人物";
  const company = $("#personCompanyInput").value.trim() || "未标注公司";
  const role = $("#personRoleInput").value.trim() || "未标注角色";
  const focus = $("#personFocusInput").value.trim();
  const notes = $("#personNotesInput").value.trim();
  const risk = /诉讼|失信|处罚|纠纷|离职|套现/.test(notes) ? "资料中出现潜在负面词，需要优先做公开记录和访谈交叉验证。" : "当前输入未发现明显负面词，但仍需验证履历、股权、关联交易和历史融资承诺。";
  const html = `<h3>${escapeHtml(name)} 人物调查</h3><p><b>公司/角色：</b>${escapeHtml(company)} · ${escapeHtml(role)}</p><h3>调查重点</h3><p>${escapeHtml(focus)}</p><h3>初步画像</h3><ul><li>核验教育和职业经历是否与公司技术路线匹配。</li><li>梳理过往融资、产业客户、共同投资人和潜在利益关联。</li><li>重点访谈离职原因、股权安排、关键团队稳定性和客户资源来源。</li></ul><h3>风险提示</h3><p>${escapeHtml(risk)}</p><h3>建议访谈问题</h3><ol><li>公司最关键的非共识判断是什么？</li><li>未来 12 个月最可能失约的经营指标是什么？</li><li>核心客户和供应商是否依赖创始人个人关系？</li></ol>`;
  return { title: `${company}-${name}人物调查`, html };
}

function renderResearchOutput(report) {
  $("#memoOutput").innerHTML = report.memoHtml;
  $("#mapOutput").innerHTML = report.mapHtml;
  $("#actionsOutput").innerHTML = report.actionHtml;
}

function saveReport(title, format, html, sector, type) {
  const now = new Date().toISOString();
  state.reports.unshift({ id: makeId(), title, format, html, sector, type, source: "manual", templateName: "", status: "已完成", createdAt: now, updatedAt: now });
  saveState();
  addHistory(`保存报告：${title}`, "报告");
  renderAll();
}

function openTemplateModal(format) {
  activeTemplateFormat = format;
  $("#templateModalTitle").textContent = `选择 ${formatLabel(format)} 模板`;
  $("#templateGrid").innerHTML = [
    ...reportTemplates[format].map(
      (template) => `
      <button class="template-option" data-template-id="${template.id}">
        <strong>${escapeHtml(template.title)}</strong>
        <span>${escapeHtml(template.subtitle)}</span>
      </button>`,
    ),
    `<button class="template-option import-option" data-template-id="import"><strong>导入 ${formatLabel(format)}</strong><span>${importHint(format)}</span><input type="file" id="templateImportInput" accept="${acceptForFormat(format)}" /></button>`,
  ].join("");
  $("#templateModal").hidden = false;
  $$("[data-template-id]", $("#templateGrid")).forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.templateId === "import") return $("#templateImportInput").click();
      createReportFromTemplate(activeTemplateFormat, button.dataset.templateId);
    });
  });
  $("#templateImportInput")?.addEventListener("change", (event) => importReportFile(activeTemplateFormat, event.target.files[0]));
}

function closeTemplateModal() {
  $("#templateModal").hidden = true;
}

function createReportFromTemplate(format, templateId) {
  const template = reportTemplates[format].find((item) => item.id === templateId);
  if (!template) return;
  const report = {
    id: makeId(),
    title: template.title,
    format,
    html: template.html,
    sector: "通用",
    type: "模板",
    source: "template",
    templateName: template.title,
    status: "已完成",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.reports.unshift(report);
  saveState();
  addHistory(`从模板新建：${template.title}`, "报告");
  closeTemplateModal();
  renderAll();
  openReportEditor(report.id);
  toast(`已创建 ${template.title}，可直接编辑。`);
}

function importReportFile(format, file) {
  if (!file) return;
  const report = {
    id: makeId(),
    title: file.name.replace(/\.[^.]+$/, ""),
    format,
    html: `<h1>${escapeHtml(file.name.replace(/\.[^.]+$/, ""))}</h1><p>已导入文件：${escapeHtml(file.name)}</p><p>当前本地原型记录文件名称；上线后可接 Word/Excel/PPT 解析服务，把原文件正文还原到编辑器。</p>`,
    sector: "导入",
    type: "导入",
    source: "import",
    templateName: "导入文件",
    status: "已完成",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.reports.unshift(report);
  saveState();
  addHistory(`导入报告：${report.title}`, "报告");
  closeTemplateModal();
  renderAll();
  openReportEditor(report.id);
}

function openReportEditor(id) {
  const report = state.reports.find((item) => item.id === id);
  if (!report) return;
  editingReportId = id;
  $("#editorTitleInput").value = report.title;
  $("#editorFormatBadge").textContent = report.format;
  $("#editorSavedAt").textContent = report.updatedAt ? `编辑过 · ${formatDate(report.updatedAt)}` : `创建于 · ${formatDate(report.createdAt)}`;
  $("#reportEditor").innerHTML = report.html;
  $("#evaActivity").innerHTML = `<p>奔奔还没在工作</p><small>右下输入问题，过程会显示在这里</small>`;
  switchView("reportEditor");
}

function getEditingReport() {
  return state.reports.find((item) => item.id === editingReportId);
}

function saveEditorReport() {
  const report = getEditingReport();
  if (!report) return;
  report.title = $("#editorTitleInput").value.trim() || report.title;
  report.html = $("#reportEditor").innerHTML;
  report.updatedAt = new Date().toISOString();
  saveState();
  renderAll();
  $("#editorSavedAt").textContent = `编辑过 · ${formatDate(report.updatedAt)}`;
  toast("报告已保存。");
}

function runEditorCommand(command, value) {
  $("#reportEditor").focus();
  if (command === "insertTable") {
    document.execCommand("insertHTML", false, "<table><tr><th>项目</th><th>说明</th><th>数据</th></tr><tr><td>填写</td><td>填写</td><td>填写</td></tr></table>");
    return;
  }
  document.execCommand(command, false, value || null);
}

function askEvaInEditor() {
  const prompt = $("#evaPromptInput").value.trim() || "请基于当前报告给出修改建议";
  const selected = window.getSelection().toString().trim();
  const report = getEditingReport();
  const advice = selected
    ? `已读取选中文本「${escapeHtml(selected.slice(0, 80))}」。建议补充数据来源、关键假设和风险缓释动作。`
    : `已读取《${escapeHtml(report?.title || "当前报告")}》。建议检查结论是否前置、每个判断是否有证据、财务假设是否能追溯。`;
  $("#evaActivity").innerHTML = `<p><b>问题：</b>${escapeHtml(prompt)}</p><p>${advice}</p><ul><li>补齐数据来源和日期。</li><li>把“观点”拆成证据、判断、行动。</li><li>对估值和风险增加敏感性说明。</li></ul>`;
  $("#evaPromptInput").value = "";
}

function downloadReport(report) {
  const format = report.format || "DOCX";
  const ext = format === "PPTX" ? "ppt" : format === "XLSX" ? "xls" : "doc";
  const type = format === "PPTX" ? "application/vnd.ms-powerpoint" : format === "XLSX" ? "application/vnd.ms-excel" : "application/msword";
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title></head><body style="font-family:Microsoft YaHei,Arial,sans-serif;line-height:1.7;color:#17211a;">${report.html}</body></html>`;
  const blob = new Blob([doc], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(report.title)}.${ext}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  addHistory(`下载报告：${report.title}`, "下载");
}

function addCompanyProject(name) {
  const company = [...state.currentScreeningResults, ...sampleCompanies].find((item) => item.name === name);
  if (!company) return toast("未找到该候选公司，请重新执行筛选。");
  if (!company) return;
  if (state.projects.some((project) => project.name === company.name)) return toast("项目池里已经有这个标的。");
  state.projects.unshift({ id: makeId(), name: company.name, sector: company.sector, stage: "初筛", owner: "待分配", note: company.intro, createdAt: new Date().toISOString() });
  saveState();
  addHistory(`加入项目池：${company.name}`, "项目");
  renderAll();
  toast(`${company.name} 已加入项目池。`);
}

function addFavorite(type, title, content) {
  state.favorites.unshift({ id: makeId(), type, title, content, createdAt: new Date().toISOString() });
  saveState();
  addHistory(`收藏 ${type}：${title}`, "收藏");
  renderAll();
}

function addHistory(title, type) {
  state.history.unshift({ id: makeId(), title, type, createdAt: new Date().toISOString() });
  state.history = state.history.slice(0, 80);
  saveState();
}

function deleteById(collection, id) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState();
  addHistory(`删除 ${collection}`, "删除");
}

function renameReport(report) {
  const next = window.prompt("输入新的报告标题", report.title);
  if (!next) return;
  report.title = next.trim();
  saveState();
  addHistory(`编辑报告标题：${report.title}`, "报告");
}

function advanceProject(project) {
  const stages = ["初筛", "立项", "尽调", "投后"];
  project.stage = stages[(stages.indexOf(project.stage) + 1) % stages.length];
  saveState();
  addHistory(`项目流转：${project.name} -> ${project.stage}`, "项目");
}

async function runTask(task) {
  const previous = task.lastResult || "首次执行";
  task.lastResult = "奔奔正在执行任务...";
  renderTasks();
  try {
    const prompt = `你是时代电气投研助手奔奔。立即执行以下定时投研任务，并输出简洁、专业、可核验的监控摘要。
任务名称：${task.name}
执行频率：${task.cadence}
任务要求：${task.prompt}
上次结果：${previous.slice(0, 4000)}
输出：核心发现、变化事项、风险提示、下一步动作。无法确认的最新信息必须标记待核验。`;
    const answer = await callAgentTask(prompt, { taskType: "scheduled-research", taskName: task.name, taskId: task.id });
    task.lastResult = answer.replace(/[#*]/g, "").trim();
    task.lastRunAt = new Date().toISOString();
    task.changeSummary = previous === "首次执行" || /等待/.test(previous) ? "首次执行完成" : "已与上次结果对比";
    saveReport(`${task.name} 执行摘要`, "DOCX", `<h1>${escapeHtml(task.name)}</h1>${markdownToHtml(answer)}`, "监控", "定时任务");
    addHistory(`执行定时任务：${task.name}`, "定时任务");
    toast("定时任务执行完成，结果已保存到报告中心。");
  } catch (error) {
    const reason = friendlyRequestError(error);
    const fallback = `本地降级摘要：已记录任务“${task.name}”并完成执行检查。当前无法调用外部大模型，研究结论和最新数据待联网核验。任务要求：${task.prompt || "未填写"}`;
    task.lastResult = `${fallback}（原因：${reason}）`;
    task.lastRunAt = new Date().toISOString();
    task.changeSummary = "已生成本地降级摘要";
    saveReport(`${task.name} 本地执行摘要`, "DOCX", `<h1>${escapeHtml(task.name)}</h1><p>${escapeHtml(fallback)}</p><p><strong>连接诊断：</strong>${escapeHtml(reason)}</p>`, "监控", "定时任务");
    addHistory(`定时任务降级执行：${task.name}`, "定时任务");
    saveState();
    toast(`任务已降级执行：${reason}`);
  }
}

async function checkDueTasks() {
  if (taskSchedulerBusy || chatRequestInFlight) return;
  const now = new Date();
  const due = state.tasks.find((task) => {
    if (!task.active) return false;
    return isTaskDue(task, now);
  });
  if (!due) return;
  taskSchedulerBusy = true;
  try {
    await runTask(due);
    renderAll();
  } finally {
    taskSchedulerBusy = false;
  }
}

async function runBpAnalysis() {
  if (!bpDocument) return toast("请先上传 BP 文件。");
  const dimensions = $$('#bpDimensionGrid input:checked').map((input) => input.value);
  if (!dimensions.length) return toast("请至少选择一个分析角度。");
  const button = $("#runBpAnalysisBtn");
  button.disabled = true;
  button.textContent = "奔奔分析中...";
  try {
    const projectName = $("#bpProjectName").value.trim() || bpDocument.name.replace(/\.[^.]+$/, "");
    const prompt = `你是奔奔，一名一级市场投资分析师。请分析以下 BP，生成专业初筛报告。
项目名称：${projectName}
分析维度：${dimensions.join("、")}
文件：${bpDocument.name}
可读取正文：${(bpDocument.text || "二进制文件，当前只能依据文件名和用户选择的维度生成待核验框架").slice(0, 30000)}
每个维度给出：核心判断、证据、风险、待核验问题。最后给出初筛建议（推进/观察/暂缓）和下一步尽调清单。禁止虚构精确数据。`;
    const answer = await callAgentTask(prompt, { taskType: "bp-analysis", projectName, dimensions });
    $("#bpAnalysisOutput").hidden = false;
    $("#bpAnalysisOutput").innerHTML = `<h2>${escapeHtml(projectName)} BP 分析</h2>${markdownToHtml(answer)}`;
    let project = state.projects.find((item) => item.name === projectName);
    if (!project) {
      project = { id: makeId(), name: projectName, sector: "待识别", stage: "初筛", owner: "待分配", round: "待核验", amount: "", equity: "", note: "由 BP 分析创建", targetCompany: "", ddOutputs: [], createdAt: new Date().toISOString() };
      state.projects.unshift(project);
    }
    saveReport(`${projectName} BP 初筛报告`, "DOCX", `<h1>${escapeHtml(projectName)} BP 初筛报告</h1>${markdownToHtml(answer)}`, project.sector, "BP分析");
    saveState();
    renderAll();
    toast("BP 分析完成，报告和项目已保存。");
  } catch (error) {
    toast(`BP 分析失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "开始分析";
  }
}

function openProjectDetail(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  activeProjectId = project.id;
  $("#detailProjectName").textContent = project.name;
  $("#detailProjectStage").textContent = project.stage;
  $("#detailWorkspaceTitle").textContent = project.name;
  $("#targetCompanyInput").value = project.targetCompany || "";
  renderDdOutput(project);
  switchView("projectDetail");
}

function saveTargetCompany() {
  const project = state.projects.find((item) => item.id === activeProjectId);
  if (!project) return;
  project.targetCompany = $("#targetCompanyInput").value.trim();
  project.updatedAt = new Date().toISOString();
  saveState();
  toast("标的公司信息已保存。");
}

async function generateDdOutput() {
  const project = state.projects.find((item) => item.id === activeProjectId);
  if (!project) return toast("请先选择项目。");
  const type = $("#ddTypeSelect").value;
  const requirement = $("#ddPromptInput").value.trim();
  const button = $("#generateDdBtn");
  button.disabled = true;
  button.textContent = "奔奔生成中...";
  try {
    const prompt = `你是奔奔，请为投资项目生成结构化尽调产物。
项目：${project.name}
标的公司：${project.targetCompany || "待补充"}
行业：${project.sector}
项目简介：${project.note || "待补充"}
产物类型：${type}
补充要求：${requirement || "按专业一级市场尽调标准执行"}
输出必须区分已知事实、分析推断和待核验事项，并给出可执行的资料清单与访谈问题。`;
    const answer = await callAgentTask(prompt, { taskType: "due-diligence", project: project.name, outputType: type });
    project.ddOutputs = project.ddOutputs || [];
    project.ddOutputs.unshift({ id: makeId(), type, content: answer, createdAt: new Date().toISOString() });
    project.updatedAt = new Date().toISOString();
    saveState();
    renderDdOutput(project);
    addHistory(`生成 DD 产物：${project.name}-${type}`, "项目尽调");
    toast("DD 产物已生成并保存到项目。");
  } catch (error) {
    toast(`DD 生成失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "生成 DD 产物";
  }
}

function renderDdOutput(project) {
  const output = project.ddOutputs?.[0];
  $("#ddOutput").hidden = !output;
  $(".project-empty-state").hidden = Boolean(output);
  if (output) $("#ddOutput").innerHTML = `<h2>${escapeHtml(output.type)} · ${escapeHtml(project.name)}</h2>${markdownToHtml(output.content)}<p class="meta-line">生成于 ${formatDate(output.createdAt)}</p>`;
}

async function readFiles(fileList) {
  const files = Array.from(fileList || []);
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, type: file.type || "unknown", text: String(reader.result || "") });
          reader.onerror = () => resolve({ name: file.name, type: file.type || "unknown", text: "" });
          if (isTextLike(file)) reader.readAsText(file, "utf-8");
          else resolve({ name: file.name, type: file.type || "binary", text: "" });
        }),
    ),
  );
}

function isTextLike(file) {
  const name = file.name.toLowerCase();
  return file.type.startsWith("text/") || [".txt", ".md", ".csv", ".json", ".log"].some((suffix) => name.endsWith(suffix));
}

function renderFileChips(files, root) {
  root.innerHTML = files.map((file) => `<span class="file-chip">${escapeHtml(file.name)} · ${file.text ? "已解析" : "仅记录"}</span>`).join("");
}

function scoreCompany(company, filters) {
  let score = 48;
  const text = `${filters.nl} ${filters.sector} ${filters.round} ${filters.region}`.toLowerCase();
  if (filters.sector && company.sector === filters.sector) score += 18;
  if (filters.round && company.round === filters.round) score += 12;
  if (filters.region && company.region === filters.region) score += 12;
  if (text.includes(company.sector.toLowerCase())) score += 10;
  if (text.includes(company.region.toLowerCase())) score += 8;
  if (text.includes("a轮以后") && ["A轮", "B轮", "C轮"].includes(company.round)) score += 10;
  company.tags.forEach((tag) => {
    if (text.includes(tag.toLowerCase()) || text.includes(tag.slice(0, 2).toLowerCase())) score += 5;
  });
  if (text.includes("卡位") && company.tags.includes("产业链卡位")) score += 10;
  return Math.max(42, Math.min(98, score));
}

function extractKeywords(text) {
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ").split(/\s+/).filter((word) => word.length >= 2);
  const stop = new Set(["公司", "行业", "投资", "研究", "项目", "风险", "市场", "核心", "资料", "业务"]);
  const counts = new Map();
  cleaned.forEach((word) => {
    if (!stop.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
}

function inferOpportunities(industry, keywords) {
  const base = [
    `${industry}的一级市场机会应优先落在供给稀缺、客户验证明确、单位经济模型可解释的环节。`,
    "若出现产业资本持续跟投和头部客户复购，该细分环节具备更高尽调优先级。",
    "标的筛选应把订单质量、交付能力和毛利韧性作为排序条件。",
  ];
  if (keywords.length) base.push(`资料高频线索包括：${keywords.slice(0, 5).join("、")}，建议作为后续访谈提纲。`);
  return base;
}

function inferRisks(industry, corpus) {
  const risks = [
    `${industry}容易出现叙事先行，需防止用远期空间替代当期商业化证据。`,
    "若收入预测高于历史收入两个数量级，需要拆分客户订单、交付节奏、产能和回款依据。",
    "公开资料和公司 BP 对关键指标口径可能不一致，进入尽调前必须做口径表。",
  ];
  if (/亏损|毛利率|现金流|回款|应收/.test(corpus)) risks.push("资料中出现财务质量相关词，应重点核验毛利率、现金流和应收账款。");
  return risks;
}

function buildChainText(industry, part, keywords) {
  const presets = {
    上游: "核心材料、关键零部件、设备和算法底座，重点看供应稀缺性和国产替代弹性。",
    中游: "系统集成、产品工程化、生产良率和交付能力，重点看从样品到量产的爬坡速度。",
    下游: "头部客户、场景落地、渠道和回款质量，重点看真实复购与价格承受力。",
  };
  const clue = keywords.length ? `资料线索：${keywords.slice(0, 3).join("、")}。` : "";
  return `${industry}${part}：${presets[part]}${clue}`;
}

function seedDemoData() {
  state.projects = [
    { id: makeId(), name: "灵构机器人", sector: "人形机器人", stage: "初筛", owner: "行研一组", round: "A轮", amount: "5000万元", equity: "8%", note: "关节模组进入客户测试线，需验证量产良率。", createdAt: new Date().toISOString() },
    { id: makeId(), name: "刻蚀微科", sector: "半导体设备", stage: "尽调", owner: "硬科技组", round: "B轮", amount: "8000万元", equity: "6%", note: "订单质量较好，重点核验毛利率和客户集中度。", createdAt: new Date().toISOString() },
    { id: makeId(), name: "云诊智联", sector: "AI医疗", stage: "立项", owner: "医疗组", round: "Pre-A", amount: "3000万元", equity: "10%", note: "需要补齐器械注册和医院付费数据。", createdAt: new Date().toISOString() },
  ];
  state.reports = [
    normalizeReport({ title: "行业分析 PPT", format: "PPTX", source: "manual", sector: "人形机器人", html: "<h1>行业分析 PPT</h1><p>赛道结论、产业链地图、标的对比、投资建议。</p>" }),
    normalizeReport({ title: "投后月报", format: "DOCX", source: "manual", sector: "AI医疗", html: "<h1>投后月报</h1><p>经营数据、融资进展、风险事项。</p>" }),
    normalizeReport({ title: "Cap Table", format: "XLSX", source: "manual", sector: "半导体设备", html: "<table border='1'><tr><th>股东</th><th>比例</th></tr><tr><td>创始团队</td><td>58%</td></tr></table>" }),
  ];
  state.tasks = structuredClone(defaultState.tasks);
  state.risks = [{ id: makeId(), level: "高", title: "收入预测跨度过大", detail: "BP预测收入与历史实际收入差距较大，需补充订单和产能依据。" }];
  state.favorites = [];
  state.history = [];
  state.memories = structuredClone(defaultState.memories);
  saveState();
  addHistory("载入演示数据", "系统");
}

function renderIcons() {
  $$("[data-icon]").forEach((node) => {
    const svg = icons[node.dataset.icon];
    if (!svg) return;
    node.innerHTML = svg;
    const svgNode = node.querySelector("svg");
    svgNode.setAttribute("fill", "none");
    svgNode.setAttribute("stroke", "currentColor");
    svgNode.setAttribute("stroke-width", "1.8");
    svgNode.setAttribute("stroke-linecap", "round");
    svgNode.setAttribute("stroke-linejoin", "round");
  });
}

function emptyState(text) {
  return `<div class="empty-state"><span data-icon="empty"></span><strong>${escapeHtml(text)}</strong><small>完成一次生成、收藏或保存后会自动沉淀到这里。</small></div>`;
}

function formatFromType(type = "") {
  if (/ppt/i.test(type)) return "PPTX";
  if (/excel|xls|模型|table/i.test(type)) return "XLSX";
  return "DOCX";
}

function formatLabel(format) {
  return format === "DOCX" ? "Word" : format === "XLSX" ? "模型" : "PPT";
}

function templateHint(format) {
  if (format === "DOCX") return "IC Memo、尽调报告、行业研究、投后月报、退出分析";
  if (format === "XLSX") return "DCF、三表、敏感性、可比公司、Cap Table";
  return "投决会、行业分析、路演、投后月报";
}

function importHint(format) {
  if (format === "DOCX") return "上传 .docx / .doc";
  if (format === "XLSX") return "上传 .xlsx / .xls / .csv";
  return "上传 .pptx / .ppt";
}

function acceptForFormat(format) {
  if (format === "DOCX") return ".doc,.docx";
  if (format === "XLSX") return ".xls,.xlsx,.csv";
  return ".ppt,.pptx";
}

function makeId() {
  return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function sanitizeFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "_");
}

function stripHtml(value) {
  const div = document.createElement("div");
  div.innerHTML = value;
  return div.textContent || div.innerText || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toast(message) {
  const oldToast = $(".toast");
  if (oldToast) oldToast.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 2600);
}

boot();
