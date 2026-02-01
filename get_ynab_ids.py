#!/usr/bin/env python3
"""
Fetch your YNAB Budget ID, Account IDs, and Category names.
Run this first and copy the IDs into .env and CATEGORY_MAPPING in ynab_import.py.
"""
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import ynab
from ynab.rest import ApiException

ACCESS_TOKEN = os.environ.get("YNAB_ACCESS_TOKEN")
if not ACCESS_TOKEN:
    print("Error: Set YNAB_ACCESS_TOKEN in .env or environment.")
    print("  Copy .env.example to .env and add your Personal Access Token.")
    sys.exit(1)

configuration = ynab.Configuration(access_token=ACCESS_TOKEN)

with ynab.ApiClient(configuration) as api_client:
    budgets_api = ynab.BudgetsApi(api_client)
    try:
        budgets_response = budgets_api.get_budgets()
        budgets = budgets_response.data.budgets
    except ApiException as e:
        print(f"API error: {e}")
        sys.exit(1)

    if not budgets:
        print("No budgets found for this account.")
        sys.exit(0)

    print("=" * 60)
    print("BUDGETS (copy YNAB_BUDGET_ID into .env)")
    print("=" * 60)
    for b in budgets:
        print(f"  Name: {b.name}")
        print(f"  ID:   {b.id}")
        print()

    for budget in budgets:
        budget_id = budget.id
        print("=" * 60)
        print(f"ACCOUNTS for budget: {budget.name}")
        print("(copy YNAB_ACCOUNT_ID into .env for the account you import into)")
        print("=" * 60)
        try:
            budget_detail = budgets_api.get_budget_by_id(budget_id)
            accounts = budget_detail.data.budget.accounts
            for acc in accounts:
                if not acc.deleted:
                    print(f"  Name: {acc.name}")
                    print(f"  ID:   {acc.id}")
                    print()
        except ApiException as e:
            print(f"  Error: {e}")
            continue

        print("=" * 60)
        print(f"CATEGORIES for budget: {budget.name}")
        print("(use these exact names in CATEGORY_MAPPING in ynab_import.py)")
        print("=" * 60)
        try:
            categories_api = ynab.CategoriesApi(api_client)
            cat_response = categories_api.get_categories(budget_id)
            for group in cat_response.data.category_groups:
                if group.hidden or group.deleted:
                    continue
                print(f"  Group: {group.name}")
                for cat in group.categories:
                    if not cat.hidden and not cat.deleted:
                        print(f"    - {cat.name}")
                print()
        except ApiException as e:
            print(f"  Error: {e}")

    print("Done. Fill .env with YNAB_BUDGET_ID and YNAB_ACCOUNT_ID, then run ynab_import.py")
