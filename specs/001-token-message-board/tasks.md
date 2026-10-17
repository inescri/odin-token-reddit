# Tasks: Token-Weighted Message Board

**Branch**: `001-token-message-board` | **Date**: 2026-10-17
**Inputs**: plan.md, spec.md, data-model.md, contracts/backend-api.md, contracts/canister-api.md, research.md, quickstart.md

**Ordering note**: US1 (voting) and US2 (content) are both P1. Content is built first because votes need threads and comments to exist; US1 follows immediately and the two together form the MVP. US3 (browsing and ranking) and US4 (voting power and vote state) follow by priority. Each phase ends in an independently verifiable state mapped to quickstart scenarios.

**Conventions**: `[P]` = can run in parallel with neighbours (different files, no shared edits). `[USn]` = user story. Frontend is 2-space, API follows the frontend style, canister stays 4-space. Amounts are `bigint` in code, `DECIMAL(40,0)` in MySQL, decimal strings on the wire.

## Phase 1: Setup & teardown

- [x] T001 Trim the canister to an identity anchor: in `packages/canister/src/index.ts` keep `@init` (owner), `getOwner`, `icrc28_trusted_origins` and the `config` map (memory id 1); remove `deposit`, `withdraw`, `getBalance`, `getBalances`, the `ledger` map and all imports from `./ledger` and `./odin`; delete `packages/canister/src/ledger.ts`, `ledger.test.ts`, `odin.ts`; set the canister `test` script to `vitest run --passWithNoTests`; rewrite `packages/canister/AI_INSTRUCTIONS.md` to describe the anchor role (no logic, no funds, memory id 0 reserved, id 1 config); replace the Netlify placeholder in `TRUSTED_ORIGINS` with a `// EDIT BEFORE DEPLOY` production entry. `dfx build canister --check` passes.
- [x] T002 [P] Frontend teardown: delete `packages/frontend/src/components/DepositForm.tsx`, `WithdrawForm.tsx`, `src/canister/actor.ts`, `idl.ts`, `useCanisterActor.ts`, `useInternalBalances.ts`, `src/lib/fees.ts`; move `APP_CANISTER_ID` into a new `src/config.ts` (with `API_URL` from `VITE_API_URL`) and delete `src/canister/config.ts`; fix the import in `src/odin/OdinConnectProvider.tsx`; reduce `src/App.tsx` to header (AuthBar, LanguageSwitcher) plus a placeholder; remove `deposit` and `withdraw` key groups from `src/i18n/locales/en.json` and `zh.json`; update `.env.example` (drop `VITE_DFX_NETWORK`, `VITE_IC_HOST`; add `VITE_API_URL`). `pnpm typecheck` and `pnpm build:frontend` pass.
- [x] T003 [P] Scaffold `packages/api`: `package.json` (`@odin-app/api`, `type: module`, scripts `dev` via `tsx watch src/index.ts`, `build` via `tsc`, `start`, `test` via vitest, `typecheck`, `prisma`), `tsconfig.json` (strict, ES2022, NodeNext), deps `express@5`, `@prisma/client@5`, `prisma@5`, `zod`, `jose`, `pino`, `pino-http`, `cors`, `odin-connect`, `@dfinity/agent`, `@dfinity/identity`, `@dfinity/principal`, `@icp-sdk/core`, `@noble/curves`; dev deps `tsx`, `vitest`, `supertest`, `@types/express`, `@types/cors`, `@types/supertest`; `src/env.ts` (zod: `PORT`, `DATABASE_URL`, `SESSION_SECRET` ≥ 32 chars, `APP_CANISTER_ID`, `CORS_ORIGINS` comma list, `ODIN_ENV`); `src/index.ts` with `cors`, `pino-http`, JSON body limit 64 KB, `GET /health`; `.env.example`; root `package.json` scripts `dev:api`, `build:api`, and `build` including the api.
- [x] T004 [P] Add `docker-compose.yml` at repo root with `mysql:8.0` (database `odin_board`, root password from env, named volume, port 3306) and a `mysql-test` database for route tests; document in `packages/api/.env.example`.
- [x] T005 Update `.github/workflows/ci.yml`: add a `mysql:8.0` service container with `DATABASE_URL` env, run `pnpm --filter @odin-app/api prisma generate` and `prisma migrate deploy` before `pnpm test`; keep the dfx and Azle steps for the trimmed canister; add `pnpm build:api`.
- [x] T006 [P] Add `react-router-dom@^7` to `packages/frontend/package.json`; extend `src/vite-env.d.ts` with `VITE_API_URL`; add `public/_redirects` (`/* /index.html 200`) for SPA fallback on Netlify.

