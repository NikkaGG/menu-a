import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from aiohttp.test_utils import TestClient, TestServer

from bot.internal_api import create_app


class InternalApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bot = SimpleNamespace(send_message=AsyncMock())
        self.bot.send_message.return_value = SimpleNamespace(message_id=321)
        self.backend = SimpleNamespace(
            save_telegram_message_id=AsyncMock(return_value={})
        )
        self.config = SimpleNamespace(
            bot_internal_api_secret="correct-secret",
            kitchen_chat_id=-100123,
        )
        self.logger = Mock()
        self.app = create_app(
            bot=self.bot,
            config=self.config,
            backend=self.backend,
            logger=self.logger,
        )
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_health_is_public_and_returns_exact_success_payload(self):
        response = await self.client.get("/health")

        self.assertEqual(response.status, 200)
        self.assertEqual(await response.json(), {"status": "ok"})

    async def test_health_rejects_unsupported_method_normally(self):
        response = await self.client.post("/health")

        self.assertEqual(response.status, 405)

    async def test_app_registers_health_and_order_intake_routes(self):
        self.assertEqual(
            [(route.method, route.resource.canonical) for route in self.app.router.routes()],
            [
                ("HEAD", "/health"),
                ("GET", "/health"),
                ("POST", "/internal/orders/new"),
            ],
        )

    async def test_order_intake_authenticates_before_parsing_body(self):
        response = await self.client.post(
            "/internal/orders/new",
            data="{not-json",
            headers={"Authorization": "Bearer wrong-secret"},
        )

        self.assertEqual(response.status, 401)
        self.assertEqual(await response.json(), {"error": "unauthorized"})
        self.bot.send_message.assert_not_awaited()

    async def test_order_intake_requires_exact_bearer_authorization(self):
        for authorization in (
            None,
            "correct-secret",
            "bearer correct-secret",
            "Bearer  correct-secret",
            "Bearer correct-secret ",
        ):
            headers = (
                {} if authorization is None else {"Authorization": authorization}
            )
            response = await self.client.post(
                "/internal/orders/new", headers=headers, json=self._payload()
            )
            self.assertEqual(response.status, 401)

    async def test_order_intake_rejects_malformed_nested_payload(self):
        malformed_payloads = [
            {},
            {"order": []},
            {"order": {**self._payload()["order"], "id": "not-a-uuid"}},
            {"order": {**self._payload()["order"], "sessionId": ""}},
            {
                "order": {
                    **self._payload()["order"],
                    "sessionId": "not-a-uuid",
                }
            },
            {"order": {**self._payload()["order"], "items": []}},
            {
                "order": {
                    **self._payload()["order"],
                    "items": [{"dishName": "", "quantity": 1}],
                }
            },
            {
                "order": {
                    **self._payload()["order"],
                    "table": {"number": ""},
                }
            },
        ]

        for payload in malformed_payloads:
            response = await self.client.post(
                "/internal/orders/new",
                headers=self._auth_headers(),
                json=payload,
            )
            self.assertEqual(response.status, 400, payload)
            self.assertEqual(await response.json(), {"error": "invalid_request"})

    async def test_order_intake_sends_plain_text_card_and_persists_message_id(self):
        response = await self.client.post(
            "/internal/orders/new",
            headers=self._auth_headers(),
            json=self._payload(),
        )

        self.assertEqual(response.status, 200)
        self.assertEqual(await response.json(), {"ok": True, "messageId": 321})
        self.bot.send_message.assert_awaited_once()
        call = self.bot.send_message.await_args
        self.assertEqual(call.kwargs["chat_id"], -100123)
        self.assertNotIn("parse_mode", call.kwargs)
        text = call.kwargs["text"]
        self.assertIn("СТОЛ 12", text)
        self.assertIn("Заказ 123e4567-e89b-12d3-a456-426614174000", text)
        self.assertIn("2 × Филадельфия <special>", text)
        self.assertIn("Итого: 1250.50 ₸", text)
        self.assertIn("Статус: Принят", text)
        self.assertNotIn("Статус: new", text)
        markup = call.kwargs["reply_markup"]
        button = markup.inline_keyboard[0][0]
        self.assertEqual(button.text, "▶️ Начать готовить")
        self.assertEqual(
            button.callback_data,
            "order:cooking:123e4567-e89b-12d3-a456-426614174000",
        )
        self.assertLessEqual(len(button.callback_data.encode()), 64)
        self.backend.save_telegram_message_id.assert_awaited_once_with(
            "123e4567-e89b-12d3-a456-426614174000", 321
        )

    async def test_invalid_telegram_message_ids_are_not_persisted(self):
        for message_id in (0, -1):
            with self.subTest(message_id=message_id):
                self.bot.send_message.return_value = SimpleNamespace(
                    message_id=message_id
                )

                response = await self.client.post(
                    "/internal/orders/new",
                    headers=self._auth_headers(),
                    json=self._payload(),
                )

                self.assertEqual(response.status, 502)
                self.assertEqual(
                    await response.json(), {"error": "upstream_failure"}
                )
        self.backend.save_telegram_message_id.assert_not_awaited()

    async def test_telegram_failure_returns_generic_error_and_logs_no_payload(self):
        self.bot.send_message.side_effect = RuntimeError("telegram exploded")

        response = await self.client.post(
            "/internal/orders/new",
            headers=self._auth_headers(),
            json=self._payload(),
        )

        self.assertEqual(response.status, 502)
        self.assertEqual(await response.json(), {"error": "upstream_failure"})
        self.backend.save_telegram_message_id.assert_not_awaited()
        logged = repr(self.logger.method_calls)
        self.assertNotIn("correct-secret", logged)
        self.assertNotIn("Филадельфия", logged)
        self.assertNotIn("telegram exploded", logged)

    async def test_persistence_failure_returns_generic_error_and_logs_safely(self):
        self.backend.save_telegram_message_id.side_effect = RuntimeError(
            "backend included sensitive response"
        )

        response = await self.client.post(
            "/internal/orders/new",
            headers=self._auth_headers(),
            json=self._payload(),
        )

        self.assertEqual(response.status, 503)
        self.assertEqual(await response.json(), {"error": "persistence_failure"})
        logged = repr(self.logger.method_calls)
        self.assertNotIn("correct-secret", logged)
        self.assertNotIn("Филадельфия", logged)
        self.assertNotIn("sensitive response", logged)

    @staticmethod
    def _auth_headers():
        return {"Authorization": "Bearer correct-secret"}

    @staticmethod
    def _payload():
        return {
            "order": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "sessionId": "223e4567-e89b-12d3-a456-426614174001",
                "status": "new",
                "total": "1250.50",
                "createdAt": "2026-07-28T12:00:00.000Z",
                "items": [
                    {
                        "dishName": "Филадельфия <special>",
                        "quantity": 2,
                        "price": "625.25",
                    }
                ],
                "table": {"number": "12"},
            }
        }


if __name__ == "__main__":
    unittest.main()
