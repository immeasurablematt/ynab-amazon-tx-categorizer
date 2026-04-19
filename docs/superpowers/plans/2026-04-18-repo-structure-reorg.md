# Repo Structure Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the repository into the approved multi-surface monorepo layout without breaking existing Python workflows, while creating clear homes for shared logic, MCP tools, and future Wealthsimple plus `n8n` integration work.

**Architecture:** Convert the repo in stages. First add guardrails and scaffolding, then move Python logic into a canonical package with compatibility wrappers, then extract shared TypeScript logic into a workspace package and relocate the web app and extension onto that shared layer, then isolate MCP tooling, docs, and integration assets. Preserve behavior with wrappers and smoke tests before removing any old paths.

**Tech Stack:** Python 3.9+, setuptools/pyproject packaging, argparse, Next.js 15, React 18, TypeScript 5, npm workspaces, webpack, node:test, pytest/unittest.

---

## Preflight Notes

- The current worktree is not clean. At plan-writing time the dirty paths were:
  - `docs/README_YNAB_IMPORT.md`
  - `docs/MBNA_QFX_IMPORT_WORKFLOW.md`
- Do not revert or overwrite those changes. If they still exist during implementation, move them with their current content.
- After Task 4, Tasks 6, 7, and 8 are safe candidates for swarm execution because they have mostly disjoint write sets:
  - Worker A: `apps/web/*`
  - Worker B: `apps/extension/*`
  - Worker C: `tools/mcp/*`, `docs/*`, `integrations/n8n/*`

## File Structure Lock-In

### Create

- `AGENTS.md`
- `pyproject.toml`
- `packages/python/ynab_automation/__init__.py`
- `packages/python/ynab_automation/cli.py`
- `packages/python/ynab_automation/amazon/__init__.py`
- `packages/python/ynab_automation/amazon/csv_to_ynab.py`
- `packages/python/ynab_automation/amazon/reports_to_ynab.py`
- `packages/python/ynab_automation/amazon/credit_card_match.py`
- `packages/python/ynab_automation/amazon/qfx_extract.py`
- `packages/python/ynab_automation/ynab/__init__.py`
- `packages/python/ynab_automation/ynab/get_ids.py`
- `packages/python/ynab_automation/ynab/import_transactions.py`
- `packages/python/ynab_automation/ynab/apply_csv_categories.py`
- `packages/python/ynab_automation/ynab/auto_categorize.py`
- `packages/python/ynab_automation/ynab/cleanup_amazon.py`
- `packages/python/ynab_automation/ynab/hidden_category_transactions.py`
- `packages/python/ynab_automation/ynab/unassign_hidden_categories.py`
- `packages/python/ynab_automation/wealthsimple/__init__.py`
- `packages/python/ynab_automation/wealthsimple/client.py`
- `packages/python/ynab_automation/wealthsimple/balances.py`
- `packages/python/ynab_automation/wealthsimple/sync_to_ynab.py`
- `packages/python/ynab_automation/wealthsimple/models.py`
- `packages/ts-core/package.json`
- `packages/ts-core/tsconfig.json`
- `packages/ts-core/src/index.ts`
- `packages/ts-core/src/amazon/normalize.ts`
- `packages/ts-core/src/amazon/index.ts`
- `tests/python/test_repo_scaffold.py`
- `tests/python/test_python_package_scaffold.py`
- `tests/python/test_amazon_wrapper_modules.py`
- `tests/python/test_ynab_wrapper_modules.py`
- `tests/python/test_tool_and_integration_layout.py`
- `tests/ts-core/normalize.test.mjs`
- `tools/mcp/__init__.py`
- `integrations/n8n/README.md`
- `integrations/n8n/config/wealthsimple_to_ynab_account_map.example.json`
- `integrations/n8n/workflows/wealthsimple_to_ynab_balance_sync.json`
- `docs/architecture/`
- `docs/guides/`
- `docs/operations/`

### Move

