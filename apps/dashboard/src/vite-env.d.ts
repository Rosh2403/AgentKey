/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENTKEY_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
