export interface FileTreeEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileNode extends FileTreeEntry {
  expanded?: boolean;
  children?: FileNode[];
  loading?: boolean;
  truncated?: boolean;
}
