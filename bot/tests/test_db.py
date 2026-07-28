import asyncio
import unittest

import aiohttp

from bot.db import BackendApiClient, BackendApiError


SECRET = "x" * 32


class FakeResponse:
    def __init__(self, status=200, payload=None, json_error=None):
        self.status = status
        self.payload = payload
        self.json_error = json_error

    async def json(self):
        if self.json_error:
            raise self.json_error
        return self.payload


class FakeRequestContext:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.response

    async def __aexit__(self, *_):
        return False


class FakeSession:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.requests = []
        self.closed = False

    def request(self, method, url, **kwargs):
        self.requests.append((method, url, kwargs))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            return FakeRequestContext(error=outcome)
        return FakeRequestContext(response=outcome)

    async def close(self):
        self.closed = True


class BackendApiClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_methods_send_expected_requests_and_unwrap_payloads(self):
        session = FakeSession(
            [
                FakeResponse(payload={"order": {"id": "a/b"}}),
                FakeResponse(payload={"order": {"status": "ready"}}),
                FakeResponse(
                    payload={
                        "session": {"id": "table 1"},
                        "table": {"id": "table-id", "number": "1"},
                        "orders": [],
                        "total": "42.00",
                    }
                ),
                FakeResponse(
                    payload={
                        "session": {"id": "table 1"},
                        "table": {"id": "table-id", "number": "1"},
                        "orders": [],
                        "total": "42.00",
                    }
                ),
                FakeResponse(payload={"order": {"id": "a/b", "telegramMessageId": 123}}),
                FakeResponse(
                    payload={
                        "order": {
                            "id": "a/b",
                            "waiterMessageId": None,
                            "waiterNotificationClaimToken": "claim",
                        }
                    }
                ),
                FakeResponse(payload={"released": True}),
                FakeResponse(payload={"order": {"id": "a/b", "waiterMessageId": None}}),
                FakeResponse(payload={"order": {"id": "a/b", "waiterMessageId": 456}}),
                FakeResponse(
                    payload={
                        "tables": [
                            {
                                "sessionId": "session-1",
                                "table": {"id": "table-1", "number": "1"},
                                "orderCount": 0,
                                "total": "0.00",
                            }
                        ]
                    }
                ),
            ]
        )
        client = BackendApiClient("https://menu.example/", SECRET, session=session)

        self.assertEqual(await client.get_order("a/b"), {"id": "a/b"})
        self.assertEqual(
            await client.update_order_status("a/b", "ready"),
            {"status": "ready"},
        )
        self.assertEqual(
            await client.get_session_bill("table 1"),
            {
                "session": {"id": "table 1"},
                "table": {"id": "table-id", "number": "1"},
                "orders": [],
                "total": "42.00",
            },
        )
        self.assertEqual(
            await client.close_session("table 1"),
            {"id": "table 1"},
        )
        self.assertEqual(
            await client.save_telegram_message_id("a/b", 123),
            {"id": "a/b", "telegramMessageId": 123},
        )
        self.assertEqual(
            await client.claim_waiter_notification("a/b"),
            {
                "id": "a/b",
                "waiterMessageId": None,
                "waiterNotificationClaimToken": "claim",
            },
        )
        self.assertEqual(
            await client.release_waiter_notification("a/b", "claim"),
            {"released": True},
        )
        self.assertEqual(
            await client.get_waiter_message_id("a/b"),
            {"id": "a/b", "waiterMessageId": None},
        )
        self.assertEqual(
            await client.save_waiter_message_id("a/b", 456, "claim"),
            {"id": "a/b", "waiterMessageId": 456},
        )
        self.assertEqual(
            await client.list_open_tables(),
            [
                {
                    "sessionId": "session-1",
                    "table": {"id": "table-1", "number": "1"},
                    "orderCount": 0,
                    "total": "0.00",
                }
            ],
        )

        self.assertEqual(
            [(method, url) for method, url, _ in session.requests],
            [
                ("GET", "https://menu.example/api/orders/a%2Fb"),
                ("POST", "https://menu.example/api/orders/a%2Fb/status"),
                ("GET", "https://menu.example/api/sessions/table%201/bill"),
                ("POST", "https://menu.example/api/sessions/table%201/close"),
                ("POST", "https://menu.example/api/orders/a%2Fb/telegram-message"),
                ("POST", "https://menu.example/api/orders/a%2Fb/waiter-notification-claim"),
                ("DELETE", "https://menu.example/api/orders/a%2Fb/waiter-notification-claim"),
                ("GET", "https://menu.example/api/orders/a%2Fb/waiter-message"),
                ("POST", "https://menu.example/api/orders/a%2Fb/waiter-message"),
                ("GET", "https://menu.example/api/sessions/open"),
            ],
        )
        for _, _, kwargs in session.requests:
            self.assertEqual(
                kwargs["headers"],
                {"Authorization": f"Bearer {SECRET}", "Accept": "application/json"},
            )
            self.assertIn("timeout", kwargs)
        self.assertNotIn("json", session.requests[0][2])
        self.assertEqual(session.requests[1][2]["json"], {"status": "ready"})
        self.assertNotIn("json", session.requests[2][2])
        self.assertEqual(session.requests[3][2]["json"], {})
        self.assertEqual(session.requests[4][2]["json"], {"telegram_message_id": 123})
        self.assertEqual(session.requests[5][2]["json"], {})
        self.assertEqual(session.requests[6][2]["json"], {"claim_token": "claim"})
        self.assertNotIn("json", session.requests[7][2])
        self.assertEqual(
            session.requests[8][2]["json"],
            {"waiter_message_id": 456, "claim_token": "claim"},
        )
        self.assertNotIn("json", session.requests[9][2])

    async def test_success_responses_require_endpoint_shapes(self):
        cases = [
            (
                "get_order",
                {"order": None},
                lambda client: client.get_order("order"),
            ),
            (
                "update_order_status",
                {"order": "ready"},
                lambda client: client.update_order_status("order", "ready"),
            ),
            (
                "save_telegram_message_id",
                {"order": []},
                lambda client: client.save_telegram_message_id("order", 123),
            ),
            (
                "claim_waiter_notification",
                {"order": []},
                lambda client: client.claim_waiter_notification("order"),
            ),
            (
                "release_waiter_notification",
                {"released": "yes"},
                lambda client: client.release_waiter_notification("order", "claim"),
            ),
            (
                "get_waiter_message_id",
                {"order": []},
                lambda client: client.get_waiter_message_id("order"),
            ),
            (
                "save_waiter_message_id",
                {"order": []},
                lambda client: client.save_waiter_message_id("order", 123, "claim"),
            ),
            (
                "get_session_bill",
                {
                    "session": {},
                    "table": {},
                    "orders": [],
                    "total": 42,
                },
                lambda client: client.get_session_bill("session"),
            ),
            (
                "close_session",
                {"session": "closed"},
                lambda client: client.close_session("session"),
            ),
            (
                "list_open_tables",
                {
                    "tables": [
                        {
                            "sessionId": "session-1",
                            "table": None,
                            "orderCount": 0,
                            "total": "0.00",
                        }
                    ]
                },
                lambda client: client.list_open_tables(),
            ),
        ]
        for name, payload, operation in cases:
            with self.subTest(name=name):
                client = BackendApiClient(
                    "https://menu.example",
                    SECRET,
                    session=FakeSession([FakeResponse(payload=payload)]),
                )
                with self.assertRaises(BackendApiError) as context:
                    await operation(client)
                self.assertEqual(context.exception.code, "invalid_response")

    async def test_open_tables_requires_tables_list(self):
        for payload in (None, {}, {"tables": {}}, {"tables": None}):
            client = BackendApiClient(
                "https://menu.example",
                SECRET,
                session=FakeSession([FakeResponse(payload=payload)]),
            )
            with self.assertRaises(BackendApiError) as context:
                await client.list_open_tables()
            self.assertEqual(context.exception.code, "invalid_response")

    async def test_errors_use_safe_categories_without_response_content(self):
        unsafe_body = {"error": f"backend leaked {SECRET}"}
        cases = [
            (asyncio.TimeoutError(f"timeout {SECRET}"), "timeout", None),
            (ConnectionError(f"connection {SECRET}"), "connection", None),
            (FakeResponse(status=503, payload=unsafe_body), "http", 503),
            (FakeResponse(payload=["not", "object"]), "invalid_response", None),
            (FakeResponse(payload={"wrong": unsafe_body}), "invalid_response", None),
            (
                FakeResponse(json_error=ValueError(f"bad json {SECRET}")),
                "invalid_response",
                None,
            ),
            (
                FakeResponse(
                    json_error=aiohttp.ClientPayloadError(f"payload {SECRET}")
                ),
                "invalid_response",
                None,
            ),
        ]
        for outcome, code, status in cases:
            with self.subTest(code=code, status=status):
                client = BackendApiClient(
                    "https://menu.example",
                    SECRET,
                    session=FakeSession([outcome]),
                )
                with self.assertRaises(BackendApiError) as context:
                    await client.get_order("order")
                error = context.exception
                self.assertEqual(error.code, code)
                self.assertEqual(error.status, status)
                self.assertNotIn(SECRET, str(error))
                self.assertNotIn(SECRET, repr(error))
                self.assertNotIn("backend leaked", str(error))

    async def test_redirect_client_errors_map_to_safe_connection_error(self):
        redirect_error = aiohttp.TooManyRedirects(
            request_info=None,
            history=(),
            status=302,
            message=f"redirected through https://menu.example/{SECRET}",
        )
        client = BackendApiClient(
            "https://menu.example",
            SECRET,
            session=FakeSession([redirect_error]),
        )

        with self.assertRaises(BackendApiError) as context:
            await client.get_order("order")

        error = context.exception
        self.assertEqual(error.code, "connection")
        self.assertIsNone(error.status)
        self.assertNotIn(SECRET, str(error))
        self.assertNotIn(SECRET, repr(error))
        self.assertNotIn("menu.example", str(error))

    async def test_lifecycle_closes_only_owned_sessions(self):
        external = FakeSession([])
        external_client = BackendApiClient(
            "https://menu.example", SECRET, session=external
        )
        await external_client.close()
        self.assertFalse(external.closed)

        explicitly_owned = FakeSession([])
        explicitly_owned_client = BackendApiClient(
            "https://menu.example",
            SECRET,
            session=explicitly_owned,
            owns_session=True,
        )
        await explicitly_owned_client.close()
        self.assertTrue(explicitly_owned.closed)

        owned = FakeSession([])
        owned_client = BackendApiClient(
            "https://menu.example",
            SECRET,
            session_factory=lambda **_: owned,
        )
        async with owned_client:
            pass
        self.assertTrue(owned.closed)


if __name__ == "__main__":
    unittest.main()