**Checkpoint**: `pnpm install && pnpm typecheck && pnpm build` green with an empty API and a placeholder frontend; canister builds.

## Phase 2: Foundational (blocks all user stories)

- [x] T007 Write `packages/api/prisma/schema.prisma` exactly per data-model.md (`Board`, `Thread`, `Comment`, `Vote` with composite id, `PostCooldown`, enums `TargetKind`, `Direction`, indexes) and create the initial migration; add `src/db.ts` Prisma client singleton; add `src/lib/amounts.ts` (`parseWeight(str): bigint` enforcing digits-only ≤ 40, `decimalToBigint`, `bigintToDecimal`, `bigintToString`) with `test/amounts.test.ts`.
- [x] T008 [P] Copy `verify-delegation-chain.ts`, `verify-session-signature.ts`, `verify-canister-signature.ts` from `odin-api/functions/src/auth/` into `packages/api/src/auth/` verbatim except import paths (`@src/...` → relative); add a header comment naming the source commit; confirm they compile under the api tsconfig.
- [x] T009 Create `packages/api/src/auth/login.ts` exporting `verifyLogin({ delegation, timestamp, signature }, { appCanisterId, now })`: parse chain with `DelegationChain.fromJSON`, `OdinUtils.isDelegationValid(delegation)`, `await verifyDelegationChain(chain)`, last delegation `targets` must include `appCanisterId`, `|now − timestamp| ≤ 300_000`, message `utf8("odin-token-reddit-login:v1\n" + timestamp)`, `verifySessionKeySignature` with the last delegation's pubkey, return `Principal.selfAuthenticating(chain.publicKey).toText()`; create `src/auth/replay-guard.ts` (Map of `sha256(signature)` → expiry, 10 min TTL, periodic sweep); `test/login.test.ts` builds a real chain with `Ed25519KeyIdentity` + `DelegationChain.create(..., { targets })` and covers success, wrong target, stale timestamp, bad signature, expired delegation, replay.
- [x] T010 Create `packages/api/src/auth/session.ts` (`issueSession(principal)`, `verifySession(token)` with `jose` HS256, `iss: "odin-token-reddit"`, 24 h) and `src/auth/require-auth.ts` exporting `requireAuth` (401 `UNAUTHORIZED`) and `optionalAuth` (sets `req.principal | null`); `test/session.test.ts`.
- [x] T011 Create `packages/api/src/lib/errors.ts` (`AppError(code, status, message)` and the code table from contracts/backend-api.md) plus an Express error middleware producing `{ error: { code, message } }`, mapping zod errors to `INVALID_INPUT`; create `src/routes/auth.routes.ts` with `POST /auth/login` (zod body; `LOGIN_REJECTED` 401, `REPLAY` 409) and `GET /auth/me`; mount in `src/index.ts`; `test/auth.routes.test.ts` with supertest.
- [x] T012 [P] Create `packages/api/src/lib/validation.ts` (constants from data-model.md; `validateTitle`, `validateThreadBody`, `validateCommentBody`, `validateTokenId`, `validateSort`, `clampLimit`), `src/lib/vote-delta.ts` (`applyVoteDelta(item, prev, direction, weight)` returning deltas and the next vote or `null`, throwing `NO_BALANCE` for cast/flip with `0n`), `src/lib/ranking.ts` (Prisma `orderBy` for top/new and the hot raw-SQL `ORDER BY` fragment); table-driven tests `test/vote-delta.test.ts` covering all six rows of the delta table plus retract at zero weight, and `test/validation.test.ts`.
- [x] T013 [P] Frontend API plumbing: `src/api/types.ts` (wire `Thread`, `Comment`, `VoteOutcome`, `BoardStats`, error shape); `src/api/client.ts` (`apiFetch<T>(path, init, token?)` on `API_URL`, JSON, maps `{ error }` to a typed `ApiError`, converts `score`, `weight`, `appliedWeight` strings to `bigint`); `src/api/session.ts` (`loginWithOdin(user)`: `identity = user.getIdentity()`, `timestamp = Date.now().toString()`, sign `utf8("odin-token-reddit-login:v1\n" + timestamp)`, base64 signature, `JSON.stringify(identity.getDelegation().toJSON())`, `POST /auth/login`; store token in `localStorage` under `otr:session:<principal>`; `loadSession(principal)`, `clearSession(principal)`); `src/hooks/useSession.ts` (when Odin `status === 'connected'` and no stored unexpired token → login once; on `disconnect` → clear; on API 401 → clear and retry once; exposes `{ token, status: 'none' | 'logging-in' | 'ready' | 'error' }`); `src/api/session.test.ts` for message construction and storage keys.
- [x] T014 [P] Frontend router shell: rewrite `src/App.tsx` with `createBrowserRouter` and routes `/` (HomePage), `/b/:tokenId` (BoardPage), `/b/:tokenId/t/:threadId` (ThreadPage) under a `Layout` (header with title link, `LanguageSwitcher`, `AuthBar`; mounts `useSession`); placeholder pages in `src/routes/`; ensure `OdinConnectProvider` wraps the router so redirect-mode sign-in restores the current URL.
- [x] T015 [P] Frontend shared pieces: extend `src/lib/amounts.ts` with `formatTokenAmount(raw, exponent)` (exponent = divisibility + decimals), `formatSignedAmount`, and a minimum-visible rule (`< 0.001` shows `~0.001`, never `0`, when raw ≠ 0) with `amounts.test.ts`; `src/hooks/useToken.ts` (`odin.api.getToken(id)` with module cache); `src/hooks/useUserProfile.ts` (`odin.api.getUser` + `odin.api.getUserAvatarUrl`, module cache, de-duplicated in-flight); `src/components/AuthorChip.tsx`.

