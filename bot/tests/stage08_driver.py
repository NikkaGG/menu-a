"""Cross-runtime Stage08 driver using production bot workflows."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from types import SimpleNamespace
from typing import Any

from aiohttp import ClientSession, web

from bot.db import BackendApiClient
from bot.handlers.kitchen import handle_cooking, handle_ready
from bot.handlers.waiter import handle_bill, handle_close, handle_close_confirm
from bot.internal_api import create_app


KITCHEN_CHAT_ID = -1008001
WAITER_CHAT_ID = -1008002


class TelegramMessage:
    def __init__(self, chat_id: int, message_id: int):
        self.chat = SimpleNamespace(id=chat_id)
        self.message_id = message_id
        self.edits: list[dict[str, Any]] = []

    async def edit_text(self, *, text: str, reply_markup: Any = None) -> None:
        self.edits.append({"text": text, "reply_markup": reply_markup})


class TelegramBot:
    def __init__(self, kitchen_message_id: int, waiter_message_id: int):
        self.kitchen_message_id = kitchen_message_id
        self.waiter_message_id = waiter_message_id
        self.sent: list[dict[str, Any]] = []

    async def send_message(
        self, *, chat_id: int, text: str, reply_markup: Any = None
    ) -> Any:
        self.sent.append(
            {
                "chat_id": chat_id,
                "text": text,
                "reply_markup": reply_markup,
                "messageId": (
                    self.kitchen_message_id
                    if chat_id == KITCHEN_CHAT_ID
                    else self.waiter_message_id
                ),
            }
        )
        message_id = (
            self.kitchen_message_id
            if chat_id == KITCHEN_CHAT_ID
            else self.waiter_message_id
        )
        return SimpleNamespace(message_id=message_id)


class Callback:
    def __init__(
        self, data: str, chat_id: int, message_id: int, bot: TelegramBot
    ):
        self.data = data
        self.message = TelegramMessage(chat_id, message_id)
        self.bot = bot
        self.answered = 0

    async def answer(self) -> None:
        self.answered += 1


def config(secret: str) -> Any:
    return SimpleNamespace(
        bot_internal_api_secret=secret,
        kitchen_chat_id=KITCHEN_CHAT_ID,
        waiter_chat_id=WAITER_CHAT_ID,
    )


def button(markup: Any, row: int = 0, column: int = 0) -> Any:
    return markup.inline_keyboard[row][column]


async def intake(
    payload: dict[str, Any],
    backend: BackendApiClient,
    secret: str,
) -> dict[str, Any]:
    kitchen_message_id = payload["kitchenMessageId"]
    bot = TelegramBot(kitchen_message_id, payload["waiterMessageId"])
    app = create_app(
        bot=bot,
        config=config(secret),
        backend=backend,
    )
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    try:
        sockets = site._server.sockets
        port = sockets[0].getsockname()[1]
        async with ClientSession() as session:
            response = await session.post(
                f"http://127.0.0.1:{port}/internal/orders/new",
                headers={"Authorization": f"Bearer {secret}"},
                json=payload["notification"],
            )
            body = await response.json()
        assert response.status == 200
        assert body == {"ok": True, "messageId": kitchen_message_id}
    finally:
        await runner.cleanup()

    assert len(bot.sent) == 1
    card = bot.sent[0]
    order = payload["notification"]["order"]
    card_button = button(card["reply_markup"])
    assert card["chat_id"] == KITCHEN_CHAT_ID
    assert card["messageId"] == kitchen_message_id
    assert f"Заказ {order['id']}" in card["text"]
    assert f"Итого: {order['total']} ₸" in card["text"]
    for item in order["items"]:
        assert f"{item['quantity']} × {item['dishName']}" in card["text"]
    assert "Статус: Принят" in card["text"]
    assert card_button.text == "▶️ Начать готовить"
    assert card_button.callback_data == f"order:cooking:{order['id']}"
    return {
        "mode": "intake",
        "orderId": order["id"],
        "messageId": kitchen_message_id,
        "button": card_button.callback_data,
        "cardAccepted": True,
    }


async def transition(
    payload: dict[str, Any],
    backend: BackendApiClient,
    secret: str,
) -> dict[str, Any]:
    order_id = payload["orderId"]
    session_id = payload["sessionId"]
    bot = TelegramBot(payload["kitchenMessageId"], payload["waiterMessageId"])
    current_config = config(secret)

    cooking = Callback(
        f"order:cooking:{order_id}",
        KITCHEN_CHAT_ID,
        payload["kitchenMessageId"],
        bot,
    )
    assert cooking.message.message_id == payload["kitchenMessageId"]
    await handle_cooking(cooking, backend, current_config)
    assert cooking.answered == 1
    assert len(cooking.message.edits) == 1
    cooking_edit = cooking.message.edits[0]
    ready_button = button(cooking_edit["reply_markup"])
    assert "Статус: Готовится" in cooking_edit["text"]
    assert ready_button.callback_data == f"order:ready:{order_id}"
    assert (await backend.get_order(order_id))["status"] == "cooking"

    ready = Callback(
        f"order:ready:{order_id}",
        KITCHEN_CHAT_ID,
        payload["kitchenMessageId"],
        bot,
    )
    assert ready.message.message_id == payload["kitchenMessageId"]
    await handle_ready(ready, backend, current_config)
    assert ready.answered == 1
    assert len(ready.message.edits) == 1
    ready_edit = ready.message.edits[0]
    assert "Статус: Готово" in ready_edit["text"]
    assert ready_edit["reply_markup"] is None
    assert len(bot.sent) == 1
    waiter_card = bot.sent[0]
    bill_button = button(waiter_card["reply_markup"])
    assert waiter_card["chat_id"] == WAITER_CHAT_ID
    assert f"Заказ {order_id}" in waiter_card["text"]
    assert bill_button.callback_data == f"bill:{session_id}"
    assert (await backend.get_order(order_id))["status"] == "ready"
    return {
        "mode": "transition",
        "orderId": order_id,
        "statuses": ["cooking", "ready"],
        "readyButton": ready_button.callback_data,
        "billButton": bill_button.callback_data,
        "waiterMessageId": payload["waiterMessageId"],
    }


async def waiter_close(
    payload: dict[str, Any],
    backend: BackendApiClient,
    secret: str,
) -> dict[str, Any]:
    session_id = payload["sessionId"]
    bot = TelegramBot(payload["kitchenMessageId"], payload["waiterMessageId"])
    current_config = config(secret)

    bill_callback = Callback(
        f"bill:{session_id}",
        WAITER_CHAT_ID,
        payload["waiterMessageId"],
        bot,
    )
    assert bill_callback.message.message_id == payload["waiterMessageId"]
    await handle_bill(bill_callback, backend, current_config)
    assert bill_callback.answered == 1
    bill_card = bot.sent[-1]
    close_button = button(bill_card["reply_markup"])
    assert payload["expectedTotal"] in bill_card["text"]
    assert close_button.callback_data == f"close:{session_id}"

    close_callback = Callback(
        close_button.callback_data,
        WAITER_CHAT_ID,
        payload["waiterMessageId"],
        bot,
    )
    await handle_close(close_callback, backend, current_config)
    confirmation = close_callback.message.edits[-1]
    confirmation_buttons = confirmation["reply_markup"].inline_keyboard[0]
    assert "Подтвердите закрытие" in confirmation["text"]
    assert [entry.callback_data for entry in confirmation_buttons] == [
        f"close:confirm:{session_id}",
        f"close:cancel:{session_id}",
    ]

    confirm_callback = Callback(
        confirmation_buttons[0].callback_data,
        WAITER_CHAT_ID,
        payload["waiterMessageId"],
        bot,
    )
    await handle_close_confirm(confirm_callback, backend, current_config)
    final_edit = confirm_callback.message.edits[-1]
    assert "закрыт" in final_edit["text"]
    assert payload["expectedTotal"] in final_edit["text"]
    assert final_edit["reply_markup"] is None
    closed_bill = await backend.get_session_bill(session_id)
    assert closed_bill["session"]["status"] == "closed"
    return {
        "mode": "waiter-close",
        "sessionId": session_id,
        "total": closed_bill["total"],
        "closeButton": close_button.callback_data,
        "confirmationShown": True,
        "closed": True,
    }


async def run() -> dict[str, Any]:
    if len(sys.argv) != 2:
        raise RuntimeError("invalid mode")
    mode = sys.argv[1]
    payload = json.loads(sys.stdin.read())
    bridge_url = os.environ["STAGE08_BRIDGE_URL"]
    secret = os.environ["STAGE08_BOT_SECRET"]
    async with BackendApiClient(
        bridge_url, secret, timeout=5
    ) as backend:
        if mode == "intake":
            return await intake(payload, backend, secret)
        if mode == "transition":
            return await transition(payload, backend, secret)
        if mode == "waiter-close":
            return await waiter_close(payload, backend, secret)
    raise RuntimeError("invalid mode")


if __name__ == "__main__":
    result = asyncio.run(asyncio.wait_for(run(), timeout=12))
    print(json.dumps(result, separators=(",", ":"), ensure_ascii=True))
