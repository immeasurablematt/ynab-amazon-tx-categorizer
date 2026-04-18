#!/usr/bin/env python3
"""
Unassign dollars from hidden categories to Ready to Assign.
Zeros out the budgeted amount in each hidden category for each month,
freeing those dollars to Ready to Assign.
Uses YNAB_ACCESS_TOKEN, YNAB_BUDGET_ID from .env
"""
import os
import sys

try:
    from dotenv import load_dotenv
    _dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_dir, ".env"))
except ImportError:
    pass

import ynab
from ynab.rest import ApiException
from ynab.models.save_month_category import SaveMonthCategory
from ynab.models.patch_month_category_wrapper import PatchMonthCategoryWrapper

ACCESS_TOKEN = os.environ.get("YNAB_ACCESS_TOKEN")
BUDGET_ID = os.environ.get("YNAB_BUDGET_ID")


def main():
    if not ACCESS_TOKEN or not BUDGET_ID:
        print("Error: Set YNAB_ACCESS_TOKEN and YNAB_BUDGET_ID in .env")
        sys.exit(1)

    configuration = ynab.Configuration(access_token=ACCESS_TOKEN)
    with ynab.ApiClient(configuration) as api_client:
        categories_api = ynab.CategoriesApi(api_client)
        months_api = ynab.MonthsApi(api_client)

        # Build set of hidden category IDs and names
        hidden_category_ids = set()
        category_id_to_name = {}
        try:
            cat_response = categories_api.get_categories(BUDGET_ID)
            for group in cat_response.data.category_groups or []:
                group_hidden = getattr(group, "hidden", False) or getattr(group, "deleted", False)
                for cat in group.categories or []:
                    cat_hidden = getattr(cat, "hidden", False) or getattr(cat, "deleted", False)
                    cat_id = getattr(cat, "id", None)
                    cat_name = getattr(cat, "name", "") or ""
                    if cat_id:
                        category_id_to_name[cat_id] = f"{group.name} › {cat_name}"
                        if group_hidden or cat_hidden:
                            hidden_category_ids.add(cat_id)
        except ApiException as e:
            print(f"Error fetching categories: {e}")
            sys.exit(1)

        if not hidden_category_ids:
            print("No hidden categories found.")
            return

        # Get all budget months
        try:
            months_resp = months_api.get_budget_months(BUDGET_ID)
            months = months_resp.data.months or []
        except ApiException as e:
            print(f"Error fetching months: {e}")
            sys.exit(1)

        total_freed = 0
        updates = []

        for month_summary in months:
            if getattr(month_summary, "deleted", False):
                continue
            month_val = getattr(month_summary, "month", None)
            if not month_val:
                continue
            month_str = month_val.strftime("%Y-%m-01") if hasattr(month_val, "strftime") else (str(month_val)[:7] + "-01")

            try:
                month_detail = months_api.get_budget_month(BUDGET_ID, month_str)
                if not month_detail or not month_detail.data or not month_detail.data.month:
                    continue
                month_data = month_detail.data.month
                cats = getattr(month_data, "categories", None) or []
                for cat in cats:
                    cat_id = getattr(cat, "id", None)
                    if not cat_id or cat_id not in hidden_category_ids:
                        continue
                    budgeted = getattr(cat, "budgeted", 0) or 0
                    if budgeted != 0:
                        updates.append((month_str, cat_id, budgeted, category_id_to_name.get(cat_id, cat_id)))
            except ApiException as e:
                print(f"  Warning: Could not fetch month {month_str}: {e}")

        if not updates:
            print("No budgeted dollars in hidden categories.")
            return

        print(f"Unassigning budgeted dollars from {len(updates)} hidden category/month(s) to Ready to Assign...")
        print("-" * 60)
        updated = 0
        for month_str, cat_id, budgeted, cat_name in updates:
            try:
                categories_api.update_month_category(
                    BUDGET_ID, month_str, cat_id, PatchMonthCategoryWrapper(category=SaveMonthCategory(budgeted=0))
                )
                updated += 1
                amt = budgeted / 1000
                total_freed += budgeted
                print(f"  {month_str}  {cat_name}: ${amt:,.2f} -> Ready to Assign")
            except ApiException as e:
                print(f"  Failed {month_str} {cat_name}: {e}")

        print("-" * 60)
        print(f"\nMoved ${total_freed / 1000:,.2f} to Ready to Assign across {updated} category/month(s).")


if __name__ == "__main__":
    main()
