"""Internal HTTP application for the bot process."""

from __future__ import annotations

import hmac
import json
import logging
from typing import Any

from aiohttp import web
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from bot.formatting import format_new_order
from bot.order_validation import is_complete_order


_LOGGER = logging.getLogger(__name__)
_BOT_KEY = web.AppKey("bot")
_CONFIG_KEY = web.AppKey("config")
_BACKEND_KEY = web.AppKey("backend")
_LOGGER_KEY = web.AppKey("logger")


async def _health(_: web.Request) -> web.Response:
    return web.json_response({"status": "ok"})


def _authorized(request: web.Request, secret: str) -> bool:
    authorization = request.headers.get("Authorization", "")
    expected = f"Bearer {secret}"
    return hmac.compare_digest(
        authorization.encode("utf-8"), expected.encode("utf-8")
    )


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_order(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    order = payload.get("order")
    if not isinstance(order, dict):
        return None
    if not is_complete_order(order) or not _nonempty_string(
        order.get("createdAt")
    ):
        return None
    return order


async def _new_order(request: web.Request) -> web.Response:
    config = request.app[_CONFIG_KEY]
    if config is None or not _authorized(
        request, config.bot_internal_api_secret
    ):
        return web.json_response({"error": "unauthorized"}, status=401)

    try:
        payload = await request.json()
    except (json.JSONDecodeError, ValueError, TypeError):
        return web.json_response({"error": "invalid_request"}, status=400)
    order = _valid_order(payload)
    if order is None:
        return web.json_response({"error": "invalid_request"}, status=400)

    bot = request.app[_BOT_KEY]
    backend = request.app[_BACKEND_KEY]
    logger = request.app[_LOGGER_KEY]
    if bot is None or backend is None:
        logger.error("Order intake dependencies unavailable")
        return web.json_response({"error": "service_unavailable"}, status=503)

    callback_data = f"order:cooking:{order['id']}"
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="▶️ Начать готовить",
                    callback_data=callback_data,
                )
            ]
        ]
    )
    try:
        message = await bot.send_message(
            chat_id=config.kitchen_chat_id,
            text=format_new_order(order),
            reply_markup=keyboard,
        )
    except Exception:
        logger.error("Telegram order notification failed")
        return web.json_response({"error": "upstream_failure"}, status=502)

    message_id = getattr(message, "message_id", None)
    if (
        isinstance(message_id, bool)
        or not isinstance(message_id, int)
        or message_id <= 0
    ):
        logger.error("Telegram order notification returned invalid message")
        return web.json_response({"error": "upstream_failure"}, status=502)
    try:
        await backend.save_telegram_message_id(order["id"], message_id)
    except Exception:
        logger.error("Order notification persistence failed")
        return web.json_response(
            {"error": "persistence_failure"}, status=503
        )
    return web.json_response({"ok": True, "messageId": message_id})


def create_app(
    *,
    bot: Any = None,
    config: Any = None,
    backend: Any = None,
    logger: Any = None,
) -> web.Application:
    """Build the public health and authenticated internal application."""

    app = web.Application()
    app[_BOT_KEY] = bot
    app[_CONFIG_KEY] = config
    app[_BACKEND_KEY] = backend
    app[_LOGGER_KEY] = logger or _LOGGER
    app.router.add_get("/health", _health)
    app.router.add_post("/internal/orders/new", _new_order)
    return app
