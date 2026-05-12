"""Safety tests for ynab_unassign_hidden_categories.py live-write guardrails."""
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

import ynab_unassign_hidden_categories


class FakeApiClient:
    def __init__(self, _configuration):
        pass

    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, traceback):
        return False


class FakeCategoriesApi:
    update_calls = 0

    def __init__(self, _api_client):
        pass

    def get_categories(self, _budget_id):
        category = SimpleNamespace(
            id="00000000-0000-0000-0000-000000000001",
            name="Old Category",
            deleted=False,
            hidden=True,
        )
        group = SimpleNamespace(name="Hidden Group", deleted=False, hidden=True, categories=[category])
        return SimpleNamespace(data=SimpleNamespace(category_groups=[group]))

    def update_month_category(self, *_args, **_kwargs):
        type(self).update_calls += 1


class FakeMonthsApi:
    def __init__(self, _api_client):
        pass

    def get_budget_months(self, _budget_id):
        month = SimpleNamespace(month=date(2026, 1, 1), deleted=False)
        return SimpleNamespace(data=SimpleNamespace(months=[month]))

    def get_budget_month(self, _budget_id, _month_str):
        category = SimpleNamespace(
            id="00000000-0000-0000-0000-000000000001",
            budgeted=12340,
        )
        month = SimpleNamespace(categories=[category])
        return SimpleNamespace(data=SimpleNamespace(month=month))


class TestYnabUnassignHiddenCategoriesSafety(unittest.TestCase):
    def test_parse_args_defaults_to_dry_run(self):
        args = ynab_unassign_hidden_categories.parse_args([])

        self.assertFalse(args.execute)

    def test_parse_args_execute_enables_live_updates(self):
        args = ynab_unassign_hidden_categories.parse_args(["--execute"])

        self.assertTrue(args.execute)

    def test_default_run_does_not_update_month_categories(self):
        FakeCategoriesApi.update_calls = 0

        with mock.patch.object(ynab_unassign_hidden_categories, "ACCESS_TOKEN", "token"), \
            mock.patch.object(ynab_unassign_hidden_categories, "BUDGET_ID", "budget"), \
            mock.patch.object(ynab_unassign_hidden_categories.ynab, "Configuration", return_value=object()), \
            mock.patch.object(ynab_unassign_hidden_categories.ynab, "ApiClient", FakeApiClient), \
            mock.patch.object(ynab_unassign_hidden_categories.ynab, "CategoriesApi", FakeCategoriesApi), \
            mock.patch.object(ynab_unassign_hidden_categories.ynab, "MonthsApi", FakeMonthsApi):
            ynab_unassign_hidden_categories.main([])

        self.assertEqual(FakeCategoriesApi.update_calls, 0)


if __name__ == "__main__":
    unittest.main()
