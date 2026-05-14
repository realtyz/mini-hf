import type { PreviewItem } from "@/lib/api-types";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  required: boolean;
  children?: Map<string, TreeNode>;
}

export function buildTree(items: PreviewItem[]): Map<string, TreeNode> {
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
          required: item.required,
        });
      } else {
        if (!current.has(name)) {
          current.set(name, {
            name,
            path: currentPath,
            type: "directory",
            size: 0,
            required: false,
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
  path: string
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

export function getFilesInDirectory(
  dirPath: string,
  items: PreviewItem[]
): string[] {
  return items
    .filter((i) => i.type === "file" && i.path.startsWith(dirPath + "/"))
    .map((i) => i.path);
}

export function getDirectorySelectionState(
  dirPath: string,
  selectedPaths: Set<string>,
  items: PreviewItem[]
): "all" | "none" | "some" {
  const files = getFilesInDirectory(dirPath, items);
  if (files.length === 0) return "none";
  const selected = files.filter((f) => selectedPaths.has(f)).length;
  if (selected === 0) return "none";
  if (selected === files.length) return "all";
  return "some";
}
