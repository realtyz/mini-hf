export const landingContent = {
  header: {
    brand: "mini-hf",
    navigation: [
      { label: "使用文档", href: "/docs", icon: "BookOpen" },
      { label: "仓库列表", href: "/repositories", icon: "Database" },
      { label: "任务队列", href: "/tasks-public", icon: "ListOrdered" },
    ],
    cta: "登录",
  },
  hero: {
    headline: "局域网 HuggingFace 缓存代理",
    subheadline:
      "企业级模型缓存，为 AI 团队赋能，为网络基建减负。",
    primaryCta: "开始使用",
    secondaryCta: "查看文档",
  },
  features: [
    {
      title: "透明缓存",
      description: "兼容 HuggingFace Hub API，设置 HF_ENDPOINT 即可接入，现有代码无需改动",
      icon: "Database",
    },
    {
      title: "局域网提速",
      description: "首次从公网拉取后写入 S3，后续请求直接走内网，速度取决于你的局域网带宽",
      icon: "Zap",
    },
    {
      title: "任务队列",
      description: "下载任务排队执行，避免多个大模型同时抢占出口带宽，支持取消和进度追踪",
      icon: "ListOrdered",
    },
    {
      title: "统一出口",
      description: "所有 HF 流量经由 mini-hf 中转，便于在网络边界统一管控外网访问",
      icon: "Shield",
    },
  ],
  howItWorks: {
    title: "工作原理",
    steps: [
      {
        number: "01",
        title: "部署 mini-hf",
        description: "启动服务，配置 PostgreSQL、Redis 和 S3 存储凭证",
      },
      {
        number: "02",
        title: "设置 HF_ENDPOINT",
        description: "将 HF_ENDPOINT 指向你的 mini-hf 地址，其余不变",
      },
      {
        number: "03",
        title: "正常使用",
        description: "huggingface_hub、transformers、datasets 等库无需任何修改",
      },
      {
        number: "04",
        title: "共享缓存",
        description: "文件写入 S3 后，团队内任何机器的后续请求直接走内网",
      },
    ],
  },
  codeExample: {
    title: "接入示例",
    description: "三步切换到 mini-hf，已有脚本无需修改",
    code: `# 1. 安装 huggingface_hub
pip install huggingface_hub

# 2. 设置 HF_ENDPOINT
export HF_ENDPOINT=${import.meta.env.VITE_HF_SERVER_URL ?? "http://your-mini-hf-server"}

# 3. 照常下载模型
hf download meta-llama/Llama-2-7b-chat-hf`,
    language: "bash",
  },
  benefits: {
    title: "为什么选择 mini-hf？",
    metrics: [
      {
        value: "90%",
        label: "节省带宽",
        description: "同一文件只出网一次，后续请求走 S3",
      },
      {
        value: "10x",
        label: "下载速度",
        description: "千兆局域网 vs. 受限的公网带宽",
      },
      {
        value: "0",
        label: "迁移成本",
        description: "兼容 HuggingFace Hub API",
      },
    ],
  },
  cta: {
    headline: "把 HuggingFace 搬进局域网",
    subheadline: "部署 mini-hf，一次配置，团队长期受益。",
    primaryCta: "开始使用",
    secondaryCta: "阅读文档",
  },
  footer: {
    links: [
      { label: "文档", href: "/docs" },
      { label: "GitHub", href: "https://github.com/realtyz/mini-hf" },
      { label: "支持", href: "https://github.com/realtyz/mini-hf/issues" },
    ],
    copyright: "© 2026 Mini-HF Project",
  },
} as const;
