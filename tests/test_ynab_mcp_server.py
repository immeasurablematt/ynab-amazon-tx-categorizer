"""Unit tests for the repo-local YNAB MCP server helpers."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.ynab_mcp_server import (  # type: ignore[import-not-found]
    load_last_used_plan,
    parse_env_text,
    save_last_used_plan,
    select_budget,
)


class TestParseEnvText(unittest.TestCase):
    def test_parses_export_and_quoted_values(self):
        parsed = parse_env_text(
            """
            # comment
            export YNAB_ACCESS_TOKEN="secret-token"
            YNAB_BUDGET_ID='budget-123'
            PLAIN=value
            """
        )

        self.assertEqual(parsed["YNAB_ACCESS_TOKEN"], "secret-token")
        self.assertEqual(parsed["YNAB_BUDGET_ID"], "budget-123")
        self.assertEqual(parsed["PLAIN"], "value")

    def test_ignores_invalid_lines(self):
        parsed = parse_env_text(
            """
            not valid
            ALSO_NOT_VALID
            GOOD=value
            """
        )

        self.assertEqual(parsed, {"GOOD": "value"})


class TestLastUsedPlanState(unittest.TestCase):
    def test_save_and_load_round_trip(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "last_used_plan.json"
            save_last_used_plan(state_file, {"id": "budget-123", "name": "Budget-ta 2.0"})
            loaded = load_last_used_plan(state_file)

        self.assertEqual(loaded["id"], "budget-123")
        self.assertEqual(loaded["name"], "Budget-ta 2.0")

    def test_missing_state_returns_none(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = Path(tmpdir) / "missing.json"
            self.assertIsNone(load_last_used_plan(state_file))


class TestSelectBudget(unittest.TestCase):
    def setUp(self):
        self.budgets = [
            {"id": "budget-123", "name": "Budget-ta 2.0"},
            {"id": "budget-456", "name": "Business"},
        ]

    def test_last_used_prefers_saved_state(self):
        selected = select_budget("last-used", self.budgets, saved_plan={"id": "budget-123"})
        self.assertEqual(selected["id"], "budget-123")

    def test_last_used_falls_back_to_env_budget_id(self):
        selected = select_budget("last-used", self.budgets, env_budget_id="budget-456")
        self.assertEqual(selected["name"], "Business")

    def test_explicit_name_matches_budget(self):
        selected = select_budget("Budget-ta 2.0", self.budgets)
        self.assertEqual(selected["id"], "budget-123")

    def test_unknown_last_used_raises(self):
        with self.assertRaises(ValueError):
            select_budget("last-used", self.budgets)


if __name__ == "__main__":
    unittest.main()
