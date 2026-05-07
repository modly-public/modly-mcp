/**
 * Tool registry. Each tool has a JSON-schema input contract and a handler
 * that takes parsed arguments + a configured ModlyClient and returns a
 * JSON-serializable result.
 *
 * Every tool routes through `raw()` against the bot's REST API so we don't
 * depend on which SDK namespaces happen to be typed yet. The MCP server is
 * meant to be exhaustive — every meaningful capability the bot exposes.
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

// ─── Arg helpers ────────────────────────────────────────────────────────
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
function getOptStrArr(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new Error(`invalid arg: ${key}`);
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
function getObj(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = getOptObj(args, key);
  if (!v) throw new Error(`missing arg: ${key}`);
  return v;
}

// ─── Raw passthrough ────────────────────────────────────────────────────
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

// non-guild-scoped raw call (e.g. /api/me, /api/modules, /api/discovery)
async function rawAbs<T = unknown>(
  client: ModlyClient,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = process.env["MODLY_API_KEY"];
  if (!apiKey) throw new Error("MODLY_API_KEY not set");
  const url = `${client.baseUrl}${path}`;
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

// Schema sugar.
const Sn = { type: "string" } as const;
const Nn = { type: "number" } as const;
const Bn = { type: "boolean" } as const;
const On = { type: "object" } as const;
const Sa = { type: "array", items: { type: "string" } } as const;

function k(key: string): { descriptionKey: string } { return { descriptionKey: key }; }

// ─── Tool list ──────────────────────────────────────────────────────────
export const TOOLS: Tool[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // MODERATION CORE
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_cases",
    descriptionKey: "mcp.tools.list_cases.description",
    inputSchema: { type: "object", properties: { userId: Sn, limit: Nn, type: Sn, cursor: Sn } },
    handler: async (a, c) => raw(c, "GET", `/cases${qs({ userId: getOptStr(a, "userId"), limit: getOptNum(a, "limit"), type: getOptStr(a, "type"), cursor: getOptStr(a, "cursor") })}`),
  },
  {
    name: "get_case",
    descriptionKey: "mcp.tools.get_case.description",
    inputSchema: { type: "object", properties: { caseNumber: Nn }, required: ["caseNumber"] },
    handler: async (a, c) => raw(c, "GET", `/cases/${encodeURIComponent(String(a["caseNumber"]))}`),
  },
  {
    name: "update_case_reason",
    descriptionKey: "mcp.tools.update_case_reason.description",
    inputSchema: { type: "object", properties: { caseNumber: Nn, reason: Sn, notes: Sn }, required: ["caseNumber"] },
    handler: async (a, c) => raw(c, "PATCH", `/cases/${encodeURIComponent(String(a["caseNumber"]))}`, {
      reason: getOptStr(a, "reason"),
      notes: getOptStr(a, "notes"),
    }),
  },
  {
    name: "ban_user",
    descriptionKey: "mcp.tools.ban_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn, deleteMessageDays: Nn, durationMs: Nn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "POST", `/cases/ban`, {
      userId: getStr(a, "userId"),
      reason: getOptStr(a, "reason"),
      deleteMessageDays: getOptNum(a, "deleteMessageDays"),
      durationMs: getOptNum(a, "durationMs"),
    }),
  },
  {
    name: "unban_user",
    descriptionKey: "mcp.tools.unban_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn }, required: ["userId"] },
    // expected-by: dedicated /cases/unban POST endpoint
    handler: async (a, c) => raw(c, "POST", `/automations/test`, { kind: "unban_user", payload: { userId: getStr(a, "userId"), reason: getOptStr(a, "reason") } }),
  },
  {
    name: "kick_user",
    descriptionKey: "mcp.tools.kick_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "POST", `/cases/kick`, { userId: getStr(a, "userId"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "timeout_user",
    descriptionKey: "mcp.tools.timeout_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, durationMs: Nn, reason: Sn }, required: ["userId", "durationMs"] },
    handler: async (a, c) => raw(c, "POST", `/cases/timeout`, { userId: getStr(a, "userId"), durationMs: getOptNum(a, "durationMs"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "untimeout_user",
    descriptionKey: "mcp.tools.untimeout_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn }, required: ["userId"] },
    // expected-by: dedicated /cases/untimeout POST endpoint
    handler: async (a, c) => raw(c, "POST", `/automations/test`, { kind: "untimeout_user", payload: { userId: getStr(a, "userId"), reason: getOptStr(a, "reason") } }),
  },
  {
    name: "warn_user",
    descriptionKey: "mcp.tools.warn_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn, severity: Sn }, required: ["userId", "reason"] },
    handler: async (a, c) => raw(c, "POST", `/cases/warn`, { userId: getStr(a, "userId"), reason: getStr(a, "reason"), severity: getOptStr(a, "severity") }),
  },
  {
    name: "softban_user",
    descriptionKey: "mcp.tools.softban_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn }, required: ["userId"] },
    // expected-by: dedicated /cases/softban POST endpoint
    handler: async (a, c) => raw(c, "POST", `/automations/test`, { kind: "softban_user", payload: { userId: getStr(a, "userId"), reason: getOptStr(a, "reason") } }),
  },
  {
    name: "mass_ban",
    descriptionKey: "mcp.tools.mass_ban.description",
    inputSchema: { type: "object", properties: { userIds: Sa, reason: Sn }, required: ["userIds"] },
    // expected-by: dedicated /cases/mass-ban POST endpoint
    handler: async (a, c) => raw(c, "POST", `/automations/test`, { kind: "mass_ban", payload: { userIds: getStrArr(a, "userIds"), reason: getOptStr(a, "reason") } }),
  },
  {
    name: "list_active_punishments",
    descriptionKey: "mcp.tools.list_active_punishments.description",
    inputSchema: { type: "object", properties: { userId: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/cases${qs({ userId: getOptStr(a, "userId"), limit: getOptNum(a, "limit"), active: true })}`),
  },
  {
    name: "list_member_notes",
    descriptionKey: "mcp.tools.list_member_notes.description",
    inputSchema: { type: "object", properties: { userId: Sn, limit: Nn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "GET", `/member-notes${qs({ userId: getStr(a, "userId"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "search_member_notes",
    descriptionKey: "mcp.tools.search_member_notes.description",
    inputSchema: { type: "object", properties: { q: Sn, userId: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/member-notes${qs({ q: getOptStr(a, "q"), userId: getOptStr(a, "userId"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "add_member_note",
    descriptionKey: "mcp.tools.add_member_note.description",
    inputSchema: { type: "object", properties: { userId: Sn, body: Sn, pinned: Bn, tags: Sa }, required: ["userId", "body"] },
    handler: async (a, c) => raw(c, "POST", `/member-notes`, {
      userId: getStr(a, "userId"),
      body: getStr(a, "body"),
      pinned: getOptBool(a, "pinned"),
      tags: getOptStrArr(a, "tags"),
    }),
  },
  {
    name: "update_member_note",
    descriptionKey: "mcp.tools.update_member_note.description",
    inputSchema: { type: "object", properties: { noteId: Sn, body: Sn, pinned: Bn, tags: Sa }, required: ["noteId"] },
    handler: async (a, c) => raw(c, "PATCH", `/member-notes/${encodeURIComponent(getStr(a, "noteId"))}`, {
      body: getOptStr(a, "body"),
      pinned: getOptBool(a, "pinned"),
      tags: getOptStrArr(a, "tags"),
    }),
  },
  {
    name: "pin_member_note",
    descriptionKey: "mcp.tools.pin_member_note.description",
    inputSchema: { type: "object", properties: { noteId: Sn }, required: ["noteId"] },
    handler: async (a, c) => raw(c, "POST", `/member-notes/${encodeURIComponent(getStr(a, "noteId"))}/pin`),
  },
  {
    name: "delete_member_note",
    descriptionKey: "mcp.tools.delete_member_note.description",
    inputSchema: { type: "object", properties: { noteId: Sn }, required: ["noteId"] },
    handler: async (a, c) => raw(c, "DELETE", `/member-notes/${encodeURIComponent(getStr(a, "noteId"))}`),
  },
  {
    name: "get_member_note_revisions",
    descriptionKey: "mcp.tools.get_member_note_revisions.description",
    inputSchema: { type: "object", properties: { noteId: Sn }, required: ["noteId"] },
    handler: async (a, c) => raw(c, "GET", `/member-notes/${encodeURIComponent(getStr(a, "noteId"))}/revisions`),
  },
  {
    name: "get_member_notes_stats",
    descriptionKey: "mcp.tools.get_member_notes_stats.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/member-notes/stats`),
  },
  {
    name: "member_lookup",
    descriptionKey: "mcp.tools.member_lookup.description",
    inputSchema: { type: "object", properties: { userId: Sn, limit: Nn }, required: ["userId"] },
    handler: async (a, c) => {
      const userId = getStr(a, "userId");
      const limit = getOptNum(a, "limit");
      const [cases, notes] = await Promise.all([
        raw(c, "GET", `/cases${qs({ userId, limit })}`).catch((e) => ({ error: String(e) })),
        raw(c, "GET", `/member-notes${qs({ userId, limit })}`).catch((e) => ({ error: String(e) })),
      ]);
      return { userId, cases, notes };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOMOD
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_automod_rules",
    descriptionKey: "mcp.tools.list_automod_rules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/automod/rules`),
  },
  {
    name: "get_automod_rule",
    descriptionKey: "mcp.tools.get_automod_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "GET", `/automod/rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "create_automod_rule",
    descriptionKey: "mcp.tools.create_automod_rule.description",
    inputSchema: {
      type: "object",
      properties: { name: Sn, kind: Sn, enabled: Bn, config: On, scope: On, action: On, priority: Nn },
      required: ["kind", "config", "scope", "action"],
    },
    handler: async (a, c) => raw(c, "POST", `/automod/rules`, {
      name: getOptStr(a, "name"),
      kind: getStr(a, "kind"),
      enabled: getOptBool(a, "enabled"),
      config: getOptObj(a, "config") ?? {},
      scope: getOptObj(a, "scope") ?? {},
      action: getOptObj(a, "action") ?? {},
      priority: getOptNum(a, "priority"),
    }),
  },
  {
    name: "update_automod_rule",
    descriptionKey: "mcp.tools.update_automod_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn, patch: On }, required: ["ruleId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/automod/rules/${encodeURIComponent(getStr(a, "ruleId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_automod_rule",
    descriptionKey: "mcp.tools.delete_automod_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/automod/rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "test_automod_message",
    descriptionKey: "mcp.tools.test_automod_message.description",
    inputSchema: { type: "object", properties: { content: Sn, ruleId: Sn, channelId: Sn, userId: Sn }, required: ["content"] },
    handler: async (a, c) => {
      const ruleId = getOptStr(a, "ruleId");
      const path = ruleId ? `/automod/rules/${encodeURIComponent(ruleId)}/test` : `/automod/test`;
      return raw(c, "POST", path, {
        content: getStr(a, "content"),
        channelId: getOptStr(a, "channelId"),
        userId: getOptStr(a, "userId"),
      });
    },
  },
  {
    name: "list_automod_telemetry",
    descriptionKey: "mcp.tools.list_automod_telemetry.description",
    inputSchema: { type: "object", properties: { limit: Nn, ruleId: Sn } },
    handler: async (a, c) => raw(c, "GET", `/automod/telemetry${qs({ limit: getOptNum(a, "limit"), ruleId: getOptStr(a, "ruleId") })}`),
  },
  {
    name: "list_word_blacklist",
    descriptionKey: "mcp.tools.list_word_blacklist.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /automod/word-blacklist GET (currently word lists live inside rule config)
    handler: async (_a, c) => raw(c, "GET", `/automod/word-blacklist`),
  },
  {
    name: "update_word_blacklist",
    descriptionKey: "mcp.tools.update_word_blacklist.description",
    inputSchema: { type: "object", properties: { add: Sa, remove: Sa, replace: Sa } },
    // expected-by: /automod/word-blacklist PUT
    handler: async (a, c) => raw(c, "PUT", `/automod/word-blacklist`, {
      add: getOptStrArr(a, "add"),
      remove: getOptStrArr(a, "remove"),
      replace: getOptStrArr(a, "replace"),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ANTINUKE / RAID / INCIDENTS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "get_antinuke_settings",
    descriptionKey: "mcp.tools.get_antinuke_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "antinuke" })}`),
  },
  {
    name: "update_antinuke_settings",
    descriptionKey: "mcp.tools.update_antinuke_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "antinuke", patch: getObj(a, "patch") }),
  },
  {
    name: "list_antinuke_incidents",
    descriptionKey: "mcp.tools.list_antinuke_incidents.description",
    inputSchema: { type: "object", properties: { limit: Nn, status: Sn } },
    handler: async (a, c) => raw(c, "GET", `/antinuke/incidents${qs({ limit: getOptNum(a, "limit"), status: getOptStr(a, "status") })}`),
  },
  {
    name: "resolve_antinuke_incident",
    descriptionKey: "mcp.tools.resolve_antinuke_incident.description",
    inputSchema: { type: "object", properties: { incidentId: Sn, resolution: Sn, notes: Sn }, required: ["incidentId", "resolution"] },
    // expected-by: /antinuke/incidents/:id/resolve POST
    handler: async (a, c) => raw(c, "POST", `/antinuke/incidents/${encodeURIComponent(getStr(a, "incidentId"))}/resolve`, {
      resolution: getStr(a, "resolution"),
      notes: getOptStr(a, "notes"),
    }),
  },
  {
    name: "list_trust_users",
    descriptionKey: "mcp.tools.list_trust_users.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /antinuke/trust GET
    handler: async (_a, c) => raw(c, "GET", `/antinuke/trust`),
  },
  {
    name: "add_trust_user",
    descriptionKey: "mcp.tools.add_trust_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, level: Sn, reason: Sn }, required: ["userId"] },
    // expected-by: /antinuke/trust POST
    handler: async (a, c) => raw(c, "POST", `/antinuke/trust`, { userId: getStr(a, "userId"), level: getOptStr(a, "level"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "remove_trust_user",
    descriptionKey: "mcp.tools.remove_trust_user.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /antinuke/trust/:userId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/antinuke/trust/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "federation_block",
    descriptionKey: "mcp.tools.federation_block.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn }, required: ["userId"] },
    // expected-by: /antinuke/federation/block POST
    handler: async (a, c) => raw(c, "POST", `/antinuke/federation/block`, { userId: getStr(a, "userId"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "federation_unblock",
    descriptionKey: "mcp.tools.federation_unblock.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /antinuke/federation/block/:userId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/antinuke/federation/block/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "get_raid_state",
    descriptionKey: "mcp.tools.get_raid_state.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/safety/state`),
  },
  {
    name: "set_raid_mode",
    descriptionKey: "mcp.tools.set_raid_mode.description",
    inputSchema: { type: "object", properties: { mode: Sn, durationMs: Nn, reason: Sn }, required: ["mode"] },
    // expected-by: /raid/mode POST
    handler: async (a, c) => raw(c, "POST", `/raid/mode`, { mode: getStr(a, "mode"), durationMs: getOptNum(a, "durationMs"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "list_raid_incidents",
    descriptionKey: "mcp.tools.list_raid_incidents.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/raid/incidents${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "rollback_raid_incident",
    descriptionKey: "mcp.tools.rollback_raid_incident.description",
    inputSchema: { type: "object", properties: { incidentId: Sn }, required: ["incidentId"] },
    handler: async (a, c) => raw(c, "POST", `/raid/incidents/${encodeURIComponent(getStr(a, "incidentId"))}/rollback`),
  },
  {
    name: "get_raid_settings",
    descriptionKey: "mcp.tools.get_raid_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "raid" })}`),
  },
  {
    name: "update_raid_settings",
    descriptionKey: "mcp.tools.update_raid_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "raid", patch: getObj(a, "patch") }),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CAPTCHA / HONEYPOT / SAFETY
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "get_captcha_analytics",
    descriptionKey: "mcp.tools.get_captcha_analytics.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/captcha`),
  },
  {
    name: "send_captcha",
    descriptionKey: "mcp.tools.send_captcha.description",
    inputSchema: { type: "object", properties: { userId: Sn, channelId: Sn }, required: ["userId"] },
    // expected-by: /captcha/send POST
    handler: async (a, c) => raw(c, "POST", `/captcha/send`, { userId: getStr(a, "userId"), channelId: getOptStr(a, "channelId") }),
  },
  {
    name: "get_captcha_status",
    descriptionKey: "mcp.tools.get_captcha_status.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /captcha/status/:userId GET
    handler: async (a, c) => raw(c, "GET", `/captcha/status/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "clear_captcha_for_user",
    descriptionKey: "mcp.tools.clear_captcha_for_user.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "POST", `/captcha/users/${encodeURIComponent(getStr(a, "userId"))}/clear`),
  },
  {
    name: "cancel_captcha_challenge",
    descriptionKey: "mcp.tools.cancel_captcha_challenge.description",
    inputSchema: { type: "object", properties: { challengeId: Sn }, required: ["challengeId"] },
    handler: async (a, c) => raw(c, "POST", `/captcha/${encodeURIComponent(getStr(a, "challengeId"))}/cancel`),
  },
  {
    name: "list_captcha_records",
    descriptionKey: "mcp.tools.list_captcha_records.description",
    inputSchema: { type: "object", properties: { limit: Nn, status: Sn } },
    // expected-by: /captcha/records GET
    handler: async (a, c) => raw(c, "GET", `/captcha/records${qs({ limit: getOptNum(a, "limit"), status: getOptStr(a, "status") })}`),
  },
  {
    name: "update_captcha_settings",
    descriptionKey: "mcp.tools.update_captcha_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "captcha", patch: getObj(a, "patch") }),
  },
  {
    name: "list_honeypots",
    descriptionKey: "mcp.tools.list_honeypots.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/honeypot`),
  },
  {
    name: "resend_honeypot_traps",
    descriptionKey: "mcp.tools.resend_honeypot_traps.description",
    inputSchema: { type: "object", properties: { channelIds: Sa } },
    handler: async (a, c) => raw(c, "POST", `/honeypot/traps/resend`, { channelIds: getOptStrArr(a, "channelIds") }),
  },
  {
    name: "add_honeypot",
    descriptionKey: "mcp.tools.add_honeypot.description",
    inputSchema: { type: "object", properties: { channelId: Sn, action: Sn, durationMs: Nn }, required: ["channelId"] },
    // expected-by: /honeypot/channels POST
    handler: async (a, c) => raw(c, "POST", `/honeypot/channels`, {
      channelId: getStr(a, "channelId"),
      action: getOptStr(a, "action"),
      durationMs: getOptNum(a, "durationMs"),
    }),
  },
  {
    name: "remove_honeypot",
    descriptionKey: "mcp.tools.remove_honeypot.description",
    inputSchema: { type: "object", properties: { channelId: Sn }, required: ["channelId"] },
    // expected-by: /honeypot/channels/:channelId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/honeypot/channels/${encodeURIComponent(getStr(a, "channelId"))}`),
  },
  {
    name: "get_honeypot_stats",
    descriptionKey: "mcp.tools.get_honeypot_stats.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /honeypot/stats GET (currently roll-up lives in /honeypot)
    handler: async (_a, c) => raw(c, "GET", `/honeypot/stats`),
  },
  {
    name: "update_honeypot_action",
    descriptionKey: "mcp.tools.update_honeypot_action.description",
    inputSchema: { type: "object", properties: { action: Sn, durationMs: Nn }, required: ["action"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "honeypot", patch: { action: getStr(a, "action"), durationMs: getOptNum(a, "durationMs") } }),
  },
  {
    name: "list_safety_flags",
    descriptionKey: "mcp.tools.list_safety_flags.description",
    inputSchema: { type: "object", properties: { unresolved: Bn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/safety/flags${qs({ unresolved: getOptBool(a, "unresolved"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "resolve_safety_flag",
    descriptionKey: "mcp.tools.resolve_safety_flag.description",
    inputSchema: { type: "object", properties: { flagId: Sn, resolution: Sn, notes: Sn }, required: ["flagId", "resolution"] },
    handler: async (a, c) => raw(c, "POST", `/safety/flags/${encodeURIComponent(getStr(a, "flagId"))}/resolve`, {
      resolution: getStr(a, "resolution"),
      notes: getOptStr(a, "notes"),
    }),
  },
  {
    name: "list_evader_detections",
    descriptionKey: "mcp.tools.list_evader_detections.description",
    inputSchema: { type: "object", properties: { userId: Sn, riskBand: Sn, unresolved: Bn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/safety/evader-detections${qs({
      userId: getOptStr(a, "userId"), riskBand: getOptStr(a, "riskBand"),
      unresolved: getOptBool(a, "unresolved"), limit: getOptNum(a, "limit"),
    })}`),
  },
  {
    name: "resolve_evader_detection",
    descriptionKey: "mcp.tools.resolve_evader_detection.description",
    inputSchema: { type: "object", properties: { detectionId: Sn, resolution: Sn, notes: Sn }, required: ["detectionId", "resolution"] },
    handler: async (a, c) => raw(c, "POST", `/safety/evader-detections/${encodeURIComponent(getStr(a, "detectionId"))}/resolve`, {
      resolution: getStr(a, "resolution"),
      notes: getOptStr(a, "notes"),
    }),
  },
  {
    name: "list_phash_blocklist",
    descriptionKey: "mcp.tools.list_phash_blocklist.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/safety/pfp-hashes`),
  },
  {
    name: "add_phash_blocklist",
    descriptionKey: "mcp.tools.add_phash_blocklist.description",
    inputSchema: { type: "object", properties: { hash: Sn, label: Sn }, required: ["hash"] },
    // expected-by: /safety/pfp-hashes POST
    handler: async (a, c) => raw(c, "POST", `/safety/pfp-hashes`, { hash: getStr(a, "hash"), label: getOptStr(a, "label") }),
  },
  {
    name: "list_safety_name_rules",
    descriptionKey: "mcp.tools.list_safety_name_rules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/safety/name-rules`),
  },
  {
    name: "add_safety_name_rule",
    descriptionKey: "mcp.tools.add_safety_name_rule.description",
    inputSchema: { type: "object", properties: { pattern: Sn, action: Sn, severity: Sn }, required: ["pattern", "action"] },
    handler: async (a, c) => raw(c, "POST", `/safety/name-rules`, {
      pattern: getStr(a, "pattern"),
      action: getStr(a, "action"),
      severity: getOptStr(a, "severity"),
    }),
  },
  {
    name: "delete_safety_name_rule",
    descriptionKey: "mcp.tools.delete_safety_name_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/safety/name-rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "list_scam_phrases",
    descriptionKey: "mcp.tools.list_scam_phrases.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /safety/scam-phrases GET
    handler: async (_a, c) => raw(c, "GET", `/safety/scam-phrases`),
  },
  {
    name: "update_scam_phrases",
    descriptionKey: "mcp.tools.update_scam_phrases.description",
    inputSchema: { type: "object", properties: { add: Sa, remove: Sa, replace: Sa } },
    // expected-by: /safety/scam-phrases PUT
    handler: async (a, c) => raw(c, "PUT", `/safety/scam-phrases`, {
      add: getOptStrArr(a, "add"), remove: getOptStrArr(a, "remove"), replace: getOptStrArr(a, "replace"),
    }),
  },
  {
    name: "get_safety_trends",
    descriptionKey: "mcp.tools.get_safety_trends.description",
    inputSchema: { type: "object", properties: { window: Sn } },
    handler: async (a, c) => raw(c, "GET", `/safety/trends${qs({ window: getOptStr(a, "window") })}`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FORMS / APPLICATIONS / APPEALS / USER-INPUT
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_forms",
    descriptionKey: "mcp.tools.list_forms.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/forms`),
  },
  {
    name: "get_form",
    descriptionKey: "mcp.tools.get_form.description",
    inputSchema: { type: "object", properties: { formId: Sn }, required: ["formId"] },
    handler: async (a, c) => raw(c, "GET", `/forms/${encodeURIComponent(getStr(a, "formId"))}`),
  },
  {
    name: "create_form",
    descriptionKey: "mcp.tools.create_form.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/forms`, getObj(a, "definition")),
  },
  {
    name: "update_form",
    descriptionKey: "mcp.tools.update_form.description",
    inputSchema: { type: "object", properties: { formId: Sn, patch: On }, required: ["formId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/forms/${encodeURIComponent(getStr(a, "formId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_form",
    descriptionKey: "mcp.tools.delete_form.description",
    inputSchema: { type: "object", properties: { formId: Sn }, required: ["formId"] },
    handler: async (a, c) => raw(c, "DELETE", `/forms/${encodeURIComponent(getStr(a, "formId"))}`),
  },
  {
    name: "publish_form",
    descriptionKey: "mcp.tools.publish_form.description",
    inputSchema: { type: "object", properties: { formId: Sn, channelId: Sn }, required: ["formId"] },
    handler: async (a, c) => raw(c, "POST", `/forms/${encodeURIComponent(getStr(a, "formId"))}/publish`, { channelId: getOptStr(a, "channelId") }),
  },
  {
    name: "list_form_submissions",
    descriptionKey: "mcp.tools.list_form_submissions.description",
    inputSchema: { type: "object", properties: { formId: Sn, status: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/forms/submissions${qs({
      formId: getOptStr(a, "formId"), status: getOptStr(a, "status"), limit: getOptNum(a, "limit"),
    })}`),
  },
  {
    name: "get_form_submission",
    descriptionKey: "mcp.tools.get_form_submission.description",
    inputSchema: { type: "object", properties: { submissionId: Sn }, required: ["submissionId"] },
    handler: async (a, c) => raw(c, "GET", `/forms/submissions/${encodeURIComponent(getStr(a, "submissionId"))}`),
  },
  {
    name: "decide_form_submission",
    descriptionKey: "mcp.tools.decide_form_submission.description",
    inputSchema: { type: "object", properties: { submissionId: Sn, decision: { type: "string", enum: ["approve", "reject"] }, reason: Sn }, required: ["submissionId", "decision"] },
    handler: async (a, c) => raw(c, "POST", `/forms/submissions/${encodeURIComponent(getStr(a, "submissionId"))}/decide`, {
      decision: getStr(a, "decision"), reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "assign_form_submission",
    descriptionKey: "mcp.tools.assign_form_submission.description",
    inputSchema: { type: "object", properties: { submissionId: Sn, assigneeId: Sn }, required: ["submissionId"] },
    handler: async (a, c) => raw(c, "POST", `/forms/submissions/${encodeURIComponent(getStr(a, "submissionId"))}/assign`, {
      assigneeId: getOptStr(a, "assigneeId"),
    }),
  },
  {
    name: "comment_on_form_submission",
    descriptionKey: "mcp.tools.comment_on_form_submission.description",
    inputSchema: { type: "object", properties: { submissionId: Sn, body: Sn }, required: ["submissionId", "body"] },
    handler: async (a, c) => raw(c, "POST", `/forms/submissions/${encodeURIComponent(getStr(a, "submissionId"))}/notes`, {
      body: getStr(a, "body"),
    }),
  },
  {
    name: "export_forms",
    descriptionKey: "mcp.tools.export_forms.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/forms/export`),
  },
  {
    name: "import_forms",
    descriptionKey: "mcp.tools.import_forms.description",
    inputSchema: { type: "object", properties: { data: On }, required: ["data"] },
    handler: async (a, c) => raw(c, "POST", `/forms/import`, getObj(a, "data")),
  },
  {
    name: "list_application_alerts",
    descriptionKey: "mcp.tools.list_application_alerts.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/applications${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "resolve_application_alert",
    descriptionKey: "mcp.tools.resolve_application_alert.description",
    inputSchema: { type: "object", properties: { alertId: Sn, action: { type: "string", enum: ["resolve", "dismiss", "snooze"] }, until: Sn }, required: ["alertId", "action"] },
    handler: async (a, c) => {
      const action = getStr(a, "action");
      const alertId = getStr(a, "alertId");
      const body = action === "snooze" ? { until: getOptStr(a, "until") } : undefined;
      return raw(c, "POST", `/applications/${encodeURIComponent(alertId)}/${encodeURIComponent(action)}`, body);
    },
  },
  {
    name: "assign_application_alert",
    descriptionKey: "mcp.tools.assign_application_alert.description",
    inputSchema: { type: "object", properties: { alertId: Sn, assigneeId: Sn }, required: ["alertId"] },
    handler: async (a, c) => raw(c, "POST", `/applications/${encodeURIComponent(getStr(a, "alertId"))}/assign`, {
      assigneeId: getOptStr(a, "assigneeId"),
    }),
  },
  {
    name: "list_appeals",
    descriptionKey: "mcp.tools.list_appeals.description",
    inputSchema: { type: "object", properties: { status: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/appeals${qs({ status: getOptStr(a, "status"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "decide_appeal",
    descriptionKey: "mcp.tools.decide_appeal.description",
    inputSchema: { type: "object", properties: { appealId: Sn, decision: Sn, reason: Sn }, required: ["appealId", "decision"] },
    handler: async (a, c) => raw(c, "POST", `/appeals/${encodeURIComponent(getStr(a, "appealId"))}/decide`, {
      decision: getStr(a, "decision"), reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "list_user_input_types",
    descriptionKey: "mcp.tools.list_user_input_types.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/user-input`),
  },
  {
    name: "create_user_input_type",
    descriptionKey: "mcp.tools.create_user_input_type.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/user-input/types`, getObj(a, "definition")),
  },
  {
    name: "delete_user_input_type",
    descriptionKey: "mcp.tools.delete_user_input_type.description",
    inputSchema: { type: "object", properties: { typeId: Sn }, required: ["typeId"] },
    handler: async (a, c) => raw(c, "DELETE", `/user-input/types/${encodeURIComponent(getStr(a, "typeId"))}`),
  },
  {
    name: "list_user_input_submissions",
    descriptionKey: "mcp.tools.list_user_input_submissions.description",
    inputSchema: { type: "object", properties: { typeId: Sn, status: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/user-input/submissions${qs({
      typeId: getOptStr(a, "typeId"), status: getOptStr(a, "status"), limit: getOptNum(a, "limit"),
    })}`),
  },
  {
    name: "set_user_input_status",
    descriptionKey: "mcp.tools.set_user_input_status.description",
    inputSchema: { type: "object", properties: { submissionId: Sn, status: Sn, reason: Sn }, required: ["submissionId", "status"] },
    handler: async (a, c) => raw(c, "POST", `/user-input/submissions/${encodeURIComponent(getStr(a, "submissionId"))}/status`, {
      status: getStr(a, "status"), reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "comment_on_user_input",
    descriptionKey: "mcp.tools.comment_on_user_input.description",
    inputSchema: { type: "object", properties: { submissionId: Sn, body: Sn }, required: ["submissionId", "body"] },
    handler: async (a, c) => raw(c, "POST", `/user-input/submissions/${encodeURIComponent(getStr(a, "submissionId"))}/comments`, {
      body: getStr(a, "body"),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOM COMMANDS / SAVED RESPONSES (TAGS) / AUTORESPONDERS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_custom_commands",
    descriptionKey: "mcp.tools.list_custom_commands.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/custom-commands`),
  },
  {
    name: "get_custom_command",
    descriptionKey: "mcp.tools.get_custom_command.description",
    inputSchema: { type: "object", properties: { commandId: Sn }, required: ["commandId"] },
    handler: async (a, c) => raw(c, "GET", `/custom-commands/commands/${encodeURIComponent(getStr(a, "commandId"))}`),
  },
  {
    name: "save_custom_command",
    descriptionKey: "mcp.tools.save_custom_command.description",
    inputSchema: {
      type: "object",
      properties: { id: Sn, name: Sn, triggerMode: Sn, responseMode: Sn, body: On },
      required: ["name", "triggerMode", "responseMode", "body"],
    },
    handler: async (a, c) => raw(c, "POST", `/custom-commands/commands`, {
      id: getOptStr(a, "id"),
      name: getStr(a, "name"),
      triggerMode: getStr(a, "triggerMode"),
      responseMode: getStr(a, "responseMode"),
      body: getObj(a, "body"),
    }),
  },
  {
    name: "delete_custom_command",
    descriptionKey: "mcp.tools.delete_custom_command.description",
    inputSchema: { type: "object", properties: { commandId: Sn }, required: ["commandId"] },
    handler: async (a, c) => raw(c, "DELETE", `/custom-commands/commands/${encodeURIComponent(getStr(a, "commandId"))}`),
  },
  {
    name: "preview_custom_command",
    descriptionKey: "mcp.tools.preview_custom_command.description",
    inputSchema: { type: "object", properties: { body: On, sample: On }, required: ["body"] },
    handler: async (a, c) => raw(c, "POST", `/custom-commands/preview`, { body: getObj(a, "body"), sample: getOptObj(a, "sample") }),
  },
  {
    name: "export_custom_commands",
    descriptionKey: "mcp.tools.export_custom_commands.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/custom-commands/export`),
  },
  {
    name: "import_custom_commands",
    descriptionKey: "mcp.tools.import_custom_commands.description",
    inputSchema: { type: "object", properties: { data: On }, required: ["data"] },
    handler: async (a, c) => raw(c, "POST", `/custom-commands/import`, getObj(a, "data")),
  },
  {
    name: "list_tags",
    descriptionKey: "mcp.tools.list_tags.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/saved-responses`),
  },
  {
    name: "get_tag",
    descriptionKey: "mcp.tools.get_tag.description",
    inputSchema: { type: "object", properties: { tagId: Sn }, required: ["tagId"] },
    handler: async (a, c) => raw(c, "GET", `/saved-responses/responses/${encodeURIComponent(getStr(a, "tagId"))}`),
  },
  {
    name: "save_tag",
    descriptionKey: "mcp.tools.save_tag.description",
    inputSchema: { type: "object", properties: { id: Sn, name: Sn, body: On }, required: ["name", "body"] },
    handler: async (a, c) => raw(c, "POST", `/saved-responses/responses`, {
      id: getOptStr(a, "id"), name: getStr(a, "name"), body: getObj(a, "body"),
    }),
  },
  {
    name: "delete_tag",
    descriptionKey: "mcp.tools.delete_tag.description",
    inputSchema: { type: "object", properties: { tagId: Sn }, required: ["tagId"] },
    handler: async (a, c) => raw(c, "DELETE", `/saved-responses/responses/${encodeURIComponent(getStr(a, "tagId"))}`),
  },
  {
    name: "list_autoresponders",
    descriptionKey: "mcp.tools.list_autoresponders.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/autoresponders`),
  },
  {
    name: "save_autoresponder",
    descriptionKey: "mcp.tools.save_autoresponder.description",
    inputSchema: { type: "object", properties: { ruleId: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const ruleId = getOptStr(a, "ruleId");
      const def = getObj(a, "definition");
      return ruleId
        ? raw(c, "PATCH", `/autoresponders/${encodeURIComponent(ruleId)}`, def)
        : raw(c, "POST", `/autoresponders`, def);
    },
  },
  {
    name: "delete_autoresponder",
    descriptionKey: "mcp.tools.delete_autoresponder.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/autoresponders/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "duplicate_autoresponder",
    descriptionKey: "mcp.tools.duplicate_autoresponder.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "POST", `/autoresponders/${encodeURIComponent(getStr(a, "ruleId"))}/duplicate`),
  },
  {
    name: "test_autoresponder",
    descriptionKey: "mcp.tools.test_autoresponder.description",
    inputSchema: { type: "object", properties: { content: Sn, channelId: Sn, ruleId: Sn }, required: ["content"] },
    // expected-by: /autoresponders/test POST
    handler: async (a, c) => raw(c, "POST", `/autoresponders/test`, {
      content: getStr(a, "content"), channelId: getOptStr(a, "channelId"), ruleId: getOptStr(a, "ruleId"),
    }),
  },
  {
    name: "list_autoresponder_telemetry",
    descriptionKey: "mcp.tools.list_autoresponder_telemetry.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    // expected-by: /autoresponders/telemetry GET
    handler: async (a, c) => raw(c, "GET", `/autoresponders/telemetry${qs({ limit: getOptNum(a, "limit") })}`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOMATIONS / SCHEDULED ACTIONS / ROLE EVENTS / AUTOPING
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_automation_rules",
    descriptionKey: "mcp.tools.list_automation_rules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/automations`),
  },
  {
    name: "get_automation_rule",
    descriptionKey: "mcp.tools.get_automation_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "GET", `/automations/rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "create_automation_rule",
    descriptionKey: "mcp.tools.create_automation_rule.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/automations/rules`, getObj(a, "definition")),
  },
  {
    name: "update_automation_rule",
    descriptionKey: "mcp.tools.update_automation_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn, patch: On }, required: ["ruleId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/automations/rules/${encodeURIComponent(getStr(a, "ruleId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_automation_rule",
    descriptionKey: "mcp.tools.delete_automation_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/automations/rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "test_automation_rule",
    descriptionKey: "mcp.tools.test_automation_rule.description",
    inputSchema: { type: "object", properties: { definition: On, sample: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/automations/test`, { definition: getObj(a, "definition"), sample: getOptObj(a, "sample") }),
  },
  {
    name: "run_automation_rule_now",
    descriptionKey: "mcp.tools.run_automation_rule_now.description",
    inputSchema: { type: "object", properties: { ruleId: Sn, payload: On }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "POST", `/automations/rules/${encodeURIComponent(getStr(a, "ruleId"))}/run`, {
      payload: getOptObj(a, "payload"),
    }),
  },
  {
    name: "list_scheduled_actions",
    descriptionKey: "mcp.tools.list_scheduled_actions.description",
    inputSchema: { type: "object", properties: { kind: Sn, limit: Nn } },
    // expected-by: /scheduled-actions GET (sister-agent route, see project notes)
    handler: async (a, c) => raw(c, "GET", `/scheduled-actions${qs({ kind: getOptStr(a, "kind"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_scheduled_action",
    descriptionKey: "mcp.tools.get_scheduled_action.description",
    inputSchema: { type: "object", properties: { actionId: Sn }, required: ["actionId"] },
    // expected-by: /scheduled-actions/:id GET
    handler: async (a, c) => raw(c, "GET", `/scheduled-actions/${encodeURIComponent(getStr(a, "actionId"))}`),
  },
  {
    name: "create_scheduled_action",
    descriptionKey: "mcp.tools.create_scheduled_action.description",
    inputSchema: { type: "object", properties: { kind: Sn, runAt: Sn, payload: On, cron: Sn }, required: ["kind"] },
    // expected-by: /scheduled-actions POST
    handler: async (a, c) => raw(c, "POST", `/scheduled-actions`, {
      kind: getStr(a, "kind"),
      runAt: getOptStr(a, "runAt"),
      cron: getOptStr(a, "cron"),
      payload: getOptObj(a, "payload") ?? {},
    }),
  },
  {
    name: "update_scheduled_action",
    descriptionKey: "mcp.tools.update_scheduled_action.description",
    inputSchema: { type: "object", properties: { actionId: Sn, patch: On }, required: ["actionId", "patch"] },
    // expected-by: /scheduled-actions/:id PATCH
    handler: async (a, c) => raw(c, "PATCH", `/scheduled-actions/${encodeURIComponent(getStr(a, "actionId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_scheduled_action",
    descriptionKey: "mcp.tools.delete_scheduled_action.description",
    inputSchema: { type: "object", properties: { actionId: Sn }, required: ["actionId"] },
    // expected-by: /scheduled-actions/:id DELETE
    handler: async (a, c) => raw(c, "DELETE", `/scheduled-actions/${encodeURIComponent(getStr(a, "actionId"))}`),
  },
  {
    name: "run_scheduled_action_now",
    descriptionKey: "mcp.tools.run_scheduled_action_now.description",
    inputSchema: { type: "object", properties: { actionId: Sn }, required: ["actionId"] },
    // expected-by: /scheduled-actions/:id/run POST
    handler: async (a, c) => raw(c, "POST", `/scheduled-actions/${encodeURIComponent(getStr(a, "actionId"))}/run`),
  },
  {
    name: "list_role_event_rules",
    descriptionKey: "mcp.tools.list_role_event_rules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/role-events`),
  },
  {
    name: "save_role_event_rule",
    descriptionKey: "mcp.tools.save_role_event_rule.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/role-events/rules`, getObj(a, "definition")),
  },
  {
    name: "delete_role_event_rule",
    descriptionKey: "mcp.tools.delete_role_event_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/role-events/rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "test_role_event_rule",
    descriptionKey: "mcp.tools.test_role_event_rule.description",
    inputSchema: { type: "object", properties: { sample: On }, required: ["sample"] },
    handler: async (a, c) => raw(c, "POST", `/role-events/test`, getObj(a, "sample")),
  },
  {
    name: "list_role_event_log",
    descriptionKey: "mcp.tools.list_role_event_log.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    // expected-by: /role-events/log GET
    handler: async (a, c) => raw(c, "GET", `/role-events/log${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "list_autoping_rules",
    descriptionKey: "mcp.tools.list_autoping_rules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/autoping`),
  },
  {
    name: "create_autoping_rule",
    descriptionKey: "mcp.tools.create_autoping_rule.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/autoping/rules`, getObj(a, "definition")),
  },
  {
    name: "update_autoping_rule",
    descriptionKey: "mcp.tools.update_autoping_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn, patch: On }, required: ["ruleId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/autoping/rules/${encodeURIComponent(getStr(a, "ruleId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_autoping_rule",
    descriptionKey: "mcp.tools.delete_autoping_rule.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/autoping/rules/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "update_autoping_settings",
    descriptionKey: "mcp.tools.update_autoping_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/autoping/settings`, getObj(a, "patch")),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ENGAGEMENT — LEVELING / ECONOMY / REPUTATION
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "get_leveling_overview",
    descriptionKey: "mcp.tools.get_leveling_overview.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/leveling`),
  },
  {
    name: "get_leveling_top",
    descriptionKey: "mcp.tools.get_leveling_top.description",
    inputSchema: { type: "object", properties: { limit: Nn, scope: Sn } },
    handler: async (a, c) => raw(c, "GET", `/leveling/top${qs({ limit: getOptNum(a, "limit"), scope: getOptStr(a, "scope") })}`),
  },
  {
    name: "get_member_xp",
    descriptionKey: "mcp.tools.get_member_xp.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /leveling/users/:userId GET
    handler: async (a, c) => raw(c, "GET", `/leveling/users/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "set_member_xp",
    descriptionKey: "mcp.tools.set_member_xp.description",
    inputSchema: { type: "object", properties: { userId: Sn, xp: Nn }, required: ["userId", "xp"] },
    handler: async (a, c) => raw(c, "POST", `/leveling/users/xp`, { userId: getStr(a, "userId"), xp: getOptNum(a, "xp"), op: "set" }),
  },
  {
    name: "give_xp",
    descriptionKey: "mcp.tools.give_xp.description",
    inputSchema: { type: "object", properties: { userId: Sn, amount: Nn, reason: Sn }, required: ["userId", "amount"] },
    handler: async (a, c) => raw(c, "POST", `/leveling/xp/give`, { userId: getStr(a, "userId"), amount: getOptNum(a, "amount"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "take_xp",
    descriptionKey: "mcp.tools.take_xp.description",
    inputSchema: { type: "object", properties: { userId: Sn, amount: Nn, reason: Sn }, required: ["userId", "amount"] },
    handler: async (a, c) => raw(c, "POST", `/leveling/xp/take`, { userId: getStr(a, "userId"), amount: getOptNum(a, "amount"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "reset_member_xp",
    descriptionKey: "mcp.tools.reset_member_xp.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "DELETE", `/leveling/users/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "list_xp_rewards",
    descriptionKey: "mcp.tools.list_xp_rewards.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /leveling/rewards GET (already has POST, fetch via overview today)
    handler: async (_a, c) => raw(c, "GET", `/leveling/rewards`),
  },
  {
    name: "save_xp_reward",
    descriptionKey: "mcp.tools.save_xp_reward.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/leveling/rewards`, getObj(a, "definition")),
  },
  {
    name: "delete_xp_reward",
    descriptionKey: "mcp.tools.delete_xp_reward.description",
    inputSchema: { type: "object", properties: { rewardId: Sn }, required: ["rewardId"] },
    handler: async (a, c) => raw(c, "DELETE", `/leveling/rewards/${encodeURIComponent(getStr(a, "rewardId"))}`),
  },
  {
    name: "sync_xp_rewards",
    descriptionKey: "mcp.tools.sync_xp_rewards.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "POST", `/leveling/rewards/sync`),
  },
  {
    name: "save_xp_reward_action",
    descriptionKey: "mcp.tools.save_xp_reward_action.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/leveling/reward-actions`, getObj(a, "definition")),
  },
  {
    name: "export_leveling",
    descriptionKey: "mcp.tools.export_leveling.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/leveling/export`),
  },
  {
    name: "import_leveling",
    descriptionKey: "mcp.tools.import_leveling.description",
    inputSchema: { type: "object", properties: { data: On }, required: ["data"] },
    handler: async (a, c) => raw(c, "POST", `/leveling/import`, getObj(a, "data")),
  },
  {
    name: "get_economy_settings",
    descriptionKey: "mcp.tools.get_economy_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/economy`),
  },
  {
    name: "update_economy_settings",
    descriptionKey: "mcp.tools.update_economy_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "economy", patch: getObj(a, "patch") }),
  },
  {
    name: "get_member_balance",
    descriptionKey: "mcp.tools.get_member_balance.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "GET", `/economy/users/${encodeURIComponent(getStr(a, "userId"))}/balance`),
  },
  {
    name: "set_member_balance",
    descriptionKey: "mcp.tools.set_member_balance.description",
    inputSchema: { type: "object", properties: { userId: Sn, balance: Nn }, required: ["userId", "balance"] },
    // expected-by: /economy/users/balance POST
    handler: async (a, c) => raw(c, "POST", `/economy/users/balance`, { userId: getStr(a, "userId"), balance: getOptNum(a, "balance"), op: "set" }),
  },
  {
    name: "give_currency",
    descriptionKey: "mcp.tools.give_currency.description",
    inputSchema: { type: "object", properties: { userId: Sn, amount: Nn, reason: Sn }, required: ["userId", "amount"] },
    handler: async (a, c) => raw(c, "POST", `/economy/give`, { userId: getStr(a, "userId"), amount: getOptNum(a, "amount"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "take_currency",
    descriptionKey: "mcp.tools.take_currency.description",
    inputSchema: { type: "object", properties: { userId: Sn, amount: Nn, reason: Sn }, required: ["userId", "amount"] },
    handler: async (a, c) => raw(c, "POST", `/economy/take`, { userId: getStr(a, "userId"), amount: getOptNum(a, "amount"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "list_economy_top",
    descriptionKey: "mcp.tools.list_economy_top.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/economy/top${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "list_economy_transactions",
    descriptionKey: "mcp.tools.list_economy_transactions.description",
    inputSchema: { type: "object", properties: { userId: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/economy/transactions${qs({ userId: getOptStr(a, "userId"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "list_shop_items",
    descriptionKey: "mcp.tools.list_shop_items.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /economy/shop GET
    handler: async (_a, c) => raw(c, "GET", `/economy/shop`),
  },
  {
    name: "save_shop_item",
    descriptionKey: "mcp.tools.save_shop_item.description",
    inputSchema: { type: "object", properties: { itemId: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const itemId = getOptStr(a, "itemId");
      const def = getObj(a, "definition");
      return itemId
        ? raw(c, "PATCH", `/economy/shop/${encodeURIComponent(itemId)}`, def)
        : raw(c, "POST", `/economy/shop`, def);
    },
  },
  {
    name: "delete_shop_item",
    descriptionKey: "mcp.tools.delete_shop_item.description",
    inputSchema: { type: "object", properties: { itemId: Sn }, required: ["itemId"] },
    handler: async (a, c) => raw(c, "DELETE", `/economy/shop/${encodeURIComponent(getStr(a, "itemId"))}`),
  },
  {
    name: "prune_inactive_economy",
    descriptionKey: "mcp.tools.prune_inactive_economy.description",
    inputSchema: { type: "object", properties: { thresholdDays: Nn } },
    // expected-by: /economy/prune POST
    handler: async (a, c) => raw(c, "POST", `/economy/prune`, { thresholdDays: getOptNum(a, "thresholdDays") }),
  },
  {
    name: "get_economy_stats",
    descriptionKey: "mcp.tools.get_economy_stats.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /economy/stats GET
    handler: async (_a, c) => raw(c, "GET", `/economy/stats`),
  },
  {
    name: "get_rep_settings",
    descriptionKey: "mcp.tools.get_rep_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/reputation`),
  },
  {
    name: "get_member_rep",
    descriptionKey: "mcp.tools.get_member_rep.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /reputation/users/:userId GET
    handler: async (a, c) => raw(c, "GET", `/reputation/users/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "give_rep",
    descriptionKey: "mcp.tools.give_rep.description",
    inputSchema: { type: "object", properties: { userId: Sn, amount: Nn, reason: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "POST", `/reputation/adjust`, {
      userId: getStr(a, "userId"), amount: getOptNum(a, "amount") ?? 1, reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "list_rep_top",
    descriptionKey: "mcp.tools.list_rep_top.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/reputation/top${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "decide_rep_review",
    descriptionKey: "mcp.tools.decide_rep_review.description",
    inputSchema: { type: "object", properties: { reviewId: Sn, action: Sn }, required: ["reviewId", "action"] },
    handler: async (a, c) => raw(c, "POST", `/reputation/reviews/${encodeURIComponent(getStr(a, "reviewId"))}/${encodeURIComponent(getStr(a, "action"))}`),
  },
  {
    name: "run_rep_decay",
    descriptionKey: "mcp.tools.run_rep_decay.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "POST", `/reputation/decay/run`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ENGAGEMENT — GIVEAWAYS / STARBOARD / POLLS / AMA / TIME-CAPSULE
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_giveaways",
    descriptionKey: "mcp.tools.list_giveaways.description",
    inputSchema: { type: "object", properties: { status: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/giveaways${qs({ status: getOptStr(a, "status"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_giveaway",
    descriptionKey: "mcp.tools.get_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "GET", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/health`),
  },
  {
    name: "create_giveaway",
    descriptionKey: "mcp.tools.create_giveaway.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/giveaways`, getObj(a, "definition")),
  },
  {
    name: "update_giveaway",
    descriptionKey: "mcp.tools.update_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn, patch: On }, required: ["giveawayId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}`, getObj(a, "patch")),
  },
  {
    name: "end_giveaway",
    descriptionKey: "mcp.tools.end_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "POST", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/end`),
  },
  {
    name: "reroll_giveaway",
    descriptionKey: "mcp.tools.reroll_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn, count: Nn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "POST", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/reroll`, { count: getOptNum(a, "count") }),
  },
  {
    name: "cancel_giveaway",
    descriptionKey: "mcp.tools.cancel_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "POST", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/cancel`),
  },
  {
    name: "publish_giveaway",
    descriptionKey: "mcp.tools.publish_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "POST", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/publish`),
  },
  {
    name: "clone_giveaway",
    descriptionKey: "mcp.tools.clone_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "POST", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/clone`),
  },
  {
    name: "delete_giveaway",
    descriptionKey: "mcp.tools.delete_giveaway.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "DELETE", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}`),
  },
  {
    name: "list_giveaway_winners",
    descriptionKey: "mcp.tools.list_giveaway_winners.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "GET", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/analysis`),
  },
  {
    name: "list_giveaway_entries",
    descriptionKey: "mcp.tools.list_giveaway_entries.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn }, required: ["giveawayId"] },
    handler: async (a, c) => raw(c, "GET", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/export`),
  },
  {
    name: "check_giveaway_eligibility",
    descriptionKey: "mcp.tools.check_giveaway_eligibility.description",
    inputSchema: { type: "object", properties: { giveawayId: Sn, userId: Sn }, required: ["giveawayId", "userId"] },
    handler: async (a, c) => raw(c, "GET", `/giveaways/${encodeURIComponent(getStr(a, "giveawayId"))}/eligibility/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "list_starboards",
    descriptionKey: "mcp.tools.list_starboards.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/starboard`),
  },
  {
    name: "save_starboard",
    descriptionKey: "mcp.tools.save_starboard.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/starboard/boards`, getObj(a, "definition")),
  },
  {
    name: "delete_starboard",
    descriptionKey: "mcp.tools.delete_starboard.description",
    inputSchema: { type: "object", properties: { boardId: Sn }, required: ["boardId"] },
    handler: async (a, c) => raw(c, "DELETE", `/starboard/boards/${encodeURIComponent(getStr(a, "boardId"))}`),
  },
  {
    name: "list_starboard_top",
    descriptionKey: "mcp.tools.list_starboard_top.description",
    inputSchema: { type: "object", properties: { boardId: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/starboard/top${qs({ boardId: getOptStr(a, "boardId"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "starboard_post_action",
    descriptionKey: "mcp.tools.starboard_post_action.description",
    inputSchema: { type: "object", properties: { postId: Sn, action: Sn }, required: ["postId", "action"] },
    handler: async (a, c) => raw(c, "POST", `/starboard/posts/${encodeURIComponent(getStr(a, "postId"))}/actions`, { action: getStr(a, "action") }),
  },
  {
    name: "save_starboard_reward",
    descriptionKey: "mcp.tools.save_starboard_reward.description",
    inputSchema: { type: "object", properties: { boardId: Sn, definition: On }, required: ["boardId", "definition"] },
    handler: async (a, c) => raw(c, "POST", `/starboard/boards/${encodeURIComponent(getStr(a, "boardId"))}/rewards`, getObj(a, "definition")),
  },
  {
    name: "starboard_diagnostics",
    descriptionKey: "mcp.tools.starboard_diagnostics.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/starboard/diagnostics`),
  },
  {
    name: "list_polls",
    descriptionKey: "mcp.tools.list_polls.description",
    inputSchema: { type: "object", properties: { status: Sn, limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/polls${qs({ status: getOptStr(a, "status"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "create_poll",
    descriptionKey: "mcp.tools.create_poll.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/polls`, getObj(a, "definition")),
  },
  {
    name: "close_poll",
    descriptionKey: "mcp.tools.close_poll.description",
    inputSchema: { type: "object", properties: { pollId: Sn }, required: ["pollId"] },
    handler: async (a, c) => raw(c, "POST", `/polls/${encodeURIComponent(getStr(a, "pollId"))}/close`),
  },
  {
    name: "reopen_poll",
    descriptionKey: "mcp.tools.reopen_poll.description",
    inputSchema: { type: "object", properties: { pollId: Sn }, required: ["pollId"] },
    handler: async (a, c) => raw(c, "POST", `/polls/${encodeURIComponent(getStr(a, "pollId"))}/reopen`),
  },
  {
    name: "get_poll_results",
    descriptionKey: "mcp.tools.get_poll_results.description",
    inputSchema: { type: "object", properties: { pollId: Sn }, required: ["pollId"] },
    handler: async (a, c) => raw(c, "GET", `/polls/${encodeURIComponent(getStr(a, "pollId"))}/export.csv`),
  },
  {
    name: "delete_poll",
    descriptionKey: "mcp.tools.delete_poll.description",
    inputSchema: { type: "object", properties: { pollId: Sn }, required: ["pollId"] },
    handler: async (a, c) => raw(c, "DELETE", `/polls/${encodeURIComponent(getStr(a, "pollId"))}`),
  },
  {
    name: "list_amas",
    descriptionKey: "mcp.tools.list_amas.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/ama`),
  },
  {
    name: "create_ama_session",
    descriptionKey: "mcp.tools.create_ama_session.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/ama/session`, getObj(a, "definition")),
  },
  {
    name: "close_ama_session",
    descriptionKey: "mcp.tools.close_ama_session.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "POST", `/ama/session/${encodeURIComponent(getStr(a, "sessionId"))}/close`),
  },
  {
    name: "decide_ama_question",
    descriptionKey: "mcp.tools.decide_ama_question.description",
    inputSchema: { type: "object", properties: { sessionId: Sn, questionId: Sn, decision: { type: "string", enum: ["approve", "reject"] }, reason: Sn }, required: ["sessionId", "questionId", "decision"] },
    handler: async (a, c) => raw(c, "POST", `/ama/session/${encodeURIComponent(getStr(a, "sessionId"))}/questions/${encodeURIComponent(getStr(a, "questionId"))}/${getStr(a, "decision")}`, {
      reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "answer_ama_question",
    descriptionKey: "mcp.tools.answer_ama_question.description",
    inputSchema: { type: "object", properties: { sessionId: Sn, questionId: Sn, answer: Sn }, required: ["sessionId", "questionId", "answer"] },
    handler: async (a, c) => raw(c, "POST", `/ama/session/${encodeURIComponent(getStr(a, "sessionId"))}/questions/${encodeURIComponent(getStr(a, "questionId"))}/answer`, {
      answer: getStr(a, "answer"),
    }),
  },
  {
    name: "list_time_capsules",
    descriptionKey: "mcp.tools.list_time_capsules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/time-capsules`),
  },
  {
    name: "get_time_capsule",
    descriptionKey: "mcp.tools.get_time_capsule.description",
    inputSchema: { type: "object", properties: { capsuleId: Sn }, required: ["capsuleId"] },
    // expected-by: /time-capsules/:id GET
    handler: async (a, c) => raw(c, "GET", `/time-capsules/${encodeURIComponent(getStr(a, "capsuleId"))}`),
  },
  {
    name: "create_time_capsule",
    descriptionKey: "mcp.tools.create_time_capsule.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/time-capsules`, getObj(a, "definition")),
  },
  {
    name: "cancel_time_capsule",
    descriptionKey: "mcp.tools.cancel_time_capsule.description",
    inputSchema: { type: "object", properties: { capsuleId: Sn }, required: ["capsuleId"] },
    handler: async (a, c) => raw(c, "POST", `/time-capsules/${encodeURIComponent(getStr(a, "capsuleId"))}/cancel`),
  },
  {
    name: "force_unlock_time_capsule",
    descriptionKey: "mcp.tools.force_unlock_time_capsule.description",
    inputSchema: { type: "object", properties: { capsuleId: Sn }, required: ["capsuleId"] },
    handler: async (a, c) => raw(c, "POST", `/time-capsules/${encodeURIComponent(getStr(a, "capsuleId"))}/deliver-now`),
  },
  {
    name: "reschedule_time_capsule",
    descriptionKey: "mcp.tools.reschedule_time_capsule.description",
    inputSchema: { type: "object", properties: { capsuleId: Sn, runAt: Sn }, required: ["capsuleId", "runAt"] },
    handler: async (a, c) => raw(c, "POST", `/time-capsules/${encodeURIComponent(getStr(a, "capsuleId"))}/reschedule`, { runAt: getStr(a, "runAt") }),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ENGAGEMENT — SUGGESTIONS / CONFESSIONS / BIRTHDAYS / HIGHLIGHTS / AFK
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_suggestions",
    descriptionKey: "mcp.tools.list_suggestions.description",
    inputSchema: { type: "object", properties: { status: Sn, limit: Nn } },
    // expected-by: /suggestions GET (sister-agent route)
    handler: async (a, c) => raw(c, "GET", `/suggestions${qs({ status: getOptStr(a, "status"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_suggestion",
    descriptionKey: "mcp.tools.get_suggestion.description",
    inputSchema: { type: "object", properties: { suggestionId: Sn }, required: ["suggestionId"] },
    // expected-by: /suggestions/:id GET (sister-agent)
    handler: async (a, c) => raw(c, "GET", `/suggestions/${encodeURIComponent(getStr(a, "suggestionId"))}`),
  },
  {
    name: "decide_suggestion",
    descriptionKey: "mcp.tools.decide_suggestion.description",
    inputSchema: { type: "object", properties: { suggestionId: Sn, decision: Sn, reason: Sn }, required: ["suggestionId", "decision"] },
    // expected-by: /suggestions/:id/decide POST
    handler: async (a, c) => raw(c, "POST", `/suggestions/${encodeURIComponent(getStr(a, "suggestionId"))}/decide`, {
      decision: getStr(a, "decision"), reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "comment_on_suggestion",
    descriptionKey: "mcp.tools.comment_on_suggestion.description",
    inputSchema: { type: "object", properties: { suggestionId: Sn, body: Sn }, required: ["suggestionId", "body"] },
    // expected-by: /suggestions/:id/comments POST
    handler: async (a, c) => raw(c, "POST", `/suggestions/${encodeURIComponent(getStr(a, "suggestionId"))}/comments`, { body: getStr(a, "body") }),
  },
  {
    name: "list_suggestion_top",
    descriptionKey: "mcp.tools.list_suggestion_top.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    // expected-by: /suggestions/top GET
    handler: async (a, c) => raw(c, "GET", `/suggestions/top${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_suggestion_settings",
    descriptionKey: "mcp.tools.get_suggestion_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "suggestions" })}`),
  },
  {
    name: "list_confessions",
    descriptionKey: "mcp.tools.list_confessions.description",
    inputSchema: { type: "object", properties: { status: Sn, limit: Nn } },
    // expected-by: /confessions GET
    handler: async (a, c) => raw(c, "GET", `/confessions${qs({ status: getOptStr(a, "status"), limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "decide_confession",
    descriptionKey: "mcp.tools.decide_confession.description",
    inputSchema: { type: "object", properties: { confessionId: Sn, decision: Sn, reason: Sn }, required: ["confessionId", "decision"] },
    // expected-by: /confessions/:id/decide POST
    handler: async (a, c) => raw(c, "POST", `/confessions/${encodeURIComponent(getStr(a, "confessionId"))}/decide`, {
      decision: getStr(a, "decision"), reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "get_confession_settings",
    descriptionKey: "mcp.tools.get_confession_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "confessions" })}`),
  },
  {
    name: "get_confession_audit",
    descriptionKey: "mcp.tools.get_confession_audit.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    // expected-by: /confessions/audit GET
    handler: async (a, c) => raw(c, "GET", `/confessions/audit${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "list_birthdays",
    descriptionKey: "mcp.tools.list_birthdays.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    // expected-by: /birthdays GET (sister-agent route)
    handler: async (a, c) => raw(c, "GET", `/birthdays${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_birthday",
    descriptionKey: "mcp.tools.get_birthday.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /birthdays/:userId GET
    handler: async (a, c) => raw(c, "GET", `/birthdays/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "set_birthday",
    descriptionKey: "mcp.tools.set_birthday.description",
    inputSchema: { type: "object", properties: { userId: Sn, date: Sn, year: Nn }, required: ["userId", "date"] },
    // expected-by: /birthdays POST
    handler: async (a, c) => raw(c, "POST", `/birthdays`, { userId: getStr(a, "userId"), date: getStr(a, "date"), year: getOptNum(a, "year") }),
  },
  {
    name: "delete_birthday",
    descriptionKey: "mcp.tools.delete_birthday.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /birthdays/:userId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/birthdays/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "list_birthdays_this_month",
    descriptionKey: "mcp.tools.list_birthdays_this_month.description",
    inputSchema: { type: "object", properties: { month: Nn } },
    // expected-by: /birthdays/upcoming GET
    handler: async (a, c) => raw(c, "GET", `/birthdays/upcoming${qs({ month: getOptNum(a, "month") })}`),
  },
  {
    name: "force_birthday_announce",
    descriptionKey: "mcp.tools.force_birthday_announce.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /birthdays/:userId/announce POST
    handler: async (a, c) => raw(c, "POST", `/birthdays/${encodeURIComponent(getStr(a, "userId"))}/announce`),
  },
  {
    name: "list_user_highlights",
    descriptionKey: "mcp.tools.list_user_highlights.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /highlights/:userId GET (sister-agent route)
    handler: async (a, c) => raw(c, "GET", `/highlights/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "add_user_highlight",
    descriptionKey: "mcp.tools.add_user_highlight.description",
    inputSchema: { type: "object", properties: { userId: Sn, term: Sn }, required: ["userId", "term"] },
    // expected-by: /highlights/:userId POST
    handler: async (a, c) => raw(c, "POST", `/highlights/${encodeURIComponent(getStr(a, "userId"))}`, { term: getStr(a, "term") }),
  },
  {
    name: "remove_user_highlight",
    descriptionKey: "mcp.tools.remove_user_highlight.description",
    inputSchema: { type: "object", properties: { userId: Sn, term: Sn }, required: ["userId", "term"] },
    // expected-by: /highlights/:userId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/highlights/${encodeURIComponent(getStr(a, "userId"))}${qs({ term: getStr(a, "term") })}`),
  },
  {
    name: "get_highlights_settings",
    descriptionKey: "mcp.tools.get_highlights_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "highlights" })}`),
  },
  {
    name: "update_highlights_settings",
    descriptionKey: "mcp.tools.update_highlights_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "highlights", patch: getObj(a, "patch") }),
  },
  {
    name: "list_afks",
    descriptionKey: "mcp.tools.list_afks.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    // expected-by: /afk GET (sister-agent route)
    handler: async (a, c) => raw(c, "GET", `/afk${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_afk",
    descriptionKey: "mcp.tools.get_afk.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /afk/:userId GET
    handler: async (a, c) => raw(c, "GET", `/afk/${encodeURIComponent(getStr(a, "userId"))}`),
  },
  {
    name: "set_afk",
    descriptionKey: "mcp.tools.set_afk.description",
    inputSchema: { type: "object", properties: { userId: Sn, message: Sn, until: Sn }, required: ["userId"] },
    // expected-by: /afk/:userId PUT
    handler: async (a, c) => raw(c, "PUT", `/afk/${encodeURIComponent(getStr(a, "userId"))}`, { message: getOptStr(a, "message"), until: getOptStr(a, "until") }),
  },
  {
    name: "clear_afk",
    descriptionKey: "mcp.tools.clear_afk.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    // expected-by: /afk/:userId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/afk/${encodeURIComponent(getStr(a, "userId"))}`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WELCOME / ONBOARDING / MESSAGES / EMBEDS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "get_welcome_settings",
    descriptionKey: "mcp.tools.get_welcome_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "welcome" })}`),
  },
  {
    name: "update_welcome_settings",
    descriptionKey: "mcp.tools.update_welcome_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "welcome", patch: getObj(a, "patch") }),
  },
  {
    name: "preview_welcome_card",
    descriptionKey: "mcp.tools.preview_welcome_card.description",
    inputSchema: { type: "object", properties: { kind: Sn } },
    handler: async (a, c) => {
      const kind = getOptStr(a, "kind");
      return raw(c, "GET", kind ? `/welcome-card/${encodeURIComponent(kind)}/preview` : `/welcome-card/preview`);
    },
  },
  {
    name: "test_welcome_message",
    descriptionKey: "mcp.tools.test_welcome_message.description",
    inputSchema: { type: "object", properties: { kind: Sn, userId: Sn } },
    handler: async (a, c) => raw(c, "POST", `/welcome/test`, { kind: getOptStr(a, "kind"), userId: getOptStr(a, "userId") }),
  },
  {
    name: "preview_rank_card",
    descriptionKey: "mcp.tools.preview_rank_card.description",
    inputSchema: { type: "object", properties: { userId: Sn } },
    handler: async (a, c) => raw(c, "GET", `/rank-card/preview${qs({ userId: getOptStr(a, "userId") })}`),
  },
  {
    name: "delete_welcome_background",
    descriptionKey: "mcp.tools.delete_welcome_background.description",
    inputSchema: { type: "object", properties: { kind: Sn } },
    handler: async (a, c) => {
      const kind = getOptStr(a, "kind");
      return raw(c, "DELETE", kind ? `/welcome-card/${encodeURIComponent(kind)}/background` : `/welcome-card/background`);
    },
  },
  {
    name: "get_onboarding_flow",
    descriptionKey: "mcp.tools.get_onboarding_flow.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/onboarding`),
  },
  {
    name: "set_onboarding_flow",
    descriptionKey: "mcp.tools.set_onboarding_flow.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "PUT", `/onboarding`, getObj(a, "definition")),
  },
  {
    name: "delete_onboarding_flow",
    descriptionKey: "mcp.tools.delete_onboarding_flow.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "DELETE", `/onboarding`),
  },
  {
    name: "get_onboarding_ab_report",
    descriptionKey: "mcp.tools.get_onboarding_ab_report.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/onboarding/ab-report`),
  },
  {
    name: "list_onboarding_completions",
    descriptionKey: "mcp.tools.list_onboarding_completions.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/onboarding/completions${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "list_messages",
    descriptionKey: "mcp.tools.list_messages.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/messages`),
  },
  {
    name: "get_message",
    descriptionKey: "mcp.tools.get_message.description",
    inputSchema: { type: "object", properties: { key: Sn }, required: ["key"] },
    handler: async (a, c) => raw(c, "GET", `/messages/${encodeURIComponent(getStr(a, "key"))}`),
  },
  {
    name: "save_message",
    descriptionKey: "mcp.tools.save_message.description",
    inputSchema: { type: "object", properties: { key: Sn, body: On }, required: ["key", "body"] },
    handler: async (a, c) => raw(c, "PUT", `/messages/${encodeURIComponent(getStr(a, "key"))}`, getObj(a, "body")),
  },
  {
    name: "delete_message",
    descriptionKey: "mcp.tools.delete_message.description",
    inputSchema: { type: "object", properties: { key: Sn }, required: ["key"] },
    handler: async (a, c) => raw(c, "DELETE", `/messages/${encodeURIComponent(getStr(a, "key"))}`),
  },
  {
    name: "list_message_instances",
    descriptionKey: "mcp.tools.list_message_instances.description",
    inputSchema: { type: "object", properties: { key: Sn }, required: ["key"] },
    handler: async (a, c) => raw(c, "GET", `/messages/${encodeURIComponent(getStr(a, "key"))}/instances`),
  },
  {
    name: "update_message_instance",
    descriptionKey: "mcp.tools.update_message_instance.description",
    inputSchema: { type: "object", properties: { key: Sn, instanceId: Sn, patch: On }, required: ["key", "instanceId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/messages/${encodeURIComponent(getStr(a, "key"))}/instances/${encodeURIComponent(getStr(a, "instanceId"))}`, getObj(a, "patch")),
  },
  {
    name: "seed_default_embeds",
    descriptionKey: "mcp.tools.seed_default_embeds.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "POST", `/messages/default-embeds/seed`),
  },
  {
    name: "list_embed_templates",
    descriptionKey: "mcp.tools.list_embed_templates.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => c.embeds.list(),
  },
  {
    name: "save_embed_template",
    descriptionKey: "mcp.tools.save_embed_template.description",
    inputSchema: { type: "object", properties: { name: Sn, json: On }, required: ["name", "json"] },
    handler: async (a, c) => c.embeds.save(getStr(a, "name"), getObj(a, "json") as Parameters<ModlyClient["embeds"]["save"]>[1]),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CHANNELS / ROLES / SERVER
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_channels",
    descriptionKey: "mcp.tools.list_channels.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/channel-utils/channels`),
  },
  {
    name: "create_channel",
    descriptionKey: "mcp.tools.create_channel.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/channel-utils/channels`, getObj(a, "definition")),
  },
  {
    name: "update_channel",
    descriptionKey: "mcp.tools.update_channel.description",
    inputSchema: { type: "object", properties: { channelId: Sn, patch: On }, required: ["channelId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/channel-utils/channels/${encodeURIComponent(getStr(a, "channelId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_channel",
    descriptionKey: "mcp.tools.delete_channel.description",
    inputSchema: { type: "object", properties: { channelId: Sn }, required: ["channelId"] },
    handler: async (a, c) => raw(c, "DELETE", `/channel-utils/channels/${encodeURIComponent(getStr(a, "channelId"))}`),
  },
  {
    name: "get_channel_permissions",
    descriptionKey: "mcp.tools.get_channel_permissions.description",
    inputSchema: { type: "object", properties: { channelId: Sn }, required: ["channelId"] },
    handler: async (a, c) => raw(c, "GET", `/channel-utils/channels/${encodeURIComponent(getStr(a, "channelId"))}/permissions`),
  },
  {
    name: "set_channel_permissions",
    descriptionKey: "mcp.tools.set_channel_permissions.description",
    inputSchema: { type: "object", properties: { channelId: Sn, overwrites: On }, required: ["channelId", "overwrites"] },
    handler: async (a, c) => raw(c, "PUT", `/channel-utils/channels/${encodeURIComponent(getStr(a, "channelId"))}/permissions`, getObj(a, "overwrites")),
  },
  {
    name: "list_discord_channels",
    descriptionKey: "mcp.tools.list_discord_channels.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/discord/channels`),
  },
  {
    name: "list_roles",
    descriptionKey: "mcp.tools.list_roles.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/roles`),
  },
  {
    name: "list_discord_roles",
    descriptionKey: "mcp.tools.list_discord_roles.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/discord/roles`),
  },
  {
    name: "list_discord_members",
    descriptionKey: "mcp.tools.list_discord_members.description",
    inputSchema: { type: "object", properties: { limit: Nn, after: Sn } },
    handler: async (a, c) => raw(c, "GET", `/discord/members${qs({ limit: getOptNum(a, "limit"), after: getOptStr(a, "after") })}`),
  },
  {
    name: "create_role",
    descriptionKey: "mcp.tools.create_role.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    // expected-by: /roles POST (currently overview-only at GET /roles)
    handler: async (a, c) => raw(c, "POST", `/roles`, getObj(a, "definition")),
  },
  {
    name: "update_role",
    descriptionKey: "mcp.tools.update_role.description",
    inputSchema: { type: "object", properties: { roleId: Sn, patch: On }, required: ["roleId", "patch"] },
    // expected-by: /roles/:roleId PATCH
    handler: async (a, c) => raw(c, "PATCH", `/roles/${encodeURIComponent(getStr(a, "roleId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_role",
    descriptionKey: "mcp.tools.delete_role.description",
    inputSchema: { type: "object", properties: { roleId: Sn }, required: ["roleId"] },
    // expected-by: /roles/:roleId DELETE
    handler: async (a, c) => raw(c, "DELETE", `/roles/${encodeURIComponent(getStr(a, "roleId"))}`),
  },
  {
    name: "add_member_role",
    descriptionKey: "mcp.tools.add_member_role.description",
    inputSchema: { type: "object", properties: { userId: Sn, roleId: Sn, reason: Sn }, required: ["userId", "roleId"] },
    // expected-by: /roles/assignments PUT (mounted via roles-api)
    handler: async (a, c) => raw(c, "PUT", `/roles/assignments`, {
      userId: getStr(a, "userId"), roleId: getStr(a, "roleId"), reason: getOptStr(a, "reason"),
    }),
  },
  {
    name: "remove_member_role",
    descriptionKey: "mcp.tools.remove_member_role.description",
    inputSchema: { type: "object", properties: { userId: Sn, roleId: Sn, reason: Sn }, required: ["userId", "roleId"] },
    // expected-by: /roles/assignments DELETE
    handler: async (a, c) => raw(c, "DELETE", `/roles/assignments${qs({ userId: getStr(a, "userId"), roleId: getStr(a, "roleId"), reason: getOptStr(a, "reason") })}`),
  },
  {
    name: "list_reaction_roles",
    descriptionKey: "mcp.tools.list_reaction_roles.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /roles/reaction-roles GET
    handler: async (_a, c) => raw(c, "GET", `/roles/reaction-roles`),
  },
  {
    name: "save_reaction_role",
    descriptionKey: "mcp.tools.save_reaction_role.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    // expected-by: /roles/reaction-roles POST
    handler: async (a, c) => raw(c, "POST", `/roles/reaction-roles`, getObj(a, "definition")),
  },
  {
    name: "list_activity_roles",
    descriptionKey: "mcp.tools.list_activity_roles.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /roles/activity-roles GET
    handler: async (_a, c) => raw(c, "GET", `/roles/activity-roles`),
  },
  {
    name: "save_activity_role",
    descriptionKey: "mcp.tools.save_activity_role.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    // expected-by: /roles/activity-roles POST
    handler: async (a, c) => raw(c, "POST", `/roles/activity-roles`, getObj(a, "definition")),
  },
  {
    name: "list_color_roles",
    descriptionKey: "mcp.tools.list_color_roles.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /roles/color-roles GET
    handler: async (_a, c) => raw(c, "GET", `/roles/color-roles`),
  },
  {
    name: "list_temp_roles",
    descriptionKey: "mcp.tools.list_temp_roles.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /roles/temp-roles GET
    handler: async (_a, c) => raw(c, "GET", `/roles/temp-roles`),
  },
  {
    name: "set_role_panel",
    descriptionKey: "mcp.tools.set_role_panel.description",
    inputSchema: { type: "object", properties: { panelId: Sn, definition: On }, required: ["definition"] },
    // expected-by: /roles/panels POST/PATCH (mounted under roles-api)
    handler: async (a, c) => {
      const panelId = getOptStr(a, "panelId");
      const def = getObj(a, "definition");
      return panelId
        ? raw(c, "PATCH", `/roles/panels/${encodeURIComponent(panelId)}`, def)
        : raw(c, "POST", `/roles/panels`, def);
    },
  },
  {
    name: "list_role_backups",
    descriptionKey: "mcp.tools.list_role_backups.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /roles/backups GET (roles-api)
    handler: async (_a, c) => raw(c, "GET", `/roles/backups`),
  },
  {
    name: "create_role_backup",
    descriptionKey: "mcp.tools.create_role_backup.description",
    inputSchema: { type: "object", properties: { label: Sn } },
    // expected-by: /roles/backups POST
    handler: async (a, c) => raw(c, "POST", `/roles/backups`, { label: getOptStr(a, "label") }),
  },
  {
    name: "get_guild",
    descriptionKey: "mcp.tools.get_guild.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}`),
  },
  {
    name: "update_guild",
    descriptionKey: "mcp.tools.update_guild.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => rawAbs(c, "PATCH", `/api/guilds/${c.guildId}`, getObj(a, "patch")),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COUNTERS / SERVER STATS / SERVER GOALS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_counters",
    descriptionKey: "mcp.tools.list_counters.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/counters`),
  },
  {
    name: "save_counter",
    descriptionKey: "mcp.tools.save_counter.description",
    inputSchema: { type: "object", properties: { counterId: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const id = getOptStr(a, "counterId");
      const def = getObj(a, "definition");
      return id
        ? raw(c, "PATCH", `/counters/${encodeURIComponent(id)}`, def)
        : raw(c, "POST", `/counters`, def);
    },
  },
  {
    name: "delete_counter",
    descriptionKey: "mcp.tools.delete_counter.description",
    inputSchema: { type: "object", properties: { counterId: Sn }, required: ["counterId"] },
    handler: async (a, c) => raw(c, "DELETE", `/counters/${encodeURIComponent(getStr(a, "counterId"))}`),
  },
  {
    name: "publish_counter",
    descriptionKey: "mcp.tools.publish_counter.description",
    inputSchema: { type: "object", properties: { counterId: Sn }, required: ["counterId"] },
    handler: async (a, c) => raw(c, "POST", `/counters/${encodeURIComponent(getStr(a, "counterId"))}/publish`),
  },
  {
    name: "import_counters",
    descriptionKey: "mcp.tools.import_counters.description",
    inputSchema: { type: "object", properties: { data: On }, required: ["data"] },
    handler: async (a, c) => raw(c, "POST", `/counters/import`, getObj(a, "data")),
  },
  {
    name: "list_server_stats",
    descriptionKey: "mcp.tools.list_server_stats.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/server-stats`),
  },
  {
    name: "save_server_stat_channel",
    descriptionKey: "mcp.tools.save_server_stat_channel.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/server-stats/channels`, getObj(a, "definition")),
  },
  {
    name: "delete_server_stat_channel",
    descriptionKey: "mcp.tools.delete_server_stat_channel.description",
    inputSchema: { type: "object", properties: { channelId: Sn }, required: ["channelId"] },
    handler: async (a, c) => raw(c, "DELETE", `/server-stats/channels/${encodeURIComponent(getStr(a, "channelId"))}`),
  },
  {
    name: "save_server_stat",
    descriptionKey: "mcp.tools.save_server_stat.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/server-stats/custom`, getObj(a, "definition")),
  },
  {
    name: "preview_server_stat",
    descriptionKey: "mcp.tools.preview_server_stat.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/server-stats/preview`, getObj(a, "definition")),
  },
  {
    name: "refresh_server_stats",
    descriptionKey: "mcp.tools.refresh_server_stats.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "POST", `/server-stats/refresh`),
  },
  {
    name: "server_stats_diagnostics",
    descriptionKey: "mcp.tools.server_stats_diagnostics.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/server-stats/diagnostics`),
  },
  {
    name: "list_server_goals",
    descriptionKey: "mcp.tools.list_server_goals.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/server-goals`),
  },
  {
    name: "create_server_goal",
    descriptionKey: "mcp.tools.create_server_goal.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/server-goals/goals`, getObj(a, "definition")),
  },
  {
    name: "delete_server_goal",
    descriptionKey: "mcp.tools.delete_server_goal.description",
    inputSchema: { type: "object", properties: { goalId: Sn }, required: ["goalId"] },
    handler: async (a, c) => raw(c, "DELETE", `/server-goals/goals/${encodeURIComponent(getStr(a, "goalId"))}`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VOICE / AI / TRANSLATION / TTS / PERSONAS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_voice_clips",
    descriptionKey: "mcp.tools.list_voice_clips.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/voice-clipper`),
  },
  {
    name: "get_voice_clip",
    descriptionKey: "mcp.tools.get_voice_clip.description",
    inputSchema: { type: "object", properties: { clipId: Sn }, required: ["clipId"] },
    handler: async (a, c) => raw(c, "GET", `/voice-clipper/clips/${encodeURIComponent(getStr(a, "clipId"))}/export`),
  },
  {
    name: "update_voice_clip",
    descriptionKey: "mcp.tools.update_voice_clip.description",
    inputSchema: { type: "object", properties: { clipId: Sn, patch: On }, required: ["clipId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/voice-clipper/clips/${encodeURIComponent(getStr(a, "clipId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_voice_clip",
    descriptionKey: "mcp.tools.delete_voice_clip.description",
    inputSchema: { type: "object", properties: { clipId: Sn }, required: ["clipId"] },
    handler: async (a, c) => raw(c, "DELETE", `/voice-clipper/clips/${encodeURIComponent(getStr(a, "clipId"))}`),
  },
  {
    name: "list_voice_recordings",
    descriptionKey: "mcp.tools.list_voice_recordings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/voice-recording`),
  },
  {
    name: "get_voice_recording",
    descriptionKey: "mcp.tools.get_voice_recording.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "GET", `/voice-recording/sessions/${encodeURIComponent(getStr(a, "sessionId"))}/export`),
  },
  {
    name: "delete_voice_recording",
    descriptionKey: "mcp.tools.delete_voice_recording.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "DELETE", `/voice-recording/sessions/${encodeURIComponent(getStr(a, "sessionId"))}`),
  },
  {
    name: "update_voice_recording",
    descriptionKey: "mcp.tools.update_voice_recording.description",
    inputSchema: { type: "object", properties: { sessionId: Sn, patch: On }, required: ["sessionId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/voice-recording/sessions/${encodeURIComponent(getStr(a, "sessionId"))}`, getObj(a, "patch")),
  },
  {
    name: "get_voice_recording_transcript",
    descriptionKey: "mcp.tools.get_voice_recording_transcript.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "GET", `/voice-recording/sessions/${encodeURIComponent(getStr(a, "sessionId"))}/transcript`),
  },
  {
    name: "start_voice_recording",
    descriptionKey: "mcp.tools.start_voice_recording.description",
    inputSchema: { type: "object", properties: { channelId: Sn }, required: ["channelId"] },
    handler: async (a, c) => raw(c, "POST", `/voice-recording/start`, { channelId: getStr(a, "channelId") }),
  },
  {
    name: "stop_voice_recording",
    descriptionKey: "mcp.tools.stop_voice_recording.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "POST", `/voice-recording/sessions/${encodeURIComponent(getStr(a, "sessionId"))}/stop`),
  },
  {
    name: "list_voice_bots",
    descriptionKey: "mcp.tools.list_voice_bots.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/voice-bots`),
  },
  {
    name: "create_voice_bot",
    descriptionKey: "mcp.tools.create_voice_bot.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/voice-bots`, getObj(a, "definition")),
  },
  {
    name: "reconnect_voice_bot",
    descriptionKey: "mcp.tools.reconnect_voice_bot.description",
    inputSchema: { type: "object", properties: { instanceId: Sn }, required: ["instanceId"] },
    handler: async (a, c) => raw(c, "POST", `/voice-bots/${encodeURIComponent(getStr(a, "instanceId"))}/reconnect`),
  },
  {
    name: "delete_voice_bot",
    descriptionKey: "mcp.tools.delete_voice_bot.description",
    inputSchema: { type: "object", properties: { instanceId: Sn }, required: ["instanceId"] },
    handler: async (a, c) => raw(c, "DELETE", `/voice-bots/${encodeURIComponent(getStr(a, "instanceId"))}`),
  },
  {
    name: "list_ai_usage",
    descriptionKey: "mcp.tools.list_ai_usage.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/ai/usage`),
  },
  {
    name: "list_ai_flags",
    descriptionKey: "mcp.tools.list_ai_flags.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/ai/flags${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "resolve_ai_flag",
    descriptionKey: "mcp.tools.resolve_ai_flag.description",
    inputSchema: { type: "object", properties: { flagId: Sn, resolution: Sn, notes: Sn }, required: ["flagId", "resolution"] },
    handler: async (a, c) => raw(c, "POST", `/ai/flags/${encodeURIComponent(getStr(a, "flagId"))}/resolve`, { resolution: getStr(a, "resolution"), notes: getOptStr(a, "notes") }),
  },
  {
    name: "list_ai_review_queue",
    descriptionKey: "mcp.tools.list_ai_review_queue.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/ai/review`),
  },
  {
    name: "decide_ai_approval",
    descriptionKey: "mcp.tools.decide_ai_approval.description",
    inputSchema: { type: "object", properties: { approvalId: Sn, decision: { type: "string", enum: ["approve", "reject"] } }, required: ["approvalId", "decision"] },
    handler: async (a, c) => raw(c, "POST", `/ai/approvals/${encodeURIComponent(getStr(a, "approvalId"))}/${getStr(a, "decision")}`),
  },
  {
    name: "list_ai_policies",
    descriptionKey: "mcp.tools.list_ai_policies.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/ai/policies`),
  },
  {
    name: "snapshot_ai_policies",
    descriptionKey: "mcp.tools.snapshot_ai_policies.description",
    inputSchema: { type: "object", properties: { label: Sn } },
    handler: async (a, c) => raw(c, "POST", `/ai/policies/snapshot`, { label: getOptStr(a, "label") }),
  },
  {
    name: "restore_ai_policies",
    descriptionKey: "mcp.tools.restore_ai_policies.description",
    inputSchema: { type: "object", properties: { version: Sn }, required: ["version"] },
    handler: async (a, c) => raw(c, "POST", `/ai/policies/${encodeURIComponent(getStr(a, "version"))}/restore`),
  },
  {
    name: "simulate_ai",
    descriptionKey: "mcp.tools.simulate_ai.description",
    inputSchema: { type: "object", properties: { sample: On }, required: ["sample"] },
    handler: async (a, c) => raw(c, "POST", `/ai/simulate`, getObj(a, "sample")),
  },
  {
    name: "run_ai_assistant",
    descriptionKey: "mcp.tools.run_ai_assistant.description",
    inputSchema: { type: "object", properties: { prompt: Sn, context: On }, required: ["prompt"] },
    handler: async (a, c) => raw(c, "POST", `/ai/run`, { prompt: getStr(a, "prompt"), context: getOptObj(a, "context") }),
  },
  {
    name: "get_ai_settings",
    descriptionKey: "mcp.tools.get_ai_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings${qs({ module: "ai" })}`),
  },
  {
    name: "update_ai_settings",
    descriptionKey: "mcp.tools.update_ai_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: "ai", patch: getObj(a, "patch") }),
  },
  {
    name: "list_ai_credentials",
    descriptionKey: "mcp.tools.list_ai_credentials.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/ai/credentials`),
  },
  {
    name: "get_translation_settings",
    descriptionKey: "mcp.tools.get_translation_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/translation`),
  },
  {
    name: "update_translation_settings",
    descriptionKey: "mcp.tools.update_translation_settings.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/translation`, getObj(a, "patch")),
  },
  {
    name: "translate_message",
    descriptionKey: "mcp.tools.translate_message.description",
    inputSchema: { type: "object", properties: { content: Sn, targetLang: Sn, sourceLang: Sn }, required: ["content", "targetLang"] },
    handler: async (a, c) => raw(c, "POST", `/translation/test`, {
      content: getStr(a, "content"), targetLang: getStr(a, "targetLang"), sourceLang: getOptStr(a, "sourceLang"),
    }),
  },
  {
    name: "list_tts_transcripts",
    descriptionKey: "mcp.tools.list_tts_transcripts.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/tts/transcripts${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "get_tts_transcript",
    descriptionKey: "mcp.tools.get_tts_transcript.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "GET", `/tts/transcripts/${encodeURIComponent(getStr(a, "sessionId"))}`),
  },
  {
    name: "delete_tts_transcript",
    descriptionKey: "mcp.tools.delete_tts_transcript.description",
    inputSchema: { type: "object", properties: { sessionId: Sn }, required: ["sessionId"] },
    handler: async (a, c) => raw(c, "DELETE", `/tts/transcripts/${encodeURIComponent(getStr(a, "sessionId"))}`),
  },
  {
    name: "tts_speak",
    descriptionKey: "mcp.tools.tts_speak.description",
    inputSchema: { type: "object", properties: { text: Sn, voice: Sn, channelId: Sn }, required: ["text"] },
    handler: async (a, c) => raw(c, "POST", `/tts/speak`, { text: getStr(a, "text"), voice: getOptStr(a, "voice"), channelId: getOptStr(a, "channelId") }),
  },
  {
    name: "list_ai_personas",
    descriptionKey: "mcp.tools.list_ai_personas.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/personas`),
  },
  {
    name: "save_ai_persona",
    descriptionKey: "mcp.tools.save_ai_persona.description",
    inputSchema: { type: "object", properties: { id: Sn, definition: On, scope: { type: "string", enum: ["preset", "own"] } }, required: ["definition"] },
    handler: async (a, c) => {
      const id = getOptStr(a, "id");
      const def = getObj(a, "definition");
      const scope = getOptStr(a, "scope") ?? "own";
      const seg = scope === "preset" ? "presets" : "own";
      return id
        ? raw(c, "PATCH", `/personas/${seg}/${encodeURIComponent(id)}`, def)
        : raw(c, "POST", `/personas/${seg}`, def);
    },
  },
  {
    name: "delete_ai_persona",
    descriptionKey: "mcp.tools.delete_ai_persona.description",
    inputSchema: { type: "object", properties: { id: Sn, scope: { type: "string", enum: ["preset", "own"] } }, required: ["id"] },
    handler: async (a, c) => {
      const scope = getOptStr(a, "scope") ?? "own";
      const seg = scope === "preset" ? "presets" : "own";
      return raw(c, "DELETE", `/personas/${seg}/${encodeURIComponent(getStr(a, "id"))}`);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WEBHOOKS — OUTBOUND / INBOUND / BROADCASTER
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_outbound_webhooks",
    descriptionKey: "mcp.tools.list_outbound_webhooks.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/outbound-webhooks`),
  },
  {
    name: "list_outbound_webhook_events",
    descriptionKey: "mcp.tools.list_outbound_webhook_events.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/outbound-webhooks/events`),
  },
  {
    name: "create_outbound_webhook",
    descriptionKey: "mcp.tools.create_outbound_webhook.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/outbound-webhooks`, getObj(a, "definition")),
  },
  {
    name: "update_outbound_webhook",
    descriptionKey: "mcp.tools.update_outbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn, patch: On }, required: ["hookId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/outbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_outbound_webhook",
    descriptionKey: "mcp.tools.delete_outbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "DELETE", `/outbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}`),
  },
  {
    name: "test_outbound_webhook",
    descriptionKey: "mcp.tools.test_outbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn, event: Sn, payload: On }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "POST", `/outbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/test`, {
      event: getOptStr(a, "event"), payload: getOptObj(a, "payload"),
    }),
  },
  {
    name: "preview_outbound_webhook",
    descriptionKey: "mcp.tools.preview_outbound_webhook.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/outbound-webhooks/preview`, getObj(a, "definition")),
  },
  {
    name: "search_outbound_webhook_deliveries",
    descriptionKey: "mcp.tools.search_outbound_webhook_deliveries.description",
    inputSchema: { type: "object", properties: { hookId: Sn, event: Sn, status: Sn, limit: Nn }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "GET", `/outbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/deliveries${qs({
      event: getOptStr(a, "event"), status: getOptStr(a, "status"), limit: getOptNum(a, "limit"),
    })}`),
  },
  {
    name: "replay_outbound_webhook_delivery",
    descriptionKey: "mcp.tools.replay_outbound_webhook_delivery.description",
    inputSchema: { type: "object", properties: { hookId: Sn, deliveryId: Sn }, required: ["hookId", "deliveryId"] },
    handler: async (a, c) => raw(c, "POST", `/outbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/deliveries/${encodeURIComponent(getStr(a, "deliveryId"))}/replay`),
  },
  {
    name: "list_inbound_webhooks",
    descriptionKey: "mcp.tools.list_inbound_webhooks.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/inbound-webhooks`),
  },
  {
    name: "list_inbound_webhook_presets",
    descriptionKey: "mcp.tools.list_inbound_webhook_presets.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/inbound-webhooks/presets`),
  },
  {
    name: "create_inbound_webhook",
    descriptionKey: "mcp.tools.create_inbound_webhook.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/inbound-webhooks`, getObj(a, "definition")),
  },
  {
    name: "update_inbound_webhook",
    descriptionKey: "mcp.tools.update_inbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn, patch: On }, required: ["hookId", "patch"] },
    handler: async (a, c) => raw(c, "PATCH", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}`, getObj(a, "patch")),
  },
  {
    name: "delete_inbound_webhook",
    descriptionKey: "mcp.tools.delete_inbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "DELETE", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}`),
  },
  {
    name: "rotate_inbound_webhook",
    descriptionKey: "mcp.tools.rotate_inbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "POST", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/rotate`),
  },
  {
    name: "test_inbound_webhook",
    descriptionKey: "mcp.tools.test_inbound_webhook.description",
    inputSchema: { type: "object", properties: { hookId: Sn, payload: On }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "POST", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/test`, getOptObj(a, "payload") ?? {}),
  },
  {
    name: "replay_inbound_webhook_delivery",
    descriptionKey: "mcp.tools.replay_inbound_webhook_delivery.description",
    inputSchema: { type: "object", properties: { hookId: Sn, deliveryId: Sn }, required: ["hookId", "deliveryId"] },
    handler: async (a, c) => raw(c, "POST", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/deliveries/${encodeURIComponent(getStr(a, "deliveryId"))}/replay`),
  },
  {
    name: "get_inbound_webhook_variables",
    descriptionKey: "mcp.tools.get_inbound_webhook_variables.description",
    inputSchema: { type: "object", properties: { hookId: Sn }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "GET", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/variables`),
  },
  {
    name: "get_inbound_webhook_secrets",
    descriptionKey: "mcp.tools.get_inbound_webhook_secrets.description",
    inputSchema: { type: "object", properties: { hookId: Sn }, required: ["hookId"] },
    handler: async (a, c) => raw(c, "GET", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/secrets`),
  },
  {
    name: "set_inbound_webhook_secret",
    descriptionKey: "mcp.tools.set_inbound_webhook_secret.description",
    inputSchema: { type: "object", properties: { hookId: Sn, key: Sn, value: Sn }, required: ["hookId", "key", "value"] },
    handler: async (a, c) => raw(c, "POST", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/secrets`, { key: getStr(a, "key"), value: getStr(a, "value") }),
  },
  {
    name: "delete_inbound_webhook_secret",
    descriptionKey: "mcp.tools.delete_inbound_webhook_secret.description",
    inputSchema: { type: "object", properties: { hookId: Sn, key: Sn }, required: ["hookId", "key"] },
    handler: async (a, c) => raw(c, "DELETE", `/inbound-webhooks/${encodeURIComponent(getStr(a, "hookId"))}/secrets/${encodeURIComponent(getStr(a, "key"))}`),
  },
  {
    name: "wb_list_targets",
    descriptionKey: "mcp.tools.wb_list_targets.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => c.webhooks.listTargets(),
  },
  {
    name: "wb_save_target",
    descriptionKey: "mcp.tools.wb_save_target.description",
    inputSchema: { type: "object", properties: { id: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const id = getOptStr(a, "id");
      const def = getObj(a, "definition");
      return id
        ? raw(c, "PATCH", `/wb/targets/${encodeURIComponent(id)}`, def)
        : raw(c, "POST", `/wb/targets`, def);
    },
  },
  {
    name: "wb_delete_target",
    descriptionKey: "mcp.tools.wb_delete_target.description",
    inputSchema: { type: "object", properties: { id: Sn }, required: ["id"] },
    handler: async (a, c) => raw(c, "DELETE", `/wb/targets/${encodeURIComponent(getStr(a, "id"))}`),
  },
  {
    name: "wb_list_groups",
    descriptionKey: "mcp.tools.wb_list_groups.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => c.webhooks.listGroups(),
  },
  {
    name: "wb_save_group",
    descriptionKey: "mcp.tools.wb_save_group.description",
    inputSchema: { type: "object", properties: { id: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const id = getOptStr(a, "id");
      const def = getObj(a, "definition");
      return id
        ? raw(c, "PATCH", `/wb/groups/${encodeURIComponent(id)}`, def)
        : raw(c, "POST", `/wb/groups`, def);
    },
  },
  {
    name: "wb_delete_group",
    descriptionKey: "mcp.tools.wb_delete_group.description",
    inputSchema: { type: "object", properties: { id: Sn }, required: ["id"] },
    handler: async (a, c) => raw(c, "DELETE", `/wb/groups/${encodeURIComponent(getStr(a, "id"))}`),
  },
  {
    name: "wb_duplicate_group",
    descriptionKey: "mcp.tools.wb_duplicate_group.description",
    inputSchema: { type: "object", properties: { id: Sn }, required: ["id"] },
    handler: async (a, c) => raw(c, "POST", `/wb/groups/${encodeURIComponent(getStr(a, "id"))}/duplicate`),
  },
  {
    name: "wb_list_schedules",
    descriptionKey: "mcp.tools.wb_list_schedules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/wb/schedules`),
  },
  {
    name: "wb_save_schedule",
    descriptionKey: "mcp.tools.wb_save_schedule.description",
    inputSchema: { type: "object", properties: { id: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const id = getOptStr(a, "id");
      const def = getObj(a, "definition");
      return id
        ? raw(c, "PATCH", `/wb/schedules/${encodeURIComponent(id)}`, def)
        : raw(c, "POST", `/wb/schedules`, def);
    },
  },
  {
    name: "wb_delete_schedule",
    descriptionKey: "mcp.tools.wb_delete_schedule.description",
    inputSchema: { type: "object", properties: { id: Sn }, required: ["id"] },
    handler: async (a, c) => raw(c, "DELETE", `/wb/schedules/${encodeURIComponent(getStr(a, "id"))}`),
  },
  {
    name: "wb_send_now",
    descriptionKey: "mcp.tools.wb_send_now.description",
    inputSchema: {
      type: "object",
      properties: {
        targetIds: { type: "array", items: Sn, minItems: 1 },
        embedTemplateName: Sn, content: Sn,
      },
      required: ["targetIds"],
    },
    handler: async (a, c) => {
      const targetIds = getStrArr(a, "targetIds");
      const embedTemplateName = getOptStr(a, "embedTemplateName");
      const content = getOptStr(a, "content");
      return c.webhooks.sendNow({
        targetIds,
        ...(embedTemplateName !== undefined ? { embedTemplateName } : {}),
        ...(content !== undefined ? { content } : {}),
      });
    },
  },
  {
    name: "wb_export",
    descriptionKey: "mcp.tools.wb_export.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/wb/export`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FEEDS — SOCIAL / GITHUB-ACTIVITY / RELAY / INVITE-TRACKER / CONNECTIONS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_social_subscriptions",
    descriptionKey: "mcp.tools.list_social_subscriptions.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/social-tracking`),
  },
  {
    name: "create_social_subscription",
    descriptionKey: "mcp.tools.create_social_subscription.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/social-tracking/subscriptions`, getObj(a, "definition")),
  },
  {
    name: "delete_social_subscription",
    descriptionKey: "mcp.tools.delete_social_subscription.description",
    inputSchema: { type: "object", properties: { subscriptionId: Sn }, required: ["subscriptionId"] },
    handler: async (a, c) => raw(c, "DELETE", `/social-tracking/subscriptions/${encodeURIComponent(getStr(a, "subscriptionId"))}`),
  },
  {
    name: "test_social_subscription",
    descriptionKey: "mcp.tools.test_social_subscription.description",
    inputSchema: { type: "object", properties: { sample: On } },
    handler: async (a, c) => raw(c, "POST", `/social-tracking/test`, getOptObj(a, "sample") ?? {}),
  },
  {
    name: "replay_social_subscription",
    descriptionKey: "mcp.tools.replay_social_subscription.description",
    inputSchema: { type: "object", properties: { subscriptionId: Sn }, required: ["subscriptionId"] },
    handler: async (a, c) => raw(c, "POST", `/social-tracking/subscriptions/${encodeURIComponent(getStr(a, "subscriptionId"))}/replay`),
  },
  {
    name: "reset_social_subscription_cursor",
    descriptionKey: "mcp.tools.reset_social_subscription_cursor.description",
    inputSchema: { type: "object", properties: { subscriptionId: Sn }, required: ["subscriptionId"] },
    handler: async (a, c) => raw(c, "POST", `/social-tracking/subscriptions/${encodeURIComponent(getStr(a, "subscriptionId"))}/reset-cursor`),
  },
  {
    name: "list_invite_tracker",
    descriptionKey: "mcp.tools.list_invite_tracker.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/invite-tracker`),
  },
  {
    name: "save_invite_bonus",
    descriptionKey: "mcp.tools.save_invite_bonus.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/invite-tracker/bonuses`, getObj(a, "definition")),
  },
  {
    name: "save_invite_reward",
    descriptionKey: "mcp.tools.save_invite_reward.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => raw(c, "POST", `/invite-tracker/rewards`, getObj(a, "definition")),
  },
  {
    name: "delete_invite_reward",
    descriptionKey: "mcp.tools.delete_invite_reward.description",
    inputSchema: { type: "object", properties: { roleId: Sn }, required: ["roleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/invite-tracker/rewards/${encodeURIComponent(getStr(a, "roleId"))}`),
  },
  {
    name: "set_invite_label",
    descriptionKey: "mcp.tools.set_invite_label.description",
    inputSchema: { type: "object", properties: { code: Sn, label: Sn }, required: ["code"] },
    handler: async (a, c) => raw(c, "PATCH", `/invite-tracker/labels/${encodeURIComponent(getStr(a, "code"))}`, { label: getOptStr(a, "label") }),
  },
  {
    name: "save_invite_leaderboard",
    descriptionKey: "mcp.tools.save_invite_leaderboard.description",
    inputSchema: { type: "object", properties: { leaderboardId: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const id = getOptStr(a, "leaderboardId");
      const def = getObj(a, "definition");
      return id
        ? raw(c, "PATCH", `/invite-tracker/leaderboards/${encodeURIComponent(id)}`, def)
        : raw(c, "POST", `/invite-tracker/leaderboards`, def);
    },
  },
  {
    name: "block_invite_user",
    descriptionKey: "mcp.tools.block_invite_user.description",
    inputSchema: { type: "object", properties: { userId: Sn, reason: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "POST", `/invite-tracker/blocklist`, { userId: getStr(a, "userId"), reason: getOptStr(a, "reason") }),
  },
  {
    name: "list_my_connections",
    descriptionKey: "mcp.tools.list_my_connections.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/me/connections`),
  },
  {
    name: "list_github_subscriptions",
    descriptionKey: "mcp.tools.list_github_subscriptions.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/me/connections/github/subscriptions`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SETTINGS / MODULES / COMPLIANCE / DISCOVERY / RECIPES / AUDIT / LOGS
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "list_modules",
    descriptionKey: "mcp.tools.list_modules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/modules`),
  },
  {
    name: "get_module_schema",
    descriptionKey: "mcp.tools.get_module_schema.description",
    inputSchema: { type: "object", properties: { moduleKey: Sn }, required: ["moduleKey"] },
    handler: async (a, c) => rawAbs(c, "GET", `/api/modules/${encodeURIComponent(getStr(a, "moduleKey"))}/schema`),
  },
  {
    name: "list_guild_modules",
    descriptionKey: "mcp.tools.list_guild_modules.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}/modules`),
  },
  {
    name: "enable_module",
    descriptionKey: "mcp.tools.enable_module.description",
    inputSchema: { type: "object", properties: { moduleKey: Sn }, required: ["moduleKey"] },
    handler: async (a, c) => rawAbs(c, "PATCH", `/api/guilds/${c.guildId}/modules/${encodeURIComponent(getStr(a, "moduleKey"))}`, { enabled: true }),
  },
  {
    name: "disable_module",
    descriptionKey: "mcp.tools.disable_module.description",
    inputSchema: { type: "object", properties: { moduleKey: Sn }, required: ["moduleKey"] },
    handler: async (a, c) => rawAbs(c, "PATCH", `/api/guilds/${c.guildId}/modules/${encodeURIComponent(getStr(a, "moduleKey"))}`, { enabled: false }),
  },
  {
    name: "get_setting",
    descriptionKey: "mcp.tools.get_setting.description",
    inputSchema: { type: "object", properties: { module: Sn, key: Sn }, required: ["module"] },
    handler: async (a, c) => raw(c, "GET", `/settings${qs({ module: getStr(a, "module"), key: getOptStr(a, "key") })}`),
  },
  {
    name: "set_setting",
    descriptionKey: "mcp.tools.set_setting.description",
    inputSchema: { type: "object", properties: { module: Sn, key: Sn, value: {} }, required: ["module", "key"] },
    handler: async (a, c) => raw(c, "PATCH", `/settings`, { module: getStr(a, "module"), patch: { [getStr(a, "key")]: a["value"] } }),
  },
  {
    name: "get_settings_bulk",
    descriptionKey: "mcp.tools.get_settings_bulk.description",
    inputSchema: { type: "object", properties: { module: Sn }, required: ["module"] },
    handler: async (a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}/settings${qs({ module: getStr(a, "module") })}`),
  },
  {
    name: "set_settings_bulk",
    descriptionKey: "mcp.tools.set_settings_bulk.description",
    inputSchema: { type: "object", properties: { module: Sn, patch: On }, required: ["module", "patch"] },
    handler: async (a, c) => rawAbs(c, "PATCH", `/api/guilds/${c.guildId}/settings`, { module: getStr(a, "module"), patch: getObj(a, "patch") }),
  },
  {
    name: "export_settings",
    descriptionKey: "mcp.tools.export_settings.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/settings/export`),
  },
  {
    name: "import_settings",
    descriptionKey: "mcp.tools.import_settings.description",
    inputSchema: { type: "object", properties: { data: On }, required: ["data"] },
    handler: async (a, c) => raw(c, "POST", `/settings/import`, getObj(a, "data")),
  },
  {
    name: "get_compliance_report",
    descriptionKey: "mcp.tools.get_compliance_report.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/compliance/report`),
  },
  {
    name: "list_compliance_reports",
    descriptionKey: "mcp.tools.list_compliance_reports.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/compliance/reports`),
  },
  {
    name: "list_audit_entries",
    descriptionKey: "mcp.tools.list_audit_entries.description",
    inputSchema: { type: "object", properties: { limit: Nn, cursor: Sn } },
    handler: async (a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}/audit${qs({ limit: getOptNum(a, "limit"), cursor: getOptStr(a, "cursor") })}`),
  },
  {
    name: "get_audit_entry",
    descriptionKey: "mcp.tools.get_audit_entry.description",
    inputSchema: { type: "object", properties: { entryId: Sn }, required: ["entryId"] },
    handler: async (a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}/audit/${encodeURIComponent(getStr(a, "entryId"))}`),
  },
  {
    name: "restore_audit_entry",
    descriptionKey: "mcp.tools.restore_audit_entry.description",
    inputSchema: { type: "object", properties: { entryId: Sn }, required: ["entryId"] },
    handler: async (a, c) => rawAbs(c, "POST", `/api/guilds/${c.guildId}/audit/${encodeURIComponent(getStr(a, "entryId"))}/restore`),
  },
  {
    name: "get_discovery_profile",
    descriptionKey: "mcp.tools.get_discovery_profile.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}/discovery`),
  },
  {
    name: "update_discovery_profile",
    descriptionKey: "mcp.tools.update_discovery_profile.description",
    inputSchema: { type: "object", properties: { patch: On }, required: ["patch"] },
    handler: async (a, c) => rawAbs(c, "PATCH", `/api/guilds/${c.guildId}/discovery`, getObj(a, "patch")),
  },
  {
    name: "create_discovery_profile",
    descriptionKey: "mcp.tools.create_discovery_profile.description",
    inputSchema: { type: "object", properties: { definition: On }, required: ["definition"] },
    handler: async (a, c) => rawAbs(c, "POST", `/api/guilds/${c.guildId}/discovery`, getObj(a, "definition")),
  },
  {
    name: "delete_discovery_profile",
    descriptionKey: "mcp.tools.delete_discovery_profile.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "DELETE", `/api/guilds/${c.guildId}/discovery`),
  },
  {
    name: "list_recipes",
    descriptionKey: "mcp.tools.list_recipes.description",
    inputSchema: { type: "object", properties: {} },
    // expected-by: /api/recipes GET (sister-agent route)
    handler: async (_a, c) => rawAbs(c, "GET", `/api/recipes`),
  },
  {
    name: "install_recipe",
    descriptionKey: "mcp.tools.install_recipe.description",
    inputSchema: { type: "object", properties: { recipeSlug: Sn, overrides: On }, required: ["recipeSlug"] },
    // expected-by: /recipes/install POST
    handler: async (a, c) => raw(c, "POST", `/recipes/install`, {
      slug: getStr(a, "recipeSlug"),
      overrides: getOptObj(a, "overrides") ?? {},
    }),
  },
  {
    name: "list_logs",
    descriptionKey: "mcp.tools.list_logs.description",
    inputSchema: { type: "object", properties: { limit: Nn, kind: Sn } },
    handler: async (a, c) => raw(c, "GET", `/logs${qs({ limit: getOptNum(a, "limit"), kind: getOptStr(a, "kind") })}`),
  },
  {
    name: "export_logs",
    descriptionKey: "mcp.tools.export_logs.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/logs/export`),
  },
  {
    name: "get_workload",
    descriptionKey: "mcp.tools.get_workload.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/workload`),
  },
  {
    name: "get_stats",
    descriptionKey: "mcp.tools.get_stats.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/stats`),
  },
  {
    name: "list_mod_coach_runs",
    descriptionKey: "mcp.tools.list_mod_coach_runs.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/mod-coach/runs${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "run_mod_coach",
    descriptionKey: "mcp.tools.run_mod_coach.description",
    inputSchema: { type: "object", properties: { sample: On } },
    handler: async (a, c) => raw(c, "POST", `/mod-coach/run`, getOptObj(a, "sample") ?? {}),
  },
  {
    name: "ask_mod_coach",
    descriptionKey: "mcp.tools.ask_mod_coach.description",
    inputSchema: { type: "object", properties: { runId: Sn, question: Sn }, required: ["runId", "question"] },
    handler: async (a, c) => raw(c, "POST", `/mod-coach/runs/${encodeURIComponent(getStr(a, "runId"))}/ask`, { question: getStr(a, "question") }),
  },
  {
    name: "apply_mod_coach_recommendation",
    descriptionKey: "mcp.tools.apply_mod_coach_recommendation.description",
    inputSchema: { type: "object", properties: { runId: Sn, recommendationId: Sn }, required: ["runId", "recommendationId"] },
    handler: async (a, c) => raw(c, "POST", `/mod-coach/runs/${encodeURIComponent(getStr(a, "runId"))}/recommendations/${encodeURIComponent(getStr(a, "recommendationId"))}/apply`),
  },
  {
    name: "list_secrets",
    descriptionKey: "mcp.tools.list_secrets.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/secrets/${c.guildId}`),
  },
  {
    name: "set_secret",
    descriptionKey: "mcp.tools.set_secret.description",
    inputSchema: { type: "object", properties: { key: Sn, value: Sn }, required: ["key", "value"] },
    handler: async (a, c) => rawAbs(c, "POST", `/api/secrets/${c.guildId}`, { key: getStr(a, "key"), value: getStr(a, "value") }),
  },
  {
    name: "delete_secret",
    descriptionKey: "mcp.tools.delete_secret.description",
    inputSchema: { type: "object", properties: { key: Sn }, required: ["key"] },
    handler: async (a, c) => rawAbs(c, "DELETE", `/api/secrets/${c.guildId}/${encodeURIComponent(getStr(a, "key"))}`),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COMPATIBILITY / CHANNEL-GAMES / GAMES / MISC
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: "compatibility_summary",
    descriptionKey: "mcp.tools.compatibility_summary.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/compatibility/summary`),
  },
  {
    name: "compatibility_pair",
    descriptionKey: "mcp.tools.compatibility_pair.description",
    inputSchema: { type: "object", properties: { userA: Sn, userB: Sn }, required: ["userA", "userB"] },
    handler: async (a, c) => raw(c, "GET", `/compatibility/pair${qs({ a: getStr(a, "userA"), b: getStr(a, "userB") })}`),
  },
  {
    name: "compatibility_should_meet",
    descriptionKey: "mcp.tools.compatibility_should_meet.description",
    inputSchema: { type: "object", properties: { userId: Sn }, required: ["userId"] },
    handler: async (a, c) => raw(c, "GET", `/compatibility/should-meet${qs({ userId: getStr(a, "userId") })}`),
  },
  {
    name: "compatibility_alerts",
    descriptionKey: "mcp.tools.compatibility_alerts.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/compatibility/alerts${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "compatibility_report",
    descriptionKey: "mcp.tools.compatibility_report.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/compatibility/report`),
  },
  {
    name: "list_channel_games",
    descriptionKey: "mcp.tools.list_channel_games.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/channel-games`),
  },
  {
    name: "save_channel_game",
    descriptionKey: "mcp.tools.save_channel_game.description",
    inputSchema: { type: "object", properties: { ruleId: Sn, definition: On }, required: ["definition"] },
    handler: async (a, c) => {
      const ruleId = getOptStr(a, "ruleId");
      const def = getObj(a, "definition");
      return ruleId
        ? raw(c, "PATCH", `/channel-games/${encodeURIComponent(ruleId)}`, def)
        : raw(c, "POST", `/channel-games`, def);
    },
  },
  {
    name: "delete_channel_game",
    descriptionKey: "mcp.tools.delete_channel_game.description",
    inputSchema: { type: "object", properties: { ruleId: Sn }, required: ["ruleId"] },
    handler: async (a, c) => raw(c, "DELETE", `/channel-games/${encodeURIComponent(getStr(a, "ruleId"))}`),
  },
  {
    name: "channel_games_leaderboard",
    descriptionKey: "mcp.tools.channel_games_leaderboard.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/channel-games/leaderboard`),
  },
  {
    name: "list_games",
    descriptionKey: "mcp.tools.list_games.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => raw(c, "GET", `/games`),
  },
  {
    name: "games_leaderboard",
    descriptionKey: "mcp.tools.games_leaderboard.description",
    inputSchema: { type: "object", properties: { limit: Nn } },
    handler: async (a, c) => raw(c, "GET", `/games/leaderboard${qs({ limit: getOptNum(a, "limit") })}`),
  },
  {
    name: "list_command_policies",
    descriptionKey: "mcp.tools.list_command_policies.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/guilds/${c.guildId}/commands`),
  },
  {
    name: "list_public_tools",
    descriptionKey: "mcp.tools.list_public_tools.description",
    inputSchema: { type: "object", properties: {} },
    handler: async (_a, c) => rawAbs(c, "GET", `/api/public/tools`),
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
