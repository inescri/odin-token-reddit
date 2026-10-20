# Implementation Plan: Token-Weighted Message Board

**Branch**: `001-token-message-board` | **Date**: 2026-10-17 (revised, supersedes the canister-storage draft) | **Spec**: specs/001-token-message-board/spec.md

## Summary

A Reddit-style board per Odin token, built as a conventional web app. A new `packages/api` Node backend (Express 5, Prisma, MySQL 8) stores boards, threads, comments, and votes. Users sign in with Odin Connect; the backend verifies the resulting delegation chain and a signed timestamp itself, using the same verifier code Odin's own login uses, and issues an app session. A minimal canister remains only because Odin Connect requires a delegation target: it publishes trusted origins and nothing else. The browser fetches the voter's balance through the Odin Connect SDK's API client and submits it with the vote; the backend records the weight as submitted. The template's custody code (deposit, withdraw, internal ledger) is removed. The frontend keeps the template's Odin Connect wiring, adds `react-router-dom`, and uses `odin.api` wrappers for tokens, profiles, and balances.

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node 22; pnpm workspace
**Backend**: Express 5, Prisma 5 (MySQL 8, mirrors odin-api), zod, `jose` (HS256 app session), pino. Identity verification: `@dfinity/identity`, `@dfinity/agent`, `@dfinity/principal`, `@icp-sdk/core`, `@noble/curves`, and `OdinUtils.isDelegationValid` from `odin-connect`. Odin API access, if any, via `new OdinConnect({ env }).api` (server-safe constructor, verified).
**Frontend**: React 19, Vite 8, `odin-connect` ^2.0.2, `react-i18next`; new `react-router-dom` ^7. All Odin data via `odin.api.*` wrappers.
**Canister**: Azle 0.33, trimmed to `@init`, `getOwner`, `icrc28_trusted_origins`. Deployed once to mainnet; never called by this app's own code.
**Storage**: MySQL. Weights and scores as `DECIMAL(40,0)`, exposed to TypeScript as `bigint` at the service boundary and as decimal strings on the wire.
**Testing**: vitest for pure modules (vote delta, validation, hot formula, login message, comment tree, amount formatting); supertest against a MySQL test database for route tests; manual quickstart.
**Target Platform**: any Node host plus MySQL; frontend static host (Netlify as in template). Hosting choice deferred.
**Performance Goals**: vote reflected within 3 s (SC-002): one HTTP round trip plus one SDK balance call in the browser.
**Constraints**: one vote per user per item under concurrency (SC-003) via row lock in a transaction; no approval popup ever (SC-007); amounts never `number` in storage or wire.

## Constitution Check (pre-design gate)

No `constitution.md` in this repo. Gate is `CLAUDE.md` plus both `AI_INSTRUCTIONS.md`.

| # | Rule | Status | Notes |
|---|---|---|---|
| 1 | Guarded ledger code not modified without maintainer sign-off | SIGN-OFF IMPLIED | The decision "canister for identity only" removes `deposit`, `withdraw`, `ledger.ts`, `odin.ts`. Recorded here as the maintainer's instruction of 2026-10-17. |
| 2 | Credited balances backed by deposits | N/A | No balances exist anywhere in the app. |
| 3 | Amounts are `bigint`, never `number` | PASS | `DECIMAL(40,0)` columns, `bigint` in services, strings on the wire. Hot ranking uses SQL arithmetic for ordering only. |
| 4 | Validate every write input | PASS | zod schemas on every route body; weight validated as a non-negative integer string of at most 40 digits. |
| 5 | Never trust the client for accounting | DEVIATION, ACCEPTED | FR-014 as revised: the weight is client-submitted and trusted. See Complexity Tracking. |
| 6 | Unique stable memory ids | PASS | Only id 1 (`config`) remains in use. Id 0 stays reserved. |
| 7 | One `OdinConnect` instance, render from state | PASS | Frontend unchanged in this respect. Backend creates its own server-side instance for API wrappers if needed. |
| 8 | No hardcoded canister ids or secrets | PASS | `VITE_APP_CANISTER_ID`, `APP_CANISTER_ID`, `SESSION_SECRET`, `DATABASE_URL` from env. |
| 9 | Strict TS, formatting conventions | PASS | Backend follows the frontend's 2-space style. |

