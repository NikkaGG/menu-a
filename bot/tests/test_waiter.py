import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import SendMessage

from bot.db import BackendApiError
from bot.handlers.waiter import (
    handle_bill,
    handle_close,
    handle_close_cancel,
    handle_close_confirm,
    handle_tables,
    router,
)


SESSION_ID = "223e4567-e89b-12d3-a456-426614174000"
ORDER_ID = "123e4567-e89b-12d3-a456-426614174000"
TABLE_ID = "323e4567-e89b-12d3-a456-426614174000"
CONFIG = SimpleNamespace(waiter_chat_id=-1002)


def bill(status="open"):
    return {
        "session": {"id": SESSION_ID, "status": status},
        "table": {"id": TABLE_ID, "number": "12"},
        "orders": [
            {
                "id": ORDER_ID,
                "sessionId": SESSION_ID,
                "status": "ready",
                "total": "1250.50",
                "items": [
                    {
                        "dishName": "Ролл",
                        "dishPrice": "500.00",
                        "quantity": 2,
                        "subtotal": "1000.00",
                    },
                    {
                        "dishName": "Чай",
                        "dishPrice": "250.50",
                        "quantity": 1,
                        "subtotal": "250.50",
                    },
                ],
            }
        ],
        "total": "1250.50",
    }


def callback(data, chat_id=-1002):
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


def telegram_bad_request():
    return TelegramBadRequest(
        method=SendMessage(chat_id=CONFIG.waiter_chat_id, text="test"),
        message="telegram secret",
    )


