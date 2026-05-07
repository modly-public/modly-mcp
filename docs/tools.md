# Tool reference

Every tool the MCP server exposes, grouped by domain. Each entry shows the full JSON-schema input shape — exactly what the agent sees when deciding whether/how to call it.

> Tool descriptions and field hints are pulled from `src/locales/en.ts`. The handler implementations live in `src/tools.ts`.

## Webhooks & embeds

### `list_webhook_targets`
> List every saved outbound webhook target in the guild.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

### `list_webhook_groups`
> List every saved target group in the guild.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

### `list_embed_templates`
> List every saved embed template in the guild.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

### `save_embed_template`
> Create or overwrite a named embed template.

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Lowercase kebab name, e.g. weekly-update." },
    "json": { "type": "object", "description": "{ content?: string, embeds: APIEmbed[] }" }
  },
  "required": ["name", "json"]
}
```

### `send_webhook`
> Broadcast a saved embed template to one or more named targets, or pass an inline embed.

```json
{
  "type": "object",
  "properties": {
    "targetIds": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "description": "Webhook target IDs from list_webhook_targets."
    },
    "embedTemplateName": { "type": "string", "description": "Saved embed template name to broadcast." },
    "content": { "type": "string", "description": "Optional plain-text prefix." }
  },
  "required": ["targetIds"]
}
```

### `search_webhook_deliveries`
> Search outbound webhook delivery history for a specific hook.

```json
{
  "type": "object",
  "properties": {
    "hookId": { "type": "string", "description": "Outbound webhook ID." },
    "event": { "type": "string", "description": "Webhook event name to filter deliveries by." },
    "status": { "type": "string", "enum": ["success", "failed", "pending"] },
    "limit": { "type": "number" }
  },
  "required": ["hookId"]
}
```

## Moderation & cases

### `list_moderation_cases`
> List recent moderation cases for the guild, optionally filtered by user.

```json
{
  "type": "object",
  "properties": {
    "userId": { "type": "string", "description": "Optional Discord user ID to filter by." },
    "limit": { "type": "number", "description": "Maximum rows to return." }
  }
}
```

### `lookup_member_cases`
> Look up every moderation case for a specific member.

```json
{
  "type": "object",
  "properties": {
    "userId": { "type": "string", "description": "Discord user ID." },
    "limit": { "type": "number" }
  },
  "required": ["userId"]
}
```

### `list_member_notes`
> List moderator notes attached to a member.

```json
{
  "type": "object",
  "properties": {
    "userId": { "type": "string", "description": "Discord user ID." },
    "limit": { "type": "number" }
  },
  "required": ["userId"]
}
```

## Automod & captcha

### `list_automod_rules`
> List every automod rule configured in the guild.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

### `create_automod_rule`
> Create a new automod rule (kind, config, scope, action).

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "Optional human-readable rule name." },
    "kind": { "type": "string", "description": "AutomodKind enum value (see /api/modules schema)." },
    "enabled": { "type": "boolean" },
    "config": { "type": "object", "description": "Kind-specific configuration object." },
    "scope": { "type": "object", "description": "Rule scope (channels, roles, exemptions)." },
    "action": { "type": "object", "description": "Action object: { type, severity, durationMs, ... }." },
    "priority": { "type": "number" }
  },
  "required": ["kind", "config", "scope", "action"]
}
```

### `delete_automod_rule`

```json
{
  "type": "object",
  "properties": { "ruleId": { "type": "string" } },
  "required": ["ruleId"]
}
```

### `get_captcha_analytics`
> Captcha challenge analytics: pass/fail counts and active challenge state.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

## Safety / appeals / forms

### `list_evader_detections`
> List recent ban-evasion detections for the guild.

```json
{
  "type": "object",
  "properties": {
    "userId": { "type": "string" },
    "riskBand": { "type": "string" },
    "unresolved": { "type": "boolean" },
    "limit": { "type": "number" }
  }
}
```

### `list_evader_flags`
> List ban-evasion detection flags, optionally filtered by risk band and resolution status.

```json
{
  "type": "object",
  "properties": {
    "riskBand": { "type": "string", "enum": ["low", "medium", "high"] },
    "unresolved": { "type": "boolean" },
    "limit": { "type": "number" }
  }
}
```

### `resolve_evader_flag`
> Resolve an evader detection (confirmed, false_positive, ignored).

```json
{
  "type": "object",
  "properties": {
    "detectionId": { "type": "string" },
    "resolution": { "type": "string", "enum": ["confirmed", "false_positive", "ignored"] },
    "notes": { "type": "string" }
  },
  "required": ["detectionId", "resolution"]
}
```

### `list_pending_appeals`
> List pending appeals awaiting moderator review.

```json
{
  "type": "object",
  "properties": { "limit": { "type": "number" } }
}
```

### `list_form_submissions`
> List submissions in the forms approval queue, filterable by form and status.

```json
{
  "type": "object",
  "properties": {
    "formId": { "type": "string", "description": "Form ID to filter by." },
    "status": { "type": "string", "enum": ["pending", "approved", "rejected"], "description": "Submission status filter." },
    "limit": { "type": "number" }
  }
}
```

### `decide_form_submission`
> Approve or reject a single form submission, with an optional reason shown to the submitter.

```json
{
  "type": "object",
  "properties": {
    "submissionId": { "type": "string", "description": "Form submission ID." },
    "decision": { "type": "string", "enum": ["approve", "reject"], "description": "Decision: approve or reject." },
    "reason": { "type": "string", "description": "Optional reason shown to the submitter." }
  },
  "required": ["submissionId", "decision"]
}
```

## Custom commands

### `list_custom_commands`
> List every custom command configured in the guild.

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

### `save_custom_command`
> Create or update a custom command (trigger, response mode, body).

```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "description": "Existing command ID to update; omit to create." },
    "name": { "type": "string", "description": "Command trigger string (without leading slash)." },
    "triggerMode": { "type": "string", "description": "How the command is triggered (slash, prefix, both)." },
    "responseMode": { "type": "string", "description": "How the command responds (text, embed, action)." },
    "body": { "type": "object", "description": "Command body — content, embed, action graph." }
  },
  "required": ["name", "triggerMode", "responseMode", "body"]
}
```

### `delete_custom_command`

```json
{
  "type": "object",
  "properties": { "commandId": { "type": "string" } },
  "required": ["commandId"]
}
```

## Engagement / automation / recipes

### `get_leveling_top`
> Get top-N leveling leaderboard for the guild.

```json
{
  "type": "object",
  "properties": {
    "limit": { "type": "number" },
    "scope": { "type": "string", "enum": ["all", "weekly", "monthly"] }
  }
}
```

### `enqueue_scheduled_action`
> Enqueue a one-shot or recurring automation rule (kind + runAt + payload).

```json
{
  "type": "object",
  "properties": {
    "kind": { "type": "string", "description": "Automation kind (e.g. unban_user, send_reminder)." },
    "runAt": { "type": "string", "description": "ISO-8601 timestamp for one-shot, or cron string for recurring." },
    "payload": { "type": "object" }
  },
  "required": ["kind", "runAt"]
}
```

### `install_recipe`
> Install a public recipe by slug, with optional override fields.

```json
{
  "type": "object",
  "properties": {
    "recipeSlug": { "type": "string", "description": "Public recipe slug from /api/recipes." },
    "overrides": { "type": "object", "description": "Optional override fields (channel/role IDs to substitute in)." }
  },
  "required": ["recipeSlug"]
}
```

---

Last updated: 2026-04-30