- `app/` -> `apps/web/app/`
- `extension/` -> `apps/extension/`
- `tests/test_amazon_reports_to_ynab.py` -> `tests/python/test_amazon_reports_to_ynab.py`
- `tests/test_ynab_mcp_server.py` -> `tests/python/test_ynab_mcp_server.py`
- `tests/test_gmail_mcp_server.py` -> `tests/python/test_gmail_mcp_server.py`
- `tools/gmail_mcp_server.py` -> `tools/mcp/gmail_mcp_server.py`
- `tools/ynab_mcp_server.py` -> `tools/mcp/ynab_mcp_server.py`
- `docs/CHROME_EXTENSION_PLAN.md` -> `docs/architecture/chrome-extension-plan.md`
- `docs/FORM_FACTOR_ANALYSIS.md` -> `docs/architecture/form-factor-analysis.md`
- `docs/OPTION_A_INSTRUCTIONS.md` -> `docs/guides/option-a-instructions.md`
- `docs/README_GMAIL_MCP.md` -> `docs/guides/gmail-mcp.md`
- `docs/README_YNAB_IMPORT.md` -> `docs/guides/ynab-import.md`
- `docs/README_YNAB_MCP.md` -> `docs/guides/ynab-mcp.md`
- `docs/WEB_DEPLOY.md` -> `docs/operations/web-deploy.md`
- `docs/MBNA_QFX_IMPORT_WORKFLOW.md` -> `docs/operations/mbna-qfx-import-workflow.md` if present

### Modify

- `CLAUDE.md`
- `README.md`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `requirements.txt`
- root Python wrappers:
  - `amazon_csv_to_ynab.py`
  - `amazon_reports_to_ynab.py`
  - `get_ynab_ids.py`
  - `match_cc_to_items.py`
  - `qfx_extract_dec.py`
  - `ynab_apply_csv_categories.py`
  - `ynab_auto_categorize.py`
  - `ynab_cleanup_amazon.py`
  - `ynab_import.py`
  - `ynab_list_hidden_category_txs.py`
  - `ynab_unassign_hidden_categories.py`
- `apps/web/app/api/normalize/route.ts`
- `apps/web/app/api/import/route.ts`
- `apps/web/package.json`
- `apps/web/next.config.js`
- `apps/extension/package.json`
- `apps/extension/webpack.config.js`
- `apps/extension/background/service-worker.ts`
- `tests/python/test_amazon_reports_to_ynab.py`
- `tests/python/test_ynab_mcp_server.py`
- `tests/python/test_gmail_mcp_server.py`

### Delete After Verification

- `lib/normalize.ts`
- duplicate normalize/types helpers inside the extension once `packages/ts-core` is wired

## Task 1: Add Guardrails and Monorepo Scaffold

**Files:**
- Create: `tests/python/test_repo_scaffold.py`
- Create: `AGENTS.md`
- Create: `apps/.gitkeep`
- Create: `packages/.gitkeep`
- Create: `scripts/.gitkeep`
- Create: `integrations/.gitkeep`
- Modify: `CLAUDE.md`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing scaffold test**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_monorepo_scaffold_exists():
    required_paths = [
        "AGENTS.md",
        "apps",
        "packages",
        "scripts",
        "integrations",
        "tools",
        "docs",
        "tests/python",
    ]
    missing = [rel for rel in required_paths if not (ROOT / rel).exists()]
    assert not missing, f"Missing scaffold paths: {missing}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/python/test_repo_scaffold.py -v`
Expected: FAIL because `AGENTS.md`, `apps`, `packages`, `scripts`, `integrations`, and `tests/python` do not all exist yet.

- [ ] **Step 3: Write the minimal scaffold implementation**

```markdown
# AGENTS

## Repo Map
- `apps/web`: Next.js web app
- `apps/extension`: Chrome extension
- `packages/python/ynab_automation`: reusable Python automation and integrations
- `packages/ts-core`: shared TypeScript domain logic
- `scripts`: thin compatibility wrappers only
- `tools/mcp`: repo-local MCP servers
- `integrations/n8n`: exported workflow definitions and config examples
- `docs`: architecture, guides, and operations docs
- `archive`: historical recovery scripts

## Rules
1. No new domain code at the repo root.
2. Put reusable logic in `packages/`, not in app-specific files.
3. Keep `scripts/` and root wrappers thin; they may delegate but must not own business logic.
4. Put workflow JSON and integration examples in `integrations/`.
5. Do not commit secrets, PATs, sessions, or live runtime state.
```

```markdown
# YNAB Automation

See `AGENTS.md` for the canonical repository layout and placement rules.
See `README.md` for end-user setup.
```

```json
{
  "name": "ynab-automation-monorepo",
  "private": true,
  "workspaces": [
    "apps/web",
    "apps/extension",
    "packages/ts-core"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "build:web": "npm run build --workspace @ynab-automation/web",
    "build:extension": "npm run build --workspace @ynab-automation/extension",
    "build:ts-core": "npm run build --workspace @ynab-automation/ts-core"
  }
}
```

```gitignore
# Extension build output
apps/extension/build/
```

