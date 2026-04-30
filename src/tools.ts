/**
 * Tool registry. Each tool has a JSON-schema input contract and a handler
 * that takes parsed arguments + a configured ModlyClient and returns a
 * JSON-serializable result.
 *
 * Kept narrow on purpose — read tools + safe writes only. Anything that
 * mutates webhook URLs or escalates moderation lives behind dashboard-
 * gated endpoints not exposed here.
 */
import type { ModlyClient } from "@modly/sdk";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, client: ModlyClient) => Promise<unknown>;
}

function getStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) throw new Error(`missing arg: ${key}`);
  return v;
}

function getOptStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function getStrArr(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new Error(`missing or invalid arg: ${key}`);
  }
  return v as string[];
}

export const TOOLS: Tool[] = [
  {
    name: "list_webhook_targets",
    description: "List every saved outbound webhook target in the guild.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => client.webhooks.listTargets(),
  },
  {
    name: "list_webhook_groups",
    description: "List every saved target group (named bundles of targets) in the guild.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => client.webhooks.listGroups(),
  },
  {
    name: "list_embed_templates",
    description: "List every saved embed template (the embed library used by /webhook + auto-messages).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => client.embeds.list(),
  },
  {
    name: "save_embed_template",
    description:
      "Create or overwrite a named embed template. The `json` argument is a Discord-style { content?, embeds[] } payload.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lowercase kebab name, e.g. weekly-update." },
        json: { type: "object", description: "{ content?: string, embeds: APIEmbed[] }" },
      },
      required: ["name", "json"],
    },
    handler: async (args, client) => {
      const name = getStr(args, "name");
      const json = args["json"];
      if (typeof json !== "object" || json === null) throw new Error("invalid arg: json");
      return client.embeds.save(name, json as Parameters<ModlyClient["embeds"]["save"]>[1]);
    },
  },
  {
    name: "send_webhook",
    description:
      "Broadcast a saved embed template to one or more named targets, or pass an inline embed. Returns per-target send results.",
    inputSchema: {
      type: "object",
      properties: {
        targetIds: {
          type: "array",
          items: { type: "string" },
          description: "Webhook target IDs (from list_webhook_targets).",
          minItems: 1,
        },
        embedTemplateName: { type: "string", description: "Saved embed template name to broadcast." },
        content: { type: "string", description: "Optional plain-text prefix." },
      },
      required: ["targetIds"],
    },
    handler: async (args, client) => {
      const targetIds = getStrArr(args, "targetIds");
      const embedTemplateName = getOptStr(args, "embedTemplateName");
      const content = getOptStr(args, "content");
      return client.webhooks.sendNow({
        targetIds,
        ...(embedTemplateName !== undefined ? { embedTemplateName } : {}),
        ...(content !== undefined ? { content } : {}),
      });
    },
  },
  {
    name: "list_moderation_cases",
    description: "List recent moderation cases for the guild, optionally filtered by user.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Optional Discord user ID to filter by." },
        limit: { type: "number", description: "Max cases to return (default 50)." },
      },
    },
    handler: async (args, client) => {
      const userId = getOptStr(args, "userId");
      const limit = typeof args["limit"] === "number" ? args["limit"] : undefined;
      return client.moderation.listCases({
        ...(userId !== undefined ? { userId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
    },
  },
];

export async function dispatch(
  name: string,
  args: Record<string, unknown>,
  client: ModlyClient,
): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown_tool: ${name}`);
  return tool.handler(args, client);
}
