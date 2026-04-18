# Repo-local Gmail MCP

This repo now includes a small stdio MCP server for read-only Gmail access aimed at Amazon receipt lookup workflows.

## Files

- `tools/gmail_mcp_server.py` — pure Python standard library MCP server plus explicit OAuth bootstrap command
- `tests/test_gmail_mcp_server.py` — unit tests for credential parsing, read-only tool surface, and MIME parsing that omits attachments

## Scope

The server intentionally exposes only these tools:

- `searchMessages(query, max_results)`
- `readMessage(message_id)`

It does not expose send, delete, modify, label, attachment download, or any other write-capable Gmail operation.

## OAuth storage

OAuth material lives outside the repo in:

- `~/.codex/gmail-readonly-mcp/client_credentials.json`
- `~/.codex/gmail-readonly-mcp/oauth_token.json`

The server never prints client secrets, access tokens, or refresh tokens.

## Gmail scope

The OAuth flow is restricted to one scope only:

- `https://www.googleapis.com/auth/gmail.readonly`

## Auth flow

The MCP server does not authenticate during startup. `initialize` and `tools/list` work without Gmail auth.

Actual OAuth setup is a separate explicit command:

```bash
python3 tools/gmail_mcp_server.py oauth-init
```

That command is intentionally out-of-band so Codex sessions do not open browser-based Gmail auth unless you explicitly choose to do it.