**Checkpoint**: sign in with Odin on the placeholder app, `GET /auth/me` returns the principal; all unit tests green; `pnpm build` green.

## Phase 3: User Story 2 — Create and reply in threads (P1)

**Goal**: threads and nested comments with author-only edit and delete, readable signed-out. Validates quickstart V2.

- [x] T016 [US2] Create `packages/api/src/services/threads.service.ts`: `list(tokenId, sort, page, limit, viewer)` (New ordering now; Top/Hot wired in T025; excludes deleted threads with `commentCount = 0`; attaches `myVote` when `viewer` set), `get(id, viewer)`, `create(principal, tokenId, title, body, tokenMeta)` (validate, upsert `Board`, enforce `PostCooldown` 30 s → `COOLDOWN` with seconds remaining, insert), `edit(principal, id, title, body)` (`FORBIDDEN` if not author, `DELETED` if deleted, sets `editedAt`), `remove(principal, id)` (blank title and body, `deleted = true`).
- [x] T017 [US2] Create `packages/api/src/services/comments.service.ts`: `list(threadId, sort, viewer)` flat with `myVote`, `create(principal, threadId, parentId, body)` (thread exists and not deleted; parent exists, same thread, not deleted; cooldown; `commentCount + 1`), `edit`, `remove` (blank body, `deleted = true`, `commentCount − 1`).
- [x] T018 [US2] Create `packages/api/src/routes/threads.routes.ts` and `comments.routes.ts` per contracts/backend-api.md with zod bodies and `optionalAuth` on reads, `requireAuth` on writes; mount; `test/threads.routes.test.ts` and `test/comments.routes.test.ts` covering create, nesting, edit marker, delete placeholder with preserved replies, `INVALID_INPUT` (empty, 201-char title, whitespace body), `FORBIDDEN`, `NOT_FOUND`, `COOLDOWN`, signed-out read works and write is `UNAUTHORIZED`.
- [x] T019 [P] [US2] Frontend content components: `src/lib/commentTree.ts` (flat → tree by `parentId`, depth cap 8 attaches deeper replies at depth 8, stable order preserved) with `commentTree.test.ts`; `src/components/Composer.tsx` (title+body or body-only, live counters against limits, disabled with sign-in prompt when signed out, submit/error states); `src/components/ThreadCard.tsx`; `src/components/CommentTree.tsx` (recursive, reply composer inline, edited marker, deleted placeholder, author-only edit/delete controls); `src/hooks/useThreads.ts`, `useThread.ts`, `useComments.ts` with create/edit/delete mutations through `apiFetch`.
- [x] T020 [US2] Wire `src/routes/BoardPage.tsx` (board header from `useToken`, New-ordered thread list, composer passing `token: { divisibility, decimals }`) and `src/routes/ThreadPage.tsx` (thread, comments tree, reply composer, 404 state); add i18n keys for board, thread, composer, errors in `en.json` and `zh.json`.

**Checkpoint**: quickstart V2 passes end to end; signed-out browser reads everything.

## Phase 4: User Story 1 — Vote with token-weighted influence (P1) 🎯 MVP

