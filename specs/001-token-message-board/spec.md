# Feature Specification: Token-Weighted Message Board

**Feature Branch**: `001-token-message-board`
**Created**: 2026-10-17
**Status**: Draft
**Input**: "Create a message board app where users can upvote and downvote threads and comments using their tokens. Snapshot of balance only, no fund deposits or withdrawals."

## Overview

A Reddit-style message board for Odin Fun. Each board is tied to one Odin token. Anyone signed in with their Odin identity can post threads and comments and vote them up or down. A vote's weight is the voter's **current balance of the board's token**, read from the authoritative source at the moment the vote is cast and recorded with the vote. Tokens never move: the app never takes custody, never asks for an approval, and never debits or credits anything. Holding more of a token means a louder voice on that token's board, and nothing else.

## Clarifications

### Session 2026-10-17

The following were decided by assumption while drafting, since the request did not specify them. Each is marked so a reviewer can overturn it before planning.

- Q: Which token gives voting weight? → A (assumed): Each board is bound to exactly one Odin token, and votes on that board are weighted by the voter's balance of that token. A user with none of the token can read and post but cannot cast a weighted vote there.
- Q: When is the balance snapshotted? → A (assumed): At the moment each vote is cast or changed, server-side from the authoritative balance source. The weight is then frozen on that vote. Later buys or sells do not change past votes.
- Q: Can a vote be changed? → A (assumed): Yes. A user has at most one vote per item and can flip it or retract it. Flipping re-snapshots the balance at that time.
- Q: Is anything deducted when voting? → A: No. The request is explicit: snapshot of balance only. No deposits, withdrawals, approvals, burns, locks, or fees of any kind.
- Q: Is board data stored in a canister? → A (decided 2026-10-17): No. Threads, comments, and votes live in the app's own backend database. A minimal canister exists only as the Odin Connect delegation target so the backend can verify sign-in cryptographically; it stores nothing and holds no funds.
- Q: Where does the balance come from and who is trusted? → A (decided 2026-10-17): The browser fetches the voter's balance from the Odin API through the Odin Connect SDK's API client and submits it with the vote. The backend trusts the API-reported balance as submitted. No on-chain verification.

## User Scenarios & Testing

### User Story 1 - Vote on threads and comments with token-weighted influence (Priority: P1)

As a holder of a token, I open that token's board, see threads and comments ranked by the community, and upvote or downvote them. My vote counts in proportion to how much of the token I hold right now, without my tokens leaving my wallet or any approval prompt appearing.

**Why this priority**: This is the entire differentiator. A plain message board exists everywhere; one where influence tracks token holdings, without custody risk, is the product. Every other story supports this one.

**Independent Test**: Sign in with two Odin accounts holding different amounts of a token. Upvote the same thread from both. Confirm the thread's token-weighted score equals the sum of the two balances at vote time, the raw vote count is two, and neither wallet's balance changed.

**Acceptance Scenarios**:

1. **Given** a signed-in user who holds a positive balance of the board's token, **When** they upvote a thread, **Then** the thread's weighted score increases by exactly that user's balance at that moment, its raw upvote count increases by one, and the user's wallet balance is unchanged.
2. **Given** the same user, **When** they downvote a comment, **Then** the comment's weighted score decreases by their balance at that moment and the raw downvote count increases by one.
3. **Given** a user who has already upvoted an item, **When** they upvote it again, **Then** the vote is retracted: the item's score and counts return to what they were without that vote.
4. **Given** a user who has upvoted an item, **When** they downvote it, **Then** the prior upvote is removed and a downvote is recorded, using the user's balance as of this new action, not the old snapshot.
5. **Given** a signed-in user who holds zero of the board's token, **When** they attempt to vote, **Then** the vote is refused with a clear message that voting on this board requires holding the token, and nothing is recorded.
6. **Given** a user who voted while holding 1,000 tokens and later sold all of them, **When** anyone views the item, **Then** the vote still contributes 1,000 to the score, since the snapshot is frozen at vote time.
7. **Given** a user who is not signed in, **When** they attempt to vote, **Then** they are prompted to sign in with Odin, and no vote is recorded.
8. **Given** a voter, **When** the vote is submitted, **Then** the weight applied is the balance the Odin API reports for the voter and the board's token at that moment, fetched through the Odin Connect SDK, and the system records it as reported.

