# CLAUDE.md — Frontend

This file provides guidance to Claude Code when working in the `frontend/` directory.

## Tech Stack

- React 19 + TypeScript 5.9 (strict mode)
- React Router 7 (route tree in `src/router.tsx`)
- TanStack Query 5 (server state, custom `queryKeys` factory)
- Zustand 5 (client state, auth persisted to localStorage)
- Tailwind CSS 4 + `@tailwindcss/vite` plugin
- shadcn/ui (Radix UI primitives via `components/ui/`)
- framer-motion (declarative animations)
- Axios (API client with JWT interceptors)
- Vite 7 (build tool)

## Path Aliases

- `@/` → `src/`
- `@docs/` → `docs/`

## Project Conventions

### Component Organization

```
src/
  components/
    ui/           ← shadcn/ui primitives (Button, Card, Badge, etc.)
    shared/       ← cross-feature reused components (ErrorBoundary, LazyLoad)
    auth/         ← auth-specific components
    repo/         ← repository cards, grids
    tasks/        ← task management components
    dashboard/    ← dashboard widgets
    theme/        ← theme provider + context
  hooks/
    api/          ← TanStack Query hooks (use-*-queries.ts)
    use-*.ts      ← generic custom hooks
  stores/         ← Zustand stores (auth-store.ts)
  lib/
    api/          ← axios client, endpoint constants, types
    query/        ← QueryClient config, query key factory
    animations/   ← framer-motion variants
    constants/    ← app constants
  pages/
    landing/      ← public landing pages
    console/      ← protected admin pages
    docs/         ← documentation pages
```

### Naming Conventions

- **Files**: PascalCase for components, kebab-case or camelCase for everything else. Follow existing patterns — don't rename without reason.
- **Components**: named exports only (no default exports). Use `React.memo()` for pure presentational components. The only exception is page entry files (`pages/**/index.tsx`), which keep a default export so `router.tsx` can `lazy()`-load them.
- **API hooks**: `use-*-queries.ts` (e.g., `use-repo-queries.ts`, `use-task-progress.ts`). Each file groups related queries + mutations for one domain.
- **Hooks placement**: Put a hook in `src/hooks/` only when it is reused across pages or features (e.g., `use-task-list`, `use-task-actions`, `use-task-detail`, `use-repo-list` are shared by `console/tasks` and the public `pages/tasks`). Single-page hooks co-locate with the page that owns them (e.g., `pages/console/cache-scan/use-cache-scan-filters.ts`, `pages/console/settings/use-config-form.ts`).

### State Management

- **Server state**: TanStack Query. Use the `queryKeys` factory in `lib/query/keys.ts` — never hardcode query key arrays.
- **Client state**: Zustand. Only `auth-store.ts` so far. New stores go in `stores/`.
- **URL state**: Use React Router's `useSearchParams` for filter/pagination state that should be shareable via URL.

### TanStack Query Patterns

- Query key factory is in `lib/query/keys.ts`. Always add new keys there.
- `staleTime` constants are in `lib/query/client.ts`. Use the appropriate tier:
  - `realtime` (3s) — active task progress, detail
  - `list` (10s) — task/repo lists
  - `stats` (60s) — dashboard aggregations
  - `config` (5min) — system settings
  - `static` (10min) — announcements, endpoints
- Mutations should invalidate affected queries. Don't manually refetch unless polling.

### API Client

- Axios instance from `lib/api/client.ts` already handles: JWT injection, token refresh, 401 redirect.
- The interceptor returns `response.data` directly — callers get `ApiResponse<T>.data`, not `AxiosResponse`.
- `ApiError` format: `{ code: number, message: string }`.
- New endpoint paths go in `lib/api/endpoints.ts`. New types in `lib/api/types.ts`.

### Styling

- Tailwind CSS 4 with `cn()` utility (`clsx` + `tailwind-merge`) for conditional classes.
- shadcn/ui components are in `components/ui/` — add new ones with `pnpm dlx shadcn@latest add <component>`.
- Use semantic Tailwind tokens (`bg-background`, `text-muted-foreground`, `border-border`) over raw colors.

### TypeScript

- Strict mode with `noUnusedLocals` and `noUnusedParameters`. Don't leave dead variables.
- `verbatimModuleSyntax: true` — use `import type` for type-only imports.
- Types for API responses go in `lib/api/types.ts`.

## Development Commands

```bash
pnpm dev             # Start dev server (Vite)
pnpm build           # TypeScript check + production build
pnpm tsc --noEmit    # Type check only
pnpm lint            # ESLint
pnpm dlx shadcn@latest add <component>  # Add shadcn/ui component
```

## Key Behavioral Rules

1. **Don't delete or rename existing files** unless the user explicitly asks. The codebase has stable structure.
2. **Match existing patterns**: If adding a new API hook, follow the structure of `use-repo-queries.ts`. If adding a new page, follow one of the existing page layouts.
3. **Query keys always go in `keys.ts`**. Never inline `['tasks', 'list']` — use `queryKeys.tasks.list()`.
4. **No default exports**. Components use named exports.
5. **Don't add new dependencies** without asking. The dependency set is stable.
6. **UI text is in Chinese** (toast messages, labels, error text). Keep it consistent.
7. **No unnecessary refactoring**. If you're fixing a bug, don't also "clean up" the surrounding code.
8. **Prefer `memo()` + `useCallback()`** for pure presentation components that receive props and fire callbacks — match the pattern in `RepoCard.tsx`.

## Layout & Z-Index

The console layout (`layouts/ConsoleLayout.tsx`) establishes the page chrome: a sticky header, a decorative grid background, and `<main>` lifted to its own stacking context (`relative z-10`) so cards sit cleanly above the grid. Two rules keep this working:

1. **Use Radix/shadcn portal components for global overlays** — Dialog, Sheet, Popover, DropdownMenu, Tooltip. They render to `document.body` and correctly escape `main`'s stacking context to sit above the sticky header. Don't hand-roll a fixed-positioned overlay with `z-[9999]` inside a page — it will be capped by `main`'s `z-10` and won't cover the header.
2. **Page-decorative backgrounds (grids, noise, ambient gradients) belong in `ConsoleLayout`, not individual pages.** Per-page absolute decorations re-introduce the same z-index trap (the decoration paints above sibling content with no positioning), and each page would need its own workaround.
