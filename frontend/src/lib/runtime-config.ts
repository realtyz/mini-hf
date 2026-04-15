interface RuntimeConfig {
  API_BASE_URL: string
  HF_SERVER_URL: string
  APP_VERSION: string
  APP_COPYRIGHT: string
  EMAIL_DOMAIN: string
}

// 开发模式 fallback 默认值（本地开发时不生成 runtime-config.js）
const defaults: RuntimeConfig = {
  API_BASE_URL: 'http://localhost:9800/api/v1',
  HF_SERVER_URL: 'http://localhost:9801',
  APP_VERSION: '1.0.0',
  APP_COPYRIGHT: '© 2026 Mini-HF Project',
  EMAIL_DOMAIN: 'example.com',
}

function getRuntimeConfig(): RuntimeConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtime = (window as any).__RUNTIME_CONFIG__ || {}
  return {
    API_BASE_URL: runtime.API_BASE_URL || defaults.API_BASE_URL,
    HF_SERVER_URL: runtime.HF_SERVER_URL || defaults.HF_SERVER_URL,
    APP_VERSION: runtime.APP_VERSION || defaults.APP_VERSION,
    APP_COPYRIGHT: runtime.APP_COPYRIGHT || defaults.APP_COPYRIGHT,
    EMAIL_DOMAIN: runtime.EMAIL_DOMAIN || defaults.EMAIL_DOMAIN,
  }
}

export const config = getRuntimeConfig()