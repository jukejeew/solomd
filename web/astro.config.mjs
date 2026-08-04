import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const PAGES_DIR = fileURLToPath(new URL('./src/pages', import.meta.url));

/**
 * Real `lastmod` per URL, taken from the last git commit that touched the
 * page's source file.
 *
 * Deliberately not `new Date()` — stamping every one of the ~90 URLs with the
 * build time is a uniform, obviously-synthetic freshness signal that crawlers
 * learn to ignore. If git history isn't available (shallow clone, no git in
 * the build image) we emit no lastmod at all rather than a fabricated one.
 */
const lastmodCache = new Map();

function sourceFileForUrl(url) {
  const pathname = new URL(url).pathname; // '/', '/blog/foo/'
  const slug = pathname.replace(/^\/|\/$/g, ''); // '', 'blog/foo'
  const base = slug === '' ? 'index' : slug;
  for (const candidate of [`${base}.astro`, `${base}/index.astro`]) {
    const abs = path.join(PAGES_DIR, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function gitLastmod(url) {
  if (lastmodCache.has(url)) return lastmodCache.get(url);

  let result;
  try {
    const file = sourceFileForUrl(url);
    const iso = file
      ? execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
          cwd: PAGES_DIR,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
      : '';
    result = iso ? new Date(iso) : undefined;
  } catch {
    // git missing, not a repo, or file never committed — omit lastmod.
    result = undefined;
  }

  lastmodCache.set(url, result);
  return result;
}

export default defineConfig({
  site: 'https://solomd.app',
  build: {
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      // /admin/ is a noindex stats dashboard. Listing a noindex page in the
      // sitemap is a contradictory signal and advertises the endpoint.
      filter: (page) => !new URL(page).pathname.startsWith('/admin'),
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          zh: 'zh-CN',
          ja: 'ja',
          ko: 'ko',
          de: 'de',
          fr: 'fr',
          es: 'es',
          pt: 'pt',
          it: 'it',
          pl: 'pl',
          nl: 'nl',
          tr: 'tr',
          sv: 'sv',
          uk: 'uk',
        },
      },
      serialize: (item) => {
        const lastmod = gitLastmod(item.url);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
