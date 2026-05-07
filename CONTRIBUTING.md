# Contributing to @modly/mcp-server

The MCP server is intentionally small. Most contributions add a tool, fix a schema, or improve a description.

## Local setup

```bash
npm install
npm run typecheck
npm run build
```

Test against your own MCP host by pointing it at the local build:

```json
{
  "mcpServers": {
    "modly-dev": {
      "command": "node",
      "args": ["/absolute/path/to/this/dist/index.js"],
      "env": { "MODLY_GUILD_ID": "...", "MODLY_API_KEY": "modly_pat_..." }
    }
  }
}
```

## Adding a tool

1. Pick a snake_case name (e.g. `list_role_events`). Verbs: `list_`, `get_`, `save_`, `delete_`, `create_`, `lookup_`, `decide_`, `resolve_`, `enqueue_`, `install_`, `search_`.
2. Add an entry to `TOOLS` in `src/tools.ts`. Use `descriptionKey` and `descriptionKey` on field hints — never hardcoded English in `tools.ts`.
3. Add description strings in `src/locales/en.ts`.
4. Document the tool in `docs/tools.md` (with full input schema).
5. If the tool fits a category, add it to the README's grouped table.

## Surface scope

Read tools and safe writes only. Mutations that change webhook secret material (which contains credentials) or escalate moderation actions (Discord-side ban/kick) stay dashboard-only.

If you're adding a write tool, the test is: **"if a malicious or hallucinating agent calls this with arbitrary inputs, what's the worst outcome?"** If the answer involves leaking credentials, taking Discord moderation actions on real users, or unrecoverable data loss — the tool stays dashboard-only.

## Conventions

- `strict: true` TypeScript, no `as any`, files <600 lines.
- ESM-only, Node 20+.
- Helpers at the top of `tools.ts` (`getStr`, `getOptObj`, `raw`, `qs`) — reuse them, don't duplicate.

## Filing issues

- **Tool returning unexpected shape?** Include the call args and raw JSON output.
- **Want a new tool?** Open a feature request describing the agent flow it enables.

---

Last updated: 2026-04-30
