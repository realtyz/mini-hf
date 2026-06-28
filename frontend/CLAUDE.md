# CLAUDE.md — Frontend

This file provides guidance to Claude Code when working in the `frontend/` directory.

## Tech Stack

- React 19 + TypeScript 5.9 (strict mode)
- React Router 7 (route tree in `src/router.tsx`)
- TanStack Query 5 (server state, custom `queryKeys` factory)
- TanStack Table 8 (tabular data, used in console tables)
- Zustand 5 (client state, auth persisted to localStorage)
- Tailwind CSS 4 + `@tailwindcss/vite` plugin
- shadcn/ui (Radix UI primitives via `components/ui/`)
- framer-motion (declarative animations)
- recharts (dashboard charts)
- sonner (toast notifications)
- react-markdown + remark-gfm + rehype-slug/autolink-headings + react-syntax-highlighter (docs rendering)
- Axios (API client with JWT interceptors)
- date-fns / lodash-es (date & utility helpers)
- Vite 7 (build tool)

## Path Aliases

- `@/` → `src/` (configured in `vite.config.ts` and `tsconfig.app.json`)
- `@docs/` → `docs/` (configured in `vite.config.ts` and the root `tsconfig.json`, but **not** in `tsconfig.app.json`; currently unused inside `src/`. If you start importing from `docs/` in app code, add the alias to `tsconfig.app.json` so type-check passes.)

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
    api/          ← TanStack Query hooks (server state)
    use-*.ts      ← generic, non-API custom hooks (use-theme, use-mobile, …)
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
- **Components**: named exports only (no default exports). Use `React.memo()` for pure presentational components. The only exception is page entry files (`pages/**/index.tsx`), which keep a default export so `router.tsx` can `lazy()`-load them. (Non-component lib modules such as `lib/api/client.ts` and `lib/api/endpoints.ts` do keep a default export — the rule targets components.)
- **API hooks**: live in `src/hooks/api/`. Name by responsibility — there is no mandatory `-queries` suffix:
  - `use-<domain>-queries.ts` — a domain's query + mutation bundle (e.g. `use-repo-queries.ts`, `use-config-queries.ts`, `use-user-queries.ts`).
  - `use-<domain>-actions.ts` — a pure mutation bundle (e.g. `use-task-actions.ts`).
  - `use-*.ts` — a single query or single-responsibility hook (e.g. `use-task-progress.ts`, `use-task-detail.ts`, `use-task-list.ts`, `use-async-preview-task.ts`).
- **Hooks placement**: anything that touches TanStack Query / the API client goes in `src/hooks/api/`. Generic, non-server-state hooks (theme, viewport, timers, storage) go in `src/hooks/`. Single-page hooks co-locate with the page that owns them (e.g. `pages/console/cache-scan/use-cache-scan-filters.ts`, `pages/console/settings/use-config-form.ts`).

### State Management

- **Server state**: TanStack Query. Use the `queryKeys` factory in `lib/query/keys.ts` — never hardcode query key arrays.
- **Client state**: Zustand. Only `auth-store.ts` so far. New stores go in `stores/`.
- **URL state**: Use React Router's `useSearchParams` for filter/pagination state that should be shareable/bookmarkable via URL (the established pattern in `pages/console/tasks`, `pages/console/repositories`, `pages/console/repository-detail`, and `pages/console/settings`). When adding a new list page whose filters benefit from being shareable, prefer `useSearchParams`.

### TanStack Query Patterns

- Query key factory is in `lib/query/keys.ts`. Always add new keys there — including inside the factory itself (build nested keys from `<domain>.all`, e.g. `[...queryKeys.tasks.all, "detail", id]`, rather than re-typing `["tasks", ...]`).
- `QueryClient` is configured in `lib/query/client.ts` with global defaults that act as the baseline — don't redeclare them per-query: `refetchOnWindowFocus: false`, `retry: 1`, default `staleTime: STALE_TIMES.stats`, mutations `retry: false`.
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

## Testing

There is **no frontend test harness yet** — `package.json` has no `test` script and no test runner is installed. Backend has pytest; the frontend has no equivalent. Until one is added, lean on `pnpm tsc --noEmit` and `pnpm lint` as the safety net, and prefer pure, easily-reasonable functions for any non-trivial logic so they can be tested later.

## Key Behavioral Rules

1. **Confirm before deleting or renaming files**. The codebase has a stable structure — don't delete or rename on your own initiative. If it's warranted, surface the proposed delete/rename and get the user's OK first.
2. **Match existing patterns**: If adding a new API hook, follow the structure of `use-repo-queries.ts`. If adding a new page, follow one of the existing page layouts.
3. **Query keys always go in `keys.ts`**. Never inline `['tasks', 'list']` — use `queryKeys.tasks.list()`.
4. **No default exports for components**. Components use named exports; only page entry files (`pages/**/index.tsx`) and a couple of non-component lib modules (`lib/api/client.ts`, `lib/api/endpoints.ts`) keep a default export.
5. **Don't add new dependencies** without asking. The dependency set is stable.
6. **UI text is in Chinese** (toast messages, labels, error text). Keep it consistent.
7. **No unnecessary refactoring**. If you're fixing a bug, don't also "clean up" the surrounding code.
8. **Prefer `memo()` + `useCallback()`** for pure presentation components that receive props and fire callbacks — match the pattern in `RepoCard.tsx`.

## Layout & Z-Index

The console layout (`layouts/ConsoleLayout.tsx`) establishes the page chrome: a sticky header, a decorative grid background, and `<main>` lifted to its own stacking context (`relative z-10`) so cards sit cleanly above the grid. Two rules keep this working:

1. **Use Radix/shadcn portal components for global overlays** — Dialog, Sheet, Popover, DropdownMenu, Tooltip. They render to `document.body` and correctly escape `main`'s stacking context to sit above the sticky header. Don't hand-roll a fixed-positioned overlay with `z-[9999]` inside a page — it will be capped by `main`'s `z-10` and won't cover the header.
2. **Page-decorative backgrounds (grids, noise, ambient gradients) belong in `ConsoleLayout`, not individual pages.** Per-page absolute decorations re-introduce the same z-index trap (the decoration paints above sibling content with no positioning), and each page would need its own workaround.
