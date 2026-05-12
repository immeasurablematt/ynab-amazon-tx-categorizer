"""Safety tests for ynab_cleanup_amazon.py live-write guardrails."""
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

import ynab_cleanup_amazon


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
    delete_calls = 0
    update_calls = 0

    def __init__(self, _api_client):
        pass

    def get_transactions_by_account(self, *_args, **_kwargs):
        tx1 = SimpleNamespace(
            id="tx-1",
            amount=-12340,
            date=date(2025, 12, 5),
            deleted=False,
            category_name="Online Shopping",
            memo="Amazon item",
            payee_name="Amazon.ca",
        )
        tx2 = SimpleNamespace(
            id="tx-2",
            amount=-12340,
            date=date(2025, 12, 5),
            deleted=False,
            category_name="Online Shopping",
            memo="Amazon item duplicate",
            payee_name="Amazon.ca",
        )
        return SimpleNamespace(data=SimpleNamespace(transactions=[tx1, tx2]))

    def delete_transaction(self, *_args, **_kwargs):
        type(self).delete_calls += 1

    def update_transaction(self, *_args, **_kwargs):
        type(self).update_calls += 1


class TestYnabCleanupAmazonSafety(unittest.TestCase):
    def test_parse_args_defaults_to_dry_run(self):
        args = ynab_cleanup_amazon.parse_args([])

        self.assertFalse(args.execute)

    def test_parse_args_execute_enables_live_cleanup(self):
        args = ynab_cleanup_amazon.parse_args(["--execute"])

        self.assertTrue(args.execute)

    def test_default_run_does_not_delete_duplicates(self):
        FakeTransactionsApi.delete_calls = 0
        FakeTransactionsApi.update_calls = 0

        with mock.patch.object(ynab_cleanup_amazon, "ACCESS_TOKEN", "token"), \
            mock.patch.object(ynab_cleanup_amazon, "BUDGET_ID", "budget"), \
            mock.patch.object(ynab_cleanup_amazon, "ACCOUNT_ID", "account"), \
            mock.patch.object(ynab_cleanup_amazon, "ANTHROPIC_API_KEY", None), \
            mock.patch.object(ynab_cleanup_amazon.ynab, "Configuration", return_value=object()), \
            mock.patch.object(ynab_cleanup_amazon.ynab, "ApiClient", FakeApiClient), \
            mock.patch.object(ynab_cleanup_amazon.ynab, "CategoriesApi", FakeCategoriesApi), \
            mock.patch.object(ynab_cleanup_amazon.ynab, "TransactionsApi", FakeTransactionsApi):
            ynab_cleanup_amazon.main([])

        self.assertEqual(FakeTransactionsApi.delete_calls, 0)
        self.assertEqual(FakeTransactionsApi.update_calls, 0)


if __name__ == "__main__":
    unittest.main()
