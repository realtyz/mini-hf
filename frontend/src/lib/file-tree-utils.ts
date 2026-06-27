import type { PreviewItem } from "@/lib/api/types";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  required?: boolean;
  is_cached: boolean | null;
  children?: Map<string, TreeNode>;
}

export function buildTree(
  items: Array<{
    path: string;
    type: "file" | "directory";
    size: number;
    is_cached: boolean | null;
    required?: boolean;
  }>,
): Map<string, TreeNode> {
  const root = new Map<string, TreeNode>();

  for (const item of items) {
    const parts = item.path.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      if (i === parts.length - 1) {
        current.set(name, {
          name,
          path: item.path,
          type: item.type,
          size: item.size,
          ...(item.required !== undefined ? { required: item.required } : {}),
          is_cached: item.is_cached,
        });
      } else {
        if (!current.has(name)) {
          current.set(name, {
            name,
            path: currentPath,
            type: "directory",
            size: 0,
            is_cached: null,
            children: new Map<string, TreeNode>(),
          });
        }
        const node = current.get(name)!;
        if (!node.children) {
          node.children = new Map<string, TreeNode>();
        }
        current = node.children;
      }
    }
  }

  return root;
}

export function getChildrenAtPath(
  root: Map<string, TreeNode>,
  path: string,
): Map<string, TreeNode> | null {
  if (!path) return root;

  const parts = path.split("/");
  let current = root;

  for (const part of parts) {
    const node = current.get(part);
    if (!node || node.type !== "directory" || !node.children) {
      return null;
    }
    current = node.children;
  }

  return current;
}

/**
 * Sort tree children: directories first, then files, each ordered by name.
 * Shared by the file-tree viewers (Preview / Selectable / RepoTreeViewer).
 */
export function sortTreeChildren(children: TreeNode[]): TreeNode[] {
  return [...children].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "directory" ? -1 : 1;
  });
}

export function getFilesInDirectory(
  dirPath: string,
  items: PreviewItem[],
): string[] {
  return items
    .filter((i) => i.type === "file" && i.path.startsWith(dirPath + "/"))
    .map((i) => i.path);
}

export function getDirectorySelectionState(
  dirPath: string,
  selectedPaths: Set<string>,
  items: PreviewItem[],
): "all" | "none" | "some" {
  const files = getFilesInDirectory(dirPath, items);
  if (files.length === 0) return "none";
  const selected = files.filter((f) => selectedPaths.has(f)).length;
  if (selected === 0) return "none";
  if (selected === files.length) return "all";
  return "some";
}
