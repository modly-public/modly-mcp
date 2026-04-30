#!/usr/bin/env node
/**
 * Modly MCP server (stdio transport).
 *
 * Reads `MODLY_GUILD_ID` and `MODLY_API_KEY` from the environment, opens a
 * stdio-based MCP server, and exposes a focused tool surface for managing
 * a single guild's webhooks + embed library + cases. The host (Claude
 * Desktop, Cursor, Cline, custom agent) handles transport negotiation;
 * this process just answers tool calls.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ModlyClient } from "@modly/sdk";
import { TOOLS, dispatch } from "./tools.js";

const GUILD_ID = process.env["MODLY_GUILD_ID"];
const API_KEY = process.env["MODLY_API_KEY"];
const BASE_URL = process.env["MODLY_BASE_URL"] ?? "https://modly.net";

if (!GUILD_ID || !API_KEY) {
  console.error(
    "modly-mcp: MODLY_GUILD_ID and MODLY_API_KEY must be set. Add them to your MCP host config — see README.",
  );
  process.exit(1);
}

const client = new ModlyClient({ guildId: GUILD_ID, apiKey: API_KEY, baseUrl: BASE_URL });

const server = new Server(
  { name: "modly", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const out = await dispatch(req.params.name, req.params.arguments ?? {}, client);
  return {
    content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
