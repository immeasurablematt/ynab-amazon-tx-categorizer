#!/usr/bin/env python3
"""Local, proposal-first Plaid-to-YNAB transaction bridge.

The tool never receives bank credentials. Account linking happens inside Plaid
Link. Plaid and YNAB tokens are read from environment variables or macOS
Keychain. Planning is read-only; applying requires the exact proposal hash.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

PROPOSAL_SCHEMA = "ynab-sitdown.plaid-proposal.v1"
STATE_SCHEMA = "ynab-sitdown.plaid-state.v1"
CONFIG_SCHEMA = "ynab-sitdown.plaid-config.v1"
APP_DIR = Path.home() / "Library" / "Application Support" / "YNAB Sitdown"
DEFAULT_CONFIG_PATH = APP_DIR / "bank-feed-config.json"
DEFAULT_STATE_PATH = APP_DIR / "bank-feed-state.json"
DEFAULT_PROPOSAL_DIR = APP_DIR / "proposals"
KEYCHAIN_ACCOUNT = "ynab-sitdown"


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def stable_import_id(provider_transaction_id: str) -> str:
    digest = hashlib.sha256(provider_transaction_id.encode("utf-8")).hexdigest()
    return f"PLAID:{digest[:30]}"


def to_ynab_milliunits(plaid_amount: Decimal | float | str) -> int:
    amount = Decimal(str(plaid_amount))
    return int((-amount * Decimal(1000)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def plan_added_transactions(
    rows: list[dict[str, Any]], mappings: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    proposed: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []
    for row in rows:
        transaction_id = str(row.get("transaction_id") or "")
        account_id = str(row.get("account_id") or "")
        base_receipt = {
            "provider_transaction_id": transaction_id,
            "provider_account_id": account_id,
            "date": row.get("date"),
        }
        if row.get("pending"):
            held.append({**base_receipt, "reason": "pending"})
            continue
        mapping = mappings.get(account_id)
        if not mapping:
            held.append({**base_receipt, "reason": "unmapped_account"})
            continue
        cutoff = mapping.get("start_date")
        if not cutoff:
            held.append({**base_receipt, "reason": "missing_cutoff"})
            continue
        if str(row.get("date") or "") < cutoff:
            held.append(
                {
                    **base_receipt,
                    "reason": "before_cutoff",
                    "cutoff": cutoff,
                }
            )
            continue
        category = row.get("personal_finance_category") or {}
        primary = str(category.get("primary") or "")
        detailed = str(category.get("detailed") or "")
        transaction_code = str(row.get("transaction_code") or "")
        if (
            primary in {"TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"}
            or "CREDIT_CARD_PAYMENT" in detailed
            or transaction_code == "transfer"
        ):
            held.append(
                {
                    **base_receipt,
                    "reason": "transfer_or_payment",
                    "provider_category": detailed or primary or transaction_code,
                }
            )
            continue
        source_currency = row.get("iso_currency_code") or row.get("unofficial_currency_code")
        expected_currency = mapping.get("currency", "CAD")
        if not source_currency:
            held.append({**base_receipt, "reason": "unknown_currency"})
            continue
        if source_currency and source_currency != expected_currency:
            held.append(
                {
                    **base_receipt,
                    "reason": "currency_mismatch",
                    "source_currency": source_currency,
                    "expected_currency": expected_currency,
                }
            )
            continue
        payee = (row.get("merchant_name") or row.get("name") or "Imported transaction").strip()
        proposed.append(
            {
                "provider_transaction_id": transaction_id,
                "provider_account_id": account_id,
                "account_label": mapping.get("label") or "Mapped YNAB account",
                "ynab_budget_id": mapping["ynab_budget_id"],
                "account_id": mapping["ynab_account_id"],
                "date": row["date"],
                "amount": to_ynab_milliunits(row["amount"]),
                "payee_name": payee[:200],
                "approved": False,
                "cleared": "uncleared",
                "import_id": stable_import_id(transaction_id),
            }
        )
    proposed.sort(key=lambda row: (row["ynab_budget_id"], row["account_id"], row["date"], row["import_id"]))
    held.sort(key=lambda row: (row.get("reason", ""), row.get("date") or "", row.get("provider_transaction_id", "")))
    return proposed, held


def proposal_digest(proposal: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(proposal)).hexdigest()


def require_exact_approval(expected: str, supplied: str) -> None:
    if not secrets.compare_digest(expected, supplied):
        raise ValueError("approval hash does not match the exact proposal")


def private_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    os.replace(temporary, path)
    path.chmod(0o600)


def load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.is_file():
        return json.loads(json.dumps(default))
    return json.loads(path.read_text(encoding="utf-8"))


def commit_cursors(path: Path, cursors: dict[str, str]) -> None:
    state = load_json(path, {"schema": STATE_SCHEMA, "items": {}})
    if state.get("schema") != STATE_SCHEMA:
        raise ValueError(f"unsupported state schema in {path}")
    for item_id, cursor in cursors.items():
        state.setdefault("items", {}).setdefault(item_id, {})["cursor"] = cursor
        state["items"][item_id]["committed_at"] = datetime.now().astimezone().isoformat()
    private_write_json(path, state)


def keychain_read(service: str, env_name: str | None = None) -> str:
    if env_name and os.environ.get(env_name):
        return os.environ[env_name]
    result = subprocess.run(
        [
            "security",
            "find-generic-password",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            service,
            "-w",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        hint = f" or set {env_name}" if env_name else ""
        raise RuntimeError(f"missing macOS Keychain secret {service}{hint}")
    return result.stdout.strip()


def keychain_write(service: str, value: str) -> None:
    result = subprocess.run(
        [
            "security",
            "add-generic-password",
            "-U",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            service,
            "-w",
        ],
        input=f"{value}\n",
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"could not store Keychain secret {service}: {result.stderr.strip()}")


def configure_secrets(environment: str) -> None:
    prompts = [
        ("Plaid client ID", "ynab-sitdown.plaid-client-id"),
        (f"Plaid {environment} secret", f"ynab-sitdown.plaid-{environment}-secret"),
        ("YNAB personal access token", "ynab-sitdown.ynab-token"),
    ]
    stored = 0
    for label, service in prompts:
        value = getpass.getpass(f"{label} (leave blank to keep existing): ")
        if value:
            keychain_write(service, value)
            stored += 1
    print(f"Stored {stored} secret(s) in the macOS Keychain; no values were printed.")


def json_request(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    request = urllib.request.Request(
        url,
        data=canonical_json(payload),
        headers=request_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            error = json.loads(body)
            detail = error.get("error_message") or error.get("error", {}).get("detail") or "request failed"
            request_id = error.get("request_id")
        except json.JSONDecodeError:
            detail, request_id = "request failed", None
        suffix = f" (request {request_id})" if request_id else ""
        raise RuntimeError(f"remote API returned HTTP {exc.code}: {detail}{suffix}") from exc


def plaid_credentials(environment: str) -> tuple[str, str]:
    client_id = keychain_read("ynab-sitdown.plaid-client-id", "PLAID_CLIENT_ID")
    secret_name = "PLAID_SANDBOX_SECRET" if environment == "sandbox" else "PLAID_SECRET"
    secret = keychain_read(f"ynab-sitdown.plaid-{environment}-secret", secret_name)
    return client_id, secret


def plaid_post(environment: str, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    client_id, secret = plaid_credentials(environment)
    return json_request(
        f"https://{environment}.plaid.com{endpoint}",
        {"client_id": client_id, "secret": secret, **payload},
    )


def ensure_config(path: Path, environment: str) -> dict[str, Any]:
    config = load_json(
        path,
        {
            "schema": CONFIG_SCHEMA,
            "environment": environment,
            "client_user_id": secrets.token_urlsafe(18),
            "items": {},
            "mappings": {},
        },
    )
    if config.get("schema") != CONFIG_SCHEMA:
        raise ValueError(f"unsupported config schema in {path}")
    if config.get("environment") != environment:
        raise ValueError(f"config environment is {config.get('environment')}, not {environment}")
    return config


def create_link_token(
    config: dict[str, Any], environment: str, update_item_id: str | None = None
) -> str:
    connection: dict[str, Any]
    if update_item_id:
        if update_item_id not in config.get("items", {}):
            raise ValueError(f"unknown Plaid item {update_item_id}")
        connection = {
            "access_token": keychain_read(f"ynab-sitdown.plaid-item.{update_item_id}")
        }
    else:
        connection = {"products": ["transactions"]}
    response = plaid_post(
        environment,
        "/link/token/create",
        {
            "client_name": "YNAB Sitdown",
            "country_codes": ["CA"],
            "language": "en",
            "user": {"client_user_id": config["client_user_id"]},
            **connection,
        },
    )
    return response["link_token"]


def serve_link(
    config_path: Path, environment: str, port: int, update_item_id: str | None = None
) -> None:
    config = ensure_config(config_path, environment)
    private_write_json(config_path, config)
    link_token = create_link_token(config, environment, update_item_id)
    session_nonce = secrets.token_urlsafe(24)
    complete = threading.Event()

    html = f"""<!doctype html>
