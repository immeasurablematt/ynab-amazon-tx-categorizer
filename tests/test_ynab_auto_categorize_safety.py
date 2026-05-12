"""Safety tests for ynab_auto_categorize.py live-write guardrails."""
import unittest
from unittest import mock

import ynab_auto_categorize


class TestYnabAutoCategorizeSafety(unittest.TestCase):
    def test_parse_args_defaults_to_dry_run(self):
        args = ynab_auto_categorize.parse_args([])

        self.assertFalse(args.execute)

    def test_parse_args_execute_enables_live_updates(self):
        args = ynab_auto_categorize.parse_args(["--execute"])

        self.assertTrue(args.execute)

    def test_default_run_does_not_bulk_update_transactions(self):
        with mock.patch.object(ynab_auto_categorize, "YNAB_TOKEN", "token"), \
            mock.patch.object(ynab_auto_categorize, "ANTHROPIC_KEY", "anthropic"), \
            mock.patch.object(ynab_auto_categorize, "get_budgets", return_value=[{"id": "budget", "name": "Budget"}]), \
            mock.patch.object(
                ynab_auto_categorize,
                "get_categories",
                return_value=[{"id": "category", "name": "Online Shopping", "group": "Everyday"}],
            ), \
            mock.patch.object(
                ynab_auto_categorize,
                "get_uncategorized_transactions",
                return_value=[{"id": "tx-1", "amount": -12340, "date": "2026-01-01", "payee_name": "Amazon"}],
            ), \
            mock.patch.object(ynab_auto_categorize.anthropic, "Anthropic", return_value=object()), \
            mock.patch.object(
                ynab_auto_categorize,
                "categorize_batch",
                return_value=[
                    {
                        "txn_id": "tx-1",
                        "category_name": "Online Shopping",
                        "confidence": "high",
                        "reason": "test",
                    }
                ],
            ), \
            mock.patch.object(ynab_auto_categorize, "bulk_update_transactions") as bulk_update:
            ynab_auto_categorize.main([])

        bulk_update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
