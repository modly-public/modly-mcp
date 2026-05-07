## What does this change

<!-- Short description. Link related issue(s). -->

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` produces clean output
- [ ] If adding a tool: registered in `src/tools.ts`, described in `src/locales/en.ts`, documented in `docs/tools.md`, added to README grouping
- [ ] No hardcoded English strings in `src/tools.ts` (use `descriptionKey`)
- [ ] Tool surface stays read/safe-write — no Discord-side moderation escalation, no webhook-secret mutation
- [ ] Tested against a real MCP host (Claude Desktop / Cursor / Cline)
