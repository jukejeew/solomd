/**
 * Shape of the JSON blob read from localStorage. Older installs may lack
 * keys introduced in later releases or carry one-time migration flags.
 * `uiFontSize14Migrated` is the v4-era readability migration (13 → 14).
 * Kept as `Record<string, unknown>` intersection so old blobs don't need
 * the full Settings shape — avoids a store ↔ types circular import.
 */
export interface ParsedSettings extends Record<string, unknown> {
  uiFontSize14Migrated?: boolean;
  previewFontSize?: number;
  fontSize?: number;
  v4AgentPanelMigrated?: boolean;
  fileTreeDefaultDesktopMigrated?: boolean;
  smartQuotesOptInMigrated?: boolean;
  v4810PreviewFontSynced?: boolean;
  v491MobileLayoutMigrated?: boolean;
  menuBarMigrated?: boolean;
  pdfDefaults?: unknown;
  keybindings?: unknown;
}
