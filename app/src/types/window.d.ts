import type { EditorView } from '@codemirror/view';

interface TauriInternals {
  metadata?: {
    currentWindow?: {
      label?: string;
    };
  };
}

declare global {
  interface Window {
    // Pinia store factory for the Pomodoro timer — exposed for the dev-bridge
    // self-test harness (App.vue). Typed as unknown to avoid a circular
    // `window.d.ts -> pomodoro.ts -> window` inference loop that triggers
    // TS7022 when the store's type references the global Window.
    usePomodoroStore: unknown;
    __solomd_showUnsavedDialog: (
      mode: 'tab' | 'window',
      fileName: string,
      count: number,
    ) => Promise<'save' | 'discard' | 'cancel'>;
    __solomdActiveView?: EditorView;
    __solomdBoards?: Map<string, unknown>;
    __solomdVimEx?: boolean;
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export {};
