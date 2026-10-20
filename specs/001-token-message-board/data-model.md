# Data Model: Token-Weighted Message Board

**Branch**: `001-token-message-board` | **Date**: 2026-10-17 (revised)

Persistent state lives in MySQL 8 via Prisma. Amounts are `DECIMAL(40,0)` in the database (scores, which sum many weights, are `DECIMAL(65,0)`), `bigint` in services, decimal strings on the wire. Principals are stored as text (≤ 63 chars). Times are `DATETIME(3)` UTC.

## Prisma schema (authoritative sketch)

```prisma
model Board {
  tokenId      String   @id @db.VarChar(64)
  divisibility Int
  decimals     Int
  createdAt    DateTime @default(now()) @db.DateTime(3)
  threads      Thread[]
}

model Thread {
  id           BigInt    @id @default(autoincrement())
  tokenId      String    @db.VarChar(64)
  board        Board     @relation(fields: [tokenId], references: [tokenId])
  author       String    @db.VarChar(63)
  title        String    @db.VarChar(200)
  body         String    @db.Text
  createdAt    DateTime  @default(now()) @db.DateTime(3)
  editedAt     DateTime? @db.DateTime(3)
  deleted      Boolean   @default(false)
  score        Decimal   @default(0) @db.Decimal(65, 0)
  upCount      Int       @default(0) @db.UnsignedInt
  downCount    Int       @default(0) @db.UnsignedInt
  commentCount Int       @default(0) @db.UnsignedInt
  comments     Comment[]

  @@index([tokenId, createdAt(sort: Desc)])
  @@index([tokenId, score(sort: Desc), createdAt(sort: Desc)])
}

model Comment {
  id        BigInt    @id @default(autoincrement())
  threadId  BigInt
  thread    Thread    @relation(fields: [threadId], references: [id])
  parentId  BigInt?
  author    String    @db.VarChar(63)
  body      String    @db.Text
  createdAt DateTime  @default(now()) @db.DateTime(3)
  editedAt  DateTime? @db.DateTime(3)
  deleted   Boolean   @default(false)
  score     Decimal   @default(0) @db.Decimal(65, 0)
  upCount   Int       @default(0) @db.UnsignedInt
  downCount Int       @default(0) @db.UnsignedInt

  @@index([threadId])
}

enum TargetKind { THREAD COMMENT }
enum Direction  { UP DOWN }

model Vote {
  voter      String     @db.VarChar(63)
  targetKind TargetKind
  targetId   BigInt
  direction  Direction
  weight     Decimal    @db.Decimal(40, 0)   // frozen at cast; never updated in place
  castAt     DateTime   @default(now()) @db.DateTime(3)

  @@id([voter, targetKind, targetId])
  @@index([targetKind, targetId])
}

model PostCooldown {
  principal  String   @id @db.VarChar(63)
  lastPostAt DateTime @db.DateTime(3)
}
```

No foreign key from `Vote` to its target: the target is polymorphic. Integrity is enforced in `votes.service.ts` inside the transaction.

## Vote delta rules (`lib/vote-delta.ts`, pure, tested)

Inputs: item `(score, upCount, downCount)`, `prev` vote or none, requested `direction`, submitted `weight`.

| prev | request | Result | score Δ | up Δ | down Δ | stored vote |
|---|---|---|---|---|---|---|
| none | up | cast | `+weight` | +1 | 0 | `{UP, weight}` |
| none | down | cast | `−weight` | 0 | +1 | `{DOWN, weight}` |
| UP (w₀) | up | retract | `−w₀` | −1 | 0 | removed |
| DOWN (w₀) | down | retract | `+w₀` | 0 | −1 | removed |
| UP (w₀) | down | flip | `−w₀ − weight` | −1 | +1 | `{DOWN, weight}` |
| DOWN (w₀) | up | flip | `+w₀ + weight` | +1 | −1 | `{UP, weight}` |

Retract uses stored `w₀`, never the submitted weight, so a seller can undo exactly what they added. Cast and flip require `weight > 0`, else `NO_BALANCE` and no write. Retract accepts any submitted weight, including `"0"`.

Transaction (`votes.service.ts`): `SELECT ... FOR UPDATE` on the target row → `NOT_FOUND` / `DELETED` checks → read `Vote` by primary key → `applyVoteDelta` → upsert or delete `Vote` → `UPDATE` counters → commit → return outcome. The row lock serialises concurrent toggles by one user (SC-003).

## Validation constants (`lib/validation.ts`)

| Constant | Value |
|---|---|
| `TITLE_MAX` | 200 |
| `THREAD_BODY_MAX` | 10,000 |
| `COMMENT_BODY_MAX` | 5,000 |
| `TOKEN_ID_MAX` | 64, no whitespace |
| `WEIGHT_MAX_DIGITS` | 40, digits only |
| `MAX_DEPTH_DISPLAY` | 8 (frontend) |
| `POST_COOLDOWN_MS` | 30,000 |
| `PAGE_LIMIT_MAX` | 50 |
| `LOGIN_SKEW_MS` | 300,000 (±5 min) |
| `REPLAY_TTL_MS` | 600,000 |

## Ranking (SQL, ordering only)

- **Top**: `ORDER BY score DESC, createdAt DESC`
- **New**: `ORDER BY createdAt DESC`
- **Hot**: `s = t.score / POW(10, b.decimals)`, `g = POW(TIMESTAMPDIFF(SECOND, t.createdAt, NOW()) / 3600 + 2, 1.5)`; `ORDER BY CASE WHEN s >= 0 THEN s / g ELSE s * g END DESC, t.createdAt DESC` (raw SQL with `Board` joined). Negative scores multiply by the age factor so old downvoted threads sink instead of decaying toward 0.

Comments default to Top with the same expression minus the board join (decimals passed from the thread's board).

Deleted threads remain listable by id (permalinks) and are excluded from board listings unless `commentCount > 0`.

## Session token claims (`auth/session.ts`)

`{ sub: <principal>, iat, exp = iat + 24h, iss: "odin-token-reddit" }`, HS256 with `SESSION_SECRET`. The frontend stores it under `otr:session:<principal>` and drops it on Odin disconnect or `401`.

## Login request binding (`auth/login.ts`)

Message signed by the session key: `utf8("odin-token-reddit-login:v1\n" + timestamp)`. Accepted when: chain parses; `OdinUtils.isDelegationValid(chainJson)`; `verifyDelegationChain(chain)`; last delegation `targets` includes `APP_CANISTER_ID`; `|now − timestamp| ≤ LOGIN_SKEW_MS`; `sha256(signature)` unseen; `verifySessionKeySignature({ signingPubKey: lastDelegation.pubkey, signature, message })`. Principal = `Principal.selfAuthenticating(chain.publicKey).toText()`.

## Frontend-only derived types

- `ThreadView` / `CommentView`: wire records with `score`, `weight` fields as strings converted to `bigint` in `api/client.ts`, plus `myVote: 'up' | 'down' | null`.
- `CommentNode`: `CommentView & { children: CommentNode[]; depth: number }`.
- `VotingPower`: `{ raw: bigint; display: string; approximate: true }` from `odin.api.getBalance` and token `divisibility + decimals`.
