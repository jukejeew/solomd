/**
 * v4.0 pillar 1 — wikilink parsing for the Inline Agent Panel.
 *
 * Mirrors the Rust regex in `mcp-server/src/workspace.rs::extract_wikilinks`
 * + `app/src-tauri/src/workspace_index.rs::extract_wikilinks` so that the
 * agent's text-rendering treats `[[X]]` / `[[X#heading]]` / `[[X|alias]]`
 * the same way the indexer does.
 *
 * Used by AgentPanel.vue to split assistant messages into a sequence of
 * text + wikilink chips. Click handling lives in the panel; this module is
 * pure parsing so it stays test-friendly.
 */

export interface Wikilink {
  /** Fully matched substring including the brackets, e.g. `[[X#h|alias]]`. */
  raw: string;
  target: string;
  heading?: string;
  alias?: string;
  blockId?: string;
}

export type ParsedRun =
  | { type: 'text'; value: string }
  | ({ type: 'wikilink' } & Wikilink);

/** Same shape as the Rust `regex_lite::Regex(r"\[\[([^\[\]\n]+?)\]\]")`. */
const WIKILINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;

/**
 * Parse one wikilink's inner text — `target[#heading][^block][|alias]`.
 * Obsidian order: [[path #heading ^block | alias]] — split | first, then ^, then #.
 * Multiple # after first are kept as part of heading chain (Help: [[A#B#C]]).
 * [[#Heading]] / [[#^block]] valid same-file links.
 */
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

function stripIgnoredSpans(s: string): string {
  // Replace inline contexts Obsidian does NOT count: `code`, $math$, %%comment%%, <!-- -->
  return s
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    .replace(/%%[^%]*%%/g, (m) => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/\$[^$]*\$/g, (m) => ' '.repeat(m.length));
}

function isInIgnoredBlock(text: string, index: number): boolean {
  // Check if index is inside ``` fence or $$ block by scanning up to index
  const before = text.slice(0, index);
  const fences = (before.match(/```|~~~/g) || []).length;
  const mathBlocks = (before.match(/^\$\$/gm) || []).length;
  return fences % 2 === 1 || mathBlocks % 2 === 1;
}

/**
 * Return every wikilink in `text`. Honors [[#heading]] / [[#^block]] same-file links and ^block.
 * Ignores wikilinks inside ``` fences, $$ blocks, `code`, %%comment%%, <!-- -->.
 */
export function extractWikilinks(text: string): Wikilink[] {
  const out: Wikilink[] = [];
  const stripped = stripIgnoredSpans(text);
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(stripped)) !== null) {
    if (isInIgnoredBlock(text, m.index)) continue;
    const raw = text.slice(m.index, m.index + m[0].length);
    const origInner = raw.slice(2, -2);
    const { target, alias, heading, blockId } = parseInner(origInner);
    if (!target && !heading && !blockId) continue;
    out.push({ raw, target, alias, heading, blockId });
  }
  return out;
}

/**
 * Split `text` into a flat sequence of text runs and wikilink runs. Useful
 * for v-for rendering in the panel: each text run becomes a `<span>` and
 * each wikilink becomes a clickable chip.
 *
 * Empty text runs are squeezed out so consumers don't render empty spans.
 */
export function parseWithWikilinks(text: string): ParsedRun[] {
  const runs: ParsedRun[] = [];
  const stripped = stripIgnoredSpans(text);
  WIKILINK_RE.lastIndex = 0;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(stripped)) !== null) {
    if (isInIgnoredBlock(text, m.index)) {
      // treat as text
      continue;
    }
    const raw = text.slice(m.index, m.index + m[0].length);
    if (m.index > cursor) {
      runs.push({ type: 'text', value: text.slice(cursor, m.index) });
    }
    const origInner = raw.slice(2, -2);
    const { target, alias, heading, blockId } = parseInner(origInner);
    if (target || heading || blockId) {
      runs.push({ type: 'wikilink', raw, target, alias, heading, blockId });
    } else {
      runs.push({ type: 'text', value: raw });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    runs.push({ type: 'text', value: text.slice(cursor) });
  }
  return runs;
}

/** Display text for a chip — alias if set, else target (and heading/block suffix). */
export function chipLabel(link: Wikilink): string {
  if (link.alias) return link.alias;
  if (link.blockId) {
    const base = link.heading ? `${link.target} › ${link.heading}` : link.target || '#';
    return `${base} ^${link.blockId}`;
  }
  if (link.heading) return `${link.target ? `${link.target} › ` : '#'}${link.heading}`;
  return link.target || link.heading || link.blockId || '';
}
