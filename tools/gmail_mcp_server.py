#!/usr/bin/env python3
"""Repo-local stdio MCP server for minimal read-only Gmail access."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import sys
import threading
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from urllib import error, request

API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
DEFAULT_PROTOCOL_VERSION = "2025-06-18"
GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
HEADER_NAMES = ("From", "To", "Subject", "Date")
STATE_DIR = Path.home() / ".codex" / "gmail-readonly-mcp"
CLIENT_CREDENTIALS_FILE = STATE_DIR / "client_credentials.json"
TOKEN_FILE = STATE_DIR / "oauth_token.json"
TOKEN_REFRESH_SKEW_SECONDS = 60


class GmailMcpError(Exception):
    """Application-level error that should surface as a tool error."""


def tool_result(payload: Dict[str, Any], is_error: bool = False) -> Dict[str, Any]:
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


def emit(message: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":"), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def require_string(arguments: Dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    if not isinstance(value, str) or not value.strip():
        raise GmailMcpError(f'"{key}" must be a non-empty string.')
    return value.strip()


def require_max_results(arguments: Dict[str, Any], key: str = "max_results", default: int = 10) -> int:
    value = arguments.get(key, default)
    if not isinstance(value, int) or isinstance(value, bool):
        raise GmailMcpError(f'"{key}" must be an integer.')
    if value < 1 or value > 100:
        raise GmailMcpError(f'"{key}" must be between 1 and 100.')
    return value


def decode_base64url_text(data: str) -> str:
    padding = "=" * (-len(data) % 4)
    decoded = base64.urlsafe_b64decode((data + padding).encode("ascii"))
    return decoded.decode("utf-8", errors="replace")


def iso_datetime_from_millis(raw_value: Any) -> Optional[str]:
    if raw_value is None:
        return None
    try:
        millis = int(str(raw_value))
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).isoformat()


def read_json_file(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise GmailMcpError(f"Missing required file: {path}") from exc
    except OSError as exc:
        raise GmailMcpError(f"Unable to read required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GmailMcpError(f"Invalid JSON in required file: {path}") from exc
    if not isinstance(data, dict):
        raise GmailMcpError(f"Expected a JSON object in file: {path}")
    return data


def secure_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent.exists():
        path.parent.chmod(0o700)
    serialized = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(serialized, encoding="utf-8")
    temp_path.chmod(0o600)
    temp_path.replace(path)
    path.chmod(0o600)


def extract_client_config(credentials_doc: Dict[str, Any]) -> Dict[str, str]:
    client_block = credentials_doc.get("installed")
    if not isinstance(client_block, dict):
        client_block = credentials_doc.get("web")
    if not isinstance(client_block, dict):
        raise GmailMcpError(
            f"Google OAuth credentials must contain an 'installed' or 'web' object in {CLIENT_CREDENTIALS_FILE}."
        )

    client_id = client_block.get("client_id")
    client_secret = client_block.get("client_secret")
    if not isinstance(client_id, str) or not client_id:
        raise GmailMcpError("Google OAuth credentials are missing client_id.")
    if not isinstance(client_secret, str) or not client_secret:
        raise GmailMcpError("Google OAuth credentials are missing client_secret.")

    auth_uri = client_block.get("auth_uri")
    token_uri = client_block.get("token_uri")
    if not isinstance(auth_uri, str) or not auth_uri:
        auth_uri = "https://accounts.google.com/o/oauth2/v2/auth"
    if not isinstance(token_uri, str) or not token_uri:
        token_uri = "https://oauth2.googleapis.com/token"

    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": auth_uri,
        "token_uri": token_uri,
    }


def extract_headers(payload: Dict[str, Any]) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    for raw_header in payload.get("headers", []):
        if not isinstance(raw_header, dict):
            continue
        name = raw_header.get("name")
        value = raw_header.get("value")
        if isinstance(name, str) and isinstance(value, str) and name in HEADER_NAMES:
            headers[name] = value
    return headers


def iter_payload_parts(payload: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return
    yield payload
    for part in payload.get("parts", []):
        if isinstance(part, dict):
            yield from iter_payload_parts(part)


def extract_message_bodies(payload: Dict[str, Any]) -> Dict[str, Any]:
    text_plain_parts: list[str] = []
    text_html_parts: list[str] = []
    attachment_filenames: list[str] = []

    for part in iter_payload_parts(payload):
        body = part.get("body")
        if not isinstance(body, dict):
            continue

        attachment_id = body.get("attachmentId")
        filename = part.get("filename")
        mime_type = part.get("mimeType")
        data = body.get("data")

        if isinstance(data, str) and data:
            try:
                decoded = decode_base64url_text(data)
            except (ValueError, UnicodeDecodeError) as exc:
                raise GmailMcpError("Gmail message body data could not be decoded.") from exc
            if mime_type == "text/plain":
                text_plain_parts.append(decoded)
            elif mime_type == "text/html":
                text_html_parts.append(decoded)
            continue

        if attachment_id or (isinstance(filename, str) and filename):
            attachment_filenames.append(filename if isinstance(filename, str) else "")

    return {
        "text_plain": "\n\n".join(part for part in text_plain_parts if part).strip(),
        "text_html": "\n\n".join(part for part in text_html_parts if part).strip(),
        "attachment_count": len(attachment_filenames),
        "attachment_filenames": attachment_filenames,
    }


def summarize_message(message: Dict[str, Any]) -> Dict[str, Any]:
    payload = message.get("payload")
    headers = extract_headers(payload) if isinstance(payload, dict) else {}
    return {
        "id": message.get("id"),
        "thread_id": message.get("threadId"),
        "snippet": message.get("snippet"),
        "internal_date_ms": message.get("internalDate"),
        "internal_date": iso_datetime_from_millis(message.get("internalDate")),
        "label_ids": message.get("labelIds", []),
        "headers": headers,
    }


class GmailOAuthSession:
    """Minimal Gmail OAuth token loader and refresher using stdlib HTTP."""

    def __init__(
        self,
        credentials_path: Path = CLIENT_CREDENTIALS_FILE,
        token_path: Path = TOKEN_FILE,
    ) -> None:
        self._credentials_path = credentials_path
        self._token_path = token_path
        try:
            credentials_doc = read_json_file(credentials_path)
        except GmailMcpError as exc:
            raise GmailMcpError(
                "Gmail OAuth client credentials are not configured yet. Save Google OAuth desktop credentials to "
                f"{self._credentials_path} and then run `python3 tools/gmail_mcp_server.py oauth-init`."
            ) from exc
        self._client_config = extract_client_config(credentials_doc)

    def get_access_token(self) -> str:
        token_data = self._load_token_data()
        expires_at = token_data.get("expires_at")
        if not isinstance(expires_at, int) or expires_at <= int(time.time()) + TOKEN_REFRESH_SKEW_SECONDS:
            token_data = self._refresh_access_token(token_data)

        access_token = token_data.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise GmailMcpError("Stored Gmail OAuth token is missing access_token.")
        return access_token

    def _load_token_data(self) -> Dict[str, Any]:
        try:
            token_data = read_json_file(self._token_path)
        except GmailMcpError as exc:
            raise GmailMcpError(
                "Gmail OAuth is not configured yet. Save Google OAuth desktop credentials to "
                f"{self._credentials_path} and then run `python3 tools/gmail_mcp_server.py oauth-init`."
            ) from exc

        refresh_token = token_data.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise GmailMcpError("Stored Gmail OAuth token is missing refresh_token.")
        return token_data

    def _refresh_access_token(self, token_data: Dict[str, Any]) -> Dict[str, Any]:
        refresh_token = token_data.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise GmailMcpError("Stored Gmail OAuth token is missing refresh_token.")

        response = self._request_json(
            self._client_config["token_uri"],
            payload={
                "client_id": self._client_config["client_id"],
                "client_secret": self._client_config["client_secret"],
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
        )

        access_token = response.get("access_token")
        expires_in = response.get("expires_in")
        if not isinstance(access_token, str) or not access_token:
            raise GmailMcpError("Google OAuth refresh response did not contain access_token.")
        if not isinstance(expires_in, int):
            raise GmailMcpError("Google OAuth refresh response did not contain expires_in.")

        refreshed = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "scope": response.get("scope", token_data.get("scope", GMAIL_READONLY_SCOPE)),
            "token_type": response.get("token_type", token_data.get("token_type", "Bearer")),
            "expires_at": int(time.time()) + expires_in,
        }
        secure_write_json(self._token_path, refreshed)
        return refreshed

    @staticmethod
    def _request_json(url: str, payload: Dict[str, str]) -> Dict[str, Any]:
        encoded = urllib.parse.urlencode(payload).encode("utf-8")
        req = request.Request(
            url,
            data=encoded,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = f"Google OAuth error: HTTP {exc.code}"
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                body = None
            if isinstance(body, dict):
                if isinstance(body.get("error_description"), str):
                    detail = body["error_description"]
                elif isinstance(body.get("error"), str):
                    detail = body["error"]
            raise GmailMcpError(detail) from exc
        except error.URLError as exc:
            raise GmailMcpError(f"Google OAuth request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GmailMcpError("Google OAuth endpoint returned invalid JSON.") from exc
        if not isinstance(parsed, dict):
            raise GmailMcpError("Google OAuth endpoint returned an invalid response object.")
        return parsed


class GmailClient:
    """Minimal Gmail REST client using the Python standard library only."""

    def __init__(self, oauth_session: GmailOAuthSession):
        self._oauth_session = oauth_session

    def request_json(
        self,
        method: str,
        path: str,
        query: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        query_string = ""
        if query:
            query_string = "?" + urllib.parse.urlencode(query, doseq=True)

        req = request.Request(
            f"{API_BASE}{path}{query_string}",
            headers={"Authorization": f"Bearer {self._oauth_session.get_access_token()}"},
            method=method,
        )

        try:
            with request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = f"Gmail API error: HTTP {exc.code}"
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                body = None
            if isinstance(body, dict):
                api_error = body.get("error")
                if isinstance(api_error, dict):
                    message = api_error.get("message")
                    if isinstance(message, str) and message:
                        detail = message
            raise GmailMcpError(detail) from exc
        except error.URLError as exc:
            raise GmailMcpError(f"Gmail API request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GmailMcpError("Gmail API returned invalid JSON.") from exc
        if not isinstance(parsed, dict):
            raise GmailMcpError("Gmail API returned an invalid response object.")
        return parsed

    def get_message(self, message_id: str, format_name: str) -> Dict[str, Any]:
        query = {"format": format_name}
        if format_name == "metadata":
            query["metadataHeaders"] = list(HEADER_NAMES)  # type: ignore[assignment]
        data = self.request_json(
            "GET",
            f"/messages/{urllib.parse.quote(message_id, safe='')}",
            query=query,
        )
        if not isinstance(data, dict):
            raise GmailMcpError("Gmail API did not return a message object.")
        return data

    def search_messages(self, query: str, max_results: int) -> Dict[str, Any]:
        response = self.request_json(
            "GET",
            "/messages",
            query={"q": query, "maxResults": str(max_results)},
        )

        messages = response.get("messages")
        if not isinstance(messages, list):
            messages = []

        summaries = []
        for entry in messages:
            if not isinstance(entry, dict):
                continue
            message_id = entry.get("id")
            if not isinstance(message_id, str) or not message_id:
                continue
            summaries.append(summarize_message(self.get_message(message_id, "metadata")))

        return {
            "query": query,
            "max_results": max_results,
            "result_size_estimate": response.get("resultSizeEstimate", len(summaries)),
            "messages": summaries,
        }

    def read_message(self, message_id: str) -> Dict[str, Any]:
        message = self.get_message(message_id, "full")
        summary = summarize_message(message)
        payload = message.get("payload")
        bodies = extract_message_bodies(payload if isinstance(payload, dict) else {})
        summary["body"] = bodies
        return summary


class GmailMcpServer:
    """Small stdio MCP server exposing the exact Gmail tools needed here."""

    def _load_runtime(self) -> GmailClient:
        return GmailClient(GmailOAuthSession())

    def search_messages(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        query = require_string(arguments, "query")
        max_results = require_max_results(arguments)
        client = self._load_runtime()
        return client.search_messages(query, max_results)

    def read_message(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        message_id = require_string(arguments, "message_id")
        client = self._load_runtime()
        return client.read_message(message_id)

    def tools_list(self) -> Dict[str, Any]:
        return {
            "tools": [
                {
                    "name": "searchMessages",
                    "description": "Search Gmail messages using Gmail query syntax and return compact message summaries.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Gmail search query, for example from:amazon.ca newer_than:30d.",
                            },
                            "max_results": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 100,
                                "default": 10,
                            },
                        },
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
                {
                    "name": "readMessage",
                    "description": "Read one Gmail message by id, returning metadata and inline bodies only.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "message_id": {"type": "string"},
                        },
                        "required": ["message_id"],
                        "additionalProperties": False,
                    },
                },
            ]
        }

    def handle_tool_call(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        if name == "searchMessages":
            return tool_result(self.search_messages(arguments))
        if name == "readMessage":
            return tool_result(self.read_message(arguments))
        raise GmailMcpError(f"Unknown tool: {name}")


def handle_message(server: GmailMcpServer, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
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
                    "name": "gmail_readonly",
                    "version": "0.1.0",
                    "description": "Repo-local read-only Gmail MCP tools for Amazon receipt workflows.",
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
        except GmailMcpError as exc:
            return success_response(request_id, tool_result({"error": str(exc)}, is_error=True))

    if request_id is None:
        return None
    return protocol_error(request_id, -32601, f"Method not found: {method}")


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    server_version = "GmailReadonlyOAuth/0.1"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        self.server.auth_response = {key: values[-1] for key, values in query.items() if values}  # type: ignore[attr-defined]
        self.server.auth_event.set()  # type: ignore[attr-defined]

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(
            b"Gmail read-only OAuth completed for Codex. You can close this browser tab and return to the terminal."
        )


def run_oauth_init() -> int:
    client_config = extract_client_config(read_json_file(CLIENT_CREDENTIALS_FILE))

    server = HTTPServer(("127.0.0.1", 0), OAuthCallbackHandler)
    server.auth_event = threading.Event()  # type: ignore[attr-defined]
    server.auth_response = {}  # type: ignore[attr-defined]
    port = server.server_address[1]
    redirect_uri = f"http://127.0.0.1:{port}/oauth2/callback"

    server_thread = threading.Thread(target=server.handle_request, daemon=True)
    server_thread.start()

    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).decode("ascii").rstrip("=")
    challenge_bytes = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode("ascii").rstrip("=")
    state = secrets.token_urlsafe(24)

    authorize_url = (
        client_config["auth_uri"]
        + "?"
        + urllib.parse.urlencode(
            {
                "client_id": client_config["client_id"],
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": GMAIL_READONLY_SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                "state": state,
            }
        )
    )

    sys.stderr.write(
        "Opening Google OAuth consent in your browser for the repo-local read-only Gmail MCP.\n"
    )
    sys.stderr.write(f"If the browser does not open, visit this URL manually:\n{authorize_url}\n")
    sys.stderr.flush()
    webbrowser.open(authorize_url, new=1, autoraise=True)

    if not server.auth_event.wait(timeout=300):  # type: ignore[attr-defined]
        raise GmailMcpError("Timed out waiting for the Gmail OAuth callback.")

    auth_response = server.auth_response  # type: ignore[attr-defined]
    server.server_close()

    if auth_response.get("state") != state:
        raise GmailMcpError("OAuth callback state did not match. Authentication was aborted.")
    if "error" in auth_response:
        raise GmailMcpError(f"Google OAuth returned an error: {auth_response['error']}")

    code = auth_response.get("code")
    if not isinstance(code, str) or not code:
        raise GmailMcpError("OAuth callback did not contain an authorization code.")

    token_response = GmailOAuthSession._request_json(
        client_config["token_uri"],
        payload={
            "client_id": client_config["client_id"],
            "client_secret": client_config["client_secret"],
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
    )

    access_token = token_response.get("access_token")
    refresh_token = token_response.get("refresh_token")
    expires_in = token_response.get("expires_in")
    if not isinstance(access_token, str) or not access_token:
        raise GmailMcpError("Google OAuth token response did not contain access_token.")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise GmailMcpError("Google OAuth token response did not contain refresh_token.")
    if not isinstance(expires_in, int):
        raise GmailMcpError("Google OAuth token response did not contain expires_in.")

    secure_write_json(
        TOKEN_FILE,
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "scope": token_response.get("scope", GMAIL_READONLY_SCOPE),
            "token_type": token_response.get("token_type", "Bearer"),
            "expires_at": int(time.time()) + expires_in,
        },
    )

    sys.stderr.write(f"Stored Gmail OAuth token at {TOKEN_FILE}\n")
    sys.stderr.flush()
    return 0


def main() -> int:
    if len(sys.argv) > 1:
        command = sys.argv[1]
        if command == "oauth-init":
            try:
                return run_oauth_init()
            except GmailMcpError as exc:
                sys.stderr.write(str(exc) + "\n")
                sys.stderr.flush()
                return 1
        sys.stderr.write(f"Unknown command: {command}\n")
        sys.stderr.flush()
        return 1

    server = GmailMcpServer()

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
                except GmailMcpError as exc:
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
        except GmailMcpError as exc:
            response = success_response(payload.get("id"), tool_result({"error": str(exc)}, is_error=True))
        if response is not None:
            emit(response)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
