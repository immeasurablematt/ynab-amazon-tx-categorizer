#!/usr/bin/env python3
"""
Extract December 2025 transactions from QFX (OFX SGML) files.
Outputs CSV with Posted Date, Payee, Address, Amount, FITID, TRNTYPE.
Usage: python qfx_extract_dec.py file1.qfx file2.qfx [-o dec_2025_transactions.csv]
"""
import argparse
import csv
import os
import re
import sys
from typing import Optional

DEC_START = 20251201
DEC_END = 20251231


def _parse_qfx_block(block: str) -> Optional[dict]:
    """Extract DTPOSTED, TRNAMT, FITID, NAME, TRNTYPE from STMTTRN block."""
    data = {}
    for tag in ["DTPOSTED", "TRNAMT", "FITID", "NAME", "TRNTYPE"]:
        m = re.search(rf"<{tag}>([^<]*)", block)
        if m:
            data[tag] = m.group(1).strip()
        else:
            return None
    return data


def _dtposted_to_date(dtposted: str) -> Optional[str]:
    """Convert DTPOSTED (YYYYMMDDHHMMSS[-5:EST]) to YYYY-MM-DD."""
    if not dtposted:
        return None
    # Take first 8 chars for YYYYMMDD
    yyyymmdd = dtposted[:8]
    if len(yyyymmdd) != 8 or not yyyymmdd.isdigit():
        return None
    try:
        y, m, d = yyyymmdd[:4], yyyymmdd[4:6], yyyymmdd[6:8]
        return f"{y}-{m}-{d}"
    except (ValueError, IndexError):
        return None


def _extract_address(name: str) -> str:
    """Extract city/address from NAME (e.g. 'AMZN Mktp CA*H513Y3UF3 TORONTO ON' -> 'TORONTO')."""
    if not name:
        return ""
    parts = name.strip().split()
    # Look for common Canadian cities
    for p in parts:
        p_upper = p.upper()
        if p_upper in ("TORONTO", "VANCOUVER", "VANCOUVER BC", "MONTREAL", "CALGARY"):
            return p
    # Return last two tokens (e.g. "TORONTO ON") or empty
    if len(parts) >= 2:
        return " ".join(parts[-2:])
    return ""


def _parse_amount(s: str) -> Optional[float]:
    if s is None or (isinstance(s, str) and not s.strip()):
        return None
    s = str(s).strip().replace(",", "").replace("$", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def extract_dec_transactions(qfx_paths: list[str]) -> list[dict]:
    """Parse QFX files, return list of Dec 2025 transactions (deduped by FITID)."""
    seen_fitids = set()
    transactions = []

    for path in qfx_paths:
        if not os.path.isfile(path):
            print(f"Warning: File not found: {path}", file=sys.stderr)
            continue

        with open(path, mode="r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        # Split on STMTTRN blocks
        blocks = re.split(r"<STMTTRN>", content, flags=re.IGNORECASE)
        for block in blocks:
            if "</STMTTRN>" not in block:
                continue
            block = block.split("</STMTTRN>")[0]
            data = _parse_qfx_block(block)
            if not data:
                continue

            dtposted = data.get("DTPOSTED", "")
            yyyymmdd_str = dtposted[:8]
            try:
                yyyymmdd = int(yyyymmdd_str)
            except ValueError:
                continue
            if yyyymmdd < DEC_START or yyyymmdd > DEC_END:
                continue

            fitid = data.get("FITID", "")
            if fitid in seen_fitids:
                continue
            seen_fitids.add(fitid)

            date_str = _dtposted_to_date(dtposted)
            amount = _parse_amount(data.get("TRNAMT", ""))
            if date_str is None or amount is None:
                continue

            name = data.get("NAME", "")
            address = _extract_address(name)

            transactions.append({
                "Posted Date": date_str,
                "Payee": name,
                "Address": address,
                "Amount": amount,
                "FITID": fitid,
                "TRNTYPE": data.get("TRNTYPE", ""),
            })

    return transactions


def main():
    parser = argparse.ArgumentParser(
        description="Extract December 2025 transactions from QFX files."
    )
    parser.add_argument("qfx_files", nargs="+", help="QFX file path(s)")
    parser.add_argument("-o", "--output", default="dec_2025_orders.csv", help="Output CSV path")
    args = parser.parse_args()

    transactions = extract_dec_transactions(args.qfx_files)

    if not transactions:
        print("No December 2025 transactions found.", file=sys.stderr)
        sys.exit(1)

    # Sort by date, then amount
    transactions.sort(key=lambda r: (r["Posted Date"], r["Amount"]))

    with open(args.output, mode="w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Posted Date", "Payee", "Address", "Amount", "FITID", "TRNTYPE"],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(transactions)

    print(f"Extracted {len(transactions)} December 2025 transactions to {args.output}")
    print("\nNext: Match to items and categorize:")
    print(f"  python match_cc_to_items.py {args.output} <items_csv> -o categorized_dec.csv")
    print("\nThen apply to YNAB:")
    print(f"  YNAB_CSV_FILE=categorized_dec.csv python3 ynab_apply_csv_categories.py")


if __name__ == "__main__":
    main()
