/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENGINE?: 'tone' | 'modular';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
