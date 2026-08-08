/**
 * Self-test runner for markdown preprocessing (table delimiters, numbered
 * headings, #213 nested list indent). Mirrors relationships.selftest.mjs:
 * a resolve hook appends `.ts` to extension-less relative imports so the
 * `node:test` suite runs under Node native type-stripping.
 *
 * Usage (from app/): node src/lib/markdown-tables.selftest.mjs
 */
import { register } from 'node:module';

register(new URL('./relationships.selftest-loader.mjs', import.meta.url));

await import('./markdown-tables.test.ts');
