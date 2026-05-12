"""Safety tests for ynab_import.py live-write guardrails."""
import csv
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import ynab_import


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
        group = SimpleNamespace(categories=[category])
        return SimpleNamespace(data=SimpleNamespace(category_groups=[group]))


class FakeTransactionsApi:
    create_calls = 0

    def __init__(self, _api_client):
        pass

    def get_transactions_by_account(self, *_args, **_kwargs):
        return SimpleNamespace(data=SimpleNamespace(transactions=[]))

    def create_transaction(self, *_args, **_kwargs):
        type(self).create_calls += 1
        return SimpleNamespace(data=SimpleNamespace(transactions=[], duplicate_import_ids=[]))


class TestYnabImportSafety(unittest.TestCase):
    def test_parse_args_defaults_to_dry_run(self):
        args = ynab_import.parse_args([])

        self.assertFalse(args.execute)

    def test_parse_args_execute_enables_live_import(self):
        args = ynab_import.parse_args(["--execute"])

        self.assertTrue(args.execute)

    def test_default_run_does_not_create_transactions(self):
        FakeTransactionsApi.create_calls = 0
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["Date", "Payee", "Memo", "Amount", "Category"])
            writer.writeheader()
            writer.writerow(
                {
                    "Date": "2026-01-02",
                    "Payee": "Amazon.ca",
                    "Memo": "Dry-run test",
                    "Amount": "-12.34",
                    "Category": "Online Shopping",
                }
            )
            csv_path = Path(f.name)

        try:
            with mock.patch.object(ynab_import, "ACCESS_TOKEN", "token"), \
                mock.patch.object(ynab_import, "BUDGET_ID", "budget"), \
                mock.patch.object(ynab_import, "ACCOUNT_ID", "00000000-0000-0000-0000-000000000002"), \
                mock.patch.object(ynab_import, "CSV_FILE", str(csv_path)), \
                mock.patch.object(ynab_import.ynab, "Configuration", return_value=object()), \
                mock.patch.object(ynab_import.ynab, "ApiClient", FakeApiClient), \
                mock.patch.object(ynab_import.ynab, "CategoriesApi", FakeCategoriesApi), \
                mock.patch.object(ynab_import.ynab, "TransactionsApi", FakeTransactionsApi):
                ynab_import.main([])

            self.assertEqual(FakeTransactionsApi.create_calls, 0)
        finally:
            csv_path.unlink()


if __name__ == "__main__":
    unittest.main()
