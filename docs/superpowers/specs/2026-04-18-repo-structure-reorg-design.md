# Repo Structure Reorganization Design

**Date:** 2026-04-18

**Goal:** Reorganize the repository into a clear multi-surface monorepo so Claude Code and Codex can navigate it reliably, while creating an obvious home for future integrations such as Wealthsimple-to-YNAB balance sync.

## Why This Change

The current repository works, but the root is doing too much at once:

- user-facing apps sit beside one-off scripts
- reusable logic is duplicated across the web app and Chrome extension
- MCP tooling lives beside application code
- future automation work such as `n8n` and Wealthsimple does not have a clear home

That layout increases drift risk and makes agentic work less reliable because the same business rules are implemented in multiple places with weak boundaries.

## Design Goals

1. Reduce top-level clutter and make the repo legible at a glance.
2. Separate product surfaces from shared business logic.
3. Give Python automation, TypeScript shared logic, MCP tooling, and workflow integrations distinct homes.
4. Preserve existing workflows during migration through thin compatibility wrappers.
5. Create an explicit place for Wealthsimple sync and `n8n` workflow assets.
6. Make the repository easier for multiple coding agents to understand without relying on chat context.

## Non-Goals

- Rebuild every workflow into a new framework immediately.
- Force an all-at-once rewrite of the Python scripts into a brand-new CLI before functionality is preserved.
- Store live credentials, session tokens, or deployment state in the repository.

## Recommended Repository Shape

```text
.
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json
├── pyproject.toml
├── apps/
│   ├── web/
│   └── extension/
├── packages/
│   ├── python/
│   │   └── ynab_automation/
│   └── ts-core/
├── scripts/
├── tools/
│   └── mcp/
├── integrations/
│   └── n8n/
├── docs/
│   ├── architecture/
│   ├── guides/
│   └── operations/
├── tests/
│   ├── python/
│   ├── ts-core/
│   └── integration/
└── archive/
```

## Top-Level Responsibilities

### `AGENTS.md`

Canonical repo guide for all coding agents. It should explain:

- the repository map
- where new code belongs
- migration expectations
- what is considered shared logic versus surface-specific code
- how to treat compatibility wrappers

This file becomes the main orientation point for Codex and Claude Code.

### `CLAUDE.md`

Thin Claude-specific shim only. It should point to `AGENTS.md` and avoid duplicating repo structure guidance unless Claude-specific behavior truly differs.

### `apps/`

Contains user-facing product surfaces only.

- `apps/web/` for the Next.js app
- `apps/extension/` for the Chrome extension

Route handlers, popup components, and service workers should orchestrate behavior, not own core domain logic.

### `packages/`

Contains reusable business logic.

#### `packages/python/ynab_automation/`

Canonical Python package for automation and integrations.

Expected subpackages:

- `amazon/` for Amazon import and conversion workflows
- `ynab/` for account/category/import/update logic
- `wealthsimple/` for Wealthsimple access and YNAB balance sync
- `gmail/` for Gmail-assisted workflows
- `shared/` for common parsing, identifiers, models, and utilities

This package should become the real home of the current Python scripts.

#### `packages/ts-core/`

Shared TypeScript domain logic used by both the web app and extension.

Expected subpackages:

- `amazon/`
- `ynab/`
- `shared/`

This package exists primarily to eliminate duplication between:

- `lib/normalize.ts`
- `extension/lib/normalize.ts`
- category resolution logic
- shared row and account types

### `scripts/`

Thin executable entrypoints only.

Examples:

- `scripts/amazon_csv_to_ynab.py`
- `scripts/ynab_import.py`

These wrappers should call package code and preserve familiar commands during migration. They should not contain real business logic.

### `tools/mcp/`

Repo-local MCP servers and operator tooling only.

Examples:

- YNAB MCP server
- Gmail MCP server

These tools are adjacent to the product but are not product surfaces.

### `integrations/n8n/`

Versioned workflow definitions and integration-facing documentation.

Expected contents:

- `workflows/` for exported workflow JSON
- `config/` for example configuration files such as account maps
- `README.md` for setup and deployment notes

This repo should store source-controlled workflow definitions, not live `n8n` runtime state.

### `docs/`

Organized by intent:

- `architecture/` for system design and structure docs
- `guides/` for setup and usage documentation
- `operations/` for runbooks, deployment, and maintenance procedures

### `tests/`

Mirrors the package and integration layout rather than the old root-script layout.