**Gate result: PASS** with one accepted, documented trust deviation.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Client-submitted vote weight (trusts the browser) | Owner decision: no custody canister, trust the Odin API balance, browser uses the SDK wrappers. The Odin API returns 403 to non-browser clients, so server-side fetch needs a Cloudflare exception first. | Server-side fetch is the hardening path; it is one function swap in `votes.service.ts` once the backend's egress is allowlisted. |
| Keep a canister at all | Odin Connect refuses a delegation with no targets, and without a delegation the app has no key the backend can verify. | Verifying the Odin-issued JWT needs Odin's HS256 secret or an Odin API call (Cloudflare-blocked). Firebase-style self-reported identity was rejected as unverifiable. |
| Copy three verifier modules from odin-api | Odin's login algorithm is proven and handles Ed25519, secp256k1, and canister-signature root keys. | Publishing them as a shared package is better long term but out of scope here. |
| Third package in the workspace | Backend has its own runtime, deps, and deploy. | Serving the API from the Vite dev server is not a deployable shape. |

## Project Structure

```
packages/
├── api/                                  # NEW — Express + Prisma backend
│   ├── package.json · tsconfig.json · .env.example
│   ├── prisma/schema.prisma              # Board, Thread, Comment, Vote
│   ├── src/
│   │   ├── index.ts                      # bootstrap, CORS, pino, routes
│   │   ├── env.ts                        # zod-validated env
│   │   ├── auth/
│   │   │   ├── verify-delegation-chain.ts   # copied from odin-api
│   │   │   ├── verify-session-signature.ts  # copied from odin-api
│   │   │   ├── verify-canister-signature.ts # copied from odin-api
│   │   │   ├── login.ts                  # verify chain+targets+timestamp+signature → principal
│   │   │   ├── session.ts                # issue/verify app JWT (jose, HS256, 24h)
│   │   │   ├── replay-guard.ts           # in-memory (sigHash → expiry) for ±5 min window
│   │   │   └── require-auth.ts           # Express middleware → req.principal
│   │   ├── lib/
│   │   │   ├── amounts.ts                # decimal-string ↔ bigint, validation
│   │   │   ├── vote-delta.ts             # applyVoteDelta (pure, tested)
│   │   │   ├── validation.ts             # title/body/tokenId limits (pure, tested)
│   │   │   └── ranking.ts                # Prisma orderBy / raw SQL for top|new|hot
│   │   ├── routes/
│   │   │   ├── auth.routes.ts            # POST /auth/login, GET /auth/me
│   │   │   ├── boards.routes.ts          # GET /boards/stats
│   │   │   ├── threads.routes.ts         # list/get/create/edit/delete
│   │   │   ├── comments.routes.ts        # list/create/edit/delete
│   │   │   └── votes.routes.ts           # POST /votes
│   │   └── services/
│   │       ├── threads.service.ts · comments.service.ts
│   │       └── votes.service.ts          # transaction + row lock + delta
│   └── test/                             # vitest unit + supertest route tests
├── canister/src/
│   ├── index.ts                          # TRIM: @init owner, getOwner, icrc28_trusted_origins
│   ├── ledger.ts · ledger.test.ts · odin.ts   # DELETE
│   └── AI_INSTRUCTIONS.md                # REWRITE: "identity anchor; no logic"
└── frontend/src/
    ├── App.tsx                           # REWRITE: RouterProvider + shell
    ├── routes/HomePage.tsx · BoardPage.tsx · ThreadPage.tsx     # NEW
    ├── components/
    │   ├── AuthBar.tsx · LanguageSwitcher.tsx                 # keep
    │   ├── VoteControl.tsx · ThreadCard.tsx · CommentTree.tsx # NEW
    │   ├── Composer.tsx · AuthorChip.tsx · VotingPower.tsx    # NEW
    │   └── DepositForm.tsx · WithdrawForm.tsx                 # DELETE
    ├── api/
    │   ├── client.ts                     # NEW: fetch wrapper, bearer session, bigint strings
    │   ├── session.ts                    # NEW: sign timestamp with user.getIdentity(), POST /auth/login, store token per principal
    │   └── types.ts                      # NEW: wire types
    ├── hooks/
    │   ├── useSession.ts · useBoards.ts · useThreads.ts · useThread.ts
    │   ├── useVote.ts · useVotingPower.ts · useUserProfile.ts   # NEW
    ├── odin/                             # keep all (client, provider, hooks)
    ├── canister/                         # DELETE all (frontend never calls the canister); keep APP_CANISTER_ID in config
    ├── lib/amounts.ts                    # EXTEND: divisibility + decimals, signed
    ├── lib/commentTree.ts                # NEW, tested
    ├── lib/fees.ts                       # DELETE
    └── i18n/locales/{en,zh}.json         # board keys replace deposit/withdraw keys
docker-compose.yml                        # NEW: mysql:8.0 for local dev
.github/workflows/ci.yml                  # UPDATE: api typecheck/test, prisma generate; keep dfx check for the tiny canister
specs/001-token-message-board/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
└── contracts/backend-api.md · contracts/canister-api.md
```

