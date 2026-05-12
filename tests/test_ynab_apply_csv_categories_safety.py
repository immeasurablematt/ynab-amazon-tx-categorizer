"""Safety tests for ynab_apply_csv_categories.py live-write guardrails."""
import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import ynab_apply_csv_categories


class FakeApiClient:
    def __init__(self, _configuration):
        pass

    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, traceback):
        return False


class FakeCategoriesApi:
    def __init__(self, _api_client):
        pass

    def get_categories(self, _budget_id):
        category = SimpleNamespace(
            name="Online Shopping",
            id="00000000-0000-0000-0000-000000000001",
            deleted=False,
            hidden=False,
        )
        group = SimpleNamespace(deleted=False, hidden=False, categories=[category])
        return SimpleNamespace(data=SimpleNamespace(category_groups=[group]))


class FakeTransactionsApi:
    update_calls = 0

    def __init__(self, _api_client):
        pass

    def get_transactions_by_account(self, *_args, **_kwargs):
        tx = SimpleNamespace(
            id="tx-1",
            account_id="00000000-0000-0000-0000-000000000002",
            amount=-12340,
            date=date(2025, 12, 5),
            deleted=False,
            category_name="Uncategorized",
            memo="Amazon item",
            payee_name="Amazon.ca",
        )
        return SimpleNamespace(data=SimpleNamespace(transactions=[tx]))

    def update_transaction(self, *_args, **_kwargs):
        type(self).update_calls += 1


class TestYnabApplyCsvCategoriesSafety(unittest.TestCase):
    def test_parse_args_defaults_to_dry_run(self):
        args = ynab_apply_csv_categories.parse_args([])

        self.assertFalse(args.execute)

    def test_parse_args_execute_enables_live_updates(self):
        args = ynab_apply_csv_categories.parse_args(["--execute"])

        self.assertTrue(args.execute)

    def test_default_run_does_not_update_transactions(self):
        FakeTransactionsApi.update_calls = 0
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["Date", "Amount", "Category"])
            writer.writeheader()
            writer.writerow(
                {
                    "Date": "2025-12-05",
                    "Amount": "-12.34",
                    "Category": "Online Shopping",
                }
            )
            csv_path = Path(f.name)

        try:
            with mock.patch.object(ynab_apply_csv_categories, "ACCESS_TOKEN", "token"), \
                mock.patch.object(ynab_apply_csv_categories, "BUDGET_ID", "budget"), \
                mock.patch.object(ynab_apply_csv_categories, "ACCOUNT_ID", "account"), \
                mock.patch.object(ynab_apply_csv_categories, "CSV_FILE", str(csv_path)), \
                mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}), \
                mock.patch.object(ynab_apply_csv_categories.ynab, "Configuration", return_value=object()), \
                mock.patch.object(ynab_apply_csv_categories.ynab, "ApiClient", FakeApiClient), \
                mock.patch.object(ynab_apply_csv_categories.ynab, "CategoriesApi", FakeCategoriesApi), \
                mock.patch.object(ynab_apply_csv_categories.ynab, "TransactionsApi", FakeTransactionsApi):
                ynab_apply_csv_categories.main([])

            self.assertEqual(FakeTransactionsApi.update_calls, 0)
        finally:
            csv_path.unlink()


if __name__ == "__main__":
    unittest.main()
