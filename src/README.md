# `src/` — MCP server source

Server source. Three files / folders, narrow on purpose.

## Layout

| File / folder | Purpose |
|---|---|
| [`index.ts`](./index.ts) | stdio entry point. Reads env vars, instantiates `ModlyClient`, registers `ListTools` + `CallTool` handlers, opens `StdioServerTransport`. |
| [`tools.ts`](./tools.ts) | The 18-tool registry. Every tool is one entry in `TOOLS` with `name`, `descriptionKey`, `inputSchema`, `handler`. Helpers at the top (`getStr`, `getOptObj`, `raw`) keep handlers tiny. |
| [`locales/`](./locales) | Tool description strings — see [its README](./locales/README.md). |

## Adding a tool

1. Pick a snake_case name (e.g. `list_role_events`).
2. Add an entry to `TOOLS` in `tools.ts`:

```ts
{
  name: "list_role_events",
  descriptionKey: "mcp.tools.list_role_events.description",
  inputSchema: {
    type: "object",
    properties: { roleId: { type: "string" } },
    required: ["roleId"],
  },
  handler: async (args, client) => raw(client, "GET", `/role-events?roleId=${getStr(args, "roleId")}`),
},
```

3. Add the description string in `locales/en.ts`.
4. Add the entry to [`docs/tools.md`](../docs/tools.md).
5. Build, restart your MCP host.

## Why so many `raw(...)` calls?

`raw()` is a thin escape hatch that hits the Modly API directly without going through a typed SDK namespace. It exists because the SDK's namespace coverage is broader than the MCP surface — and for endpoints not yet generated in the SDK, `raw()` lets us ship the tool today and migrate to a typed call later.

When the SDK gains a typed namespace for a route, swap the `raw(client, "GET", "/foo")` call for `client.foo.list()`. The tool's behavior doesn't change.

---

Last updated: 2026-04-30