```bash
mkdir -p apps packages scripts integrations tests/python
touch apps/.gitkeep packages/.gitkeep scripts/.gitkeep integrations/.gitkeep
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/python/test_repo_scaffold.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md package.json .gitignore apps/.gitkeep packages/.gitkeep scripts/.gitkeep integrations/.gitkeep tests/python/test_repo_scaffold.py
git commit -m "chore: add monorepo scaffold and agent guide"
```

## Task 2: Create the Canonical Python Package and CLI

**Files:**
- Create: `tests/python/test_python_package_scaffold.py`
- Create: `pyproject.toml`
- Create: `packages/python/ynab_automation/__init__.py`
- Create: `packages/python/ynab_automation/cli.py`
- Create: `packages/python/ynab_automation/amazon/__init__.py`
- Create: `packages/python/ynab_automation/ynab/__init__.py`
- Create: `packages/python/ynab_automation/wealthsimple/__init__.py`
- Modify: `requirements.txt`

- [ ] **Step 1: Write the failing Python package smoke test**

```python
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "python"))


def test_python_cli_main_is_importable():
    from ynab_automation.cli import main

    assert callable(main)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/python/test_python_package_scaffold.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ynab_automation'`

- [ ] **Step 3: Write the minimal package and CLI scaffold**

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "ynab-automation"
version = "0.1.0"
requires-python = ">=3.9"
dependencies = [
  "anthropic>=0.40.0",
  "python-dotenv>=1.0.0",
  "ynab>=1.0.0",
]

[project.scripts]
ynab-automation = "ynab_automation.cli:main"

[tool.setuptools]
package-dir = {"" = "packages/python"}

[tool.setuptools.packages.find]
where = ["packages/python"]
```

```python
__all__ = ["cli"]
```

```python
import argparse


def main(argv=None):
    parser = argparse.ArgumentParser(prog="ynab-automation")
    root = parser.add_subparsers(dest="domain", required=True)

    amazon = root.add_parser("amazon")
    amazon_sub = amazon.add_subparsers(dest="command", required=True)
    amazon_sub.add_parser("csv-to-ynab")
    amazon_sub.add_parser("reports-to-ynab")

    ynab = root.add_parser("ynab")
    ynab_sub = ynab.add_subparsers(dest="command", required=True)
    ynab_sub.add_parser("import")
    ynab_sub.add_parser("get-ids")

    wealthsimple = root.add_parser("wealthsimple")
    wealthsimple_sub = wealthsimple.add_subparsers(dest="command", required=True)
    wealthsimple_sub.add_parser("fetch-balances")
    wealthsimple_sub.add_parser("sync-balances")

    parser.parse_args(argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

```text
-e .
```

```bash
mkdir -p packages/python/ynab_automation/amazon packages/python/ynab_automation/ynab packages/python/ynab_automation/wealthsimple
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/python/test_python_package_scaffold.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml requirements.txt packages/python/ynab_automation tests/python/test_python_package_scaffold.py
git commit -m "chore: scaffold python package and canonical cli"
```

## Task 3: Move Amazon Python Logic Into the Package and Add Compatibility Wrappers

**Files:**
- Create: `tests/python/test_amazon_wrapper_modules.py`
- Move/Create: `packages/python/ynab_automation/amazon/csv_to_ynab.py`
- Move/Create: `packages/python/ynab_automation/amazon/reports_to_ynab.py`
- Move/Create: `packages/python/ynab_automation/amazon/credit_card_match.py`
- Move/Create: `packages/python/ynab_automation/amazon/qfx_extract.py`
- Move: `tests/test_amazon_reports_to_ynab.py` -> `tests/python/test_amazon_reports_to_ynab.py`
- Modify: `amazon_csv_to_ynab.py`
- Modify: `amazon_reports_to_ynab.py`
- Modify: `match_cc_to_items.py`
- Modify: `qfx_extract_dec.py`
- Modify: `tests/python/test_amazon_reports_to_ynab.py`

- [ ] **Step 1: Write the failing Amazon package-wrapper tests**

```python
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "python"))


def test_reports_module_exports_main():
    from ynab_automation.amazon import reports_to_ynab

    assert callable(reports_to_ynab.main)


def test_root_wrapper_delegates_to_package_module():
    wrapper = (ROOT / "amazon_reports_to_ynab.py").read_text(encoding="utf-8")
    assert "ynab_automation.amazon.reports_to_ynab" in wrapper
```

Update the moved unit test import header to:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "packages" / "python"))

