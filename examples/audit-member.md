# Example: audit a member

When a moderator says "tell me everything about user X," the agent can pull case history, notes, and any active evader flags in one round.

---

**You:**
> Audit user 987654321098765432 — full picture.

**Claude:**
> I'll pull cases, notes, and evader flags in parallel.

*(calls `lookup_member_cases` with `userId: "987..."`)*
*(calls `list_member_notes` with `userId: "987..."`)*
*(calls `list_evader_detections` with `userId: "987..."`)*

> Here's what I found:
>
> **Cases (4 total)**
> - 2026-02-12 — warn (10 pts) — slur, auto-deleted
> - 2026-02-15 — warn (4 pts) — invite link
> - 2026-03-01 — timeout 6h — mass mention
> - 2026-04-22 — ban — scam link
>
> **Mod notes (2)**
> - 2026-03-02 by `@mod_a` — "second-chance after timeout, watching"
> - 2026-04-21 by `@mod_b` — "phishing DMs reported in #scam-reports"
>
> **Evader flags (1)**
> - 2026-04-22 — high risk band, **unresolved**. Same fingerprint as banned account from 2025-11.
>
> **Suggested action:** the evader flag aligns with the ban date. Want me to mark the evader detection as `confirmed` and pin a note linking the prior account?

**You:**
> Yes, mark confirmed and add a note.

**Claude:**
*(calls `resolve_evader_flag` with `detectionId: "...", resolution: "confirmed", notes: "Confirmed evasion of 2025-11 ban — same fingerprint."`)*

> Done. The detection is now `confirmed` and the note is attached.

---

**Why this works**

- Three parallel reads (cases, notes, evader flags) collapse a 3-tab dashboard workflow into one paragraph.
- `resolve_evader_flag` is a safe write — it only updates Modly's internal disposition, doesn't take Discord-level action against the member.
