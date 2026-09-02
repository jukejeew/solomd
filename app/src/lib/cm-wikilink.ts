/**
 * CodeMirror 6 extension for `[[wikilink]]` syntax (F1 of v2.0).
 *
 * Provides:
 *   - Decoration: `[[X]]` rendered as a styled span (resolved → green, unresolved → red dashed).
 *   - Click handling: Cmd/Ctrl+click on a wikilink resolves the target via the
 *     workspace index store and emits `solomd:wiki-open` (App.vue listens and
 *     opens the file).
 *   - Autocomplete: typing `[[` opens a dropdown of matching workspace files.
 *
 * Resolution is fuzzy: stem (case-insensitive) → title (H1 / front-matter
 * title) → substring of stem. Misses are still rendered (red dashed) so the
 * user can act.
 */
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { frozenDuringComposition } from './cm-ime-guard';
import type { DecorationSet } from '@codemirror/view';
import type {
  CompletionContext,
  CompletionResult,
  Completion,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { useWorkspaceIndexStore } from '../stores/workspaceIndex';

const WIKILINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;

function parseInner(inner: string): { target: string; alias?: string; heading?: string; blockId?: string } {
  let target = inner.trim();
  let alias: string | undefined;
  let heading: string | undefined;
  let blockId: string | undefined;
  const pipeIdx = target.indexOf('|');
  if (pipeIdx >= 0) {
    alias = target.slice(pipeIdx + 1).trim() || undefined;
    target = target.slice(0, pipeIdx).trim();
  }
  const caretIdx = target.indexOf('^');
  if (caretIdx >= 0) {
    blockId = target.slice(caretIdx + 1).trim() || undefined;
    target = target.slice(0, caretIdx).trim();
  }
  const hashIdx = target.indexOf('#');
  if (hashIdx >= 0) {
    heading = target.slice(hashIdx + 1).trim() || undefined;
    target = target.slice(0, hashIdx).trim();
  }
  return { target, alias, heading, blockId };
}

function nfcLower(s: string): string {
  try {
    return typeof s.normalize === 'function' ? s.normalize('NFC').toLowerCase() : s.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function isResolved(target: string): boolean {
  const raw = target.trim();
  if (!raw) return false;
  const t = nfcLower(raw);
  const hasSlash = raw.includes('/') || raw.includes('\\');
  try {
    const idx = useWorkspaceIndexStore();
    if (!idx.ready || idx.entries.length === 0) return true; // assume valid until index ready
    // Same-file [[#heading]] / [[#^block]] always resolved
    if (!t && (raw.includes('#') || raw.includes('^'))) return true;
    // If target contains slash, try path-suffix first (Obsidian path-first)
    if (hasSlash) {
      const norm = t.replace(/\\/g, '/');
      const noExt = norm.endsWith('.md') ? norm.slice(0, -3) : norm;
      for (const e of idx.entries) {
        const p = nfcLower(e.path.replace(/\\/g, '/'));
        if (p.endsWith(`/${norm}`) || p.endsWith(`/${noExt}`) || p.endsWith(`/${noExt}.md`)) return true;
      }
    }
    // 1. stem exact
    if (idx.byStem.has(t)) return true;
    // byStem is keyed lower; need NFC-aware check
    for (const e of idx.entries) {
      if (nfcLower(e.stem) === t) return true;
    }
    // 2. title exact
    for (const e of idx.entries) {
      if (e.title && nfcLower(e.title) === t) return true;
    }
    // 3. alias
    for (const e of idx.entries) {
      const fm = e.frontmatter as Record<string, unknown> | null;
      if (!fm) continue;
      const rawAl = (fm as Record<string, unknown>)['aliases'] ?? (fm as Record<string, unknown>)['alias'];
      if (typeof rawAl === 'string' && nfcLower(rawAl.trim()) === t) return true;
      if (Array.isArray(rawAl)) {
        for (const v of rawAl) {
          if (typeof v === 'string' && nfcLower(v.trim()) === t) return true;
        }
      }
    }
    // 4. path-suffix fallback when no slash
    if (!hasSlash) {
      const norm = t.replace(/\\/g, '/');
      const noExt = norm.endsWith('.md') ? norm.slice(0, -3) : norm;
      for (const e of idx.entries) {
        const p = nfcLower(e.path.replace(/\\/g, '/'));
        if (p.endsWith(`/${norm}`) || p.endsWith(`/${noExt}`) || p.endsWith(`/${noExt}.md`)) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

class WikilinkWidget extends WidgetType {
  constructor(readonly inner: string, readonly resolved: boolean, readonly display: string) {
    super();
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `cm-wikilink ${this.resolved ? 'cm-wikilink--ok' : 'cm-wikilink--missing'}`;
    span.textContent = this.display;
    span.title = this.resolved
      ? `Open ${this.inner} (Cmd/Ctrl+click)`
      : `${this.inner} not found in workspace — Cmd/Ctrl+click to create`;
    span.setAttribute('data-wikilink', this.inner);
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
  eq(other: WidgetType): boolean {
    return (
      other instanceof WikilinkWidget &&
      other.inner === this.inner &&
      other.resolved === this.resolved &&
      other.display === this.display
    );
  }
}

const wikilinkMatcher = new MatchDecorator({
  regexp: WIKILINK_RE,
  decoration: (m) => {
    const inner = m[1] || '';
    const parsed = parseInner(inner);
    let display: string;
    if (parsed.alias) display = parsed.alias;
    else if (parsed.blockId) {
      const base = parsed.heading ? `${parsed.target} › ${parsed.heading}` : parsed.target || '#';
      display = `${base} ^${parsed.blockId}`;
    } else if (parsed.heading) {
      display = parsed.target ? `${parsed.target} › ${parsed.heading}` : `#${parsed.heading}`;
    } else {
      display = parsed.target || inner.trim();
    }
    // [[#heading]] same-file always resolved; empty target with no mod is unresolved
    const resolved = parsed.target ? isResolved(parsed.target) : !!(parsed.heading || parsed.blockId);
    return Decoration.replace({
      widget: new WikilinkWidget(parsed.target || parsed.heading || parsed.blockId || inner, resolved, display),
    });
  },
});

class WikilinkPluginValue {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = wikilinkMatcher.createDeco(view);
  }
  update(update: ViewUpdate) {
    // IME composition guard (#108) — see cm-ime-guard.ts.
    const frozen = frozenDuringComposition(update, this.decorations);
    if (frozen) {
      this.decorations = frozen;
      return;
    }
    this.decorations = wikilinkMatcher.updateDeco(update, this.decorations);
  }
}

const wikilinkPlugin = ViewPlugin.fromClass(WikilinkPluginValue, {
  decorations: (v) => v.decorations,
  eventHandlers: {
    mousedown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return false;
      const link = target.closest('.cm-wikilink');
      if (!link) return false;
      if (!(e.metaKey || e.ctrlKey)) return false;
      const inner = link.getAttribute('data-wikilink') || '';
      if (!inner) return false;
      e.preventDefault();
      // Defer resolution to App.vue (it has access to the files composable).
      window.dispatchEvent(new CustomEvent('solomd:wiki-open', { detail: { target: inner } }));
      return true;
    },
  },
});

const wikilinkTheme = EditorView.theme({
  '.cm-wikilink': {
    cursor: 'pointer',
    padding: '0 2px',
    borderRadius: '3px',
    transition: 'background 0.12s',
  },
  '.cm-wikilink--ok': {
    color: 'var(--accent, #ff9f40)',
    backgroundColor: 'color-mix(in srgb, var(--accent, #ff9f40) 12%, transparent)',
  },
  '.cm-wikilink--ok:hover': {
    backgroundColor: 'color-mix(in srgb, var(--accent, #ff9f40) 22%, transparent)',
    textDecoration: 'underline',
  },
  '.cm-wikilink--missing': {
    color: 'var(--text-muted, #888)',
    backgroundColor: 'transparent',
    border: '1px dashed color-mix(in srgb, currentColor 60%, transparent)',
    padding: '0 4px',
  },
  '.cm-wikilink--missing:hover': {
    color: 'var(--danger, #d63939)',
    borderColor: 'var(--danger, #d63939)',
  },
  // Shared popup theme with slash menu (/ ) — same tokens so [[/#/@ look identical to / palette
  '.cm-tooltip-autocomplete': {
    maxWidth: '360px',
    maxHeight: '320px',
    overflowY: 'auto',
    background: 'var(--bg-elevated, var(--bg, #fff))',
    border: '1px solid var(--border, rgba(0, 0, 0, 0.12))',
    borderRadius: '8px',
    boxShadow: 'var(--sh-pop, 0 8px 24px rgba(0, 0, 0, 0.18))',
    padding: '4px',
    fontSize: '13px',
    fontFamily: 'inherit',
    color: 'var(--text, #222)',
  },
  '.cm-tooltip-autocomplete ul': {
    margin: '0',
    padding: '0',
  },
  // Obsidian-like 2-line autocomplete items (CodeMirror) - Q2=2บรรทัด, Q4=A — unified with slash row rhythm
  '.cm-tooltip-autocomplete ul li': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '5px 10px',
    lineHeight: '1.2',
    borderRadius: '5px',
    gap: '0',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'var(--bg-hover, rgba(255, 159, 64, 0.18))',
    color: 'var(--text, #222)',
  },
  '.cm-completionLabel': {
    fontSize: '13px',
    color: 'var(--text, #ddd)',
  },
  '.cm-completionDetail': {
    fontSize: '11px',
    color: 'var(--text-faint, #888)',
    opacity: '0.85',
    marginLeft: '0',
    fontStyle: 'normal',
  },
  '.cm-completionMatchedText': {
    color: 'var(--accent, #ff9f40)',
    textDecoration: 'none',
  },
  // Section header (Q1=A): keyword type → visual cue, non-insert
  '.cm-tooltip-autocomplete ul li:has(.cm-completionIcon-keyword)': {
    opacity: '0.55',
    fontStyle: 'italic',
  },
});

// ---- Autocomplete ---------------------------------------------------------

function wikilinkComplete(context: CompletionContext): CompletionResult | null {
  // #108: never run completion while an IME composition is active. With
  // autocompletion's activateOnTyping, every pinyin keystroke would start a
  // query whose accept() dispatches a transaction mid-composition, which
  // aborts the Sogou IME on Windows/WebView2 (intermittent "吃字"). Verified
  // via live trace: guarding the sources here eliminates the dropped chars.
  if (context.view?.composing) return null;
  // Match `[[query` up to cursor.
  const match = context.matchBefore(/\[\[([^\[\]\n]*)$/);
  if (!match) return null;
  const query = match.text.slice(2);
  if (!context.explicit && query.length === 0) {
    // Don't autoshow on empty `[[`; user can press Ctrl+Space if they want to.
    return null;
  }
  // Collect entries with folder for sub-bucket grouping (Q3=แยก)
  let entries: { stem: string; name: string; title: string | null; relPath: string; folder: string }[] = [];
  let idxRef: ReturnType<typeof useWorkspaceIndexStore> | null = null;
  try {
    const idx = useWorkspaceIndexStore();
    idxRef = idx;
    entries = idx.entries.map((e) => {
      const rel = idx.relativePathFor(e.path);
      const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      return { stem: e.stem, name: e.name, title: e.title || null, relPath: rel, folder };
    });
  } catch {
    return null;
  }
  const q = nfcLower(query).replace(/\\/g, '/');
  const qHasSlash = q.includes('/');
  const ranked = entries
    .map((e) => {
      const stemLc = nfcLower(e.stem);
      const titleLc = nfcLower(e.title || '');
      const relLc = nfcLower(e.relPath);
      const folderLc = nfcLower(e.folder);
      let score = 0;
      // Path-aware scoring: when query contains '/', prioritize relPath/folder
      if (qHasSlash) {
        if (relLc === q) score = 100;
        else if (relLc.startsWith(q)) score = 95;
        else if (relLc.includes(q)) score = 55;
        else if (folderLc && folderLc.includes(q.replace(/\/.*$/, ''))) score = 50;
        else if (stemLc === q) score = 90;
        else if (stemLc.startsWith(q)) score = 80;
        else if (stemLc.includes(q)) score = 45;
        else if (titleLc.includes(q)) score = 35;
      } else {
        if (stemLc === q) score = 100;
        else if (relLc === q) score = 98;
        else if (stemLc.startsWith(q)) score = 90;
        else if (relLc.startsWith(q)) score = 88;
        else if (folderLc.startsWith(q)) score = 85;
        else if (titleLc === q) score = 80;
        else if (titleLc.startsWith(q)) score = 70;
        else if (stemLc.includes(q)) score = 50;
        else if (relLc.includes(q)) score = 48;
        else if (folderLc.includes(q)) score = 44;
        else if (titleLc.includes(q)) score = 40;
      }
      return { e, score };
    })
    .filter((r) => r.score > 0)
    // Sub-bucket: sort by score desc, then folder asc, then stem asc (Q3=แยก)
    .sort((a, b) => b.score - a.score || a.e.folder.localeCompare(b.e.folder) || a.e.stem.localeCompare(b.e.stem))
    .slice(0, 30);

  const options: Completion[] = [];
  // Section header like Obsidian: "02_drafts/..." or "04_characters/..." (Q1=A: Enter does nothing)
  if (q.length > 0 && ranked.length > 0) {
    const qFolderPart = qHasSlash ? q.replace(/\/+$/, '').split('/').pop() || '' : q;
    const candidate = ranked.find((r) => {
      const f = r.e.folder.toLowerCase();
      const rel = r.e.relPath.toLowerCase();
      return f.startsWith(qFolderPart) || rel.startsWith(q) || f.includes(qFolderPart);
    });
    let headerLabel: string | null = null;
    if (qHasSlash) {
      // Query has slash → header is the folder being filtered
      const folderFromFirst = candidate?.e.folder;
      if (folderFromFirst) headerLabel = folderFromFirst + '/...';
      else {
        const prefix = q.slice(0, q.lastIndexOf('/') + 1);
        if (prefix) headerLabel = prefix + '...';
      }
    } else if (candidate) {
      // No slash but folder matches prefix (e.g. "04" → "04_characters/...")
      headerLabel = candidate.e.folder ? candidate.e.folder + '/...' : null;
    }
    if (headerLabel) {
      options.push({
        label: headerLabel,
        detail: undefined,
        // Q1=A: no insert, visual cue only (like Obsidian header)
        apply: () => {},
        type: 'keyword',
        boost: 99,
      } as unknown as Completion);
    }
  }

  for (const { e } of ranked) {
    const folderDetail = e.folder ? e.folder + '/' : undefined;
    // Shortest path when possible (Obsidian default): unique stem → just stem
    const isUnique = idxRef ? (idxRef as unknown as { isStemUnique: (s: string) => boolean }).isStemUnique(e.stem) : true;
    const insertTarget = isUnique ? e.stem : e.relPath;
    options.push({
      label: e.stem,
      detail: folderDetail,
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        const insertText = `${insertTarget}]]`;
        view.dispatch({
          changes: { from, to, insert: insertText },
          selection: { anchor: from + insertText.length },
        });
      },
    });
  }
  return {
    from: match.from + 2, // after the `[[`
    options,
    validFor: /^[^\[\]\n]*$/,
  };
}

/** Decoration + click + theme only (no autocompletion). The matching
 * `wikilinkComplete` source is exported separately and combined in
 * Editor.vue with the other markdown autocompletion sources, since CM6
 * doesn't allow multiple `autocompletion({ override })` extensions to
 * coexist. */
export function wikilinkExtension(): Extension {
  return [wikilinkPlugin, wikilinkTheme];
}

export { wikilinkComplete };