from ynab_automation.amazon.reports_to_ynab import (
    _is_valid_amount,
    _parse_amount,
    _parse_date,
    allocate_amounts,
    load_transactions_csv,
    load_items_csv,
    enrich_transactions,
    categorize_rule_based,
)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/python/test_amazon_wrapper_modules.py tests/python/test_amazon_reports_to_ynab.py -v`
Expected: FAIL because the package module does not exist yet and the wrapper does not delegate.

- [ ] **Step 3: Move implementation and write wrappers**

```bash
git mv tests/test_amazon_reports_to_ynab.py tests/python/test_amazon_reports_to_ynab.py
cp amazon_csv_to_ynab.py packages/python/ynab_automation/amazon/csv_to_ynab.py
cp amazon_reports_to_ynab.py packages/python/ynab_automation/amazon/reports_to_ynab.py
cp match_cc_to_items.py packages/python/ynab_automation/amazon/credit_card_match.py
cp qfx_extract_dec.py packages/python/ynab_automation/amazon/qfx_extract.py
```

Replace each root script with a thin wrapper using this exact pattern:

```python
#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "packages" / "python"))

from ynab_automation.amazon.reports_to_ynab import main


if __name__ == "__main__":
    raise SystemExit(main())
```

Use the same wrapper shape for:

- `amazon_csv_to_ynab.py` -> `ynab_automation.amazon.csv_to_ynab`
- `amazon_reports_to_ynab.py` -> `ynab_automation.amazon.reports_to_ynab`
- `match_cc_to_items.py` -> `ynab_automation.amazon.credit_card_match`
- `qfx_extract_dec.py` -> `ynab_automation.amazon.qfx_extract`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/python/test_amazon_wrapper_modules.py tests/python/test_amazon_reports_to_ynab.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add amazon_csv_to_ynab.py amazon_reports_to_ynab.py match_cc_to_items.py qfx_extract_dec.py packages/python/ynab_automation/amazon tests/python/test_amazon_wrapper_modules.py tests/python/test_amazon_reports_to_ynab.py
git commit -m "refactor: move amazon python logic into package"
```

## Task 4: Move YNAB Python Logic Into the Package and Extend the CLI

**Files:**
- Create: `tests/python/test_ynab_wrapper_modules.py`
- Create/Move: `packages/python/ynab_automation/ynab/get_ids.py`
- Create/Move: `packages/python/ynab_automation/ynab/import_transactions.py`
- Create/Move: `packages/python/ynab_automation/ynab/apply_csv_categories.py`
- Create/Move: `packages/python/ynab_automation/ynab/auto_categorize.py`
- Create/Move: `packages/python/ynab_automation/ynab/cleanup_amazon.py`
- Create/Move: `packages/python/ynab_automation/ynab/hidden_category_transactions.py`
- Create/Move: `packages/python/ynab_automation/ynab/unassign_hidden_categories.py`
- Modify: `get_ynab_ids.py`
- Modify: `ynab_import.py`
- Modify: `ynab_apply_csv_categories.py`
- Modify: `ynab_auto_categorize.py`
- Modify: `ynab_cleanup_amazon.py`
- Modify: `ynab_list_hidden_category_txs.py`
- Modify: `ynab_unassign_hidden_categories.py`
- Modify: `packages/python/ynab_automation/cli.py`

- [ ] **Step 1: Write the failing YNAB package-wrapper tests**

```python
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "python"))


def test_ynab_import_module_exports_main():
    from ynab_automation.ynab import import_transactions

    assert callable(import_transactions.main)


def test_root_import_wrapper_delegates_to_package_module():
    wrapper = (ROOT / "ynab_import.py").read_text(encoding="utf-8")
    assert "ynab_automation.ynab.import_transactions" in wrapper
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/python/test_ynab_wrapper_modules.py -v`
Expected: FAIL because the package modules do not exist yet.

- [ ] **Step 3: Move implementation files and wire CLI dispatch**

```bash
cp get_ynab_ids.py packages/python/ynab_automation/ynab/get_ids.py
cp ynab_import.py packages/python/ynab_automation/ynab/import_transactions.py
cp ynab_apply_csv_categories.py packages/python/ynab_automation/ynab/apply_csv_categories.py
cp ynab_auto_categorize.py packages/python/ynab_automation/ynab/auto_categorize.py
cp ynab_cleanup_amazon.py packages/python/ynab_automation/ynab/cleanup_amazon.py
cp ynab_list_hidden_category_txs.py packages/python/ynab_automation/ynab/hidden_category_transactions.py
cp ynab_unassign_hidden_categories.py packages/python/ynab_automation/ynab/unassign_hidden_categories.py
```

Update `packages/python/ynab_automation/cli.py` to dispatch real subcommands:

