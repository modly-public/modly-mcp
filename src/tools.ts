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
import { EN_TEXT } from "./locales/en.js";

export interface Tool {
  name: string;
  description?: string;
  descriptionKey?: string;
  descriptionValues?: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, client: ModlyClient) => Promise<unknown>;
}

export function toolDescription(tool: Tool): string {
  return tool.descriptionKey ? (EN_TEXT[tool.descriptionKey] ?? tool.name) : (tool.description ?? tool.name);
}

function localizeSchemaNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => localizeSchemaNode(v));
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === "descriptionKey" && typeof v === "string") out["description"] = EN_TEXT[v] ?? v;
    else out[k] = localizeSchemaNode(v);
  }
  return out;
}

export function toolInputSchema(tool: Tool): Record<string, unknown> {
  return localizeSchemaNode(tool.inputSchema) as Record<string, unknown>;
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
    descriptionKey: "mcp.tools.list_webhook_targets.description",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => client.webhooks.listTargets(),
  },
  {
    name: "list_webhook_groups",
    descriptionKey: "mcp.tools.list_webhook_groups.description",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => client.webhooks.listGroups(),
  },
  {
    name: "list_embed_templates",
    descriptionKey: "mcp.tools.list_embed_templates.description",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => client.embeds.list(),
  },
  {
    name: "save_embed_template",
    descriptionKey: "mcp.tools.save_embed_template.description",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", descriptionKey: "mcp.fields.kebab_name" },
        json: { type: "object", descriptionKey: "mcp.fields.inline_message_json" },
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
    descriptionKey: "mcp.tools.send_webhook.description",
    inputSchema: {
      type: "object",
      properties: {
        targetIds: {
          type: "array",
          items: { type: "string" },
          descriptionKey: "mcp.fields.target_ids",
          minItems: 1,
        },
        embedTemplateName: { type: "string", descriptionKey: "mcp.fields.embed_template_name" },
        content: { type: "string", descriptionKey: "mcp.fields.plain_text_prefix" },
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
    descriptionKey: "mcp.tools.list_moderation_cases.description",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", descriptionKey: "mcp.fields.user_id_filter" },
        limit: { type: "number", descriptionKey: "mcp.fields.limit" },
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
  {
    name: "list_evader_detections",
    descriptionKey: "mcp.tools.list_evader_detections.description",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
        riskBand: { type: "string" },
        unresolved: { type: "boolean" },
        limit: { type: "number" },
      },
    },
    handler: async (args, client) => {
      const userId = getOptStr(args, "userId");
      const riskBand = getOptStr(args, "riskBand");
      const unresolved = typeof args["unresolved"] === "boolean" ? args["unresolved"] : undefined;
      const limit = typeof args["limit"] === "number" ? args["limit"] : undefined;
      return client.safety.listEvaderDetections({
        ...(userId !== undefined ? { userId } : {}),
        ...(riskBand !== undefined ? { riskBand } : {}),
        ...(unresolved !== undefined ? { unresolved } : {}),
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
