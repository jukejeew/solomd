/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_STORE_BUILD?: string | boolean;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}
