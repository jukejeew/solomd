declare module 'html2canvas' {
  const html2canvas: any;
  export default html2canvas;
}
declare module 'html2pdf.js' {
  const html2pdf: any;
  export default html2pdf;
}
declare module 'opencc-js' {
  export function Converter(options: { from: string; to: string }): (input: string) => string;
  const OpenCC: {
    Converter: (options: { from: string; to: string }) => (input: string) => string;
  };
  export default OpenCC;
}
declare module 'markdown-it-front-matter' {
  import type MarkdownIt from 'markdown-it';
  const frontMatter: MarkdownIt.PluginSimple;
  export default frontMatter;
}
declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it';
  const mark: MarkdownIt.PluginSimple;
  export default mark;
}
declare module '@vscode/markdown-it-katex' {
  import type MarkdownIt from 'markdown-it';
  const katex: MarkdownIt.PluginWithOptions<{ throwOnError?: boolean }>;
  export default katex;
}
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const footnote: MarkdownIt.PluginSimple;
  export default footnote;
}
declare module 'markdown-it-cjk-friendly' {
  import type MarkdownIt from 'markdown-it';
  const cjkFriendly: MarkdownIt.PluginSimple;
  export default cjkFriendly;
}