### `archive/`

Keeps recovery scripts and obsolete one-off utilities out of the active code paths while preserving history.

## Product Surface Boundaries

### Web App

Move the current Next.js app into `apps/web/`.

It should consume shared TypeScript logic from `packages/ts-core/` and only keep web-specific code in:

- route handlers
- UI components
- app shell configuration

### Extension

Move the current extension into `apps/extension/`.

It should also depend on `packages/ts-core/` for shared normalization, data shaping, and category resolution rules.

### Python Automation

The current top-level Python files should be migrated into `packages/python/ynab_automation/` by responsibility instead of by historical script name.

The old root-level or `scripts/` entrypoints may remain temporarily as wrappers to avoid breaking habit-based usage.

## Wealthsimple and `n8n`

Wealthsimple is important enough to deserve a first-class home immediately rather than being added as another top-level script.

Recommended Python structure:

```text
packages/python/ynab_automation/wealthsimple/
├── client.py
├── balances.py
├── sync_to_ynab.py
└── models.py
```

Recommended `n8n` structure:

```text
integrations/n8n/
├── workflows/
│   └── wealthsimple_to_ynab_balance_sync.json
├── config/
│   └── wealthsimple_to_ynab_account_map.example.json
└── README.md
```

This keeps orchestration definitions near the code they depend on without mixing source-controlled assets with live automation state.

## Canonical Command Surface

Long term, the repository should expose a package-based Python command surface:

```bash
python -m ynab_automation amazon csv-to-ynab
python -m ynab_automation amazon reports-to-ynab
python -m ynab_automation ynab import
python -m ynab_automation wealthsimple fetch-balances
python -m ynab_automation wealthsimple sync-balances
```

During migration, compatibility wrappers should preserve existing script-style workflows until the package-based commands are proven stable.

## Naming Rules

1. No new domain code at the repo root.
2. No new business logic inside `scripts/`.
3. No provider-specific logic in UI files unless it is strictly presentation or transport glue.
4. Shared rules and models must live in `packages/`, not be copy-pasted across apps.
5. Workflow JSON, account map examples, and integration setup docs belong in `integrations/`.
6. Live secrets, PATs, session tokens, OTP secrets, and local runtime state must stay out of the repo.

## Migration Strategy

The reorganization should be done as a staged migration rather than a big-bang rewrite.

### Stage 1: Structural groundwork

- create the new directory layout
- add `AGENTS.md`
- move docs into clearer buckets
- add `pyproject.toml` for the Python package
- keep existing app behavior intact

### Stage 2: Python consolidation

- move real Python logic into `packages/python/ynab_automation/`
- convert top-level scripts into wrappers
- keep imports and commands working during transition

### Stage 3: TypeScript consolidation

- create `packages/ts-core/`
- migrate shared normalization, category helpers, and types into it
- update both web and extension imports

### Stage 4: Tooling and integration isolation

- move MCP servers under `tools/mcp/`
- add `integrations/n8n/`
- introduce Wealthsimple module and workflow assets

### Stage 5: Cleanup

- remove obsolete duplication
- retire wrappers only after package commands are stable
- move old one-off utilities to `archive/` if they remain useful only for history or recovery

## Risks and Mitigations

### Risk: breaking familiar workflows

Mitigation:

- keep thin wrappers initially
- preserve command names during migration
- document the new canonical commands before removing the old ones

### Risk: cross-app TypeScript breakage

Mitigation:

- migrate shared helpers incrementally
- add tests around normalization and categorization behavior before moving code

### Risk: agent confusion during the transition

Mitigation:

- add `AGENTS.md` first
- document the intended boundaries before moving large file sets
- keep compatibility wrappers explicit and minimal

### Risk: Wealthsimple integration introduces security sprawl

Mitigation:

- store only source-controlled integration definitions in the repo
- keep real credentials and session material in `n8n` credentials or external secret stores

## Success Criteria

The reorganization is successful when:

1. The repository root clearly communicates the system shape.
2. Claude Code and Codex can identify where to place new work without relying on prior chat context.
3. Shared domain logic is no longer duplicated across the web app and extension.
4. Existing workflows still function during migration.
5. Wealthsimple and `n8n` have an obvious, stable home for future work.

## Recommendation

Proceed with the reorganization using a staged migration and compatibility wrappers. This gives the repo a much cleaner long-term architecture without forcing an immediate hard cutover in the workflows you already use.