class WaiterHandlerTests(unittest.IsolatedAsyncioTestCase):
    async def test_registers_four_exact_callbacks_and_tables_command(self):
        callbacks = router.observers["callback_query"].handlers
        self.assertEqual(
            [entry.callback for entry in callbacks],
            [handle_bill, handle_close, handle_close_confirm, handle_close_cancel],
        )
        samples = [
            f"bill:{SESSION_ID}",
            f"close:{SESSION_ID}",
            f"close:confirm:{SESSION_ID}",
            f"close:cancel:{SESSION_ID}",
        ]
        for index, entry in enumerate(callbacks):
            for sample_index, sample in enumerate(samples):
                self.assertEqual(
                    (await entry.check(SimpleNamespace(data=sample)))[0],
                    index == sample_index,
                )
            for invalid in (
                samples[index] + ":extra",
                "x" + samples[index],
                samples[index].rsplit(":", 1)[0] + ":not-a-uuid",
            ):
                self.assertFalse(
                    (await entry.check(SimpleNamespace(data=invalid)))[0]
                )
        messages = router.observers["message"].handlers
        self.assertEqual(len(messages), 1)
        self.assertIs(messages[0].callback, handle_tables)

    async def test_callbacks_reject_wrong_or_missing_chat_quietly(self):
        for handler, data in (
            (handle_bill, f"bill:{SESSION_ID}"),
            (handle_close, f"close:{SESSION_ID}"),
            (handle_close_confirm, f"close:confirm:{SESSION_ID}"),
            (handle_close_cancel, f"close:cancel:{SESSION_ID}"),
        ):
            for event in (callback(data, -9), callback(data)):
                if event.message.chat.id == CONFIG.waiter_chat_id:
                    event.message = None
                backend = SimpleNamespace(
                    get_session_bill=AsyncMock(), close_session=AsyncMock()
                )
                await handler(event, backend, CONFIG)
                event.answer.assert_awaited_once_with()
                backend.get_session_bill.assert_not_awaited()
                backend.close_session.assert_not_awaited()

    async def test_bill_sends_authoritative_detailed_bill_and_close_button(self):
        backend = SimpleNamespace(get_session_bill=AsyncMock(return_value=bill()))
        event = callback(f"bill:{SESSION_ID}")

        await handle_bill(event, backend, CONFIG)

        event.answer.assert_awaited_once_with()
        backend.get_session_bill.assert_awaited_once_with(SESSION_ID)
        event.bot.send_message.assert_awaited_once()
        sent = event.bot.send_message.await_args.kwargs
        self.assertEqual(sent["chat_id"], CONFIG.waiter_chat_id)
        for part in (
            "Стол №12",
            f"Заказ {ORDER_ID}",
            "2 × Ролл",
            "1000.00 ₸",
            "Итого заказа: 1250.50 ₸",
            "Итого по столу: 1250.50 ₸",
        ):
            self.assertIn(part, sent["text"])
        button = sent["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.text, "Закрыть стол")
        self.assertEqual(button.callback_data, f"close:{SESSION_ID}")
        self.assertLessEqual(len(sent["text"]), 4096)

    async def test_close_only_asks_for_confirmation_with_latest_total(self):
        backend = SimpleNamespace(
            get_session_bill=AsyncMock(return_value=bill()),
            close_session=AsyncMock(),
        )
        event = callback(f"close:{SESSION_ID}")

        await handle_close(event, backend, CONFIG)

        backend.get_session_bill.assert_awaited_once_with(SESSION_ID)
        backend.close_session.assert_not_awaited()
        edit = event.message.edit_text.await_args.kwargs
        self.assertEqual(
            edit["text"],
            "Подтвердите закрытие стола №12 на сумму 1250.50 ₸",
        )
        buttons = edit["reply_markup"].inline_keyboard[0]
        self.assertEqual(
            [(button.text, button.callback_data) for button in buttons],
            [
                ("Да", f"close:confirm:{SESSION_ID}"),
                ("Отмена", f"close:cancel:{SESSION_ID}"),
            ],
        )

    async def test_confirm_refetches_then_closes_and_removes_buttons(self):
        closed_bill = bill(status="closed")
        closed_bill["total"] = "1500.00"
        backend = SimpleNamespace(
            get_session_bill=AsyncMock(side_effect=[bill(), closed_bill]),
            close_session=AsyncMock(return_value={"status": "closed"}),
        )
        event = callback(f"close:confirm:{SESSION_ID}")

        await handle_close_confirm(event, backend, CONFIG)

        self.assertEqual(backend.get_session_bill.await_count, 2)
        backend.get_session_bill.assert_awaited_with(SESSION_ID)
        backend.close_session.assert_awaited_once_with(SESSION_ID)
        edit = event.message.edit_text.await_args.kwargs
        self.assertIn("Стол №12 закрыт", edit["text"])
        self.assertIn("1500.00 ₸", edit["text"])
        self.assertIsNone(edit["reply_markup"])

    async def test_cancel_refetches_bill_without_mutation(self):
        backend = SimpleNamespace(
            get_session_bill=AsyncMock(return_value=bill()),
            close_session=AsyncMock(),
        )
        event = callback(f"close:cancel:{SESSION_ID}")

        await handle_close_cancel(event, backend, CONFIG)

        backend.get_session_bill.assert_awaited_once_with(SESSION_ID)
        backend.close_session.assert_not_awaited()
        edit = event.message.edit_text.await_args.kwargs
        self.assertIn("Итого по столу: 1250.50 ₸", edit["text"])
        self.assertEqual(
            edit["reply_markup"].inline_keyboard[0][0].callback_data,
            f"close:{SESSION_ID}",
        )

    async def test_conflict_reconciles_to_closed_state_without_error_details(self):
        backend = SimpleNamespace(
            get_session_bill=AsyncMock(
                side_effect=[bill(), bill(status="closed")]
            ),
            close_session=AsyncMock(
                side_effect=BackendApiError("secret conflict", 409)
            ),
        )
        event = callback(f"close:confirm:{SESSION_ID}")
        logger = Mock()

        await handle_close_confirm(event, backend, CONFIG, logger)

        self.assertEqual(backend.get_session_bill.await_count, 2)
        self.assertIn("закрыт", event.message.edit_text.await_args.kwargs["text"])
        self.assertNotIn("secret", str(logger.method_calls))

    async def test_tables_empty_and_list_have_one_bill_button_per_table(self):
        empty_message = AsyncMock()
        empty_message.chat.id = CONFIG.waiter_chat_id
        backend = SimpleNamespace(list_open_tables=AsyncMock(return_value=[]))
        await handle_tables(empty_message, backend, CONFIG)
        empty_message.answer.assert_awaited_once_with("Открытых столов нет.")

        tables_message = AsyncMock()
        tables_message.chat.id = CONFIG.waiter_chat_id
        backend.list_open_tables.return_value = [
            {
                "sessionId": SESSION_ID,
                "table": {"id": TABLE_ID, "number": "12"},
                "orderCount": 2,
                "total": "1250.50",
            }
        ]
        await handle_tables(tables_message, backend, CONFIG)
        sent = tables_message.answer.await_args
        self.assertIn("Стол №12 — заказов: 2 — 1250.50 ₸", sent.args[0])
        button = sent.kwargs["reply_markup"].inline_keyboard[0][0]
        self.assertEqual(button.text, "Стол №12 — Показать счёт")
        self.assertLessEqual(len(button.text), 64)
        self.assertEqual(button.callback_data, f"bill:{SESSION_ID}")

    async def test_tables_button_text_with_long_number_is_bounded(self):
        message = AsyncMock()
        message.chat.id = CONFIG.waiter_chat_id
        backend = SimpleNamespace(
            list_open_tables=AsyncMock(
                return_value=[
                    {
                        "sessionId": SESSION_ID,
                        "table": {
                            "id": TABLE_ID,
                            "number": "1" * 100,
                        },
                        "orderCount": 1,
                        "total": "1.00",
                    }
                ]
            )
        )

        await handle_tables(message, backend, CONFIG)

        button = message.answer.await_args.kwargs[
            "reply_markup"
        ].inline_keyboard[0][0]
        self.assertTrue(button.text.startswith("Стол №"))
        self.assertTrue(button.text.endswith(" — Показать счёт"))
        self.assertLessEqual(len(button.text), 64)

    async def test_tables_rejects_wrong_chat(self):
        message = AsyncMock()
        message.chat.id = -9
        backend = SimpleNamespace(list_open_tables=AsyncMock())

        await handle_tables(message, backend, CONFIG)

        backend.list_open_tables.assert_not_awaited()
        message.answer.assert_not_awaited()

    async def test_tables_normal_answer_failure_is_logged_without_propagating(self):
        message = AsyncMock()
        message.chat.id = CONFIG.waiter_chat_id
        message.answer.side_effect = RuntimeError("telegram normal secret")
        backend = SimpleNamespace(
            list_open_tables=AsyncMock(
                return_value=[
                    {
                        "sessionId": SESSION_ID,
                        "table": {"id": TABLE_ID, "number": "12"},
                        "orderCount": 1,
                        "total": "10.00",
                    }
                ]
            )
        )
        logger = Mock()

        await handle_tables(message, backend, CONFIG, logger)

        message.answer.assert_awaited_once()
        self.assertTrue(logger.error.called)
        self.assertNotIn("secret", str(logger.method_calls))

    async def test_tables_error_answer_failure_is_logged_without_propagating(self):
        message = AsyncMock()
        message.chat.id = CONFIG.waiter_chat_id
        message.answer.side_effect = RuntimeError("telegram error secret")
        backend = SimpleNamespace(
            list_open_tables=AsyncMock(
                side_effect=BackendApiError("backend secret")
            )
        )
        logger = Mock()

        await handle_tables(message, backend, CONFIG, logger)

        message.answer.assert_awaited_once_with(
            "Не удалось загрузить данные стола. Попробуйте позже."
        )
        self.assertTrue(logger.error.called)
        self.assertNotIn("secret", str(logger.method_calls))

    async def test_malformed_bill_never_closes_and_uses_safe_message_and_log(self):
        malformed = bill()
        malformed["orders"][0]["items"][0]["subtotal"] = "NaN secret"
        for handler, data in (
            (handle_bill, f"bill:{SESSION_ID}"),
            (handle_close, f"close:{SESSION_ID}"),
            (handle_close_confirm, f"close:confirm:{SESSION_ID}"),
            (handle_close_cancel, f"close:cancel:{SESSION_ID}"),
        ):
            backend = SimpleNamespace(
                get_session_bill=AsyncMock(return_value=malformed),
                close_session=AsyncMock(),
            )
            event = callback(data)
            logger = Mock()
            await handler(event, backend, CONFIG, logger)
            backend.close_session.assert_not_awaited()
            self.assertNotIn("secret", str(logger.method_calls))
            self.assertTrue(logger.error.called)

    async def test_unbounded_money_is_rejected_before_formatting(self):
        malformed = bill()
        malformed["total"] = "1e5000"
        backend = SimpleNamespace(get_session_bill=AsyncMock(return_value=malformed))
        event = callback(f"bill:{SESSION_ID}")
        logger = Mock()

        await handle_bill(event, backend, CONFIG, logger)

        sent = event.bot.send_message.await_args.kwargs["text"]
        self.assertEqual(sent, "Не удалось загрузить данные стола. Попробуйте позже.")
        self.assertLessEqual(len(sent), 4096)
        self.assertTrue(logger.error.called)

    async def test_deterministic_edit_failure_falls_back_but_ambiguous_does_not(self):
        for error, expected_sends in (
            (telegram_bad_request(), 1),
            (RuntimeError("network secret"), 0),
        ):
            backend = SimpleNamespace(get_session_bill=AsyncMock(return_value=bill()))
            event = callback(f"close:{SESSION_ID}")
            event.message.edit_text.side_effect = error
            logger = Mock()

            await handle_close(event, backend, CONFIG, logger)

            self.assertEqual(event.bot.send_message.await_count, expected_sends)
            self.assertNotIn("secret", str(logger.method_calls))

    async def test_bill_and_tables_are_bounded_and_mark_truncation(self):
        huge = bill()
        huge["orders"] = [
            {
                **huge["orders"][0],
                "id": f"{index:08x}-e89b-12d3-a456-426614174000",
                "items": huge["orders"][0]["items"] * 20,
            }
            for index in range(200)
        ]
        backend = SimpleNamespace(get_session_bill=AsyncMock(return_value=huge))
        event = callback(f"bill:{SESSION_ID}")
        await handle_bill(event, backend, CONFIG)
        text = event.bot.send_message.await_args.kwargs["text"]
        self.assertLessEqual(len(text), 4096)
        self.assertIn("сокращ", text.lower())
        self.assertIn("Стол №12", text)
        self.assertTrue(text.endswith("Итого по столу: 1250.50 ₸"))

        message = AsyncMock()
        message.chat.id = CONFIG.waiter_chat_id
        backend = SimpleNamespace(
            list_open_tables=AsyncMock(
                return_value=[
                    {
                        "sessionId": f"{index:08x}-e89b-12d3-a456-426614174000",
                        "table": {"id": TABLE_ID, "number": str(index)},
                        "orderCount": index,
                        "total": "1.00",
                    }
                    for index in range(120)
                ]
            )
        )
        await handle_tables(message, backend, CONFIG)
        sent = message.answer.await_args
        self.assertLessEqual(len(sent.args[0]), 4096)
        buttons = sum(
            len(row) for row in sent.kwargs["reply_markup"].inline_keyboard
        )
        self.assertLessEqual(buttons, 50)
        self.assertIn("сокращ", sent.args[0].lower())


if __name__ == "__main__":
    unittest.main()
