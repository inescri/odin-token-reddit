# Contract: Board Backend REST API v1

**Branch**: `001-token-message-board` | **Date**: 2026-10-17

Base URL from `VITE_API_URL`. JSON everywhere. Big integers (`score`, `weight`) travel as decimal strings. Ids travel as strings. Times are ISO 8601 UTC. Authenticated routes take `Authorization: Bearer <app session JWT>`.

## Errors

```json
{ "error": { "code": "NOT_FOUND", "message": "human readable" } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | zod validation failed; `message` names the rule |
| 401 | `UNAUTHORIZED` | missing, invalid, or expired session |
| 401 | `LOGIN_REJECTED` | delegation or signature verification failed |
| 403 | `FORBIDDEN` | not the author |
| 404 | `NOT_FOUND` | thread, comment, or parent missing |
| 409 | `DELETED` | target is deleted |
| 409 | `REPLAY` | login signature seen before |
| 422 | `NO_BALANCE` | cast or flip with weight `"0"` |
| 429 | `COOLDOWN` | `message` includes seconds remaining |

## Auth

### `POST /auth/login`
```json
{ "delegation": "<DelegationChain JSON string>", "timestamp": "1760690000000", "signature": "<base64>" }
```
Signature by the delegation's session key over `utf8("odin-token-reddit-login:v1\n" + timestamp)`. Chain's last delegation `targets` must include the app canister id. Timestamp within ±5 min.
**200** `{ "token": "<jwt>", "principal": "<text>", "expiresAt": "<iso>" }`

### `GET /auth/me` (auth)
**200** `{ "principal": "<text>" }`

## Boards

### `GET /boards/stats?tokenIds=a,b,c`
**200** `{ "items": [ { "tokenId": "a", "threadCount": 12, "lastActivity": "<iso>|null" } ] }` — unknown ids return `threadCount: 0`.

## Threads

### `GET /boards/:tokenId/threads?sort=top|new|hot&page=1&limit=25`
`limit ≤ 50`. If authenticated, each item carries `myVote`.
**200** `{ "items": [Thread], "total": 123 }`

### `GET /threads/:id`
**200** `Thread` (deleted threads return with `deleted: true` and blank text). **404** otherwise.

### `POST /boards/:tokenId/threads` (auth)
```json
{ "title": "…", "body": "…", "token": { "divisibility": 8, "decimals": 3 } }
```
`token` upserts the `Board` row (display-only metadata from `odin.api.getToken`). Enforces cooldown.
**201** `Thread`

### `PATCH /threads/:id` (auth, author) `{ "title", "body" }` → **200** `Thread`
### `DELETE /threads/:id` (auth, author) → **204**

## Comments

### `GET /threads/:id/comments?sort=top|new`
Flat list; client nests by `parentId`.
**200** `{ "items": [Comment] }`

### `POST /threads/:id/comments` (auth) `{ "body": "…", "parentId": "<id>|null" }` → **201** `Comment`
Parent must belong to the thread and be non-deleted; thread must be non-deleted. Enforces cooldown.
### `PATCH /comments/:id` (auth, author) `{ "body" }` → **200** `Comment`
### `DELETE /comments/:id` (auth, author) → **204**

## Votes

### `POST /votes` (auth)
```json
{ "target": { "kind": "thread" | "comment", "id": "<id>" }, "direction": "up" | "down", "weight": "123456789" }
```
`weight` is the voter's balance of the board's token in raw units as returned by `odin.api.getBalance(principal, tokenId)` immediately before the call. The backend validates the shape (digits only, ≤ 40) and **trusts the value** (spec FR-014). Semantics per data-model vote delta table.
**200**
```json
{ "target": {…}, "score": "…", "upCount": 3, "downCount": 1, "myVote": "up" | "down" | null, "appliedWeight": "…" }
```
`appliedWeight` is `"0"` on retract.

## Wire types

```ts
type Thread = {
  id: string; tokenId: string; author: string;      // author = principal text
  title: string; body: string;
  createdAt: string; editedAt: string | null; deleted: boolean;
  score: string; upCount: number; downCount: number; commentCount: number;
  myVote: 'up' | 'down' | null;
};
type Comment = Omit<Thread, 'tokenId' | 'title' | 'commentCount'> & { threadId: string; parentId: string | null };
```

## Frontend reads from the Odin API (via `odin-connect`, browser)

| Call | Used for |
|---|---|
| `odin.api.getTokens({ page, limit }, { field: 'marketcap', direction: 'desc' }, { search })` | Boards list and search |
| `odin.api.getToken(id)` | Board header, `divisibility`, `decimals` |
| `odin.api.getUser(principal)`, `odin.api.getUserAvatarUrl(principal)` | Author chips (cached) |
| `odin.api.getBalance(principal, tokenId)` | Voting power display and the `weight` sent with each vote |

## Backend reads from the Odin API

None in v1. Hardening path: `new OdinConnect({ name, env }).api.getBalance(...)` in `votes.service.ts`, requires a Cloudflare exception for the backend's egress IP.
