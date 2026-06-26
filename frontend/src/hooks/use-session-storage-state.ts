import { useState, useCallback } from "react";

/**
 * 将状态持久化到 sessionStorage 的 hook。
 * 用于页面刷新后保持筛选条件、分页位置等 UI 状态。
 */
export function useSessionStorageState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // sessionStorage 不可用时静默失败
        }
        return next;
      });
    },
    [key],
  );

  return [state, setPersistedState];
}
