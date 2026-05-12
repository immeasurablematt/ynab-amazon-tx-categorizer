# YNAB Automation

Import Amazon order exports into YNAB with AI-powered categorization and duplicate detection.

## Status
Deployed on Vercel. Chrome extension scaffolded.

## Components
- **Web app**: ynab-automation.vercel.app — upload CSV, convert or import
- **CLI**: Python scripts for local workflow
- **Safety**: import, cleanup, category-fix, auto-categorize, and hidden-category scripts dry-run by default; use `--execute` only after review
- **AI categorization**: Uses Anthropic API (Claude). `--no-ai` to skip.

## Setup
1. `pip install -r requirements.txt`, copy `.env.example` to `.env`
2. `python get_ynab_ids.py` — list budgets/accounts/categories
3. `python amazon_csv_to_ynab.py <csv>` — AI categorize, output ready CSV
4. `YNAB_CSV_FILE=<csv> python ynab_import.py` — dry-run only, no YNAB changes
5. `YNAB_CSV_FILE=<csv> python ynab_import.py --execute` — import to YNAB after review

## Key: Requires `ANTHROPIC_API_KEY` in `.env`
