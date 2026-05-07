# Example: triage today's appeals queue

A short, realistic transcript with Claude Desktop after the MCP server is configured.

---

**You:**
> Pull the pending appeals queue and summarize each one. Flag any where the user has 3+ prior cases.

**Claude:**
> I'll start by listing pending appeals, then look up each appellant's case history.

*(calls `list_pending_appeals` with `limit: 50`)*

> Got 7 pending appeals. Looking up case histories now…

*(calls `lookup_member_cases` once per appellant)*

> Here's the summary:
>
> 1. **@user_1** — appealing a 7-day ban for raid spam. **3 prior cases** (1 warn, 1 timeout, 1 kick). 🚩 flagged.
> 2. **@user_2** — appealing a slur warn. 1 prior warn, 11 months ago. Likely first-offense rehab.
> 3. **@user_3** — appealing a permaban for evasion. **5 prior cases**, includes ban + alt detection. 🚩 flagged.
> 4. … (truncated)
>
> Want me to draft individual responses, or just queue the two flagged ones for human review?

**You:**
> Draft responses for the unflagged ones.

**Claude:**
*(no MCP calls — composing in chat)*

> Drafts ready below. Paste into the dashboard once you've eyeballed them.

---

**Why this works**

- `list_pending_appeals` is read-only and returns enough context for triage.
- `lookup_member_cases` lets the agent merge case history into the appeal — the human view in the dashboard does the same join, but the agent saves you the 7 clicks.
- The agent **doesn't** approve/reject anything — that endpoint is dashboard-gated on purpose. Final disposition stays human.