**Goal**: up/down votes weighted by the API-reported balance, one vote per user per item, frozen snapshots. Validates quickstart V1, V3, V4.

- [x] T021 [US1] Create `packages/api/src/services/votes.service.ts`: `vote(principal, target, direction, weightStr)` in a Prisma interactive transaction: `SELECT ... FOR UPDATE` on the target row via `$queryRaw` (`NOT_FOUND`, `DELETED`), resolve `tokenId`, read `Vote` by composite key, `applyVoteDelta`, upsert or delete `Vote`, `UPDATE` `score`/`upCount`/`downCount`, return `VoteOutcome` with `appliedWeight`.
- [x] T022 [US1] Create `packages/api/src/routes/votes.routes.ts` (`POST /votes`, zod: `target.kind`, `target.id` digits, `direction`, `weight` digits ≤ 40); mount; `test/votes.routes.test.ts` covering cast/retract/flip arithmetic with two principals, `NO_BALANCE` on `"0"` cast, retract allowed with `"0"`, `DELETED`, `UNAUTHORIZED`, and a concurrency test firing 100 alternating up/down requests with `Promise.all` from one principal asserting ≤ 1 `Vote` row, non-negative counts, and `score` equal to the sum of remaining weights (SC-003).
- [x] T023 [P] [US1] Frontend voting: `src/hooks/useVote.ts` (signed out → returns `needsSignIn`; else `odin.api.getBalance(principal, tokenId)`; `null` or `0n` and not a retract → local `NO_BALANCE` message, no request; else `POST /votes` with `weight: balance.toString()`; apply returned outcome; pending and error states; `BALANCE_UNAVAILABLE` on SDK failure); `src/components/VoteControl.tsx` (up/down arrows with active state from `myVote`, weighted score via `formatSignedAmount(score, divisibility + decimals)`, raw up/down counts, `appliedWeight` toast after voting, sign-in prompt when signed out).
- [x] T024 [US1] Mount `VoteControl` in `ThreadCard` and `CommentTree`; provide token `divisibility`/`decimals` from `BoardPage`/`ThreadPage` via context; refetch `myVote` after `useSession` becomes `ready`; i18n keys for vote messages.

**Checkpoint**: quickstart V1, V3, V4 pass with two dev accounts — MVP shippable.

## Phase 5: User Story 3 — Browse boards and ranked content (P2)

**Goal**: home with board discovery and search; Top/Hot/New threads; Top/New comments. Validates quickstart V5.

- [x] T025 [US3] Backend ranking: implement `sort=top|hot` in `threads.service.list` (hot via `$queryRaw` joining `Board` for `decimals`, then hydrate by id order) and `sort=top|new` in `comments.service.list`; add `GET /boards/stats?tokenIds=` in `src/routes/boards.routes.ts` (`threadCount` of non-deleted threads, `lastActivity`); `test/ranking.test.ts` seeds threads with varied scores and ages and asserts each ordering, plus stats for unknown ids.
- [x] T026 [P] [US3] Frontend home: `src/hooks/useBoards.ts` (`odin.api.getTokens({ page, limit: 24 }, { field: 'marketcap', direction: 'desc' }, search ? { search } : {})` with debounced search, overlay `GET /boards/stats`); `src/routes/HomePage.tsx` with board cards (image via `OdinUtils.buildTokenImageUrl(id, env)`, name, ticker, holder count, thread count), search box, pagination, links to `/b/:tokenId`; empty-board state on `BoardPage` with composer prompt.
- [x] T027 [US3] `BoardPage` sort tabs (Top, Hot, New) persisted in the URL query, pagination controls; `ThreadPage` comment sort toggle (Top, New); deleted-thread permalink shows placeholder with comments; i18n keys.

**Checkpoint**: quickstart V5 passes.

## Phase 6: User Story 4 — See my voting power and vote state (P3)

**Goal**: visible, approximate voting power per board and consistent vote state across devices. Validates US4 acceptance scenarios and quickstart V3.4.

- [x] T028 [US4] `src/hooks/useVotingPower.ts` (`odin.api.getBalance(principal, tokenId)` on board load, after each vote outcome, and on window focus; exposes `{ raw, display, loading, error }`) and `src/components/VotingPower.tsx` (shows `≈ <amount> <ticker>` with an "approximate" tooltip, zero state explains voting requires holding the token); mount in `BoardPage` header and `ThreadPage`.
- [x] T029 [US4] Verify vote-state consistency: backend test in `test/votes.routes.test.ts` that two sessions for the same principal both see `myVote`; frontend refetch of lists after login and after voting; show the frozen snapshot vs current power distinction in the `appliedWeight` toast copy; i18n keys.