### User Story 2 - Create and reply in threads (Priority: P1)

As a signed-in user, I start a thread on a token's board and reply to threads and to other comments, so the board has something to vote on.

**Why this priority**: Voting needs content. This is table stakes but still P1 because the product does nothing without it.

**Independent Test**: Sign in, create a thread with a title and body, reply to it, reply to the reply. Confirm all three appear in the correct nesting, attributed to the author, with timestamps, and that signed-out visitors can read them.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a board, **When** they submit a thread with a title and body, **Then** the thread appears at the top of the board's "New" ordering, attributed to them with their Odin display name and avatar.
2. **Given** a thread, **When** a signed-in user submits a comment, **Then** it appears under the thread; **When** they reply to a comment, **Then** it appears nested under that comment.
3. **Given** a thread or comment, **When** its author edits it, **Then** the new text is shown with an "edited" indicator; **When** the author deletes it, **Then** its text is replaced with a deleted placeholder, its replies remain visible, and its votes still count toward nothing visible.
4. **Given** a user who is not signed in, **When** they browse a board or thread, **Then** they can read everything but every compose and vote control prompts sign-in.
5. **Given** a submission that is empty, whitespace-only, or over the length limit, **When** it is submitted, **Then** it is rejected with a message stating the rule, and nothing is saved.
6. **Given** a user not the author, **When** they try to edit or delete an item, **Then** the action is refused.

### User Story 3 - Browse boards and ranked content (Priority: P2)

As a visitor, I discover which tokens have boards, open one, and sort its threads by what the community has weighted highest, by recent activity, or by newest, so the token holders' collective judgment is what I see first.

**Why this priority**: Ranking is where token-weighting becomes visible to a reader. Without it, weights are stored but invisible.

**Independent Test**: Seed a board with several threads of varying weighted score and age. Switch between Top, Hot, and New and confirm each ordering matches its definition. Open a thread and confirm comments default to weighted-score order.

**Acceptance Scenarios**:

1. **Given** the app home, **When** a visitor arrives, **Then** they see the list of boards with each board's token name, ticker, image, and thread count, and can search by token name or ticker.
2. **Given** a board, **When** the visitor chooses "Top", **Then** threads are ordered by weighted score descending; **When** they choose "New", **Then** by creation time descending; **When** they choose "Hot", **Then** by weighted score with a decay for age so new strong threads can surface.
3. **Given** a thread, **When** opened, **Then** comments are ordered by weighted score descending by default, with replies nested under their parent, and the reader can switch to newest-first.
4. **Given** any thread or comment, **When** displayed, **Then** it shows both the token-weighted score (formatted in the token's display units) and the raw up and down vote counts, so readers can tell "one whale" from "many holders".
5. **Given** a board for a token the visitor searched for that does not have a board yet, **When** they open it, **Then** the board exists with no threads and a compose prompt; boards are not pre-created or gated.

### User Story 4 - See my own voting power and vote state (Priority: P3)

As a signed-in holder, I see on each board how much weight my vote would carry right now, and on each item whether and how I have already voted, so I understand what pressing the arrow will do.

**Why this priority**: Makes the mechanic legible. Not required for correctness, but without it the weighting feels arbitrary.

**Independent Test**: Sign in, open a board, confirm the displayed voting power matches the wallet balance of that token. Vote on an item, reload, confirm the arrow shows the chosen direction. Buy more of the token elsewhere, return, confirm the displayed voting power updates while the earlier vote's weight does not.

**Acceptance Scenarios**:

1. **Given** a signed-in user on a board, **When** the board loads, **Then** their current voting power for that token is displayed and matches their wallet balance of it.
2. **Given** a user who previously voted on an item, **When** they view it again from any device, **Then** the control shows their current vote direction.
3. **Given** a user whose balance changed since they voted, **When** they view the item, **Then** the displayed voting power reflects the new balance while the item's score still reflects the frozen snapshot.
4. **Given** the balance source is temporarily unavailable, **When** the user tries to vote, **Then** the vote is refused with a retry message rather than recorded with a zero or stale weight.

### Edge Cases

- **Balance changes mid-session**: the user buys or sells between page load and clicking vote. The recorded weight must be the balance at the moment the vote is processed, not the balance displayed at page load.
- **Balance source unavailable**: a vote must never be recorded with a guessed, cached, or zero weight. Refuse and let the user retry.
- **Sybil splitting**: a user spreading tokens across many wallets gains no extra weight, since the sum of balances is unchanged. Raw vote counts, however, can be inflated this way, which is why weighted score is the primary ranking signal and raw counts are informational.
- **Dust balances**: tokens have many decimals. A holder of a negligible amount can vote, but their weight is negligible. Display formatting must not round such a score to a misleading zero or hide that a vote exists.
- **Very large balances**: a single large holder can dominate a board. This is accepted as inherent to the design; the raw counts are shown alongside so readers can see it.
- **Voting on deleted content**: votes on a deleted thread or comment are refused; existing votes on it remain stored but have no visible effect.
- **Voting on your own content**: allowed, same as any other vote. The author's holdings are as legitimate as anyone's.
- **Rapid vote toggling**: repeated flips must converge to exactly one stored vote per user per item, never duplicates or negative counts, regardless of request ordering.
- **Session expiry**: if the Odin session expires between page load and voting, the vote is refused and the user is prompted to sign in again, with no partial state.
- **Wallet in-app browsers**: sign-in may complete via a full-page redirect rather than a popup. The board must render correctly after that reload and still carry the user's intended action, or at least return them to the page they were on.
- **Token with no board activity**: boards exist implicitly for every Odin token; an empty board is a valid state, not an error.
- **Unicode and formatting in posts**: text is shown as plain text with line breaks preserved. No embedded scripts or active content ever execute.

## Requirements

### Functional Requirements

**Identity and access**

- **FR-001**: Users MUST sign in with their Odin identity via Odin Connect. The app MUST NOT maintain a separate account system. The backend MUST verify the Odin identity cryptographically before accepting any write.
- **FR-002**: Signed-out visitors MUST be able to read all boards, threads, and comments.
- **FR-003**: Creating, editing, deleting, and voting MUST require a signed-in user, and edit and delete MUST be limited to the item's author.

**Boards**

- **FR-004**: The app MUST provide one board per Odin token, addressable by the token's identifier, showing the token's name, ticker, and image.
- **FR-005**: Boards MUST exist implicitly for every Odin token; no creation step, approval, or minimum activity is required.
- **FR-006**: The home view MUST list boards and allow search by token name or ticker.

**Threads and comments**

- **FR-007**: A thread MUST have a title, a body, an author, a creation time, and belong to exactly one board.
- **FR-008**: A comment MUST have a body, an author, a creation time, and belong to exactly one thread, optionally nested under one parent comment within that thread.
- **FR-009**: The system MUST enforce length limits on titles and bodies and reject empty or whitespace-only submissions, stating the rule in the rejection.
- **FR-010**: Authors MUST be able to edit their own items, which are then marked as edited, and delete their own items, which are then shown as a deleted placeholder with replies preserved.
- **FR-011**: Content MUST be rendered as plain text with line breaks preserved. No user-supplied markup or script MUST ever execute.

**Voting**

- **FR-012**: Each signed-in user MUST be able to hold at most one vote per thread and one vote per comment, with direction up or down.
- **FR-013**: Casting a vote MUST record the voter, the item, the direction, the time, and the **weight**, where weight is the voter's balance of the board's token as reported by the Odin API at the time of voting.
- **FR-014**: The weight MUST originate from the Odin API's balance for the voter, obtained through the Odin Connect SDK's API client in the browser and submitted with the vote. The app trusts the API-reported balance and performs no on-chain verification. Known limitation: a tampered client could submit a false weight. This is accepted for this release.
- **FR-015**: A recorded weight MUST never change afterwards. A voter's later balance changes MUST NOT alter any existing vote.
- **FR-016**: Re-casting the same direction MUST retract the vote. Casting the opposite direction MUST replace the vote, re-reading the balance at that time.
- **FR-017**: A vote MUST be refused when the voter's balance of the board's token is zero, when the balance cannot be read from the Odin API (the browser MUST NOT submit), when the item is deleted, or when the user is not signed in. A refused vote MUST leave no stored state.
- **FR-018**: The app MUST NOT request token approvals, transfer, lock, burn, deposit, withdraw, or charge any token or fee for any action. The deposit and withdraw capabilities inherited from the app template MUST NOT be exposed in this product.

**Scoring and ranking**

- **FR-019**: Every thread and comment MUST expose a weighted score equal to the sum of upvote weights minus the sum of downvote weights, plus raw upvote and downvote counts.
- **FR-020**: Boards MUST offer Top (weighted score), New (creation time), and Hot (weighted score decayed by age) orderings for threads.
- **FR-021**: Thread views MUST order comments by weighted score by default, preserving nesting, with a newest-first alternative.
- **FR-022**: Weighted scores MUST be displayed in the token's display units, formatted so that small non-zero scores are distinguishable from zero.

**Voter feedback**

- **FR-023**: Signed-in users MUST see their current voting power on each board, equal to their current balance of that token.
- **FR-024**: Items MUST indicate the viewing user's existing vote direction, consistent across devices and reloads.

### Key Entities

- **Board**: One per Odin token. Identified by the token's identifier. Carries the token's display metadata. Owns threads.
- **Thread**: A top-level post on a board. Title, body, author, created time, edited flag, deleted flag, weighted score, up count, down count.
- **Comment**: A reply within a thread, optionally nested under a parent comment. Body, author, created time, edited flag, deleted flag, weighted score, up count, down count.
- **Vote**: The one vote a user holds on one item. Voter, item, direction, time, and frozen weight in the board token's smallest unit. Replaced or removed as the user changes their mind; never two for the same user and item.
- **Voting Power**: Not stored. A user's current balance of a board's token as reported by the Odin API, read on demand for display and at vote time for the snapshot.
- **User**: An Odin identity. Display name and avatar come from Odin. The app stores no profile of its own.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In the two-account acceptance test, the weighted score equals the sum of the two balances at vote time to the smallest token unit, and both wallet balances are unchanged after voting. 0 token movements of any kind across the full test suite.
- **SC-002**: A vote is reflected in the item's score and the voter's control within 3 seconds of clicking under normal conditions.
- **SC-003**: After 100 rapid alternating up/down clicks by one user on one item, exactly one vote or zero votes exist for that user on that item, and counts are never negative.
- **SC-004**: A user who sells their entire balance after voting still contributes their snapshot weight; verified by direct comparison before and after the sale.
- **SC-005**: 100% of write actions by a signed-out or expired session are refused with a sign-in prompt and leave no stored state.
- **SC-006**: A new visitor can find a token's board, open a thread, and read the comments without signing in, in under 1 minute.
- **SC-007**: No approval popup or redirect to the Odin approval page occurs anywhere in the product. The only Odin Connect interaction is sign-in.

## Assumptions

- The product is built in the `odin-app-template` fork in this repository as a web app with its own backend and database. The template's Odin Connect sign-in is reused. The template's deposit, withdraw, and internal ledger are removed. The canister is kept only as the Odin Connect delegation target.
- The balance source is the Odin API as exposed by the Odin Connect SDK's API client. The app trusts it. Balances the API does not count (for example tokens in liquidity positions) do not count toward voting weight.
- Weight is stored in the token's smallest unit as an unbounded integer. Display converts using the token's decimals.
- One board per token is the model. A single global board, or user-created boards, is out of scope.
- Moderation beyond author self-delete is out of scope for this release. Reporting, hiding, bans, and moderator roles can be added later.
- Notifications, direct messages, search within post text, images or rich media in posts, and real-time updates are out of scope for this release.
- Votes are public in aggregate only. Which specific user voted which way is not shown to other users, though the voter sees their own state.
- The initial release targets desktop and mobile web browsers, including wallet in-app browsers, consistent with the template's Odin Connect integration.

## Open Questions for Review

These are the assumptions most likely to change the plan if overturned. Resolve them before `/odin-plan-feature`.

1. **One board per token** versus a single board where weight comes from one designated token. The former is assumed because it matches the repository name and makes every token a community.
2. **Snapshot at vote time** versus a periodic snapshot (for example, balances captured once per day). Vote-time snapshot is assumed because it is simplest to explain and matches the literal request.
3. **Zero-balance users cannot vote** versus allowing zero-weight votes that still count in raw totals. Refusal is assumed so raw counts cannot be inflated for free.
