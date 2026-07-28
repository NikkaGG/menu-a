"""Kitchen order status callbacks."""

from __future__ import annotations

import logging
import re
from typing import Any

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from bot.db import BackendApiError
from bot.formatting import (
    format_cooking_order,
    format_ready_order,
    format_waiter_notification,
)
from bot.order_validation import is_complete_order

router = Router(name="kitchen")
_LOGGER = logging.getLogger(__name__)
_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_COOKING_PATTERN = rf"^order:cooking:({_UUID})$"
_READY_PATTERN = rf"^order:ready:({_UUID})$"


def _order_id(callback: Any) -> str | None:
    match = re.fullmatch(rf"order:(?:cooking|ready):({_UUID})", callback.data or "")
    return match.group(1) if match else None


async def _answer(callback: Any, logger: Any) -> None:
    try:
        await callback.answer()
    except Exception:
        logger.error("Telegram callback acknowledgement failed")


def _kitchen_message(callback: Any, config: Any) -> bool:
    message = getattr(callback, "message", None)
    chat = getattr(message, "chat", None)
    return chat is not None and getattr(chat, "id", None) == config.kitchen_chat_id


def _keyboard(order_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Готово", callback_data=f"order:ready:{order_id}"
                )
            ]
        ]
    )


async def _edit_or_replace(
    callback: Any,
    config: Any,
    backend: Any,
    order_id: str,
    text: str,
    markup: InlineKeyboardMarkup | None,
    logger: Any,
) -> None:
    message = callback.message
    try:
        await message.edit_text(text=text, reply_markup=markup)
        return
    except TelegramBadRequest:
        logger.error("Kitchen message edit failed")
    except Exception:
        logger.error("Kitchen message edit outcome uncertain")
        return
    try:
        replacement = await callback.bot.send_message(
            chat_id=config.kitchen_chat_id, text=text, reply_markup=markup
        )
        message_id = getattr(replacement, "message_id", None)
        if isinstance(message_id, int) and not isinstance(message_id, bool) and message_id > 0:
            await _persist_replacement(
                backend, order_id, message_id, logger
            )
        else:
            logger.error("Kitchen replacement message invalid")
    except Exception:
        logger.error("Kitchen replacement message failed")


async def _persist_replacement(
    backend: Any,
    order_id: str,
    message_id: int,
    logger: Any,
) -> None:
    for attempt in range(2):
        try:
            await backend.save_telegram_message_id(order_id, message_id)
            return
        except BackendApiError:
            if attempt == 0:
                continue
        except Exception:
            pass
        logger.error("Kitchen message persistence failed")
        return


async def _transition(
    callback: Any,
    backend: Any,
    config: Any,
    expected: str,
    target: str,
    formatter: Any,
    markup: InlineKeyboardMarkup | None,
    logger: Any,
) -> dict[str, Any] | None:
    order_id = _order_id(callback)
    if order_id is None or not _kitchen_message(callback, config):
        await _answer(callback, logger)
        return None
    await _answer(callback, logger)
    try:
        current = await backend.get_order(order_id)
        if not is_complete_order(current):
            logger.error("Kitchen backend order invalid")
            return None
        if current.get("status") != expected:
            return None
        await backend.update_order_status(order_id, target)
        await _edit_or_replace(
            callback,
            config,
            backend,
            order_id,
            formatter(current),
            markup,
            logger,
        )
        return current
    except BackendApiError as error:
        if error.status == 409:
            return None
        logger.error("Kitchen backend operation failed")
    except Exception:
        logger.error("Kitchen order processing failed")
    return None


async def handle_cooking(
    callback: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    await _transition(
        callback,
        backend,
        config,
        "new",
        "cooking",
        format_cooking_order,
        _keyboard(_order_id(callback) or ""),
        logger,
    )


async def _notify_waiter(
    callback: Any, config: Any, order: dict[str, Any], logger: Any
) -> int | None:
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Показать счёт",
                    callback_data=f"bill:{order['sessionId']}",
                )
            ]
        ]
    )
    try:
        message = await callback.bot.send_message(
            chat_id=config.waiter_chat_id,
            text=format_waiter_notification(order),
            reply_markup=markup,
        )
    except TelegramBadRequest:
        pass
    except Exception:
        logger.error("Waiter notification outcome uncertain")
        return None
    else:
        message_id = getattr(message, "message_id", None)
        if (
            isinstance(message_id, int)
            and not isinstance(message_id, bool)
            and message_id > 0
        ):
            return message_id
        logger.error("Waiter notification returned invalid message")
        return None
    try:
        message = await callback.bot.send_message(
            chat_id=config.waiter_chat_id,
            text=format_waiter_notification(order),
            reply_markup=markup,
        )
        message_id = getattr(message, "message_id", None)
        if (
            isinstance(message_id, int)
            and not isinstance(message_id, bool)
            and message_id > 0
        ):
            return message_id
        logger.error("Waiter notification returned invalid message")
    except Exception:
        logger.error("Waiter notification failed")
    return None


def _persisted_waiter_message(state: Any) -> bool | None:
    if not isinstance(state, dict):
        return None
    message_id = state.get("waiterMessageId")
    if message_id is None:
        return False
    if (
        isinstance(message_id, int)
        and not isinstance(message_id, bool)
        and message_id > 0
    ):
        return True
    if isinstance(message_id, str) and message_id.isdecimal() and int(message_id) > 0:
        return True
    return None


async def _release_waiter_claim(
    backend: Any, order_id: str, claim_token: str, logger: Any
) -> None:
    try:
        await backend.release_waiter_notification(order_id, claim_token)
    except Exception:
        logger.error("Waiter notification claim release failed")


async def handle_ready(
    callback: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    order_id = _order_id(callback)
    if order_id is None or not _kitchen_message(callback, config):
        await _answer(callback, logger)
        return
    await _answer(callback, logger)
    try:
        current = await backend.get_order(order_id)
        if not is_complete_order(current):
            logger.error("Kitchen backend order invalid")
            return
        if current.get("status") == "cooking":
            try:
                await backend.update_order_status(order_id, "ready")
            except BackendApiError as error:
                if error.status != 409:
                    raise
                current = await backend.get_order(order_id)
                if (
                    not is_complete_order(current)
                    or current.get("status") != "ready"
                ):
                    return
        elif current.get("status") != "ready":
            return

        state = await backend.claim_waiter_notification(order_id)
        persisted = _persisted_waiter_message(state)
        if persisted is None:
            logger.error("Waiter notification state invalid")
            return
        if persisted:
            claim_token = None
        else:
            claim_token = state.get("waiterNotificationClaimToken")
            if not isinstance(claim_token, str) or not claim_token:
                return
            message_id = await _notify_waiter(
                callback, config, current, logger
            )
            if message_id is None:
                await _release_waiter_claim(
                    backend, order_id, claim_token, logger
                )
                return
            try:
                await backend.save_waiter_message_id(
                    order_id, message_id, claim_token
                )
            except Exception:
                await _release_waiter_claim(
                    backend, order_id, claim_token, logger
                )
                raise

        await _edit_or_replace(
            callback,
            config,
            backend,
            order_id,
            format_ready_order(current),
            None,
            logger,
        )
    except BackendApiError:
        logger.error("Kitchen backend operation failed")
    except Exception:
        logger.error("Kitchen order processing failed")


router.callback_query.register(
    handle_cooking, F.data.regexp(_COOKING_PATTERN)
)
router.callback_query.register(handle_ready, F.data.regexp(_READY_PATTERN))
