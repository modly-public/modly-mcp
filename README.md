# @modly/mcp-server

> Modly is the all-in-one Discord moderation bot — this is the official **MCP server** that lets any Model Context Protocol agent (Claude Desktop, Cursor, Cline, Continue, custom agents) drive a Modly-powered guild.

Run it locally over stdio. Point it at your guild with a personal access token. Your AI assistant can then triage appeals, audit members, install recipes, save embed templates, and more — without you leaving the chat.

- Bot: <https://modly.net>
- Issues: <https://github.com/modly-public/modly-mcp/issues>
- License: [MIT](./LICENSE)

## Install

```bash
npm install -g @modly/mcp-server
```

…or skip global install and use `npx @modly/mcp-server` directly in your MCP host config (recommended — auto-updates with each release).

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MODLY_API_KEY` | yes | — | Personal access token from **Account Settings → API tokens** (`modly_pat_...`). |
| `MODLY_GUILD_ID` | yes | — | Snowflake of the guild to operate on. |
| `MODLY_BASE_URL` | no | `https://modly.net` | Override for self-hosted Modly. |

## Host configs

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly/mcp-server"],
      "env": {
        "MODLY_GUILD_ID": "1234567890",
        "MODLY_API_KEY": "modly_pat_..."
      }
    }
  }
}
```

Restart Claude Desktop. The Modly tools appear under the hammer icon.

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly/mcp-server"],
      "env": { "MODLY_GUILD_ID": "...", "MODLY_API_KEY": "modly_pat_..." }
    }
  }
}
```

### Cline (VS Code)

`cline_mcp_settings.json` in the Cline extension settings:

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly/mcp-server"],
      "env": { "MODLY_GUILD_ID": "...", "MODLY_API_KEY": "modly_pat_..." }
    }
  }
}
```

### Continue / generic MCP host

Any MCP host that supports stdio transport. Pass the same `command` + `args` + `env`. Full per-host walkthroughs in [`docs/installation.md`](./docs/installation.md).

## Tool surface

Eighteen tools, grouped by domain:

### Webhooks & embeds

| Tool | What it does |
|---|---|
| `list_webhook_targets` | List every saved outbound webhook target in the guild. |
| `list_webhook_groups` | List every saved target group in the guild. |
| `list_embed_templates` | List every saved embed template in the guild. |
| `save_embed_template` | Create or overwrite a named embed template. |
| `send_webhook` | Broadcast a saved (or inline) embed to one or more targets. |
| `search_webhook_deliveries` | Search outbound webhook delivery history for a hook. |

### Moderation & cases

| Tool | What it does |
|---|---|
| `list_moderation_cases` | List recent moderation cases, optionally filtered by user. |
| `lookup_member_cases` | Full moderation history for a specific member. |
| `list_member_notes` | List moderator-only notes attached to a member. |

### Automod & captcha

| Tool | What it does |
|---|---|
| `list_automod_rules` | List every automod rule in the guild. |
| `create_automod_rule` | Create a new automod rule (kind, config, scope, action). |
| `delete_automod_rule` | Delete an automod rule by ID. |
| `get_captcha_analytics` | Captcha pass/fail counts and active challenge state. |

### Safety / appeals / forms

| Tool | What it does |
|---|---|
| `list_evader_detections` / `list_evader_flags` | List ban-evasion detections, filterable by risk band and resolution. |
| `resolve_evader_flag` | Resolve a detection (confirmed / false_positive / ignored). |
| `list_pending_appeals` | List pending appeals awaiting review. |
| `list_form_submissions` | Forms approval queue, filterable by form and status. |
| `decide_form_submission` | Approve or reject a form submission with optional reason. |

### Custom commands

| Tool | What it does |
|---|---|
| `list_custom_commands` | List every custom command in the guild. |
| `save_custom_command` | Create or update a custom command. |
| `delete_custom_command` | Delete a custom command by ID. |

### Engagement / automation / recipes

| Tool | What it does |
|---|---|
| `get_leveling_top` | Top-N leveling leaderboard. |
| `enqueue_scheduled_action` | Enqueue a one-shot or cron automation rule. |
| `install_recipe` | Install a public recipe by slug, with optional overrides. |

Full schemas (every input field, type, enum) live in [`docs/tools.md`](./docs/tools.md).

> **Why this surface?** Read tools and safe writes only. Anything that mutates webhook URLs (which contain credentials) or escalates moderation actions (ban / kick a real human) stays dashboard-only by design — agents shouldn't be able to add a partner's webhook URL or unilaterally ban a member.

## Example transcripts

Three short snippets in [`examples/`](./examples) showing realistic uses:

- [Triage today's appeals queue](./examples/triage-appeals.md)
- [Audit a member](./examples/audit-member.md)
- [Roll out a recipe](./examples/rollout-recipe.md)

## Directory map

```
modly-mcp/
├── src/
│   ├── index.ts            # stdio entry — wires MCP host ↔ ModlyClient
│   ├── tools.ts            # 18-tool registry with handlers
│   └── locales/
│       └── en.ts           # tool description strings
├── dist/                   # compiled output (published to npm)
├── docs/
│   ├── installation.md     # per-host install walkthroughs
│   └── tools.md            # full tool reference with schemas
├── examples/               # transcript snippets
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

| Path | What's in it |
|---|---|
| [`src/`](./src) | Server source — entry point, tool registry, locales. |
| [`docs/`](./docs) | Install + tool reference. |
| [`examples/`](./examples) | Realistic usage transcripts. |
| `dist/` | TypeScript build output. Don't edit. |

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Adding a tool means: pick a name, write the JSON schema in `src/tools.ts`, add the description string in `src/locales/en.ts`, and update [`docs/tools.md`](./docs/tools.md).

## License

MIT — see [`LICENSE`](./LICENSE).

---

Built with ❤ for [Modly](https://modly.net).

Last updated: 2026-04-30
