# Repo-local YNAB MCP

This repo includes a small stdio MCP server for the YNAB categorization workflow.

## Files

- `tools/ynab_mcp_server.py` — pure Python standard library MCP server
- `tests/test_ynab_mcp_server.py` — unit tests for env parsing and plan resolution

## Scope

The server intentionally exposes only these tools:

- `getCategories(plan_id)`
- `getTransactions(plan_id, type)`
- `updateTransactions(plan_id, transactions)`

It supports `plan_id="last-used"` by saving the last resolved budget id in the repo-local ignored file:

- `.ynab-mcp/last_used_plan.json`

## Credential lookup

The server prefers existing YNAB credential sources already used by this repo:

1. Process environment
2. `.env`
3. `.env.local`
4. `~/.openclaw/.env`
5. `~/.secrets`

It never prints the YNAB API token.

## Tooling boundaries

- Codex auto-loading is configured globally in `~/.codex/config.toml`
- No repo-local Codex MCP config file is added
- No repo-local Claude Code MCP config file is added

That keeps the MCP wiring isolated to Codex without changing how other assistants discover repo config.
