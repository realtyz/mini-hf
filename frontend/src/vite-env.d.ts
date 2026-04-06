/// <reference types="vite/client" />

declare module '*.md' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_HF_SERVER_URL: string
  readonly VITE_APP_VERSION: string
  readonly VITE_APP_COPYRIGHT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
