/// <reference types="vite/client" />

declare module '*.md' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly APP_API_BASE_URL: string
  readonly APP_HF_SERVER_URL: string
  readonly APP_VERSION: string
  readonly APP_COPYRIGHT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
