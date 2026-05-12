#!/usr/bin/env python3
"""
Auto-categorize uncategorized YNAB transactions using Claude AI.

Pulls all uncategorized transactions from YNAB, sends each to Claude
for category matching, and applies the category back via the YNAB API.

Usage:
    python ynab_auto_categorize.py                  # Preview all uncategorized
    python ynab_auto_categorize.py --execute        # Apply categories after review
    python ynab_auto_categorize.py --limit 10       # Process only first 10
    python ynab_auto_categorize.py --batch-size 20  # AI batch size (default: 20)

Requires: YNAB_ACCESS_TOKEN, ANTHROPIC_API_KEY in env or .env
"""
import argparse
import json
import logging
import os
import sys
from datetime import datetime

try:
    from dotenv import load_dotenv
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_script_dir, ".env"))
    # Also try the main OpenClaw env
    load_dotenv(os.path.expanduser("~/.openclaw/.env"))
except ImportError:
    pass

import anthropic
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
YNAB_BASE = "https://api.ynab.com/v1"
YNAB_TOKEN = os.environ.get("YNAB_ACCESS_TOKEN")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auto_categorize.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# YNAB helpers
# ---------------------------------------------------------------------------
def ynab_headers() -> dict:
    return {"Authorization": f"Bearer {YNAB_TOKEN}", "Content-Type": "application/json"}


def ynab_get(path: str) -> dict:
    r = httpx.get(f"{YNAB_BASE}{path}", headers=ynab_headers(), timeout=30)
    r.raise_for_status()
    return r.json()["data"]


def ynab_put(path: str, payload: dict) -> dict:
    r = httpx.put(f"{YNAB_BASE}{path}", headers=ynab_headers(), json=payload, timeout=30)
    r.raise_for_status()
    return r.json()["data"]


def ynab_patch(path: str, payload: dict) -> dict:
    r = httpx.patch(f"{YNAB_BASE}{path}", headers=ynab_headers(), json=payload, timeout=30)
    r.raise_for_status()
    return r.json()["data"]


def get_budgets() -> list[dict]:
    return ynab_get("/budgets")["budgets"]


def get_categories(budget_id: str) -> list[dict]:
    """Return flat list of non-hidden, non-deleted categories with group name."""
    data = ynab_get(f"/budgets/{budget_id}/categories")
    cats = []
    for group in data["category_groups"]:
        if group.get("hidden") or group.get("deleted"):
            continue
        group_name = group["name"]
        # Skip internal YNAB groups
        if group_name in ("Internal Master Category", "Credit Card Payments"):
            continue
        for cat in group["categories"]:
            if not cat.get("hidden") and not cat.get("deleted"):
                cats.append({
                    "id": cat["id"],
                    "name": cat["name"],
                    "group": group_name,
                })
    return cats


def get_uncategorized_transactions(budget_id: str) -> list[dict]:
    """Fetch all transactions where category_id is null."""
    data = ynab_get(f"/budgets/{budget_id}/transactions")
    txns = data["transactions"]
    uncategorized = [
        t for t in txns
        if t.get("category_id") is None
        and not t.get("deleted", False)
        # Skip split parent transactions (they have subtransactions)
        and not t.get("subtransactions")
    ]
    return uncategorized


def update_transaction_category(budget_id: str, txn_id: str, category_id: str) -> dict:
    """Update a single transaction's category."""
    payload = {
        "transaction": {
            "category_id": category_id,
        }
    }
    return ynab_put(f"/budgets/{budget_id}/transactions/{txn_id}", payload)


def bulk_update_transactions(budget_id: str, updates: list[dict]) -> dict:
    """Bulk update transactions. Each update needs id and category_id."""
    payload = {
        "transactions": [
            {"id": u["id"], "category_id": u["category_id"]}
            for u in updates
        ]
    }
    return ynab_patch(f"/budgets/{budget_id}/transactions", payload)


