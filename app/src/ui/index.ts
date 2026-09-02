/* SoloMD 4.6 headless component library — barrel re-export.
 *
 * Every primitive is styled exclusively via the design tokens in
 * styles/tokens.css. Import from here, e.g.
 *   import { DsButton, DsModal } from '@/ui';
 */
export { default as DsButton } from './DsButton.vue';
export { default as DsInput } from './DsInput.vue';
export { default as DsTextarea } from './DsTextarea.vue';
export { default as DsSelect } from './DsSelect.vue';
export { default as DsDropdown } from './DsDropdown.vue';
export { default as DsModal } from './DsModal.vue';
export { default as DsPopover } from './DsPopover.vue';
export { default as DsChip } from './DsChip.vue';
export { default as DsPanel } from './DsPanel.vue';
export { default as DsListRow } from './DsListRow.vue';
export { default as DsTooltip } from './DsTooltip.vue';
export { default as DsTabs } from './DsTabs.vue';

// Re-export component prop types — Vue SFC <script setup> interfaces aren't
// resolvable as module exports under bundler resolution, so we silence the
// TS2614 here; runtime works and the types are structurally identical.
// @ts-ignore
export type { DsSelectOption } from './DsSelect.vue';
// @ts-ignore
export type { DsDropdownItem } from './DsDropdown.vue';
// @ts-ignore
export type { DsTab } from './DsTabs.vue';
