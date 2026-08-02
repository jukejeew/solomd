import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldUsePlainWindowsEditor } from './platform.ts';

test('Windows standard mode uses the IME-safe textarea', () => {
  assert.equal(shouldUsePlainWindowsEditor(true, false), true);
});

test('Windows Vim mode uses CodeMirror', () => {
  assert.equal(shouldUsePlainWindowsEditor(true, true), false);
});

test('non-Windows platforms keep CodeMirror', () => {
  assert.equal(shouldUsePlainWindowsEditor(false, false), false);
});
