# YNAB Automation

Import Amazon order exports into [You Need A Budget (YNAB)](https://ynab.com) with categories and duplicate detection.

- **Web app:** [ynab-automation.vercel.app](https://ynab-automation.vercel.app) — upload CSV, convert Amazon export or import to YNAB
- **CLI:** Python scripts for local convert + import (see [README_YNAB_IMPORT.md](README_YNAB_IMPORT.md))

## Quick start (web)

1. Deploy to Vercel or use the live app.
2. Set env vars: `YNAB_ACCESS_TOKEN`, `YNAB_BUDGET_ID`, `YNAB_ACCOUNT_ID`.
3. **Convert:** Upload Amazon Order History Reporter CSV → download YNAB-ready CSV.
4. **Import:** Upload YNAB-ready CSV → transactions go into YNAB (duplicates skipped).

## Repo layout

| Path | Purpose |
|------|--------|
| `app/`, `lib/` | Next.js web app (Vercel) |
| `amazon_csv_to_ynab.py` | CLI: Amazon CSV → YNAB-ready CSV |
| `ynab_import.py` | CLI: import CSV into YNAB |
| `get_ynab_ids.py` | List budgets/accounts/categories for config |
| `WEB_DEPLOY.md` | Vercel + GitHub deploy steps |

## License

Use as you like.