<meta charset=\"utf-8\"><title>YNAB Sitdown bank link</title>
<script src=\"https://cdn.plaid.com/link/v2/stable/link-initialize.js\"></script>
<main><h1>Connect a bank for YNAB Sitdown</h1><button id=\"link\">Connect bank</button><p id=\"status\"></p></main>
<script>
const status = document.getElementById('status');
const handler = Plaid.create({{
  token: {json.dumps(link_token)},
  onSuccess: async (public_token, metadata) => {{
    status.textContent = 'Saving the authorized connection locally...';
    const response = await fetch('/exchange', {{method:'POST', headers:{{'Content-Type':'application/json'}}, body:JSON.stringify({{nonce:{json.dumps(session_nonce)}, public_token, metadata}})}});
    status.textContent = response.ok ? 'Connected. You may close this tab.' : 'Connection could not be saved.';
  }},
  onExit: (error) => {{ if (error) status.textContent = 'Plaid Link exited with an error. No connection was stored.'; }}
}});
document.getElementById('link').onclick = () => handler.open();
</script>"""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format: str, *_args: Any) -> None:
            return

        def do_GET(self) -> None:
            if self.path != "/":
                self.send_error(404)
                return
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self) -> None:
            if self.path != "/exchange":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not secrets.compare_digest(payload.get("nonce", ""), session_nonce):
                self.send_error(403)
                return
            if update_item_id:
                item_id = update_item_id
            else:
                exchange = plaid_post(
                    environment,
                    "/item/public_token/exchange",
                    {"public_token": payload["public_token"]},
                )
                item_id = exchange["item_id"]
                keychain_write(f"ynab-sitdown.plaid-item.{item_id}", exchange["access_token"])
            metadata = payload.get("metadata") or {}
            latest = ensure_config(config_path, environment)
            latest.setdefault("items", {})[item_id] = {
                "institution": (metadata.get("institution") or {}).get("name") or "Connected institution",
                "accounts": [
                    {
                        "plaid_account_id": account.get("id"),
                        "name": account.get("name"),
                        "mask": account.get("mask"),
                    }
                    for account in metadata.get("accounts") or []
                ],
            }
            private_write_json(config_path, latest)
            response = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
            complete.set()

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.timeout = 1
    action = "reauthorize the selected institution" if update_item_id else "authorize one institution"
    print(f"Open http://127.0.0.1:{port} in your browser to {action}.")
    print("The tool does not receive or store your bank username or password.")
    try:
        while not complete.is_set():
            server.handle_request()
    finally:
        server.server_close()


def plaid_sync_item(environment: str, item_id: str, cursor: str | None) -> dict[str, Any]:
    access_token = keychain_read(f"ynab-sitdown.plaid-item.{item_id}")
    original_cursor = cursor
    added: list[dict[str, Any]] = []
    modified: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    while True:
        response = plaid_post(
            environment,
            "/transactions/sync",
            {"access_token": access_token, "cursor": cursor or "", "count": 500},
        )
        added.extend(response.get("added") or [])
        modified.extend(response.get("modified") or [])
        removed.extend(response.get("removed") or [])
        cursor = response["next_cursor"]
        if not response.get("has_more"):
            return {
                "item_id": item_id,
                "original_cursor": original_cursor,
                "next_cursor": cursor,
                "added": added,
                "modified": modified,
                "removed": removed,
            }


def map_account(
    config_path: Path,
    environment: str,
    plaid_account_id: str,
    ynab_budget_id: str,
    ynab_account_id: str,
    label: str,
    currency: str,
    start_date: str,
) -> None:
    config = ensure_config(config_path, environment)
    known_accounts = {
        account.get("plaid_account_id")
        for item in config.get("items", {}).values()
        for account in item.get("accounts", [])
    }
    if plaid_account_id not in known_accounts:
        raise ValueError(f"unknown Plaid account {plaid_account_id}")
    try:
        date.fromisoformat(start_date)
    except ValueError as exc:
        raise ValueError("start date must use YYYY-MM-DD") from exc
    config.setdefault("mappings", {})[plaid_account_id] = {
        "ynab_budget_id": ynab_budget_id,
        "ynab_account_id": ynab_account_id,
        "label": label,
        "currency": currency,
        "start_date": start_date,
    }
    private_write_json(config_path, config)
    print(f"Mapped one Plaid account to YNAB as {label}.")


def build_proposal(config_path: Path, state_path: Path, output_dir: Path, environment: str) -> Path:
    config = ensure_config(config_path, environment)
    state = load_json(state_path, {"schema": STATE_SCHEMA, "items": {}})
    all_proposed: list[dict[str, Any]] = []
    all_held: list[dict[str, Any]] = []
    next_cursors: dict[str, str] = {}
    for item_id in sorted(config.get("items", {})):
        cursor = state.get("items", {}).get(item_id, {}).get("cursor")
        result = plaid_sync_item(environment, item_id, cursor)
        proposed, held = plan_added_transactions(result["added"], config.get("mappings", {}))
        for row in proposed:
            row["source_item_id"] = item_id
        all_proposed.extend(proposed)
        all_held.extend(held)
        all_held.extend(
            {
                "provider_transaction_id": row.get("transaction_id"),
                "provider_account_id": row.get("account_id"),
                "reason": "provider_modified",
            }
            for row in result["modified"]
        )
        all_held.extend(
            {
                "provider_transaction_id": row.get("transaction_id"),
                "reason": "provider_removed",
            }
            for row in result["removed"]
        )
        next_cursors[item_id] = result["next_cursor"]

    proposal = {
        "schema": PROPOSAL_SCHEMA,
        "created_at": datetime.now().astimezone().isoformat(),
        "environment": environment,
        "transactions": all_proposed,
        "held": all_held,
        "next_cursors": next_cursors,
    }
    timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    output = output_dir / f"plaid-ynab-proposal-{timestamp}.json"
    private_write_json(output, proposal)
    return output


def ynab_request(method: str, path: str, token: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    request = urllib.request.Request(
        f"https://api.ynab.com/v1{path}",
        data=canonical_json(payload) if payload is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        raise RuntimeError(
            "YNAB write outcome may be unknown. Read back the exact import IDs before retrying."
        ) from exc


def verify_ynab_rows(token: str, rows: list[dict[str, Any]]) -> None:
    by_budget: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_budget[row["ynab_budget_id"]].append(row)
    failures: list[str] = []
    for budget_id, expected_rows in by_budget.items():
        since = min(row["date"] for row in expected_rows)
        response = ynab_request("GET", f"/budgets/{budget_id}/transactions?since_date={since}", token)
        actual = {
            row.get("import_id"): row
            for row in response.get("data", {}).get("transactions", [])
            if row.get("import_id")
        }
        for expected in expected_rows:
            row = actual.get(expected["import_id"])
            if not row:
                failures.append(expected["import_id"])
                continue
            checks = {
                "account_id": expected["account_id"],
                "date": expected["date"],
                "amount": expected["amount"],
                "approved": False,
            }
            if any(row.get(field) != value for field, value in checks.items()):
                failures.append(expected["import_id"])
    if failures:
        raise RuntimeError(f"YNAB readback did not verify {len(failures)} proposed import(s)")


def apply_proposal(
    proposal_path: Path,
    approval_hash: str,
    state_path: Path,
    acknowledge_transfers: bool = False,
) -> None:
    proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
    if proposal.get("schema") != PROPOSAL_SCHEMA:
        raise ValueError("unsupported proposal schema")
    digest = proposal_digest(proposal)
    require_exact_approval(digest, approval_hash)
    blocking = [
        row for row in proposal.get("held", [])
        if row.get("reason")
        in {"unmapped_account", "missing_cutoff", "unknown_currency", "currency_mismatch"}
    ]
    if blocking:
        raise ValueError(f"proposal has {len(blocking)} blocking held row(s); repair mappings first")
    transfer_holds = [
        row for row in proposal.get("held", []) if row.get("reason") == "transfer_or_payment"
    ]
    if transfer_holds and not acknowledge_transfers:
        raise ValueError(
            f"proposal has {len(transfer_holds)} transfer/payment hold(s); verify their separate "
            "YNAB transfer treatment, then explicitly acknowledge them"
        )
    rows = proposal.get("transactions") or []
    token = keychain_read("ynab-sitdown.ynab-token", "YNAB_ACCESS_TOKEN")
    by_budget: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_budget[row["ynab_budget_id"]].append(row)
    for budget_id, budget_rows in by_budget.items():
        payload_rows = [
            {
                field: row[field]
                for field in (
                    "account_id",
                    "date",
                    "amount",
                    "payee_name",
                    "approved",
                    "cleared",
                    "import_id",
                )
            }
            for row in budget_rows
        ]
        ynab_request("POST", f"/budgets/{budget_id}/transactions", token, {"transactions": payload_rows})
    verify_ynab_rows(token, rows)
    commit_cursors(state_path, proposal.get("next_cursors") or {})
    print(f"Verified {len(rows)} YNAB import(s); Plaid cursors committed.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Proposal-first Plaid-to-YNAB bridge")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE_PATH)
    parser.add_argument("--environment", choices=("sandbox", "production"), default="sandbox")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("configure-secrets", help="Prompt for API credentials and store them in Keychain")

    link = commands.add_parser("link", help="Run a local Plaid Link session")
    link.add_argument("--port", type=int, default=8791)
    link.add_argument("--update-item", help="Existing Plaid item ID to reauthorize in update mode")

    mapping = commands.add_parser("map-account", help="Map one linked Plaid account to one YNAB account")
    mapping.add_argument("--plaid-account", required=True)
    mapping.add_argument("--ynab-budget", required=True)
    mapping.add_argument("--ynab-account", required=True)
    mapping.add_argument("--label", required=True)
    mapping.add_argument("--currency", default="CAD")
    mapping.add_argument(
        "--start-date",
        required=True,
        help="First bank-posted date not already covered by the prior feed",
    )

    plan = commands.add_parser("plan", help="Create a read-only import proposal")
    plan.add_argument("--output-dir", type=Path, default=DEFAULT_PROPOSAL_DIR)

    apply = commands.add_parser("apply", help="Apply one exact approved proposal")
    apply.add_argument("proposal", type=Path)
    apply.add_argument("--approve", required=True, help="Exact SHA-256 shown by the plan command")
    apply.add_argument(
        "--acknowledge-transfers",
        action="store_true",
        help="Advance past held transfers only after their separate YNAB treatment is verified",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    if args.command == "configure-secrets":
        configure_secrets(args.environment)
    elif args.command == "link":
        serve_link(args.config, args.environment, args.port, args.update_item)
    elif args.command == "map-account":
        map_account(
            args.config,
            args.environment,
            args.plaid_account,
            args.ynab_budget,
            args.ynab_account,
            args.label,
            args.currency,
            args.start_date,
        )
    elif args.command == "plan":
        output = build_proposal(args.config, args.state, args.output_dir, args.environment)
        proposal = json.loads(output.read_text(encoding="utf-8"))
        print(f"Proposal: {output}")
        print(f"Transactions proposed: {len(proposal['transactions'])}")
        print(f"Held: {len(proposal['held'])}")
        print(f"Approval hash: {proposal_digest(proposal)}")
        print("No YNAB changes made; Plaid cursors were not advanced.")
    elif args.command == "apply":
        apply_proposal(
            args.proposal,
            args.approve,
            args.state,
            acknowledge_transfers=args.acknowledge_transfers,
        )


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError) as exc:
        print(f"Refusing: {exc}", file=sys.stderr)
        raise SystemExit(1)
