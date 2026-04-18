#!/usr/bin/env python3
"""Repo-local stdio MCP server for a small YNAB workflow."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from urllib import error, parse, request

API_BASE = "https://api.ynab.com/v1"
DEFAULT_PROTOCOL_VERSION = "2025-06-18"
INTERNAL_CATEGORY_GROUPS = {"Internal Master Category", "Credit Card Payments"}
STATE_FILE = Path(__file__).resolve().parent.parent / ".ynab-mcp" / "last_used_plan.json"
ENV_FILES = (
    Path(__file__).resolve().parent.parent / ".env",
    Path(__file__).resolve().parent.parent / ".env.local",
    Path.home() / ".openclaw" / ".env",
    Path.home() / ".secrets",
)


class YnabMcpError(Exception):
    """Application-level error that should surface as a tool error."""


def parse_env_text(text: str) -> Dict[str, str]:
    """Parse a minimal dotenv or shell export file into key-value pairs."""
    values: Dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or not key.replace("_", "A").isalnum() or key[0].isdigit():
            continue
        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def load_env_values() -> Dict[str, str]:
    """Load values from the live environment first, then known env files."""
    values = dict(os.environ)
    for env_file in ENV_FILES:
        if env_file.is_file():
            try:
                file_values = parse_env_text(env_file.read_text(encoding="utf-8"))
            except OSError:
                continue
            for key, value in file_values.items():
                values.setdefault(key, value)
    return values


def load_last_used_plan(state_file: Path = STATE_FILE) -> Optional[Dict[str, Any]]:
    """Load the last-used YNAB budget reference from disk."""
    if not state_file.is_file():
        return None
    try:
        data = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    plan_id = data.get("id")
    if not isinstance(plan_id, str) or not plan_id:
        return None
    return data


def save_last_used_plan(state_file: Path, plan: Dict[str, Any]) -> None:
    """Persist the most recent resolved budget for later `last-used` calls."""
    state_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "id": plan["id"],
        "name": plan.get("name"),
    }
    state_file.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def select_budget(
    plan_id: str,
    budgets: Iterable[Dict[str, Any]],
    saved_plan: Optional[Dict[str, Any]] = None,
    env_budget_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolve a budget by explicit id, explicit name, or `last-used`."""
    budget_list = list(budgets)
    budgets_by_id = {budget.get("id"): budget for budget in budget_list if isinstance(budget.get("id"), str)}

    if plan_id == "last-used":
        if saved_plan and saved_plan.get("id") in budgets_by_id:
            return budgets_by_id[saved_plan["id"]]
        if env_budget_id and env_budget_id in budgets_by_id:
            return budgets_by_id[env_budget_id]
        raise ValueError(
            'No last-used plan is available yet. Call a tool once with an explicit plan id or exact budget name.'
        )

    if plan_id in budgets_by_id:
        return budgets_by_id[plan_id]

    matches = [budget for budget in budget_list if str(budget.get("name", "")).lower() == plan_id.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ValueError(f'Multiple budgets matched "{plan_id}". Use the exact budget id instead.')
    raise ValueError(f'Unknown YNAB plan "{plan_id}".')


def normalize_category_groups(category_groups: Iterable[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Filter hidden/deleted/internal groups while preserving YNAB-ish shape."""
    normalized: list[Dict[str, Any]] = []
    for group in category_groups:
        if group.get("deleted") or group.get("hidden"):
            continue
        if group.get("name") in INTERNAL_CATEGORY_GROUPS:
            continue
        categories = []
        for category in group.get("categories", []):
            if category.get("deleted") or category.get("hidden"):
                continue
            categories.append(category)
        if not categories:
            continue
        group_copy = dict(group)
        group_copy["categories"] = categories
        normalized.append(group_copy)
    return normalized


def normalize_transaction(transaction: Dict[str, Any]) -> Dict[str, Any]:
    """Keep the YNAB transaction payload and add a dollars field for jq-friendly work."""
    normalized = dict(transaction)
    amount = normalized.get("amount")
    if isinstance(amount, int):
        normalized["amount_currency"] = amount / 1000
    return normalized


def filter_transactions(transactions: Iterable[Dict[str, Any]], tx_type: str) -> list[Dict[str, Any]]:
    """Apply the small set of workflow-specific transaction filters."""
    if tx_type not in {"all", "unapproved", "uncategorized"}:
        raise YnabMcpError('Unsupported transaction type. Use one of: "all", "unapproved", "uncategorized".')

    normalized = [normalize_transaction(transaction) for transaction in transactions]
    if tx_type == "all":
        return normalized
    if tx_type == "unapproved":
        return [transaction for transaction in normalized if not transaction.get("approved", False)]
    return [transaction for transaction in normalized if transaction.get("category_id") is None]


def tool_result(payload: Dict[str, Any], is_error: bool = False) -> Dict[str, Any]:
    """Return a jq-friendly MCP tool result."""
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return {
        "content": [{"type": "text", "text": text}],
        "structuredContent": payload,
        "isError": is_error,
    }


def protocol_error(request_id: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def success_response(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


class YnabClient:
    """Minimal YNAB REST client using the Python standard library only."""

    def __init__(self, token: str):
        self._token = token

    def request_json(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data: Optional[bytes] = None
        if payload is not None:
            data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

        req = request.Request(
            f"{API_BASE}{path}",
            data=data,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            },
            method=method,
        )

        try:
            with request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = f"YNAB API error: HTTP {exc.code}"
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                body = None
            if isinstance(body, dict):
                ynab_error = body.get("error")
                if isinstance(ynab_error, dict) and isinstance(ynab_error.get("detail"), str):
                    detail = ynab_error["detail"]
            raise YnabMcpError(detail) from exc
        except error.URLError as exc:
            raise YnabMcpError(f"YNAB API request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise YnabMcpError("YNAB API returned invalid JSON.") from exc
        if not isinstance(parsed, dict) or "data" not in parsed or not isinstance(parsed["data"], dict):
            raise YnabMcpError("YNAB API response did not contain a data object.")
        return parsed["data"]

    def get_budgets(self) -> list[Dict[str, Any]]:
        return self.request_json("GET", "/budgets").get("budgets", [])

    def get_categories(self, budget_id: str) -> list[Dict[str, Any]]:
        escaped_budget_id = parse.quote(budget_id, safe="")
        data = self.request_json("GET", f"/budgets/{escaped_budget_id}/categories")
        return normalize_category_groups(data.get("category_groups", []))

    def get_transactions(self, budget_id: str, tx_type: str) -> list[Dict[str, Any]]:
        escaped_budget_id = parse.quote(budget_id, safe="")
        data = self.request_json("GET", f"/budgets/{escaped_budget_id}/transactions")
        return filter_transactions(data.get("transactions", []), tx_type)

    def update_transactions(self, budget_id: str, transactions: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        escaped_budget_id = parse.quote(budget_id, safe="")
        data = self.request_json(
            "PATCH",
            f"/budgets/{escaped_budget_id}/transactions",
            payload={"transactions": transactions},
        )
        updated_transactions = data.get("transactions", [])
        if not isinstance(updated_transactions, list):
            return []
        return [normalize_transaction(transaction) for transaction in updated_transactions if isinstance(transaction, dict)]


class YnabMcpServer:
    """Small stdio MCP server exposing the exact YNAB tools needed here."""

    def __init__(self) -> None:
        pass

    def _load_runtime(self) -> tuple[Dict[str, str], YnabClient]:
        env_values = load_env_values()
        token = env_values.get("YNAB_ACCESS_TOKEN")
        if not token:
            raise YnabMcpError(
                "YNAB_ACCESS_TOKEN is not set in the environment or known env files."
            )
        return env_values, YnabClient(token)

    def resolve_plan(self, plan_id: str) -> Dict[str, Any]:
        env_values, client = self._load_runtime()
        budgets = client.get_budgets()
        selected = select_budget(
            plan_id,
            budgets,
            saved_plan=load_last_used_plan(),
            env_budget_id=env_values.get("YNAB_BUDGET_ID"),
        )
        save_last_used_plan(STATE_FILE, selected)
        return selected

    def get_categories(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        plan_id = require_string(arguments, "plan_id")
        budget = self.resolve_plan(plan_id)
        _, client = self._load_runtime()
        category_groups = client.get_categories(budget["id"])
        return {
            "plan_id": budget["id"],
            "plan_name": budget.get("name"),
            "category_groups": category_groups,
        }

    def get_transactions(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        plan_id = require_string(arguments, "plan_id")
        tx_type = require_string(arguments, "type")
        budget = self.resolve_plan(plan_id)
        _, client = self._load_runtime()
        transactions = client.get_transactions(budget["id"], tx_type)
        return {
            "plan_id": budget["id"],
            "plan_name": budget.get("name"),
            "type": tx_type,
            "transactions": transactions,
        }

    def update_transactions(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        plan_id = require_string(arguments, "plan_id")
        raw_transactions = arguments.get("transactions")
        if not isinstance(raw_transactions, list):
            raise YnabMcpError('"transactions" must be an array.')

        budget = self.resolve_plan(plan_id)
        cleaned_updates = sanitize_transaction_updates(raw_transactions)
        _, client = self._load_runtime()
        updated_transactions = client.update_transactions(budget["id"], cleaned_updates)
        return {
            "plan_id": budget["id"],
            "plan_name": budget.get("name"),
            "updated": len(updated_transactions),
            "transactions": updated_transactions,
        }

    def tools_list(self) -> Dict[str, Any]:
        return {
            "tools": [
                {
                    "name": "getCategories",
                    "description": "Return active YNAB category groups for a plan.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "plan_id": {
                                "type": "string",
                                "description": 'Budget id, exact budget name, or "last-used".',
                            }
                        },
                        "required": ["plan_id"],
                        "additionalProperties": False,
                    },
                },
                {
                    "name": "getTransactions",
                    "description": "Return YNAB transactions for a plan, optionally filtered for the categorization workflow.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "plan_id": {
                                "type": "string",
                                "description": 'Budget id, exact budget name, or "last-used".',
                            },
                            "type": {
                                "type": "string",
                                "enum": ["all", "unapproved", "uncategorized"],
                            },
                        },
                        "required": ["plan_id", "type"],
                        "additionalProperties": False,
                    },
                },
                {
                    "name": "updateTransactions",
                    "description": "Batch update existing YNAB transactions.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "plan_id": {
                                "type": "string",
                                "description": 'Budget id, exact budget name, or "last-used".',
                            },
                            "transactions": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "category_id": {"type": ["string", "null"]},
                                        "memo": {"type": ["string", "null"]},
                                        "payee_name": {"type": ["string", "null"]},
                                        "approved": {"type": "boolean"},
                                        "cleared": {"type": "string"},
                                        "flag_color": {"type": ["string", "null"]},
                                    },
                                    "required": ["id"],
                                    "additionalProperties": False,
                                },
                            },
                        },
                        "required": ["plan_id", "transactions"],
                        "additionalProperties": False,
                    },
                },
            ]
        }

    def handle_tool_call(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        if name == "getCategories":
            return tool_result(self.get_categories(arguments))
        if name == "getTransactions":
            return tool_result(self.get_transactions(arguments))
        if name == "updateTransactions":
            return tool_result(self.update_transactions(arguments))
        raise YnabMcpError(f"Unknown tool: {name}")


def require_string(arguments: Dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if not isinstance(value, str) or not value:
        raise YnabMcpError(f'"{key}" must be a non-empty string.')
    return value


def sanitize_transaction_updates(raw_transactions: list[Any]) -> list[Dict[str, Any]]:
    allowed_keys = {"id", "category_id", "memo", "payee_name", "approved", "cleared", "flag_color"}
    cleaned: list[Dict[str, Any]] = []

    for index, raw_transaction in enumerate(raw_transactions):
        if not isinstance(raw_transaction, dict):
            raise YnabMcpError(f"transactions[{index}] must be an object.")
        tx_id = raw_transaction.get("id")
        if not isinstance(tx_id, str) or not tx_id:
            raise YnabMcpError(f'transactions[{index}].id must be a non-empty string.')

        cleaned_transaction = {"id": tx_id}
        for key in allowed_keys - {"id"}:
            if key in raw_transaction:
                cleaned_transaction[key] = raw_transaction[key]

        if len(cleaned_transaction) == 1:
            raise YnabMcpError(f"transactions[{index}] must include at least one mutable field besides id.")
        cleaned.append(cleaned_transaction)

    return cleaned


def handle_message(server: YnabMcpServer, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}

    if method == "initialize":
        protocol_version = params.get("protocolVersion")
        if not isinstance(protocol_version, str) or not protocol_version:
            protocol_version = DEFAULT_PROTOCOL_VERSION
        return success_response(
            request_id,
            {
                "protocolVersion": protocol_version,
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "ynab",
                    "version": "0.1.0",
                    "description": "Repo-local YNAB MCP tools for categorization workflows.",
                },
            },
        )

    if method == "notifications/initialized":
        return None

    if method == "ping":
        return success_response(request_id, {})

    if method == "tools/list":
        return success_response(request_id, server.tools_list())

    if method == "tools/call":
        if not isinstance(params, dict):
            return success_response(request_id, tool_result({"error": "Invalid tools/call params."}, is_error=True))
        name = params.get("name")
        if not isinstance(name, str):
            return success_response(request_id, tool_result({"error": "Tool name must be a string."}, is_error=True))
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return success_response(
                request_id,
                tool_result({"error": "Tool arguments must be an object."}, is_error=True),
            )
        try:
            return success_response(request_id, server.handle_tool_call(name, arguments))
        except YnabMcpError as exc:
            return success_response(request_id, tool_result({"error": str(exc)}, is_error=True))

    if request_id is None:
        return None
    return protocol_error(request_id, -32601, f"Method not found: {method}")


def emit(message: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":"), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    server = YnabMcpServer()

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            emit(protocol_error(None, -32700, "Parse error"))
            continue

        if isinstance(payload, list):
            responses = []
            for entry in payload:
                if not isinstance(entry, dict):
                    responses.append(protocol_error(None, -32600, "Invalid Request"))
                    continue
                try:
                    response = handle_message(server, entry)
                except YnabMcpError as exc:
                    response = success_response(entry.get("id"), tool_result({"error": str(exc)}, is_error=True))
                if response is not None:
                    responses.append(response)
            if responses:
                emit(responses if len(responses) > 1 else responses[0])
            continue

        if not isinstance(payload, dict):
            emit(protocol_error(None, -32600, "Invalid Request"))
            continue

        try:
            response = handle_message(server, payload)
        except YnabMcpError as exc:
            response = success_response(payload.get("id"), tool_result({"error": str(exc)}, is_error=True))
        if response is not None:
            emit(response)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
