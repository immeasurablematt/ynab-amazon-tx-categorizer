# YNAB Automation

Import Amazon order exports into [You Need A Budget (YNAB)](https://ynab.com) with AI-powered categorization and duplicate detection.

- **Web app:** [ynab-automation.vercel.app](https://ynab-automation.vercel.app) — upload CSV, convert or import to YNAB
- **CLI:** Python scripts for local workflow (see [docs/README_YNAB_IMPORT.md](docs/README_YNAB_IMPORT.md))

## Quick start

1. **Setup:** `pip install -r requirements.txt` and copy `.env.example` to `.env`
2. **Get IDs:** `python get_ynab_ids.py` — lists budgets, accounts, categories
3. **Convert:** `python amazon_csv_to_ynab.py ~/Downloads/amazon_export.csv` — AI categorizes, outputs `amazon_ynab_ready.csv`
4. **Preview:** `YNAB_CSV_FILE=amazon_ynab_ready.csv python ynab_import.py` — dry-run only, no YNAB changes
5. **Import:** `YNAB_CSV_FILE=amazon_ynab_ready.csv python ynab_import.py --execute` — imports to YNAB after review (duplicates skipped)

Requires `ANTHROPIC_API_KEY` in `.env` for AI categorization. Use `--no-ai` to skip.

## Project structure

| Path | Purpose |
|------|---------|
| `amazon_csv_to_ynab.py` | Amazon CSV → YNAB-ready CSV (AI categorization) |
| `ynab_import.py` | Import CSV into YNAB |
| `ynab_apply_csv_categories.py` | Match YNAB tx to CSV and preview Uncategorized fixes; `--execute` required for live changes |
| `ynab_cleanup_amazon.py` | Dedupe and verify categories in YNAB; dry-run by default, `--execute` required for live changes |
| `ynab_unassign_hidden_categories.py` | Preview moving hidden-category budget dollars to Ready to Assign; `--execute` required for live changes |
| `ynab_auto_categorize.py` | Preview AI categorization for uncategorized YNAB transactions; `--execute` required for live changes |
| `get_ynab_ids.py` | List budgets/accounts/categories |
| `tools/ynab_mcp_server.py` | Repo-local stdio MCP server for YNAB categorization work |
| `tools/gmail_mcp_server.py` | Repo-local stdio MCP server for read-only Gmail receipt lookup |
| `app/`, `lib/` | Next.js web app (Vercel) |
| `docs/` | Instructions and deployment docs |

## Documentation

- [docs/OPTION_A_INSTRUCTIONS.md](docs/OPTION_A_INSTRUCTIONS.md) — Amazon Chrome extension + normalizer workflow
- [docs/README_YNAB_IMPORT.md](docs/README_YNAB_IMPORT.md) — Import setup and commands
- [docs/README_YNAB_MCP.md](docs/README_YNAB_MCP.md) — Repo-local YNAB MCP server notes
- [docs/README_GMAIL_MCP.md](docs/README_GMAIL_MCP.md) — Repo-local Gmail MCP server notes
- [docs/WEB_DEPLOY.md](docs/WEB_DEPLOY.md) — Vercel deployment

## License

Use as you like.