```python
from ynab_automation.amazon.csv_to_ynab import main as amazon_csv_to_ynab_main
from ynab_automation.amazon.reports_to_ynab import main as amazon_reports_to_ynab_main
from ynab_automation.ynab.get_ids import main as ynab_get_ids_main
from ynab_automation.ynab.import_transactions import main as ynab_import_main


COMMANDS = {
    ("amazon", "csv-to-ynab"): amazon_csv_to_ynab_main,
    ("amazon", "reports-to-ynab"): amazon_reports_to_ynab_main,
    ("ynab", "get-ids"): ynab_get_ids_main,
    ("ynab", "import"): ynab_import_main,
}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="ynab-automation")
    root = parser.add_subparsers(dest="domain", required=True)
    amazon = root.add_parser("amazon")
    amazon_sub = amazon.add_subparsers(dest="command", required=True)
    amazon_sub.add_parser("csv-to-ynab")
    amazon_sub.add_parser("reports-to-ynab")
    ynab = root.add_parser("ynab")
    ynab_sub = ynab.add_subparsers(dest="command", required=True)
    ynab_sub.add_parser("get-ids")
    ynab_sub.add_parser("import")
    args, passthrough = parser.parse_known_args(argv)
    return COMMANDS[(args.domain, args.command)](passthrough)
```

Use the same wrapper pattern from Task 3 to replace each YNAB root script with a package delegate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/python/test_ynab_wrapper_modules.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add get_ynab_ids.py ynab_import.py ynab_apply_csv_categories.py ynab_auto_categorize.py ynab_cleanup_amazon.py ynab_list_hidden_category_txs.py ynab_unassign_hidden_categories.py packages/python/ynab_automation/ynab packages/python/ynab_automation/cli.py tests/python/test_ynab_wrapper_modules.py
git commit -m "refactor: move ynab python logic into package"
```

## Task 5: Extract Shared TypeScript Domain Logic Into `packages/ts-core`

**Files:**
- Create: `tests/ts-core/normalize.test.mjs`
- Create: `packages/ts-core/package.json`
- Create: `packages/ts-core/tsconfig.json`
- Create: `packages/ts-core/src/index.ts`
- Create: `packages/ts-core/src/amazon/index.ts`
- Create: `packages/ts-core/src/amazon/normalize.ts`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing shared TypeScript smoke test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAmazonCsv, ynabReadyToJson } from "../../packages/ts-core/dist/amazon/normalize.js";

test("normalizeAmazonCsv converts Amazon exports into YNAB-ready rows", () => {
  const csv = "order date,order total,item title,order id\n2025-01-15,12.34,USB Cable,123-1234567-1234567\n";
  const rows = normalizeAmazonCsv(csv, "Amazon.ca");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Date, "2025-01-15");
  assert.equal(rows[0].Amount, -12.34);
  assert.equal(rows[0].OrderId, "123-1234567-1234567");
});

test("ynabReadyToJson preserves normalized csv rows", () => {
  const csv = "Date,Payee,Memo,Amount,Category,OrderId\n2025-01-15,Amazon.ca,USB Cable,-12.34,Uncategorized,123-1234567-1234567\n";
  const rows = ynabReadyToJson(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Memo, "USB Cable");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ts-core/normalize.test.mjs`
Expected: FAIL because `packages/ts-core/dist/amazon/normalize.js` does not exist.

- [ ] **Step 3: Create the package and move the shared normalize logic**

```json
{
  "name": "@ynab-automation/ts-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./amazon": "./dist/amazon/index.js",
    "./amazon/normalize": "./dist/amazon/normalize.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "csv-parse": "^5.5.6"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

```typescript
export * from "./amazon/index.js";
```

```typescript
export * from "./normalize.js";
```

Copy the shared implementation from the current web `lib/normalize.ts` into:

```bash
mkdir -p packages/ts-core/src/amazon
cp lib/normalize.ts packages/ts-core/src/amazon/normalize.ts
```

Ensure the copied file continues to export exactly these symbols:

```typescript
export interface CsvRow {
  Date: string;
  Payee: string;
  Memo: string;
  Amount: number;
  Category: string;
  OrderId?: string;
}

export function normalizeAmazonCsv(csvText: string, noCategory?: boolean): CsvRow[];
export function ynabReadyToJson(csvText: string): CsvRow[];
export function dedupeYnabReadyRows(rows: CsvRow[]): CsvRow[];
```

Then install workspace metadata:

```bash
npm install
npm run build:ts-core
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
- `npm run build:ts-core`
- `node --test tests/ts-core/normalize.test.mjs`

