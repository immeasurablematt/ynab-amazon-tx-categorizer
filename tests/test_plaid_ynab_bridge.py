"""Safety and normalization tests for the local Plaid-to-YNAB bridge."""

import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock

import plaid_ynab_bridge as bridge


class PlaidYnabBridgeTests(unittest.TestCase):
    def test_plaid_outflow_sign_is_reversed_for_ynab(self):
        self.assertEqual(bridge.to_ynab_milliunits(Decimal("12.34")), -12340)

    def test_plaid_refund_sign_is_reversed_for_ynab(self):
        self.assertEqual(bridge.to_ynab_milliunits(Decimal("-5.01")), 5010)

    def test_import_id_is_stable_bounded_and_provider_namespaced(self):
        first = bridge.stable_import_id("transaction-123")
        second = bridge.stable_import_id("transaction-123")
        other = bridge.stable_import_id("transaction-124")

        self.assertEqual(first, second)
        self.assertNotEqual(first, other)
        self.assertTrue(first.startswith("PLAID:"))
        self.assertLessEqual(len(first), 36)

    def test_plan_holds_pending_and_unmapped_rows(self):
        rows = [
            {
                "transaction_id": "posted-1",
                "account_id": "plaid-checking",
                "date": "2026-08-28",
                "amount": 10.25,
                "merchant_name": "Cafe",
                "pending": False,
                "iso_currency_code": "CAD",
            },
            {
                "transaction_id": "pending-1",
                "account_id": "plaid-checking",
                "date": "2026-08-29",
                "amount": 20,
                "name": "Pending merchant",
                "pending": True,
                "iso_currency_code": "CAD",
            },
            {
                "transaction_id": "unmapped-1",
                "account_id": "plaid-other",
                "date": "2026-08-27",
                "amount": 30,
                "name": "Other merchant",
                "pending": False,
                "iso_currency_code": "CAD",
            },
        ]
        mappings = {
            "plaid-checking": {
                "label": "CIBC family chequing",
                "ynab_budget_id": "budget-1",
                "ynab_account_id": "account-1",
                "start_date": "2026-08-01",
            }
        }

        proposed, held = bridge.plan_added_transactions(rows, mappings)

        self.assertEqual(len(proposed), 1)
        self.assertEqual(proposed[0]["amount"], -10250)
        self.assertFalse(proposed[0]["approved"])
        self.assertEqual({row["reason"] for row in held}, {"pending", "unmapped_account"})

    def test_plan_holds_non_cad_rows(self):
        proposed, held = bridge.plan_added_transactions(
            [
                {
                    "transaction_id": "usd-1",
                    "account_id": "plaid-card",
                    "date": "2026-08-28",
                    "amount": 10,
                    "name": "USD merchant",
                    "pending": False,
                    "iso_currency_code": "USD",
                }
            ],
            {
                "plaid-card": {
                    "label": "Canadian card",
                    "ynab_budget_id": "budget-1",
                    "ynab_account_id": "account-1",
                    "currency": "CAD",
                    "start_date": "2026-08-01",
                }
            },
        )

        self.assertEqual(proposed, [])
        self.assertEqual(held[0]["reason"], "currency_mismatch")

    def test_plan_holds_transfer_like_rows_for_separate_ynab_linking(self):
        proposed, held = bridge.plan_added_transactions(
            [
                {
                    "transaction_id": "payment-1",
                    "account_id": "plaid-card",
                    "date": "2026-08-28",
                    "amount": -500,
                    "name": "AUTOMATIC PAYMENT",
                    "pending": False,
                    "iso_currency_code": "CAD",
                    "personal_finance_category": {
                        "primary": "LOAN_PAYMENTS",
                        "detailed": "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
                    },
                }
            ],
            {
                "plaid-card": {
                    "label": "Card",
                    "ynab_budget_id": "budget-1",
                    "ynab_account_id": "account-1",
                    "currency": "CAD",
                    "start_date": "2026-08-01",
                }
            },
        )

        self.assertEqual(proposed, [])
        self.assertEqual(held[0]["reason"], "transfer_or_payment")

    def test_missing_or_pre_cutover_rows_are_held(self):
        row = {
            "transaction_id": "history-1",
            "account_id": "plaid-card",
            "date": "2026-07-31",
            "amount": 10,
            "name": "Historical merchant",
            "pending": False,
            "iso_currency_code": "CAD",
        }
        base_mapping = {
            "label": "Card",
            "ynab_budget_id": "budget-1",
            "ynab_account_id": "account-1",
            "currency": "CAD",
        }

        proposed, held = bridge.plan_added_transactions([row], {"plaid-card": base_mapping})
        self.assertEqual(proposed, [])
        self.assertEqual(held[0]["reason"], "missing_cutoff")

        proposed, held = bridge.plan_added_transactions(
            [row], {"plaid-card": {**base_mapping, "start_date": "2026-08-01"}}
        )
        self.assertEqual(proposed, [])
        self.assertEqual(held[0]["reason"], "before_cutoff")

    def test_proposal_hash_detects_any_change(self):
        proposal = {"schema": bridge.PROPOSAL_SCHEMA, "transactions": [{"id": "one"}]}
        first = bridge.proposal_digest(proposal)
        proposal["transactions"][0]["id"] = "two"
        second = bridge.proposal_digest(proposal)
        self.assertNotEqual(first, second)

    def test_apply_requires_exact_proposal_hash(self):
        with self.assertRaisesRegex(ValueError, "approval hash"):
            bridge.require_exact_approval("expected", "different")

    def test_cursor_state_is_not_written_until_explicit_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "state.json"
            bridge.commit_cursors(state_path, {"item-one": "cursor-1"})
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(state["items"]["item-one"]["cursor"], "cursor-1")

    def test_failed_ynab_readback_does_not_advance_cursor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            proposal_path = root / "proposal.json"
            state_path = root / "state.json"
            proposal = {
                "schema": bridge.PROPOSAL_SCHEMA,
                "environment": "sandbox",
                "transactions": [
                    {
                        "provider_transaction_id": "posted-1",
                        "provider_account_id": "plaid-account",
                        "source_item_id": "item-one",
                        "account_label": "Card",
                        "ynab_budget_id": "budget-1",
                        "account_id": "account-1",
                        "date": "2026-08-28",
                        "amount": -10250,
                        "payee_name": "Cafe",
                        "approved": False,
                        "cleared": "uncleared",
                        "import_id": bridge.stable_import_id("posted-1"),
                    }
                ],
                "held": [],
                "next_cursors": {"item-one": "cursor-1"},
            }
            proposal_path.write_text(json.dumps(proposal), encoding="utf-8")

            def fake_ynab_request(method, _path, _token, _payload=None):
                if method == "POST":
                    return {"data": {"transactions": []}}
                return {"data": {"transactions": []}}

            with (
                mock.patch.object(bridge, "keychain_read", return_value="token"),
                mock.patch.object(bridge, "ynab_request", side_effect=fake_ynab_request),
                self.assertRaisesRegex(RuntimeError, "readback"),
            ):
                bridge.apply_proposal(
                    proposal_path,
                    bridge.proposal_digest(proposal),
                    state_path,
                )

            self.assertFalse(state_path.exists())

    def test_blocking_held_rows_prevent_ynab_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            proposal_path = root / "proposal.json"
            proposal = {
                "schema": bridge.PROPOSAL_SCHEMA,
                "transactions": [],
                "held": [{"reason": "missing_cutoff"}],
                "next_cursors": {"item-one": "cursor-1"},
            }
            proposal_path.write_text(json.dumps(proposal), encoding="utf-8")
            with (
                mock.patch.object(bridge, "ynab_request") as request,
                self.assertRaisesRegex(ValueError, "blocking held"),
            ):
                bridge.apply_proposal(
                    proposal_path,
                    bridge.proposal_digest(proposal),
                    root / "state.json",
                )
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