# ---------------------------------------------------------------------------
# AI categorization
# ---------------------------------------------------------------------------
def build_category_list(categories: list[dict]) -> str:
    """Format categories for Claude prompt."""
    lines = []
    current_group = None
    for cat in sorted(categories, key=lambda c: (c["group"], c["name"])):
        if cat["group"] != current_group:
            current_group = cat["group"]
            lines.append(f"\n## {current_group}")
        lines.append(f"  - {cat['name']}")
    return "\n".join(lines)


def categorize_batch(
    client: anthropic.Anthropic,
    transactions: list[dict],
    category_text: str,
    categories: list[dict],
) -> list[dict]:
    """Send a batch of transactions to Claude for categorization.

    Returns list of {"txn_id": ..., "category_name": ..., "confidence": ..., "reason": ...}
    """
    cat_name_to_id = {c["name"]: c["id"] for c in categories}

    txn_lines = []
    for i, t in enumerate(transactions):
        amount = t["amount"] / 1000  # milliunits -> dollars
        txn_lines.append(
            f'{i+1}. payee="{t.get("payee_name", "")}" | '
            f'memo="{t.get("memo", "") or ""}" | '
            f'amount=${amount:.2f} | '
            f'date={t["date"]} | '
            f'account="{t.get("account_name", "")}" | '
            f'id={t["id"]}'
        )

    txn_block = "\n".join(txn_lines)

    prompt = f"""You are a personal finance categorization assistant. Categorize each transaction into exactly one of the available YNAB budget categories.

AVAILABLE CATEGORIES:
{category_text}

TRANSACTIONS TO CATEGORIZE:
{txn_block}

For each transaction, respond with a JSON array. Each element must have:
- "txn_id": the transaction id exactly as given
- "category_name": the exact category name from the list above (must match exactly)
- "confidence": "high", "medium", or "low"
- "reason": a brief explanation (10 words max)

Rules:
- Use ONLY category names from the list above. No inventing categories.
- For transfers between accounts, use "Uncategorized" if no transfer category exists.
- For ambiguous transactions, pick the most likely category and mark confidence as "low".
- Negative amounts are outflows (spending). Positive amounts are inflows (income/refunds).
- Pay attention to the payee name — it's the strongest signal.

Respond with ONLY the JSON array, no other text."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
        text = text.strip()

    try:
        results = json.loads(text)
    except json.JSONDecodeError:
        log.error("Failed to parse AI response:\n%s", text[:500])
        return []

    # Validate category names
    validated = []
    for r in results:
        if r.get("category_name") in cat_name_to_id:
            validated.append(r)
        else:
            log.warning(
                "AI returned unknown category '%s' for txn %s — skipping",
                r.get("category_name"),
                r.get("txn_id"),
            )

    return validated


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Auto-categorize uncategorized YNAB transactions")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Preview without applying changes. This is the default.")
    mode.add_argument("--execute", action="store_true", help="Apply category updates in YNAB. Required for live writes.")
    parser.add_argument("--limit", type=int, default=0, help="Max transactions to process (0=all)")
    parser.add_argument("--batch-size", type=int, default=20, help="Transactions per AI call")
    parser.add_argument("--budget", type=str, default="", help="Budget name (default: first budget)")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    if not YNAB_TOKEN:
        log.error("YNAB_ACCESS_TOKEN not set. Add it to .env or environment.")
        sys.exit(1)
    if not ANTHROPIC_KEY:
        log.error("ANTHROPIC_API_KEY not set. Add it to .env or environment.")
        sys.exit(1)

    # 1. Find budget
    log.info("Fetching budgets...")
    budgets = get_budgets()
    if not budgets:
        log.error("No budgets found.")
        sys.exit(1)

    budget = budgets[0]
    if args.budget:
        matches = [b for b in budgets if args.budget.lower() in b["name"].lower()]
        if matches:
            budget = matches[0]
        else:
            log.error("Budget '%s' not found. Available: %s", args.budget, [b["name"] for b in budgets])
            sys.exit(1)

    budget_id = budget["id"]
    log.info("Using budget: %s (%s)", budget["name"], budget_id)

    # 2. Fetch categories
    log.info("Fetching categories...")
    categories = get_categories(budget_id)
    log.info("Found %d categories", len(categories))
    category_text = build_category_list(categories)
    cat_name_to_id = {c["name"]: c["id"] for c in categories}

    # 3. Fetch uncategorized transactions
    log.info("Fetching uncategorized transactions...")
    uncategorized = get_uncategorized_transactions(budget_id)
    log.info("Found %d uncategorized transactions", len(uncategorized))

    if not uncategorized:
        log.info("Nothing to do — all transactions are categorized!")
        return

    if args.limit > 0:
        uncategorized = uncategorized[: args.limit]
        log.info("Limited to %d transactions", len(uncategorized))

    # 4. Categorize in batches
    ai_client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    all_updates = []
    batch_size = args.batch_size

    for i in range(0, len(uncategorized), batch_size):
        batch = uncategorized[i : i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(uncategorized) + batch_size - 1) // batch_size
        log.info("Processing batch %d/%d (%d transactions)...", batch_num, total_batches, len(batch))

        results = categorize_batch(ai_client, batch, category_text, categories)

        for r in results:
            cat_id = cat_name_to_id.get(r["category_name"])
            if cat_id:
                all_updates.append({
                    "id": r["txn_id"],
                    "category_id": cat_id,
                    "category_name": r["category_name"],
                    "confidence": r.get("confidence", "unknown"),
                    "reason": r.get("reason", ""),
                })

    log.info("AI categorized %d/%d transactions", len(all_updates), len(uncategorized))

    # 5. Summary
    by_category = {}
    for u in all_updates:
        by_category.setdefault(u["category_name"], []).append(u)

    log.info("\n--- Categorization Summary ---")
    for cat_name, updates in sorted(by_category.items()):
        log.info("  %s: %d transactions", cat_name, len(updates))

    confidence_counts = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
    for u in all_updates:
        confidence_counts[u.get("confidence", "unknown")] += 1
    log.info("Confidence: high=%d, medium=%d, low=%d", confidence_counts["high"], confidence_counts["medium"], confidence_counts["low"])

    if not args.execute:
        log.info("\n--- DRY RUN — no changes applied ---")
        for u in all_updates:
            log.info(
                "  Would set txn %s -> %s (%s: %s)",
                u["id"][:8],
                u["category_name"],
                u["confidence"],
                u["reason"],
            )
        return

    # 6. Apply via bulk update (batches of 100 to respect API limits)
    log.info("Applying %d category updates...", len(all_updates))
    applied = 0
    api_batch_size = 100  # YNAB bulk update limit

    for i in range(0, len(all_updates), api_batch_size):
        batch = all_updates[i : i + api_batch_size]
        try:
            bulk_update_transactions(budget_id, batch)
            applied += len(batch)
            log.info("  Applied batch %d-%d (%d total)", i + 1, i + len(batch), applied)
        except httpx.HTTPStatusError as e:
            log.error("  API error applying batch: %s %s", e.response.status_code, e.response.text[:200])
            # Fall back to single updates
            log.info("  Falling back to single updates for this batch...")
            for u in batch:
                try:
                    update_transaction_category(budget_id, u["id"], u["category_id"])
                    applied += 1
                except httpx.HTTPStatusError as e2:
                    log.error("    Failed txn %s: %s", u["id"][:8], e2.response.status_code)

    log.info("\nDone! Applied categories to %d/%d transactions.", applied, len(all_updates))

    # 7. Write decision log
    log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auto_categorize_decisions.json")
    decisions = []
    for u in all_updates:
        decisions.append({
            "txn_id": u["id"],
            "category": u["category_name"],
            "confidence": u["confidence"],
            "reason": u["reason"],
            "applied": True,
            "timestamp": datetime.now().isoformat(),
        })

    # Append to existing log if present
    existing = []
    if os.path.exists(log_path):
        try:
            with open(log_path) as f:
                existing = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    with open(log_path, "w") as f:
        json.dump(existing + decisions, f, indent=2)

    log.info("Decision log written to %s", log_path)


if __name__ == "__main__":
    main()