Expected:
- TypeScript build succeeds
- Both `node:test` cases PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ts-core package.json package-lock.json tests/ts-core/normalize.test.mjs
git commit -m "refactor: add shared ts-core package"
```

## Task 6: Move the Next.js App Into `apps/web`

**Files:**
- Create: `tests/python/test_web_workspace_layout.py`
- Move: `app/` -> `apps/web/app/`
- Move: `next.config.js` -> `apps/web/next.config.js`
- Move: `next-env.d.ts` -> `apps/web/next-env.d.ts`
- Move: `tsconfig.json` -> `apps/web/tsconfig.json`
- Move/Replace: root `package.json` content into `apps/web/package.json`
- Modify: `apps/web/app/api/normalize/route.ts`
- Modify: `apps/web/app/api/import/route.ts`
- Modify: `apps/web/next.config.js`
- Modify: `README.md`

- [ ] **Step 1: Write the failing web-layout test**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_web_app_lives_under_apps_web():
    assert (ROOT / "apps" / "web" / "app" / "page.tsx").exists()
    assert (ROOT / "apps" / "web" / "package.json").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/python/test_web_workspace_layout.py -v`
Expected: FAIL because `apps/web` does not exist yet.

- [ ] **Step 3: Move the app and wire it to `@ynab-automation/ts-core`**

```bash
mkdir -p apps/web
git mv app apps/web/app
git mv next.config.js apps/web/next.config.js
git mv next-env.d.ts apps/web/next-env.d.ts
git mv tsconfig.json apps/web/tsconfig.json
```

Create `apps/web/package.json` from the current web manifest:

```json
{
  "name": "@ynab-automation/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@vercel/analytics": "^1.4.1",
    "@ynab-automation/ts-core": "workspace:*",
    "next": "^15.0.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "ynab": "^2.10.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5"
  }
}
```

Update imports in the web routes:

```typescript
import { normalizeAmazonCsv } from "@ynab-automation/ts-core/amazon/normalize";
```

```typescript
import { ynabReadyToJson, dedupeYnabReadyRows } from "@ynab-automation/ts-core/amazon/normalize";
```

Update `apps/web/next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ynab-automation/ts-core"],
};

module.exports = nextConfig;
```

- [ ] **Step 4: Run verification**

Run:
- `pytest tests/python/test_web_workspace_layout.py -v`
- `npm run build:web`

Expected:
- layout test PASS
- Next.js build succeeds from `apps/web`

- [ ] **Step 5: Commit**

```bash
git add apps/web README.md tests/python/test_web_workspace_layout.py
git commit -m "refactor: move next app into apps web workspace"
```

## Task 7: Move the Chrome Extension Into `apps/extension`

