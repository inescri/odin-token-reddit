/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ODIN_APP_NAME?: string;
  // Validated at runtime by `parseOdinEnv` in `src/odin/client.ts`.
  readonly VITE_ODIN_ENV?: string;
  readonly VITE_APP_CANISTER_ID?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
