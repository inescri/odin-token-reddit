# CLAUDE.md — AI assistant guide for odin-token-reddit

This file tells AI coding assistants how to work in this repository safely.
**Read it before editing.** Per-package rules live in
`packages/api/AI_INSTRUCTIONS.md`, `packages/frontend/AI_INSTRUCTIONS.md`, and
`packages/canister/AI_INSTRUCTIONS.md`.

## What this is

A token-weighted message board for Odin Fun: one board per Odin token, threads
and nested comments, up/down votes whose weight is the voter's balance of that
token at vote time. Tokens never move. Spec and plan: `specs/001-token-message-board/`.

## Project shape

```
packages/
  api/        # Express 5 + Prisma + MySQL 8 — boards, threads, comments, votes, auth
  frontend/   # Vite + React — Odin Connect sign-in, board UI, votes via odin-connect balances
  canister/   # Azle identity-anchor canister — delegation target + trusted origins only
docker-compose.yml   # local MySQL
specs/               # spec, plan, data model, contracts, tasks
```

Stack: Node 22 · pnpm workspace · TypeScript strict · Express 5 · Prisma 5 ·
MySQL 8 · React 19 + Vite 8 · odin-connect 2.x · Azle 0.33 (canister).

## Trust model (read this before touching votes or auth)

- **Identity** is verified by the backend: the browser signs an app-bound
  timestamp with its Odin Connect delegation; `packages/api/src/auth/login.ts`
  calls `verifyOdinLogin` from `odin-auth-verify` (the verifiers extracted from
  odin-api), which checks the chain, requires the delegation to target
  `APP_CANISTER_ID`, and guards against replay; the API then issues a 24 h app
  session. The canister exists only so Odin issues that delegation; nothing
  calls it.
- **Vote weight is the Odin API balance as fetched by the browser through
  `odin.api.getBalance` and submitted with the vote. The backend trusts it**
  (owner decision, spec FR-014). The Odin API currently blocks non-browser
  clients, so the hardening path (server-side fetch in `votes.service.ts`)
  needs a Cloudflare exception first. Every accepted vote is logged with its
  weight for later reconciliation.
- **No custody.** No approvals, transfers, deposits, withdrawals, fees. If a
  task seems to need the app to hold or move tokens, stop and ask a human.

## What you MAY modify freely

- UI, components, styling, copy (keep `en.json` and `zh.json` key sets equal)
- Routes and services that do not change the trust model above
- Tests, docs, tooling, as long as CI stays green

## What you MAY NOT change without maintainer sign-off

- The login verification in `packages/api/src/auth/login.ts`: the
  `verifyOdinLogin` options (`appCanisterId`, message prefix, timestamp window,
  replay guard) and the `odin-auth-verify` dependency itself. Fix verifier bugs
  in the odin-auth-verify repo, not here. The API pins it to an exact npm
  version; review the release before bumping it.
- The vote transaction's row lock in `packages/api/src/services/votes.service.ts`
- The canister's role (it must stay logic-free) and stable memory id 0 (reserved)

## Invariants

1. Amounts are `bigint` in code, `DECIMAL(40,0)` in MySQL, decimal strings on
   the wire. Never `number`.
2. At most one vote per (voter, target); retract uses the stored weight.
3. Every write is authenticated and validated (zod + `lib/validation.ts`).
4. The frontend only talks to Odin through `odin.api.*`.

## Conventions

- 2-space indentation, single quotes, semicolons (canister: 4-space).
- Function components + hooks. No `any`. Explicit return types on exports.
- Conventional Commits.

## Build / test

```sh
pnpm install
docker compose up -d mysql
cp packages/api/.env.example packages/api/.env      # fill SESSION_SECRET, APP_CANISTER_ID
cp packages/frontend/.env.example packages/frontend/.env
pnpm --filter @odin-app/api prisma:migrate
pnpm dev:api          # http://localhost:3000
pnpm dev:frontend     # http://localhost:5173

pnpm typecheck && pnpm test && pnpm build
```

Route tests need `TEST_DATABASE_URL`; they skip without it and run in CI
against a MySQL service. `dfx build canister --check` needs dfx (CI has it).
