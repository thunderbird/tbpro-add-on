/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<
    Record<string, never>,
    Record<string, never>,
    never
  >;
  export default component;
}
