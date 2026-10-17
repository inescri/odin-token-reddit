# Phase 0 Research: Token-Weighted Message Board

**Branch**: `001-token-message-board` | **Date**: 2026-10-17 (revised)

## Current State (facts from codebases)

- **Repo** `odin-token-reddit` is an unmodified fork of `odin-app-template`: `packages/canister` (Azle 0.33) and `packages/frontend` (React 19, Vite 8, `odin-connect` ^2.0.2). CI installs dfx and builds the canister.
- **Odin Connect sign-in**: `OdinConnectProvider.tsx` calls `odin.connect({ requires_api: true, requires_delegation: true, targets: [APP_CANISTER_ID] })`. `user.getIdentity()` returns a `DelegationIdentity` (session key plus chain) or `null` without a delegation. `odin.api.apiKey` exposes the Odin-issued JWT.
- **Delegation rules**: Odin rejects `requires_delegation` with no `targets` (`no_targets`) and requires each target canister to list the app origin via `icrc28_trusted_origins` (`untrusted_origin`). Odin issues delegations with a 48 h expiry (`AuthorizeConnect.tsx`).
- **Odin's JWT** is HS256 with a server secret (`JwtModule.register({ secret: process.env.JWT_SECRET })`), 24 h. Third parties cannot verify it offline. `GET /auth` returns the principal for a valid bearer token.
- **Cloudflare**: `https://api.odin.fun/v2/...` returns HTTP 403 with a Cloudflare challenge page to curl, to Node axios, and to axios with browser-like headers (tested 2026-10-17 from a Manila egress). Browser requests from the Odin frontend and this template work. No server-to-server allowance is documented in odin-api.
- **Odin's own login** (`POST /auth` in odin-api `auth.controller.ts`): body `{ delegation (JSON string), timestamp (ms string), signature (base64) }`. Server: `isDelegationValid(chain)`, `verifyDelegationChain(chain)`, signing key = last delegation's pubkey, `|now − timestamp| ≤ 5 min`, `verifySessionKeySignature(signature, utf8(timestamp))`, principal = `Principal.selfAuthenticating(chain.publicKey)`. The verifiers (`verify-delegation-chain.ts`, `verify-session-signature.ts`, `verify-canister-signature.ts`) depend only on `@dfinity/agent`, `@dfinity/identity`, `@icp-sdk/core`, `@noble/curves`, and Node `crypto`.
- **SDK in Node**: `new OdinConnect({ name, env })` constructs without browser globals (README: "On a server (no window) the constructor does not touch the browser"). `odin.api` is an `OdinApiClient` (not exported standalone). `getBalance(principal, tokenId)` calls `/user/{p}/balances?token_in=` and returns `Balance | null` with `balance: bigint` via json-bigint. `getTokens` supports `filters.search`. `OdinUtils.isDelegationValid(chainJson)` is exported.
- **Display units** (Odin frontend `models/amount.ts`): human = raw / 10^(divisibility + decimals).
- **odin-api stack**: NestJS 11, Prisma 5.22, MySQL 8 (docker-compose), Express 5, class-validator, axios.

## Decisions

### D1 — No board data in a canister; a Node backend with MySQL

**Decision**: `packages/api`: Express 5, Prisma 5, MySQL 8.
**Rationale**: Owner decision 2026-10-17. MySQL and Prisma mirror odin-api so the team's tooling and docker-compose carry over.
**Alternatives**: NestJS (rejected: ceremony for ten routes); Postgres or SQLite (rejected: team runs MySQL); Firestore from the browser (rejected: no verifiable identity).

### D2 — Canister kept only as the delegation target

**Decision**: Trim the canister to `@init` (owner), `getOwner`, `icrc28_trusted_origins`. Deploy once. The app's own code never calls it.
**Rationale**: Odin Connect needs a target to issue a delegation, and the backend needs a delegation to verify identity without Odin's secret or Odin's API.
**Alternatives**: canister that mints certified login tokens (rejected: certificate verification on the backend is heavier than chain verification and buys nothing); no canister (rejected: no verifiable identity reaches the backend).

### D3 — Backend verifies Odin's delegation login itself

**Decision**: `POST /auth/login { delegation, timestamp, signature }` mirroring odin-api's `POST /auth`, with two additions: the signed message is `"odin-token-reddit-login:v1\n" + timestamp` to bind to this app, and the chain's last delegation `targets` must include `APP_CANISTER_ID`. Copy the three verifier modules from odin-api verbatim. Use `OdinUtils.isDelegationValid` for expiry.
**Rationale**: Proven algorithm, no Odin API call, no Cloudflare dependency. The target check stops delegations issued to other apps being replayed here.
**Alternatives**: forward the Odin JWT to `GET /auth` (rejected: Cloudflare 403 server-side); accept self-reported principal (rejected).

