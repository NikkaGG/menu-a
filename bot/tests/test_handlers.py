import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import CommandStart
from aiogram.methods import SendMessage

from bot.db import BackendApiError
from bot.handlers import common_router, kitchen_router, router, waiter_router
from bot.handlers.common import handle_start
from bot.handlers.kitchen import handle_cooking, handle_ready
from bot.handlers.waiter import handle_tables


ORDER_ID = "123e4567-e89b-12d3-a456-426614174000"
SESSION_ID = "223e4567-e89b-12d3-a456-426614174000"


def order(status):
    return {
        "id": ORDER_ID,
        "sessionId": SESSION_ID,
        "status": status,
        "total": "1250.50",
        "items": [{"dishName": "Ролл", "quantity": 2}],
        "table": {"number": "12"},
    }


def callback(data, chat_id=-1001):
    message = SimpleNamespace(
        chat=SimpleNamespace(id=chat_id),
        message_id=77,
        edit_text=AsyncMock(),
    )
    return SimpleNamespace(
        data=data,
        message=message,
        bot=SimpleNamespace(send_message=AsyncMock()),
        answer=AsyncMock(),
    )


CONFIG = SimpleNamespace(kitchen_chat_id=-1001, waiter_chat_id=-1002)


def rejected(message="telegram secret"):
    return TelegramBadRequest(
        method=SendMessage(chat_id=CONFIG.kitchen_chat_id, text="test"),
        message=message,
    )


class HandlerRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_root_router_includes_each_handler_group_exactly_once(self):
        self.assertEqual(router.name, "root")
        self.assertEqual(
            router.sub_routers,
            [common_router, kitchen_router, waiter_router],
        )

    async def test_start_answers_with_staff_configuration_message_without_chat_id(self):
        message = AsyncMock()
        message.chat.id = -100123456

        await handle_start(message)

        message.answer.assert_awaited_once()
        response = message.answer.await_args.args[0]
        self.assertIn("персонал", response.lower())
        self.assertIn("настро", response.lower())
        self.assertNotIn(str(message.chat.id), response)
        self.assertLessEqual(len(response), 200)

    async def test_common_router_has_only_the_start_handler(self):
        handlers = common_router.observers["message"].handlers

        self.assertEqual(common_router.name, "common")
        self.assertEqual(len(handlers), 1)
        self.assertIs(handlers[0].callback, handle_start)
        self.assertTrue(
            any(
                isinstance(filter_.callback, CommandStart)
                for filter_ in handlers[0].filters
            )
        )

    async def test_kitchen_and_waiter_register_their_handlers(self):
        self.assertEqual(kitchen_router.name, "kitchen")
        self.assertEqual(waiter_router.name, "waiter")
        self.assertIsNot(kitchen_router, waiter_router)
        self.assertIsNot(kitchen_router, common_router)
        self.assertIsNot(waiter_router, common_router)
        self.assertEqual(kitchen_router.observers["message"].handlers, [])
        self.assertEqual(
            [handler.callback for handler in waiter_router.observers["message"].handlers],
            [handle_tables],
        )
        handlers = kitchen_router.observers["callback_query"].handlers
        self.assertEqual(
            [handler.callback for handler in handlers],
            [handle_cooking, handle_ready],
        )
        self.assertEqual(len(waiter_router.observers["callback_query"].handlers), 4)

    async def test_kitchen_callback_patterns_are_exact_and_action_specific(self):
        cooking, ready = kitchen_router.observers["callback_query"].handlers
        cooking_data = f"order:cooking:{ORDER_ID}"
        ready_data = f"order:ready:{ORDER_ID}"

        self.assertTrue((await cooking.check(SimpleNamespace(data=cooking_data)))[0])
        self.assertFalse((await cooking.check(SimpleNamespace(data=ready_data)))[0])
        self.assertTrue((await ready.check(SimpleNamespace(data=ready_data)))[0])
        self.assertFalse((await ready.check(SimpleNamespace(data=cooking_data)))[0])
        for invalid in (
            f"x{cooking_data}",
            f"{cooking_data}:extra",
            "order:cooking:not-a-uuid",
        ):
            self.assertFalse(
                (await cooking.check(SimpleNamespace(data=invalid)))[0]
            )

    async def test_cooking_is_restricted_to_kitchen_chat_and_answers_promptly(self):
        backend = SimpleNamespace(get_order=AsyncMock())
        event = callback(f"order:cooking:{ORDER_ID}", chat_id=-999)

        await handle_cooking(event, backend, CONFIG)

        event.answer.assert_awaited_once_with()
        backend.get_order.assert_not_awaited()
        event.message.edit_text.assert_not_awaited()

    async def test_missing_message_is_quietly_rejected(self):
        backend = SimpleNamespace(get_order=AsyncMock())
        event = callback(f"order:cooking:{ORDER_ID}")
        event.message = None

        await handle_cooking(event, backend, CONFIG)

        event.answer.assert_awaited_once_with()
        backend.get_order.assert_not_awaited()

    async def test_new_order_transitions_to_cooking_and_edits_keyboard(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("new")),
            update_order_status=AsyncMock(return_value={"status": "cooking"}),
        )
        event = callback(f"order:cooking:{ORDER_ID}")

        await handle_cooking(event, backend, CONFIG)

        event.answer.assert_awaited_once_with()
        backend.get_order.assert_awaited_once_with(ORDER_ID)
        backend.update_order_status.assert_awaited_once_with(ORDER_ID, "cooking")
        event.message.edit_text.assert_awaited_once()
        kwargs = event.message.edit_text.await_args.kwargs
        self.assertIn("Статус: Готовится", kwargs["text"])
        button = kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.text, "✅ Готово")
        self.assertEqual(button.callback_data, f"order:ready:{ORDER_ID}")
        self.assertLessEqual(len(button.callback_data.encode()), 64)

    async def test_ready_transition_edits_card_and_notifies_waiter(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("cooking")),
            update_order_status=AsyncMock(return_value={"status": "ready"}),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }
            ),
            save_waiter_message_id=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")
        event.bot.send_message.return_value = SimpleNamespace(message_id=88)

        await handle_ready(event, backend, CONFIG)

        backend.update_order_status.assert_awaited_once_with(ORDER_ID, "ready")
        backend.save_waiter_message_id.assert_awaited_once_with(
            ORDER_ID, 88, "claim"
        )
        event.message.edit_text.assert_awaited_once()
        edit_kwargs = event.message.edit_text.await_args.kwargs
        self.assertIn("Статус: Готово", edit_kwargs["text"])
        self.assertIsNone(edit_kwargs["reply_markup"])
        event.bot.send_message.assert_awaited_once()
        send_kwargs = event.bot.send_message.await_args.kwargs
        self.assertEqual(send_kwargs["chat_id"], CONFIG.waiter_chat_id)
        self.assertIn("СТОЛ 12", send_kwargs["text"])
        self.assertIn("2 × Ролл", send_kwargs["text"])
        self.assertIn(ORDER_ID, send_kwargs["text"])
        button = send_kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.text, "Показать счёт")
        self.assertEqual(button.callback_data, f"bill:{SESSION_ID}")
        self.assertLessEqual(len(button.callback_data.encode()), 64)

    async def test_duplicate_or_advanced_status_is_idempotent(self):
        for handler, action, status in (
            (handle_cooking, "cooking", "cooking"),
            (handle_cooking, "cooking", "ready"),
            (handle_ready, "ready", "new"),
        ):
            with self.subTest(action=action, status=status):
                backend = SimpleNamespace(
                    get_order=AsyncMock(return_value=order(status)),
                    update_order_status=AsyncMock(),
                )
                event = callback(f"order:{action}:{ORDER_ID}")

                await handler(event, backend, CONFIG)

                backend.update_order_status.assert_not_awaited()
                event.message.edit_text.assert_not_awaited()
                event.bot.send_message.assert_not_awaited()

    async def test_conflict_is_quietly_idempotent(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("new")),
            update_order_status=AsyncMock(side_effect=BackendApiError("http", 409)),
        )
        event = callback(f"order:cooking:{ORDER_ID}")

        await handle_cooking(event, backend, CONFIG)

        event.answer.assert_awaited_once_with()
        event.message.edit_text.assert_not_awaited()

    async def test_malformed_current_order_never_mutates_status(self):
        malformed_orders = [
            None,
            {**order("new"), "id": "not-a-uuid"},
            {**order("new"), "sessionId": "not-a-uuid"},
            {**order("new"), "status": "bogus"},
            {**order("new"), "total": "NaN"},
            {**order("new"), "total": "-1"},
            {**order("new"), "table": {"number": " "}},
            {**order("new"), "items": []},
            {
                **order("new"),
                "items": [{"dishName": " ", "quantity": 1}],
            },
            {
                **order("new"),
                "items": [{"dishName": "Ролл", "quantity": True}],
            },
            {
                **order("new"),
                "items": [{"dishName": "Ролл", "quantity": 0}],
            },
        ]
        for malformed in malformed_orders:
            with self.subTest(order=malformed):
                backend = SimpleNamespace(
                    get_order=AsyncMock(return_value=malformed),
                    update_order_status=AsyncMock(),
                )
                event = callback(f"order:cooking:{ORDER_ID}")
                logger = Mock()

                await handle_cooking(event, backend, CONFIG, logger)

                backend.update_order_status.assert_not_awaited()
                event.message.edit_text.assert_not_awaited()
                self.assertTrue(logger.error.called)
                self.assertNotIn("not-a-uuid", str(logger.method_calls))

    async def test_edit_failure_sends_replacement_and_persists_message_id(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("new")),
            update_order_status=AsyncMock(return_value=order("cooking")),
            save_telegram_message_id=AsyncMock(),
        )
        event = callback(f"order:cooking:{ORDER_ID}")
        event.message.edit_text.side_effect = rejected()
        event.bot.send_message.return_value = SimpleNamespace(message_id=99)
        logger = Mock()

        await handle_cooking(event, backend, CONFIG, logger)

        event.bot.send_message.assert_awaited_once()
        replacement = event.bot.send_message.await_args.kwargs
        self.assertEqual(replacement["chat_id"], CONFIG.kitchen_chat_id)
        self.assertIn("Статус: Готовится", replacement["text"])
        await_args = backend.save_telegram_message_id.await_args
        self.assertEqual(await_args.args, (ORDER_ID, 99))
        self.assertNotIn("telegram secret", str(logger.method_calls))

    async def test_ambiguous_edit_failure_does_not_send_replacement(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("new")),
            update_order_status=AsyncMock(return_value=order("cooking")),
            save_telegram_message_id=AsyncMock(),
        )
        event = callback(f"order:cooking:{ORDER_ID}")
        event.message.edit_text.side_effect = RuntimeError("ambiguous secret")
        logger = Mock()

        await handle_cooking(event, backend, CONFIG, logger)

        event.bot.send_message.assert_not_awaited()
        backend.save_telegram_message_id.assert_not_awaited()
        self.assertNotIn("ambiguous secret", str(logger.method_calls))

    async def test_replacement_message_persistence_retries_once(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("new")),
            update_order_status=AsyncMock(return_value=order("cooking")),
            save_telegram_message_id=AsyncMock(
                side_effect=[BackendApiError("connection"), None]
            ),
        )
        event = callback(f"order:cooking:{ORDER_ID}")
        event.message.edit_text.side_effect = rejected()
        event.bot.send_message.return_value = SimpleNamespace(message_id=99)
        logger = Mock()

        await handle_cooking(event, backend, CONFIG, logger)

        self.assertEqual(backend.save_telegram_message_id.await_count, 2)
        backend.save_telegram_message_id.assert_awaited_with(ORDER_ID, 99)

    async def test_backend_and_replacement_failures_are_logged_safely(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(side_effect=RuntimeError("backend secret")),
        )
        event = callback(f"order:cooking:{ORDER_ID}")
        logger = Mock()

        await handle_cooking(event, backend, CONFIG, logger)

        event.answer.assert_awaited_once_with()
        self.assertTrue(logger.error.called)
        self.assertNotIn("backend secret", str(logger.method_calls))

    async def test_waiter_send_is_retried_once_without_crashing(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("cooking")),
            update_order_status=AsyncMock(return_value=order("ready")),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }
            ),
            save_waiter_message_id=AsyncMock(),
            release_waiter_notification=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")
        event.bot.send_message.side_effect = [
            rejected("first secret"),
            SimpleNamespace(message_id=88),
        ]
        logger = Mock()

        await handle_ready(event, backend, CONFIG, logger)

        self.assertEqual(event.bot.send_message.await_count, 2)
        self.assertNotIn("secret", str(logger.method_calls))

    async def test_ambiguous_waiter_failure_is_not_retried(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("cooking")),
            update_order_status=AsyncMock(return_value=order("ready")),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }
            ),
            save_waiter_message_id=AsyncMock(),
            release_waiter_notification=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")
        event.bot.send_message.side_effect = RuntimeError("network secret")
        logger = Mock()

        await handle_ready(event, backend, CONFIG, logger)

        self.assertEqual(event.bot.send_message.await_count, 1)
        backend.release_waiter_notification.assert_awaited_once_with(
            ORDER_ID, "claim"
        )
        event.message.edit_text.assert_not_awaited()
        self.assertNotIn("network secret", str(logger.method_calls))

    async def test_already_ready_without_notification_recovers_delivery(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("ready")),
            update_order_status=AsyncMock(),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }
            ),
            save_waiter_message_id=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")
        event.bot.send_message.return_value = SimpleNamespace(message_id=91)

        await handle_ready(event, backend, CONFIG)

        backend.update_order_status.assert_not_awaited()
        backend.save_waiter_message_id.assert_awaited_once_with(
            ORDER_ID, 91, "claim"
        )
        event.bot.send_message.assert_awaited_once()
        event.message.edit_text.assert_awaited_once()
        self.assertIsNone(
            event.message.edit_text.await_args.kwargs["reply_markup"]
        )

    async def test_already_notified_ready_order_only_reconciles_kitchen_card(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("ready")),
            update_order_status=AsyncMock(),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": 91,
                    "waiterNotificationClaimToken": None,
                }
            ),
            save_waiter_message_id=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")

        await handle_ready(event, backend, CONFIG)

        backend.update_order_status.assert_not_awaited()
        backend.save_waiter_message_id.assert_not_awaited()
        event.bot.send_message.assert_not_awaited()
        event.message.edit_text.assert_awaited_once()

    async def test_waiter_persistence_failure_leaves_ready_button_for_retry(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("cooking")),
            update_order_status=AsyncMock(return_value=order("ready")),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }
            ),
            save_waiter_message_id=AsyncMock(
                side_effect=BackendApiError("connection")
            ),
            release_waiter_notification=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")
        event.bot.send_message.return_value = SimpleNamespace(message_id=92)
        logger = Mock()

        await handle_ready(event, backend, CONFIG, logger)

        backend.save_waiter_message_id.assert_awaited_once_with(
            ORDER_ID, 92, "claim"
        )
        backend.release_waiter_notification.assert_awaited_once_with(
            ORDER_ID, "claim"
        )
        event.message.edit_text.assert_not_awaited()
        self.assertNotIn("connection", str(logger.method_calls))

    async def test_kitchen_finalization_happens_only_after_persistence(self):
        event = callback(f"order:ready:{ORDER_ID}")

        async def persist(*_):
            event.message.edit_text.assert_not_awaited()

        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("ready")),
            update_order_status=AsyncMock(),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }
            ),
            save_waiter_message_id=AsyncMock(side_effect=persist),
        )
        event.bot.send_message.return_value = SimpleNamespace(message_id=93)

        await handle_ready(event, backend, CONFIG)

        backend.save_waiter_message_id.assert_awaited_once_with(
            ORDER_ID, 93, "claim"
        )
        event.message.edit_text.assert_awaited_once()

    async def test_claim_denial_quietly_leaves_ready_card_unchanged(self):
        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("ready")),
            update_order_status=AsyncMock(),
            claim_waiter_notification=AsyncMock(
                return_value={
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": None,
                }
            ),
            save_waiter_message_id=AsyncMock(),
        )
        event = callback(f"order:ready:{ORDER_ID}")

        await handle_ready(event, backend, CONFIG)

        event.bot.send_message.assert_not_awaited()
        backend.save_waiter_message_id.assert_not_awaited()
        event.message.edit_text.assert_not_awaited()

    async def test_concurrent_ready_callbacks_send_waiter_message_once(self):
        lock = asyncio.Lock()
        state = {"claimed": False, "message_id": None}

        async def claim(_):
            async with lock:
                if state["message_id"] is not None:
                    return {
                        "id": ORDER_ID,
                        "waiterMessageId": state["message_id"],
                        "waiterNotificationClaimToken": None,
                    }
                if state["claimed"]:
                    return {
                        "id": ORDER_ID,
                        "waiterMessageId": None,
                        "waiterNotificationClaimToken": None,
                    }
                state["claimed"] = True
                return {
                    "id": ORDER_ID,
                    "waiterMessageId": None,
                    "waiterNotificationClaimToken": "claim",
                }

        async def save(_, message_id, claim_token):
            self.assertEqual(claim_token, "claim")
            state["message_id"] = message_id
            state["claimed"] = False
            return {"id": ORDER_ID, "waiterMessageId": message_id}

        backend = SimpleNamespace(
            get_order=AsyncMock(return_value=order("ready")),
            update_order_status=AsyncMock(),
            claim_waiter_notification=AsyncMock(side_effect=claim),
            save_waiter_message_id=AsyncMock(side_effect=save),
            release_waiter_notification=AsyncMock(),
        )
        bot = SimpleNamespace(send_message=AsyncMock())

        async def send(**_):
            await asyncio.sleep(0)
            return SimpleNamespace(message_id=94)

        bot.send_message.side_effect = send
        first = callback(f"order:ready:{ORDER_ID}")
        second = callback(f"order:ready:{ORDER_ID}")
        first.bot = bot
        second.bot = bot

        await asyncio.gather(
            handle_ready(first, backend, CONFIG),
            handle_ready(second, backend, CONFIG),
        )

        self.assertEqual(bot.send_message.await_count, 1)
        self.assertEqual(backend.save_waiter_message_id.await_count, 1)
        self.assertEqual(
            first.message.edit_text.await_count
            + second.message.edit_text.await_count,
            1,
        )


if __name__ == "__main__":
    unittest.main()
