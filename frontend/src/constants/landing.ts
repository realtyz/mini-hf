export const landingContent = {
  header: {
    brand: "MiniHF",
    navigation: [
      { label: "使用文档", href: "/docs", icon: "BookOpen" },
      { label: "仓库列表", href: "/repositories", icon: "Boxes" },
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
  footer: {
    links: [
      { label: "文档", href: "/docs" },
      { label: "GitHub", href: "https://github.com/realtyz/mini-hf" },
      { label: "支持", href: "https://github.com/realtyz/mini-hf/issues" },
    ],
    copyright: "© 2026 Mini-HF Project",
  },
} as const;
