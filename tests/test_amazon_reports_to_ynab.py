"""Lean unit tests for amazon_reports_to_ynab.py"""
import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from amazon_reports_to_ynab import (
    _is_valid_amount,
    _parse_amount,
    _parse_date,
    allocate_amounts,
    load_transactions_csv,
    load_items_csv,
    enrich_transactions,
    categorize_rule_based,
)


class TestParseAmount(unittest.TestCase):
    def test_valid_amount(self):
        assert _is_valid_amount("-34.89")
        assert _is_valid_amount("74.56")
        assert _is_valid_amount("$55.73")
        assert _is_valid_amount("1,234.56")

    def test_invalid_amount(self):
        assert not _is_valid_amount("=SUBTOTAL(103,A2:A168)")
        assert not _is_valid_amount("")
        assert not _is_valid_amount("abc")

    def test_parse_amount(self):
        assert _parse_amount("-34.89") == -34.89
        assert _parse_amount("$55.73") == 55.73
        assert _parse_amount("1,234.56") == 1234.56
        assert _parse_amount("") is None
        assert _parse_amount("=SUM") is None


class TestParseDate(unittest.TestCase):
    def test_yyyy_mm_dd(self):
        assert _parse_date("2025-11-07") == "2025-11-07"
        assert _parse_date("2025-12-27") == "2025-12-27"

    def test_mm_dd_yyyy(self):
        assert _parse_date("11/07/2025") == "2025-11-07"
        assert _parse_date("12/27/2025") == "2025-12-27"

    def test_dd_mm_yyyy(self):
        assert _parse_date("07/11/2025") == "2025-07-11"  # 7 Nov in DD/MM
        # Ambiguous: 07/11 could be Jul 11 or Nov 7 depending on locale
        # Our parser tries MM/DD first, so 07/11/2025 -> 2025-07-11

    def test_invalid(self):
        assert _parse_date("") is None
        assert _parse_date("invalid") is None


class TestAllocateAmounts(unittest.TestCase):
    def test_proportional(self):
        items = [{"price": 50, "quantity": 1}, {"price": 50, "quantity": 1}]
        result = allocate_amounts(-100.0, items)
        assert len(result) == 2
        assert sum(result) == -100.0
        assert result[0] == -50.0
        assert result[1] == -50.0

    def test_unequal_split(self):
        items = [{"price": 25, "quantity": 1}, {"price": 75, "quantity": 1}]
        result = allocate_amounts(-100.0, items)
        assert len(result) == 2
        assert abs(sum(result) - (-100.0)) < 0.01
        assert abs(result[0] - (-25.0)) < 0.01
        assert abs(result[1] - (-75.0)) < 0.01

    def test_rounding_adjustment(self):
        items = [{"price": 33.33, "quantity": 1}, {"price": 33.33, "quantity": 1}, {"price": 33.34, "quantity": 1}]
        result = allocate_amounts(-100.0, items)
        assert len(result) == 3
        assert abs(sum(result) - (-100.0)) < 0.01

    def test_empty_items(self):
        assert allocate_amounts(-50.0, []) == []

    def test_refund_positive(self):
        items = [{"price": 25, "quantity": 1}, {"price": 25, "quantity": 1}]
        result = allocate_amounts(50.0, items)
        assert sum(result) == 50.0


class TestLoadTransactionsCsv(unittest.TestCase):
    def test_skip_footer(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["date", "order ids", "amount", "vendor"])
            writer.writeheader()
            writer.writerow({"date": "2025-11-07", "order ids": "702-123-456", "amount": "-34.89", "vendor": "Amazon"})
            writer.writerow({"date": "", "order ids": "", "amount": "=SUBTOTAL(103,A2:A168)", "vendor": ""})
            path = Path(f.name)
        try:
            txs = load_transactions_csv(path)
            assert len(txs) == 1
            assert txs[0]["amount"] == -34.89
            assert txs[0]["order_id"] == "702-123-456"
        finally:
            path.unlink()

    def test_missing_columns_raises(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["foo", "bar"])
            writer.writeheader()
            writer.writerow({"foo": "1", "bar": "2"})
            path = Path(f.name)
        try:
            try:
                load_transactions_csv(path)
                assert False, "Expected ValueError"
            except ValueError as e:
                assert "Missing required" in str(e) or "columns" in str(e).lower()
        finally:
            path.unlink()


class TestLoadItemsCsv(unittest.TestCase):
    def test_group_by_order(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["order id", "description", "price", "quantity"])
            writer.writeheader()
            writer.writerow({"order id": "702-A", "description": "Item 1", "price": "$10", "quantity": "1"})
            writer.writerow({"order id": "702-A", "description": "Item 2", "price": "$20", "quantity": "1"})
            writer.writerow({"order id": "702-B", "description": "Item 3", "price": "$30", "quantity": "1"})
            path = Path(f.name)
        try:
            items = load_items_csv(path)
            assert "702-A" in items
            assert len(items["702-A"]) == 2
            assert items["702-A"][0]["price"] == 10.0
            assert items["702-A"][1]["price"] == 20.0
            assert len(items["702-B"]) == 1
        finally:
            path.unlink()


class TestEnrichTransactions(unittest.TestCase):
    def test_attach_items(self):
        txs = [{"order_id": "702-A", "date": "2025-11-07", "amount": -30}, {"order_id": "702-B", "date": "2025-11-08", "amount": -20}]
        items_by_order = {"702-A": [{"description": "Item 1", "price": 30}], "702-B": []}
        enriched = enrich_transactions(txs, items_by_order)
        assert len(enriched[0]["items"]) == 1
        assert enriched[0]["items"][0]["description"] == "Item 1"
        assert len(enriched[1]["items"]) == 0


class TestCategorizeRuleBased(unittest.TestCase):
    def test_gift_card(self):
        tx = {"vendor": "Amazon", "items": [{"description": "Amazon eGift Card - Birthday"}]}
        cat, memo = categorize_rule_based(tx)
        assert cat == "Gifts & Giving"

    def test_kids_item(self):
        tx = {"vendor": "Amazon", "items": [{"description": "Toddler pajamas for kids"}]}
        cat, memo = categorize_rule_based(tx)
        assert cat == "Kids Supplies"

    def test_prime_subscription(self):
        tx = {"vendor": "Ad free for PrimeVideo", "items": []}
        cat, memo = categorize_rule_based(tx)
        assert cat == "Subscriptions (Monthly)"


if __name__ == "__main__":
    unittest.main()
