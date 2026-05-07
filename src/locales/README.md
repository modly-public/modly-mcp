# `src/locales/`

Tool description strings, keyed by stable IDs. Every `descriptionKey` referenced in `src/tools.ts` resolves through this map at MCP-host hand-off time.

## Files

| File | Purpose |
|---|---|
| [`en.ts`](./en.ts) | English strings. Source of truth. |

## Why a locale layer at all?

The MCP host shows tool descriptions to the agent (and sometimes to the user). Hardcoding English strings in `tools.ts` would lock us out of localizing them later. Keeping a `descriptionKey → string` map means a future `fr.ts`, `de.ts`, etc. can be selected at server start with zero changes to `tools.ts`.

Today only `en.ts` ships. New strings should:

1. Live as a stable key (e.g. `mcp.tools.list_x.description`, `mcp.fields.user_id`).
2. Be added to `en.ts` in alphabetical-ish grouping by tool.
3. Be referenced from `tools.ts` via `descriptionKey`, never inlined.

## Adding a string

```ts
// src/tools.ts
{
  name: "do_thing",
  descriptionKey: "mcp.tools.do_thing.description",
  inputSchema: { ... },
  handler: ...,
}
```

```ts
// src/locales/en.ts
export const EN_TEXT: Record<string, string> = {
  ...,
  "mcp.tools.do_thing.description": "Do the thing.",
};
```

---

Last updated: 2026-04-30
