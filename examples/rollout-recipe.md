# Example: roll out a recipe

You found a recipe in [`modly-recipes`](https://github.com/modly-public/modly-recipes) and want to install it on your server. The agent can do it without you copying JSON around.

---

**You:**
> Install the `community-safe` automod pack on my server.

**Claude:**
> I'll install it. The recipe uses placeholders for channel/role IDs — do you want me to substitute any specific ones, or use the recipe's defaults?

**You:**
> Use defaults, but route `mod-log` to channel `1234567890`.

**Claude:**
*(calls `install_recipe` with `recipeSlug: "automod-packs/community-safe"`, `overrides: { "{channel:mod-log}": "1234567890" }`)*

> Installed `community-safe` (4 rules). Verifying now…

*(calls `list_automod_rules`)*

> All 4 rules are live and enabled:
>
> - Slurs + hate speech (priority 10)
> - Discord invite links (priority 20)
> - Mass mentions (priority 30)
> - Scam links (priority 40)
>
> Mod-log is wired to <#1234567890>. Want me to run a test message through `automod_test` to confirm patterns fire?

**You:**
> Yeah, test "join my server: discord.gg/abc"

*(agent uses the test endpoint, returns matched rule)*

> Caught by **"Discord invite links"** — would `delete + warn (4 pts)`. Looks right.

---

**Why this works**

- `install_recipe` accepts `overrides` so the agent can customize per-server channel/role IDs without forking the recipe.
- A read-back via `list_automod_rules` confirms the install in the same turn.
- The recipe catalog itself ([`modly-recipes`](https://github.com/modly-public/modly-recipes)) is open — agents can suggest recipes by browsing the index.
