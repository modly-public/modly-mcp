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

function getOptNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" ? v : undefined;
}

function getOptBool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === "boolean" ? v : undefined;
}

function getOptObj(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = args[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

// ─── Raw passthrough ────────────────────────────────────────────────────
// Reaches into ModlyClient via its public baseUrl + a header-construction
// trick: we re-derive Authorization from the env var the host already set
// (see public/modly-mcp/src/index.ts). This avoids exposing a private
// method on the SDK just for the MCP server. Used by tools that target
// surfaces the typed SDK doesn't expose yet — once the SDK codegen
// pipeline (bot/scripts/generate-sdk.ts) produces typed namespaces for
// these endpoints, swap each `raw(...)` for the typed call.

async function raw<T = unknown>(
  client: ModlyClient,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = process.env["MODLY_API_KEY"];
  if (!apiKey) throw new Error("MODLY_API_KEY not set");
  const url = `${client.baseUrl}/api/guilds/${client.guildId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "authorization": `Bearer ${apiKey}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let parsed: unknown = null;
    try { parsed = await res.json(); } catch { /* ignore */ }
    throw new Error(`http_${res.status}: ${JSON.stringify(parsed)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  return u.size ? `?${u.toString()}` : "";
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
  // 1) Forms — list submission queue (status filter)
  {
    name: "list_form_submissions",
    descriptionKey: "mcp.tools.list_form_submissions.description",
    inputSchema: {
      type: "object",
      properties: {
        formId: { type: "string", descriptionKey: "mcp.fields.form_id" },
        status: { type: "string", enum: ["pending", "approved", "rejected"], descriptionKey: "mcp.fields.submission_status" },
        limit: { type: "number", descriptionKey: "mcp.fields.limit" },
      },
    },
    handler: async (args, client) => raw(client, "GET", `/forms/submissions${qs({
      formId: getOptStr(args, "formId"),
      status: getOptStr(args, "status"),
      limit: getOptNum(args, "limit"),
    })}`),
  },

  // 2) Forms — approve/reject a submission
  {
    name: "decide_form_submission",
    descriptionKey: "mcp.tools.decide_form_submission.description",
    inputSchema: {
      type: "object",
      properties: {
        submissionId: { type: "string", descriptionKey: "mcp.fields.submission_id" },
        decision: { type: "string", enum: ["approve", "reject"], descriptionKey: "mcp.fields.decision" },
        reason: { type: "string", descriptionKey: "mcp.fields.reason" },
      },
      required: ["submissionId", "decision"],
    },
    handler: async (args, client) => raw(client, "POST", `/forms/submissions/${encodeURIComponent(getStr(args, "submissionId"))}/decide`, {
      decision: getStr(args, "decision"),
      reason: getOptStr(args, "reason"),
    }),
  },

  // 3) Automod — list rules
  {
    name: "list_automod_rules",
    descriptionKey: "mcp.tools.list_automod_rules.description",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => raw(client, "GET", `/automod/rules`),
  },

  // 4) Automod — create rule
  {
    name: "create_automod_rule",
    descriptionKey: "mcp.tools.create_automod_rule.description",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", descriptionKey: "mcp.fields.rule_name" },
        kind: { type: "string", descriptionKey: "mcp.fields.rule_kind" },
        enabled: { type: "boolean" },
        config: { type: "object", descriptionKey: "mcp.fields.rule_config" },
        scope: { type: "object", descriptionKey: "mcp.fields.rule_scope" },
        action: { type: "object", descriptionKey: "mcp.fields.rule_action" },
        priority: { type: "number" },
      },
      required: ["kind", "config", "scope", "action"],
    },
    handler: async (args, client) => raw(client, "POST", `/automod/rules`, {
      name: getOptStr(args, "name"),
      kind: getStr(args, "kind"),
      enabled: getOptBool(args, "enabled"),
      config: getOptObj(args, "config") ?? {},
      scope: getOptObj(args, "scope") ?? {},
      action: getOptObj(args, "action") ?? {},
      priority: getOptNum(args, "priority"),
    }),
  },

  // 5) Automod — delete rule
  {
    name: "delete_automod_rule",
    descriptionKey: "mcp.tools.delete_automod_rule.description",
    inputSchema: {
      type: "object",
      properties: { ruleId: { type: "string" } },
      required: ["ruleId"],
    },
    handler: async (args, client) => raw(client, "DELETE", `/automod/rules/${encodeURIComponent(getStr(args, "ruleId"))}`),
  },

  // 6) Captcha — analytics snapshot
  {
    name: "get_captcha_analytics",
    descriptionKey: "mcp.tools.get_captcha_analytics.description",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => raw(client, "GET", `/captcha`),
  },

  // 7) Outbound webhooks — search delivery history
  {
    name: "search_webhook_deliveries",
    descriptionKey: "mcp.tools.search_webhook_deliveries.description",
    inputSchema: {
      type: "object",
      properties: {
        hookId: { type: "string", descriptionKey: "mcp.fields.hook_id" },
        event: { type: "string", descriptionKey: "mcp.fields.event_name" },
        status: { type: "string", enum: ["success", "failed", "pending"] },
        limit: { type: "number" },
      },
      required: ["hookId"],
    },
    handler: async (args, client) => raw(client, "GET", `/outbound-webhooks/${encodeURIComponent(getStr(args, "hookId"))}/deliveries${qs({
      event: getOptStr(args, "event"),
      status: getOptStr(args, "status"),
      limit: getOptNum(args, "limit"),
    })}`),
  },

  // 8) Leveling — top-N leaderboard
  {
    name: "get_leveling_top",
    descriptionKey: "mcp.tools.get_leveling_top.description",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", descriptionKey: "mcp.fields.limit" },
        scope: { type: "string", enum: ["all", "weekly", "monthly"] },
      },
    },
    handler: async (_args, client) => raw(client, "GET", `/leveling`),
  },

  // 9) Member case lookup — all moderation history for a user
  {
    name: "lookup_member_cases",
    descriptionKey: "mcp.tools.lookup_member_cases.description",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", descriptionKey: "mcp.fields.user_id" },
        limit: { type: "number", descriptionKey: "mcp.fields.limit" },
      },
      required: ["userId"],
    },
    handler: async (args, client) => raw(client, "GET", `/cases${qs({
      userId: getStr(args, "userId"),
      limit: getOptNum(args, "limit"),
    })}`),
  },

  // 10) Member notes — list pinned notes
  {
    name: "list_member_notes",
    descriptionKey: "mcp.tools.list_member_notes.description",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", descriptionKey: "mcp.fields.user_id" },
        limit: { type: "number" },
      },
      required: ["userId"],
    },
    handler: async (args, client) => raw(client, "GET", `/member-notes${qs({
      userId: getStr(args, "userId"),
      limit: getOptNum(args, "limit"),
    })}`),
  },

  // 11) Custom commands — list
  {
    name: "list_custom_commands",
    descriptionKey: "mcp.tools.list_custom_commands.description",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, client) => raw(client, "GET", `/custom-commands`),
  },

  // 12) Custom commands — create/update
  {
    name: "save_custom_command",
    descriptionKey: "mcp.tools.save_custom_command.description",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", descriptionKey: "mcp.fields.command_id_optional" },
        name: { type: "string", descriptionKey: "mcp.fields.command_name" },
        triggerMode: { type: "string", descriptionKey: "mcp.fields.trigger_mode" },
        responseMode: { type: "string", descriptionKey: "mcp.fields.response_mode" },
        body: { type: "object", descriptionKey: "mcp.fields.command_body" },
      },
      required: ["name", "triggerMode", "responseMode", "body"],
    },
    handler: async (args, client) => raw(client, "POST", `/custom-commands/commands`, {
      id: getOptStr(args, "id"),
      name: getStr(args, "name"),
      triggerMode: getStr(args, "triggerMode"),
      responseMode: getStr(args, "responseMode"),
      body: getOptObj(args, "body") ?? {},
    }),
  },

  // 13) Custom commands — delete
  {
    name: "delete_custom_command",
    descriptionKey: "mcp.tools.delete_custom_command.description",
    inputSchema: {
      type: "object",
      properties: { commandId: { type: "string" } },
      required: ["commandId"],
    },
    handler: async (args, client) => raw(client, "DELETE", `/custom-commands/commands/${encodeURIComponent(getStr(args, "commandId"))}`),
  },

  // 14) Scheduled actions — enqueue an automation
  {
    name: "enqueue_scheduled_action",
    descriptionKey: "mcp.tools.enqueue_scheduled_action.description",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", descriptionKey: "mcp.fields.action_kind" },
        runAt: { type: "string", descriptionKey: "mcp.fields.run_at_iso" },
        payload: { type: "object" },
      },
      required: ["kind", "runAt"],
    },
    handler: async (args, client) => raw(client, "POST", `/automations/rules`, {
      kind: getStr(args, "kind"),
      runAt: getStr(args, "runAt"),
      payload: getOptObj(args, "payload") ?? {},
    }),
  },

  // 15) Evader detection — list
  {
    name: "list_evader_flags",
    descriptionKey: "mcp.tools.list_evader_flags.description",
    inputSchema: {
      type: "object",
      properties: {
        riskBand: { type: "string", enum: ["low", "medium", "high"] },
        unresolved: { type: "boolean" },
        limit: { type: "number" },
      },
    },
    handler: async (args, client) => raw(client, "GET", `/safety/evader-detections${qs({
      riskBand: getOptStr(args, "riskBand"),
      unresolved: getOptBool(args, "unresolved"),
      limit: getOptNum(args, "limit"),
    })}`),
  },

  // 16) Evader detection — resolve
  {
    name: "resolve_evader_flag",
    descriptionKey: "mcp.tools.resolve_evader_flag.description",
    inputSchema: {
      type: "object",
      properties: {
        detectionId: { type: "string" },
        resolution: { type: "string", enum: ["confirmed", "false_positive", "ignored"] },
        notes: { type: "string" },
      },
      required: ["detectionId", "resolution"],
    },
    handler: async (args, client) => raw(client, "POST", `/safety/evader-detections/${encodeURIComponent(getStr(args, "detectionId"))}/resolve`, {
      resolution: getStr(args, "resolution"),
      notes: getOptStr(args, "notes"),
    }),
  },

  // 17) Recipes — install from public catalog
  {
    name: "install_recipe",
    descriptionKey: "mcp.tools.install_recipe.description",
    inputSchema: {
      type: "object",
      properties: {
        recipeSlug: { type: "string", descriptionKey: "mcp.fields.recipe_slug" },
        overrides: { type: "object", descriptionKey: "mcp.fields.recipe_overrides" },
      },
      required: ["recipeSlug"],
    },
    handler: async (args, client) => raw(client, "POST", `/recipes/install`, {
      slug: getStr(args, "recipeSlug"),
      overrides: getOptObj(args, "overrides") ?? {},
    }),
  },

  // 18) Appeals — list pending
  {
    name: "list_pending_appeals",
    descriptionKey: "mcp.tools.list_pending_appeals.description",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    handler: async (args, client) => raw(client, "GET", `/appeals${qs({
      status: "pending",
      limit: getOptNum(args, "limit"),
    })}`),
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
