/**
 * Typed handle for the Editor.vue instance exposed via defineExpose.
 * Covers the methods PaneContent.vue consumes for scroll-sync and
 * view-mode restoration.
 */
export interface EditorHandle {
  gotoLine: (line: number) => void;
  getViewLine: () => number | null;
  lineTopY: (line: number) => number | null;
  scrollToLine: (line: number) => void;
  insertMarkdown?: (snippet: string) => void;
  insertImageFromPath?: (path: string) => void;
  insertImageUrl?: (url: string, alt?: string) => void;
  uploadLocalImages?: () => void;
  openFind?: () => void;
}
