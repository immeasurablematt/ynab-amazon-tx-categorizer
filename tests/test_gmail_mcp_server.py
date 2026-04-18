"""Unit tests for the repo-local Gmail MCP server helpers."""

import base64
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.gmail_mcp_server import (  # type: ignore[import-not-found]
    GmailMcpError,
    GmailMcpServer,
    extract_client_config,
    extract_message_bodies,
    summarize_message,
)


def encode_body(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii")


class TestExtractClientConfig(unittest.TestCase):
    def test_extracts_installed_google_oauth_client(self):
        config = extract_client_config(
            {
                "installed": {
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            }
        )

        self.assertEqual(config["client_id"], "client-id")
        self.assertEqual(config["client_secret"], "client-secret")
        self.assertEqual(config["token_uri"], "https://oauth2.googleapis.com/token")

    def test_rejects_missing_google_oauth_fields(self):
        with self.assertRaises(GmailMcpError):
            extract_client_config({"installed": {"client_id": "only-id"}})


class TestMessageHelpers(unittest.TestCase):
    def test_extract_message_bodies_decodes_inline_parts_and_counts_attachments(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": encode_body("plain body")},
                },
                {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        {
                            "mimeType": "text/html",
                            "body": {"data": encode_body("<p>html body</p>")},
                        }
                    ],
                },
                {
                    "filename": "invoice.pdf",
                    "mimeType": "application/pdf",
                    "body": {"attachmentId": "attachment-123"},
                },
            ],
        }

        bodies = extract_message_bodies(payload)

        self.assertEqual(bodies["text_plain"], "plain body")
        self.assertEqual(bodies["text_html"], "<p>html body</p>")
        self.assertEqual(bodies["attachment_count"], 1)
        self.assertEqual(bodies["attachment_filenames"], ["invoice.pdf"])

    def test_summarize_message_returns_selected_headers(self):
        message = {
            "id": "msg-123",
            "threadId": "thread-123",
            "snippet": "Amazon order placed",
            "internalDate": "1710000000000",
            "labelIds": ["INBOX"],
            "payload": {
                "headers": [
                    {"name": "Subject", "value": "Your Amazon.ca order"},
                    {"name": "From", "value": "Amazon.ca <auto-confirm@amazon.ca>"},
                    {"name": "Date", "value": "Mon, 1 Jan 2026 10:00:00 -0500"},
                ]
            },
        }

        summary = summarize_message(message)

        self.assertEqual(summary["id"], "msg-123")
        self.assertEqual(summary["headers"]["Subject"], "Your Amazon.ca order")
        self.assertEqual(summary["headers"]["From"], "Amazon.ca <auto-confirm@amazon.ca>")
        self.assertEqual(summary["label_ids"], ["INBOX"])


class TestGmailMcpServer(unittest.TestCase):
    def test_tools_list_exposes_only_read_only_tools(self):
        tools = GmailMcpServer().tools_list()["tools"]
        self.assertEqual([tool["name"] for tool in tools], ["searchMessages", "readMessage"])


if __name__ == "__main__":
    unittest.main()