**Files:**
- Create: `tests/python/test_extension_workspace_layout.py`
- Move: `extension/` -> `apps/extension/`
- Modify: `apps/extension/package.json`
- Modify: `apps/extension/webpack.config.js`
- Modify: `apps/extension/background/service-worker.ts`
- Modify: `apps/extension/lib/categorize.ts`
- Modify: `apps/extension/lib/normalize.ts` or remove after import rewiring
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing extension-layout test**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_extension_lives_under_apps_extension():
    assert (ROOT / "apps" / "extension" / "manifest.json").exists()
    assert (ROOT / "apps" / "extension" / "package.json").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/python/test_extension_workspace_layout.py -v`
Expected: FAIL because `apps/extension` does not exist yet.

- [ ] **Step 3: Move the extension and point it at shared core**

```bash
mkdir -p apps
git mv extension apps/extension
```

Update `apps/extension/package.json`:

```json
{
  "name": "@ynab-automation/extension",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "clean": "rm -rf build"
  },
  "dependencies": {
    "@ynab-automation/ts-core": "workspace:*",
    "papaparse": "^5.4.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/papaparse": "^5.3.14",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "copy-webpack-plugin": "^12.0.2",
    "css-loader": "^7.1.2",
    "html-webpack-plugin": "^5.6.0",
    "mini-css-extract-plugin": "^2.9.0",
    "style-loader": "^4.0.0",
    "ts-loader": "^9.5.1",
    "typescript": "^5.5.0",
    "webpack": "^5.93.0",
    "webpack-cli": "^5.1.4"
  }
}
```

Update `apps/extension/webpack.config.js` aliases:

```javascript
alias: {
  "@lib": path.resolve(__dirname, "lib"),
  "@core": path.resolve(__dirname, "../../packages/ts-core/src"),
},
```

Update extension imports to shared normalize logic:

```typescript
import { normalizeAmazonCsv, ynabReadyToJson, dedupeYnabReadyRows as dedupeRows } from "@core/amazon/normalize";
```

Update `.gitignore` if needed to:

```gitignore
apps/extension/build/
```

- [ ] **Step 4: Run verification**

Run:
- `pytest tests/python/test_extension_workspace_layout.py -v`
- `npm run build:extension`

Expected:
- layout test PASS
- webpack build succeeds under `apps/extension`

- [ ] **Step 5: Commit**

```bash
git add apps/extension .gitignore tests/python/test_extension_workspace_layout.py
git commit -m "refactor: move browser extension into apps extension workspace"
```

## Task 8: Move MCP Tools, Reorganize Docs, and Add `n8n` Plus Wealthsimple Integration Scaffolding

**Files:**
- Create: `tests/python/test_tool_and_integration_layout.py`
- Create: `tools/mcp/__init__.py`
- Move: `tools/gmail_mcp_server.py` -> `tools/mcp/gmail_mcp_server.py`
- Move: `tools/ynab_mcp_server.py` -> `tools/mcp/ynab_mcp_server.py`
- Move: `tests/test_ynab_mcp_server.py` -> `tests/python/test_ynab_mcp_server.py`
- Move: `tests/test_gmail_mcp_server.py` -> `tests/python/test_gmail_mcp_server.py`
- Create: `integrations/n8n/README.md`
- Create: `integrations/n8n/config/wealthsimple_to_ynab_account_map.example.json`
- Create: `integrations/n8n/workflows/wealthsimple_to_ynab_balance_sync.json`
- Create: `packages/python/ynab_automation/wealthsimple/client.py`
- Create: `packages/python/ynab_automation/wealthsimple/balances.py`
- Create: `packages/python/ynab_automation/wealthsimple/sync_to_ynab.py`
- Create: `packages/python/ynab_automation/wealthsimple/models.py`
- Move/Modify: docs into `docs/architecture`, `docs/guides`, `docs/operations`
- Modify: `tests/python/test_ynab_mcp_server.py`
- Modify: `tests/python/test_gmail_mcp_server.py`
- Modify: `README.md`

- [ ] **Step 1: Write the failing layout and import tests**

```python
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def test_mcp_tools_and_n8n_layout_exist():
    assert (ROOT / "tools" / "mcp" / "ynab_mcp_server.py").exists()
    assert (ROOT / "tools" / "mcp" / "gmail_mcp_server.py").exists()
    assert (ROOT / "integrations" / "n8n" / "README.md").exists()
    assert (ROOT / "integrations" / "n8n" / "config" / "wealthsimple_to_ynab_account_map.example.json").exists()


def test_wealthsimple_sync_module_is_importable():
    sys.path.insert(0, str(ROOT / "packages" / "python"))
    from ynab_automation.wealthsimple import sync_to_ynab

    assert sync_to_ynab is not None
```

Update the MCP test imports to:

```python
from tools.mcp.ynab_mcp_server import (
    load_last_used_plan,
    parse_env_text,
    save_last_used_plan,
    select_budget,
)
```

```python
from tools.mcp.gmail_mcp_server import (
    GmailMcpError,
    GmailMcpServer,
    extract_client_config,
    extract_message_bodies,
    summarize_message,
)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/python/test_tool_and_integration_layout.py tests/python/test_ynab_mcp_server.py tests/python/test_gmail_mcp_server.py -v`
Expected: FAIL because the new paths and modules do not exist yet.

- [ ] **Step 3: Move tools, add integration scaffolding, and reorganize docs**

```bash
mkdir -p tools/mcp integrations/n8n/workflows integrations/n8n/config docs/architecture docs/guides docs/operations
git mv tools/gmail_mcp_server.py tools/mcp/gmail_mcp_server.py
git mv tools/ynab_mcp_server.py tools/mcp/ynab_mcp_server.py
git mv tests/test_ynab_mcp_server.py tests/python/test_ynab_mcp_server.py
git mv tests/test_gmail_mcp_server.py tests/python/test_gmail_mcp_server.py
git mv docs/CHROME_EXTENSION_PLAN.md docs/architecture/chrome-extension-plan.md
git mv docs/FORM_FACTOR_ANALYSIS.md docs/architecture/form-factor-analysis.md
git mv docs/OPTION_A_INSTRUCTIONS.md docs/guides/option-a-instructions.md
git mv docs/README_GMAIL_MCP.md docs/guides/gmail-mcp.md
git mv docs/README_YNAB_IMPORT.md docs/guides/ynab-import.md
git mv docs/README_YNAB_MCP.md docs/guides/ynab-mcp.md
git mv docs/WEB_DEPLOY.md docs/operations/web-deploy.md
if [ -f docs/MBNA_QFX_IMPORT_WORKFLOW.md ]; then mv docs/MBNA_QFX_IMPORT_WORKFLOW.md docs/operations/mbna-qfx-import-workflow.md; fi
```

Create `integrations/n8n/README.md`:

```markdown
# n8n Integrations