**Checkpoint**: US4 scenarios 1 to 4 pass; V3.4 (expired session) passes.

## Phase 7: Polish & cross-cutting

- [x] T030 [P] Login hardening: `test/login.test.ts` and `test/auth.routes.test.ts` cover `REPLAY`, missing-target `LOGIN_REJECTED`, 10-minute-old timestamp; add `express-rate-limit` on `POST /auth/login` (20/min per IP) (quickstart V7).
- [x] T031 [P] Vote audit log: in `votes.service.ts` emit one structured pino line per accepted vote `{ principal, tokenId, targetKind, targetId, direction, weight, appliedWeight }` for later reconciliation against the Odin API (plan risk "false weights").
- [x] T032 Rewrite `README.md` (architecture diagram: frontend ↔ api ↔ MySQL, Odin Connect sign-in, identity-anchor canister, trust model for weights, env vars, local setup, deploy notes); update root `CLAUDE.md` (remove ledger-guard sections, add api package rules: zod on every write, `bigint` amounts, no raw SQL outside `ranking.ts` and the vote lock), `packages/frontend/AI_INSTRUCTIONS.md` (api client, session, no direct `api.odin.fun` calls), new `packages/api/AI_INSTRUCTIONS.md`.
- [x] T033 [P] Production wiring: `CORS_ORIGINS` and `TRUSTED_ORIGINS` production hosts, `VITE_API_URL` per environment, Netlify `_redirects` verified, `prisma migrate deploy` documented for the chosen host.
- [~] T034 Run `pnpm typecheck`, `pnpm test`, `pnpm build`; CI green; walk quickstart V1 to V7 with two dev-env Odin accounts against the deployed anchor canister; record deviations in `quickstart.md`.
  - Done locally 2026-10-17: typecheck (3 packages), tests (frontend 31, api 36 unit + 12 MySQL-gated skipped), frontend and api builds.
  - Not done locally (environment lacked dfx, Docker/MySQL, and a deployed anchor canister): `dfx build canister --check`, the 12 MySQL route tests (run in CI), and the manual V1 to V7 walk, which needs the canister deployed to the IC and two dev-env Odin accounts.

## Dependencies

```
Phase 1 (T001 ∥ T002 ∥ T003 ∥ T004 ∥ T006 → T005)
  └─► Phase 2 (T007 → T009 → T010 → T011; T008 ∥ T012 ∥ T013 ∥ T014 ∥ T015)
        └─► Phase 3 / US2 (T016 → T017 → T018; T019 [P] → T020)
              └─► Phase 4 / US1 (T021 → T022; T023 [P] → T024)
                    └─► Phase 5 / US3 (T025; T026 [P] → T027)
                          └─► Phase 6 / US4 (T028 → T029)
                                └─► Phase 7 (T030 ∥ T031 ∥ T033 → T032 → T034)
```

- T009 depends on T008 (verifier modules) and T007 (nothing from the DB, but shared tsconfig and deps land there).
- T013 depends on T003 only for the error shape; it can start as soon as contracts are fixed.
- T020 needs T018 (routes) and T019 (components). T024 needs T022 and T023.
- T025 touches `threads.service.ts` and `comments.service.ts` after T016/T017; do not parallelize with them.
- T029 may surface changes in T018's `optionalAuth` wiring; re-run route tests.

## Parallel opportunities

- Setup: T001, T002, T003, T004, T006 together; T005 after T003.
- Foundational: T008, T012, T013, T014, T015 alongside the T007 → T009 → T010 → T011 chain.
- US2: backend chain (T016 → T017 → T018) ∥ frontend components (T019).
- US1: backend (T021 → T022) ∥ frontend (T023).
- US3: T025 ∥ T026.
- Polish: T030 ∥ T031 ∥ T033.

## Summary

- **Total**: 34 tasks — Setup 6, Foundational 9, US2 5, US1 4, US3 3, US4 2, Polish 5.
- **MVP scope**: Phases 1 to 4 (T001 to T024): sign-in, threads and comments, weighted voting.
- **Independent test points**: Phase 2 → login round trip; US2 → V2; US1 → V1, V3, V4; US3 → V5; US4 → US4 scenarios; Polish → V6, V7 and the full CI run.
- **Decisions already made that tasks rely on**: client-submitted weight trusted (FR-014), identity-anchor canister, MySQL via Prisma, in-memory replay guard (single instance).
- **Next**: `/odin-implement`
