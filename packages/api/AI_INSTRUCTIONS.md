# AI_INSTRUCTIONS — `@odin-app/api`

Rules for working inside the backend package. Read alongside the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this package is

An Express 5 + Prisma (MySQL 8) service that stores boards, threads, comments,
and votes, and authenticates users by verifying their Odin Connect delegation.

```
src/
  index.ts            # bootstrap (env, prisma, listen)
  app.ts              # createApp(deps): middleware + routers; used by tests
  env.ts              # zod-validated process.env
  auth/
    login.ts          # verifyLogin: wraps odin-auth-verify's verifyOdinLogin → principal
    session.ts        # app JWT (jose, HS256, 24 h)
    require-auth.ts   # requireAuth / optionalAuth → req.principal
  lib/                # pure, unit-tested: amounts, validation, vote-delta, ranking, errors
  services/           # Prisma access; votes.service.ts owns the vote transaction
  routes/             # zod-validated HTTP surface (contracts/backend-api.md)
prisma/schema.prisma  # Board, Thread, Comment, Vote, PostCooldown
```

## Hard rules

1. **Amounts are `bigint` in code, `DECIMAL(40,0)` in MySQL, decimal strings on
   the wire.** Never `number`. Convert at the boundary with `lib/amounts.ts`.
2. **Validate every write input with zod and `lib/validation.ts`.** Weight is a
   digits-only string ≤ 40 chars (`parseWeight`).
3. **The vote weight is client-submitted and trusted** (spec FR-014, owner
   decision). Do not "fix" this silently: the hardening path is to fetch the
   balance server-side in `votes.service.ts` via the odin-connect API client
   once the backend's egress is allowed through Cloudflare.
4. **Vote arithmetic lives in `lib/vote-delta.ts`** and runs inside the
   `SELECT ... FOR UPDATE` transaction in `votes.service.ts`. Keep the lock;
   it is what makes concurrent toggles converge.
5. **Raw SQL only in `lib/ranking.ts` and the vote row lock.** Everything else
   goes through the Prisma client.
6. **Delegation and signature verification lives in `odin-auth-verify`.** Fix
   it there, publish a release, then bump the exact version pinned in
   `package.json`. The replay guard is
   `createMemoryReplayGuard()` (in-memory, single instance only).
7. **Login must keep the target check** (`targets` includes
   `APP_CANISTER_ID`) and the app-bound message prefix. Dropping either lets a
   delegation issued to another app log in here.

## Build & test

```sh
pnpm --filter @odin-app/api typecheck
pnpm --filter @odin-app/api test          # route tests skip without TEST_DATABASE_URL
pnpm --filter @odin-app/api build         # tsc → dist/
pnpm --filter @odin-app/api prisma:migrate  # needs DATABASE_URL (docker compose up -d mysql)
```

Migrations are committed under `prisma/migrations`; CI runs `prisma migrate deploy`
against a MySQL service and then the full test suite.