This directory stores source-controlled workflow definitions and non-secret config examples.

- `workflows/`: exported `n8n` workflow JSON
- `config/`: example mapping/config files

Do not commit live credentials, sessions, or runtime database exports here.
```

Create `integrations/n8n/config/wealthsimple_to_ynab_account_map.example.json`:

```json
{
  "ws-tfsa-invest": "ynab-account-uuid-1",
  "ws-cash": "ynab-account-uuid-2",
  "ws-crypto": "ynab-account-uuid-3"
}
```

Create `integrations/n8n/workflows/wealthsimple_to_ynab_balance_sync.json`:

```json
{
  "name": "Wealthsimple to YNAB Balance Sync",
  "nodes": [],
  "connections": {},
  "meta": {
    "status": "scaffold-only",
    "source": "repo-structure-reorg"
  }
}
```

Create minimal Wealthsimple package files:

```python
from dataclasses import dataclass


@dataclass
class WealthsimpleBalance:
    account_id: str
    account_name: str
    balance: float
    currency: str
```

```python
from ynab_automation.wealthsimple.models import WealthsimpleBalance


def fetch_balances():
    return []
```

```python
def sync_balances():
    return {"status": "scaffolded", "updated": 0}
```

Update `README.md` links to the new doc paths and mention `integrations/n8n`.

- [ ] **Step 4: Run verification**

Run: `pytest tests/python/test_tool_and_integration_layout.py tests/python/test_ynab_mcp_server.py tests/python/test_gmail_mcp_server.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/mcp integrations/n8n packages/python/ynab_automation/wealthsimple docs README.md tests/python/test_tool_and_integration_layout.py tests/python/test_ynab_mcp_server.py tests/python/test_gmail_mcp_server.py
git commit -m "chore: isolate mcp tools and add integration scaffolding"
```

## Task 9: Final Verification, Cleanup, and Deferred Follow-Up Capture

**Files:**
- Modify: `README.md`
- Delete: `lib/normalize.ts` after import rewiring is complete
- Modify: any remaining duplicate extension normalize/types files if now unused

- [ ] **Step 1: Write the final failing verification checklist**

Create a local checklist in the PR or session notes:

```text
- python package imports resolve
- root wrapper commands still show help
- ts-core builds
- web app builds from apps/web
- extension builds from apps/extension
- python and MCP tests pass from tests/python
- ts-core smoke test passes
- docs links resolve to moved docs
```

- [ ] **Step 2: Run the full verification suite**

Run:

```bash
pytest tests/python -q
node --test tests/ts-core/normalize.test.mjs
npm run build:ts-core
npm run build:web
npm run build:extension
python amazon_reports_to_ynab.py --help
python ynab_import.py --help
python -m ynab_automation amazon reports-to-ynab --help
python -m ynab_automation ynab import --help
```

Expected:

- all Python tests PASS
- `node:test` PASS
- all three npm builds PASS
- both legacy wrapper commands show argparse help
- canonical package commands show argparse help

- [ ] **Step 3: Remove verified duplicates and update the README summary**

Delete only after successful builds:

```bash
rm -f lib/normalize.ts
```

Then update `README.md` so the top-level structure and entrypoints match the new layout:

```markdown
## Repo layout

- `apps/web` — Next.js app
- `apps/extension` — browser extension
- `packages/python/ynab_automation` — Python automation and integrations
- `packages/ts-core` — shared TypeScript domain logic
- `tools/mcp` — MCP servers
- `integrations/n8n` — exported workflow definitions and config examples
```

- [ ] **Step 4: Run a final status check**

Run: `git status --short`
Expected:
- only intended moved/modified files remain
- no accidental deletion of user-owned dirty docs

- [ ] **Step 5: Commit**

```bash
git add README.md
git add -u
git commit -m "chore: complete repo structure reorganization"
```

## Deferred Follow-Up Work

- Implement real Wealthsimple API access under `packages/python/ynab_automation/wealthsimple/`
- Replace scaffold `n8n` workflow JSON with an actual exported workflow
- Add richer CLI coverage for the remaining YNAB maintenance commands
- Remove legacy root wrappers only after the package-based command surface is stable and documented
