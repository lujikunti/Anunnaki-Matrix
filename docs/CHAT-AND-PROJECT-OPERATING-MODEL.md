# ANK Chat & Project Operating Model

**Status:** Canonical governance  
**Date:** 2026-09-24

## Principle

A chat is a temporary workbench, not a database, backlog, asset vault, production receipt or sales pipeline.

Useful work must leave the chat before the chat is considered complete.

## Systems of record

| Work type | Canonical home |
|---|---|
| Product code, architecture, QA, release truth | GitHub repository / PR / issue |
| Runtime and database truth | Vercel / Supabase plus repository receipts |
| Sales conversations and buyer replies | Gmail, with status reflected in the relevant commercial issue/CRM |
| Long-lived documents and source assets | Project sources / Library / Google Drive as appropriate |
| Time-specific obligations | Calendar / scheduled task |
| ChatGPT coordination context | The relevant ChatGPT Project |

## Chat classes

### 1. Control Room
One active control-room chat per project/workstream. Use for prioritisation, cross-system execution, decisions and status.

### 2. Incident / Transaction
Temporary chat for one bounded event: broken deploy, buyer response, application, DNS incident, release, etc. It must have a closure condition and be archived when the event is resolved or transferred to a system of record.

### 3. Research / Design Branch
Use only when isolated context genuinely helps. Synthesize the useful result into the project/repo/source, then archive it.

Do not create a new chat merely because a new idea appeared.

## Exit gate

Before declaring a chat safe to archive:

1. Extract durable decisions, requirements, evidence and unresolved tasks.
2. Put each item in its canonical system of record.
3. Verify consequential changes where possible.
4. Record external blockers truthfully; do not keep a chat open just because a third party has not replied.
5. Preserve source files/assets in a durable source location before **deleting** the chat.
6. Produce a closure receipt: what changed, what remains, where it lives.
7. Archive the chat.

## WIP limits

- Default: **1 Control Room + at most 2 temporary chats per ChatGPT Project.**
- If a fourth chat seems necessary, first close/archive or consolidate one.
- A chat older than 7 days with no active interaction should be reviewed for closure.
- Backlog belongs in issues/tasks, not chat titles.

## Naming

- `MN — Control Room — 2026 Q4`
- `GC — Control Room — 2026 Q4`
- `ANK — Control Room — 2026 Q4`
- `BWN — Control Room — 2026 Q4`
- Temporary: `MN — Incident — Cloudflare Release 65`
- Temporary: `BWN — Transaction — CannaFlora evaluation`
- Temporary: `GC — Research — GCC 2025 source review`

## Default closing command

> Close this thread. Move every durable decision, task, artifact and blocker into the correct system of record; verify what can be verified; give me a closure receipt; then tell me whether it is safe to archive. Do not keep unresolved backlog only in chat.

## Deletion rule

Archive by default. Delete only when the conversation is genuinely disposable and any source file or unique asset that matters has been preserved elsewhere.