## Phase 0 — Research (complete)

See `research.md`, decisions D1 to D13. Highlights: Odin API blocks non-browser clients (verified 403 from curl and Node); Odin's login algorithm is reusable and self-contained; delegation lifetime is 48 h; `OdinConnect` constructs in Node; `odin.api.getBalance` returns `bigint` through json-bigint.

## Phase 1 — Design & Contracts (complete)

- `data-model.md`: Prisma schema, key constraints, vote delta rules, ranking SQL, validation constants, session token claims.
- `contracts/backend-api.md`: REST surface, auth protocol, error codes, wire conventions.
- `contracts/canister-api.md`: the trimmed Candid interface and why it exists.
- `quickstart.md`: local setup with MySQL, two-account validation V1 to V7.

## Implementation approach (input to /odin-generate-tasks)

1. **Teardown**: delete custody code in canister and frontend, delete frontend `canister/` actor files, trim canister to identity anchor, update `TRUSTED_ORIGINS`, AI_INSTRUCTIONS, i18n keys. `pnpm build` green.
2. **Backend skeleton**: `packages/api` with Express, Prisma schema + first migration, env validation, docker-compose MySQL, pino, CORS for frontend origins.
3. **Auth**: copy verifier modules; `login.ts` (chain valid via `OdinUtils.isDelegationValid`, chain signatures via `verifyDelegationChain`, targets include `APP_CANISTER_ID`, timestamp ±5 min, replay guard, signature over timestamp by last delegation's pubkey, principal via `Principal.selfAuthenticating(chain.publicKey)`); session JWT; middleware; tests.
4. **Pure logic + services**: validation, `applyVoteDelta`, amounts, ranking; threads/comments/votes services with the vote transaction.
5. **Routes + route tests** with supertest.
6. **Frontend plumbing**: `api/client.ts`, `api/session.ts`, `useSession` (auto-login after Odin connect, clear on disconnect), router shell.
7. **Frontend UI**: pages and components; `useVotingPower` and `useVote` call `odin.api.getBalance` immediately before `POST /votes`.
8. **Validation**: quickstart V1 to V7 with two dev-env Odin accounts; CI green.

## Constitution Re-check (post-design gate)

No new deviations beyond the accepted client-weight trust. **PASS.**

## Risks & mitigations

- **False weights from a tampered client.** Accepted by the owner. Mitigation path documented: swap `votes.service.ts` weight source to `odin.api.getBalance` server-side once Cloudflare allows the backend's egress. Also log `(principal, tokenId, weight)` per vote for later audit against the API.
- **Odin API balance semantics.** `getBalance` reads `/user/{p}/balances?token_in=`; tokens in LP positions may be excluded. Spec assumption updated accordingly.
- **Cross-app delegation replay.** A delegation issued to another app could be presented here. Mitigation: require `targets` to include this app's canister id, and bind the signed message to this app with a prefix.
- **Login replay within ±5 min.** Replay guard keyed by signature hash; single-instance in-memory for v1, move to MySQL or Redis when scaling horizontally.
- **Delegation expiry (48 h) vs app session (24 h).** Session shorter than delegation; re-login is silent while the Odin session is valid.
- **Hot ranking math in SQL** on `DECIMAL(40,0)` divided by powers of ten: MySQL handles it; ordering only.
- **Spam.** Post cooldown of 30 s per principal; length limits.

## Next step

Run `/odin-generate-tasks` to produce the dependency-ordered task list from this plan.
