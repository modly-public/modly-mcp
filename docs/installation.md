# Installation

This server uses MCP's stdio transport. Every MCP host that supports stdio works the same way:

1. Tell the host how to launch the server: `npx -y @modly_public/mcp-server` (npm) **or** `npx -y github:modly-public/modly-mcp` (git).
2. Set two env vars: `MODLY_GUILD_ID` and `MODLY_API_KEY`.
3. (Optional) Set `MODLY_BASE_URL` if you self-host Modly.

> **Today**: `@modly_public/mcp-server` isn't published to npm yet. Use `github:modly-public/modly-mcp` everywhere you see `@modly_public/mcp-server` below — `npx` will clone, run the `prepare` build, and launch in one step. Once the npm package is live we'll flip these examples back.

## Get an API key

1. Open <https://modly.net> and sign in.
2. **Account Settings → API tokens → New token**.
3. Copy the token (starts with `modly_pat_`). It's shown once.

The token grants the same access as your dashboard session for the guilds you can manage. Each request is scoped server-side to the `MODLY_GUILD_ID` you set, so a single token can be reused across hosts as long as you're not switching guilds.

## Get a guild ID

Right-click your server in Discord → **Copy Server ID**. Enable **Settings → Advanced → Developer Mode** if the option isn't there.

## Per-host configs

### Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly_public/mcp-server"],
      "env": {
        "MODLY_GUILD_ID": "1234567890",
        "MODLY_API_KEY": "modly_pat_..."
      }
    }
  }
}
```

Restart Claude Desktop. Tools appear under the hammer icon.

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly_public/mcp-server"],
      "env": { "MODLY_GUILD_ID": "...", "MODLY_API_KEY": "modly_pat_..." }
    }
  }
}
```

Reload the Cursor window. Tools surface in the chat composer.

### Cline (VS Code)

Open the Cline panel → settings cog → **Edit MCP settings**:

```json
{
  "mcpServers": {
    "modly": {
      "command": "npx",
      "args": ["-y", "@modly_public/mcp-server"],
      "env": { "MODLY_GUILD_ID": "...", "MODLY_API_KEY": "modly_pat_..." }
    }
  }
}
```

### Continue (VS Code / JetBrains)

In `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "@modly_public/mcp-server"],
          "env": { "MODLY_GUILD_ID": "...", "MODLY_API_KEY": "modly_pat_..." }
        }
      }
    ]
  }
}
```

### Custom / generic MCP host

Any host that speaks stdio can spawn the server. Use the same `command` + `args` + `env` shape. The server speaks MCP 1.x — see <https://modelcontextprotocol.io>.

## Self-hosted Modly

Add `MODLY_BASE_URL` alongside the other env vars:

```json
"env": {
  "MODLY_GUILD_ID": "1234567890",
  "MODLY_API_KEY": "modly_pat_...",
  "MODLY_BASE_URL": "https://modly.example.com"
}
```

## Sanity check

After configuring, ask your agent:

> "List the webhook targets in my Modly server."

If you get a list back, you're set. If you see `MODLY_GUILD_ID and MODLY_API_KEY must be set`, the env vars didn't reach the spawned process — check your host's config file path and restart the host.

## Pinning a version

Don't want auto-updates from `npx -y`? Install globally and pin:

```bash
npm install -g @modly_public/mcp-server@0.1.0
```

…then change the config to `"command": "modly-mcp", "args": []`.

---

Last updated: 2026-04-30
