import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * v2.7.66 — fix CI-only test failure.
 *
 * `services/auth` imports `@nexus/config` (for `getRedisClient`) from
 * `lib/tokens.ts`, which is in turn imported by `routes/mfa.ts`. The
 * `@nexus/config` package's `package.json` declares `main: ./dist/index.js`,
 * but `dist/` is gitignored and is NOT built before `pnpm test` in CI
 * (the Unit Tests job only runs `pnpm install --frozen-lockfile` and then
 * `pnpm --filter @nexus/auth test` — no build step).
 *
 * Local Windows passes only because previous `pnpm build` runs left
 * `packages/config/dist/` populated on disk. A fresh checkout (CI Linux
 * or a fresh git worktree) has no `dist/`, so Vite's resolver throws
 * `Failed to resolve entry for package "@nexus/config"` and the entire
 * mfa.test.ts suite fails to load.
 *
 * Fix: alias `@nexus/config` directly to the workspace source. Vite/Vitest
 * transpile TS on the fly so this works without a prior build, and the
 * alias only applies to test runs (production still resolves through
 * the package's `main`).
 *
 * `@nexus/fastify-audit` is also a workspace package with the same
 * dist-only main, but the auth tests don't import any module that pulls
 * it in (it's only referenced from src/index.ts, which the tests don't
 * touch). Aliased anyway as defence-in-depth so a future test that
 * imports an index.ts-adjacent module doesn't trip the same wire.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@nexus/config',        replacement: resolve(__dirname, '../../packages/config/src/index.ts') },
      { find: '@nexus/fastify-audit', replacement: resolve(__dirname, '../../packages/fastify-audit/src/index.ts') },
    ],
  },
});