### D4 — App session: HS256 JWT, 24 h, bearer header

**Decision**: On login success issue `{ sub: principal, iat, exp }` signed with `SESSION_SECRET` via `jose`. Frontend stores it in `localStorage` keyed by principal and sends `Authorization: Bearer`. Cleared on Odin disconnect.
**Rationale**: Frontend and API are on different origins (Netlify vs API host); a bearer token avoids cross-site cookie configuration.
**Alternatives**: httpOnly cookie with `SameSite=None` (rejected for v1: CSRF and cookie-domain work); re-verify the delegation on every request (rejected: cost).

### D5 — Replay guard

**Decision**: In-memory map of `sha256(signature) → expiry` for 10 min; reject duplicates. Timestamp window ±5 min.
**Rationale**: Same shape as odin-api's nonce burn. Single-instance for v1; promote to MySQL or Redis when running multiple instances.

### D6 — Vote weight: browser fetches via `odin.api.getBalance`, submits, backend trusts

**Decision**: `useVote` calls `odin.api.getBalance(principal, tokenId)` immediately before `POST /votes`, sends `weight` as a decimal string of raw units. Backend validates shape only (non-negative integer, ≤ 40 digits). `null` balance → the browser does not submit and shows the no-balance message. Cast/flip with `weight = 0` → `NoBalance`.
**Rationale**: Owner decision: trust the API balance; use the SDK wrappers; the API blocks server-side callers today.
**Hardening path**: swap the weight source in `votes.service.ts` to a server-side `new OdinConnect({ env }).api.getBalance(...)` once the backend's egress is allowlisted in Cloudflare. The route contract does not change (the `weight` field becomes advisory).

### D7 — Vote atomicity in SQL

**Decision**: Prisma interactive transaction: `SELECT ... FOR UPDATE` on the target row, read the existing vote by unique `(voterPrincipal, targetKind, targetId)`, compute `applyVoteDelta`, upsert or delete the vote, update counters, commit.
**Rationale**: Row lock serialises concurrent toggles from the same user (SC-003). Unique constraint is the backstop.

### D8 — Storage types

**Decision**: `weight`, `score` as `DECIMAL(40,0)`; counts as `INT UNSIGNED`; ids as `BIGINT AUTO_INCREMENT`; principals as `VARCHAR(63)`; timestamps `DATETIME(3)`. Services convert `Prisma.Decimal` ↔ `bigint` at the boundary.
**Rationale**: Odin amounts can exceed signed 64-bit for external runes. Decimal with scale 0 is exact.

### D9 — Ranking in SQL

**Decision**: Top: `ORDER BY score DESC, createdAt DESC`. New: `createdAt DESC`. Hot: raw SQL `ORDER BY (score / POW(10, b.decimals)) / POW(TIMESTAMPDIFF(SECOND, t.createdAt, NOW())/3600 + 2, 1.5) DESC, t.createdAt DESC` where `decimals` lives on the `Board` row.
**Rationale**: Full-board ordering must happen in the database for pagination. Ordering only; nothing stored.

### D10 — Board row holds `divisibility` and `decimals`

**Decision**: `Board(tokenId PK, divisibility, decimals, createdAt)`, upserted on first thread creation from values the client read via `odin.api.getToken`.
**Rationale**: Hot ranking needs decimals server-side. Display-only metadata; trusting the client here is harmless.

### D11 — Flat comments, client-side tree, depth cap 8

Unchanged from the first draft.

### D12 — Frontend data access only through `odin.api` wrappers

**Decision**: Boards list `odin.api.getTokens({page, limit}, {marketcap desc}, {search})`; board header `getToken`; author chips `getUser` plus `getUserAvatarUrl` via a module cache; voting power and vote weight `getBalance`. No hand-rolled calls to `api.odin.fun`.
**Rationale**: Owner instruction; the SDK already handles bigint parsing and env base URLs.

### D13 — Content rules and anti-spam

Title 1 to 200, thread body 0 to 10,000, comment 1 to 5,000, trimmed; tokenId ≤ 64 chars no whitespace; 30 s post cooldown per principal; edits unlimited with `editedAt`; delete blanks text and sets `deleted`.

## Open items carried from the spec

Spec's three Open Questions (one board per token, snapshot at vote time, zero-balance refusal) remain implemented as specified.
