# @modly/mcp-server

Local [Model Context Protocol](https://modelcontextprotocol.io) server that exposes [Modly](https://modly.net)'s guild-management tools to any MCP-compatible agent — Claude Desktop, Cursor, Cline, Continue, custom agents, etc.

Run it on your own machine. It connects to your Modly server using a personal access token (created in the dashboard at **Account Settings → API tokens**) and a guild ID.

## Install

```bash
npm i -g @modly/mcp-server
```

…or use `npx` directly without installing (recommended for MCP host configs).

## Claude Desktop

Edit `claude_desktop_config.json`:

**macOS** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly/mcp-server"],
      "env": {
        "MODLY_GUILD_ID": "1234567890",
        "MODLY_API_KEY": "modly_pk_..."
      }
    }
  }
}
```

Restart Claude Desktop. You should now be able to ask things like:

> "List the webhook targets in my server"
> "Save a new embed template called release-notes with content 'Shipped today' and a purple embed titled 'v0.4.0'"
> "Broadcast release-notes to the announcements target"

## Cursor / Cline / other MCP hosts

Same `command` + `env` pattern. Drop into your host's MCP config file.

## Tools exposed

| Tool | What it does |
|---|---|
| `list_webhook_targets` | List all saved webhook targets in the guild |
| `list_webhook_groups` | List target groups (bundles of targets) |
| `list_embed_templates` | List the saved embed library |
| `save_embed_template` | Create or overwrite a named embed template |
| `send_webhook` | Broadcast a saved (or inline) embed to targets |
| `list_moderation_cases` | List moderation cases, optionally filtered by user |

The surface is intentionally narrow. Mutations that involve credentials (creating webhook URLs) or escalated moderation actions stay dashboard-only on purpose — agents can't add a new partnered server's webhook URL or ban a user with this server. The full bot/API surface is larger; the MCP server only mirrors the safe, high-signal subset.

## Self-hosting Modly

If you self-host Modly on a different origin, set `MODLY_BASE_URL`:

```json
"env": {
  "MODLY_GUILD_ID": "...",
  "MODLY_API_KEY": "...",
  "MODLY_BASE_URL": "https://modly.example.com"
}
```

## License

MIT.
