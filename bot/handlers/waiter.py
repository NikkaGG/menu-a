"""Waiter bill viewing and table-closing flows."""

from __future__ import annotations

import logging
import re
from typing import Any

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from bot.db import BackendApiError
from bot.formatting import (
    format_bill,
    format_close_confirmation,
    format_closed_bill,
    format_open_tables,
)
from bot.order_validation import is_complete_bill, is_open_table


router = Router(name="waiter")
_LOGGER = logging.getLogger(__name__)
_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_BILL_PATTERN = rf"^bill:({_UUID})$"
_CLOSE_PATTERN = rf"^close:({_UUID})$"
_CONFIRM_PATTERN = rf"^close:confirm:({_UUID})$"
_CANCEL_PATTERN = rf"^close:cancel:({_UUID})$"
_STAFF_ERROR = "Не удалось загрузить данные стола. Попробуйте позже."
_TABLE_BUTTON_LIMIT = 64


async def _answer(callback: Any, logger: Any) -> None:
    try:
        await callback.answer()
    except Exception:
        logger.error("Waiter callback acknowledgement failed")


def _waiter_callback(callback: Any, config: Any) -> bool:
    message = getattr(callback, "message", None)
    chat = getattr(message, "chat", None)
    return chat is not None and getattr(chat, "id", None) == config.waiter_chat_id


def _session_id(callback: Any, action: str) -> str | None:
    match = re.fullmatch(rf"{action}:({_UUID})", callback.data or "")
    return match.group(1) if match else None


def _close_keyboard(session_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Закрыть стол", callback_data=f"close:{session_id}"
                )
            ]
        ]
    )


def _confirmation_keyboard(session_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Да", callback_data=f"close:confirm:{session_id}"
                ),
                InlineKeyboardButton(
                    text="Отмена", callback_data=f"close:cancel:{session_id}"
                ),
            ]
        ]
    )


def _table_button_text(number: str) -> str:
    prefix = "Стол №"
    suffix = " — Показать счёт"
    available = _TABLE_BUTTON_LIMIT - len(prefix) - len(suffix)
    displayed = number.strip()
    if len(displayed) > available:
        displayed = displayed[: available - 1] + "…"
    return prefix + displayed + suffix


async def _send(
    bot: Any, chat_id: int, text: str, markup: Any, logger: Any
) -> None:
    try:
        await bot.send_message(
            chat_id=chat_id, text=text, reply_markup=markup
        )
    except Exception:
        logger.error("Waiter message send failed")


async def _edit_or_replace(
    callback: Any,
    config: Any,
    text: str,
    markup: InlineKeyboardMarkup | None,
    logger: Any,
) -> None:
    try:
        await callback.message.edit_text(text=text, reply_markup=markup)
        return
    except TelegramBadRequest:
        logger.error("Waiter message edit failed")
    except Exception:
        logger.error("Waiter message edit outcome uncertain")
        return
    await _send(callback.bot, config.waiter_chat_id, text, markup, logger)


async def _safe_bill(
    backend: Any, session_id: str, logger: Any
) -> dict[str, Any] | None:
    try:
        current = await backend.get_session_bill(session_id)
    except BackendApiError:
        logger.error("Waiter backend bill request failed")
        return None
    except Exception:
        logger.error("Waiter bill processing failed")
        return None
    if not is_complete_bill(current) or current["session"]["id"] != session_id:
        logger.error("Waiter backend bill invalid")
        return None
    return current


async def _send_staff_error(callback: Any, config: Any, logger: Any) -> None:
    await _send(callback.bot, config.waiter_chat_id, _STAFF_ERROR, None, logger)


async def _answer_message(
    message: Any,
    text: str,
    logger: Any,
    markup: InlineKeyboardMarkup | None = None,
) -> None:
    try:
        if markup is None:
            await message.answer(text)
        else:
            await message.answer(text, reply_markup=markup)
    except Exception:
        logger.error("Waiter message answer failed")


async def handle_bill(
    callback: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    session_id = _session_id(callback, "bill")
    allowed = session_id is not None and _waiter_callback(callback, config)
    await _answer(callback, logger)
    if not allowed:
        return
    current = await _safe_bill(backend, session_id, logger)
    if current is None:
        await _send_staff_error(callback, config, logger)
        return
    markup = (
        _close_keyboard(session_id)
        if current["session"]["status"] == "open"
        else None
    )
    await _send(
        callback.bot,
        config.waiter_chat_id,
        format_bill(current),
        markup,
        logger,
    )


async def handle_close(
    callback: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    session_id = _session_id(callback, "close")
    allowed = session_id is not None and _waiter_callback(callback, config)
    await _answer(callback, logger)
    if not allowed:
        return
    current = await _safe_bill(backend, session_id, logger)
    if current is None:
        await _send_staff_error(callback, config, logger)
        return
    if current["session"]["status"] == "closed":
        text = format_closed_bill(current)
        markup = None
    else:
        text = format_close_confirmation(current)
        markup = _confirmation_keyboard(session_id)
    await _edit_or_replace(callback, config, text, markup, logger)


async def handle_close_confirm(
    callback: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    session_id = _session_id(callback, "close:confirm")
    allowed = session_id is not None and _waiter_callback(callback, config)
    await _answer(callback, logger)
    if not allowed:
        return
    current = await _safe_bill(backend, session_id, logger)
    if current is None:
        await _send_staff_error(callback, config, logger)
        return
    if current["session"]["status"] == "closed":
        await _edit_or_replace(
            callback, config, format_closed_bill(current), None, logger
        )
        return
    try:
        closed = await backend.close_session(session_id)
        if not isinstance(closed, dict) or closed.get("status") != "closed":
            logger.error("Waiter close response invalid")
            return
    except BackendApiError as error:
        if error.status != 409:
            logger.error("Waiter close request failed")
            return
        reconciled = await _safe_bill(backend, session_id, logger)
        if reconciled is not None:
            await _edit_or_replace(
                callback, config, format_closed_bill(reconciled), None, logger
            )
        return
    except Exception:
        logger.error("Waiter close processing failed")
        return
    reconciled = await _safe_bill(backend, session_id, logger)
    if reconciled is None or reconciled["session"]["status"] != "closed":
        logger.error("Waiter closed bill unavailable")
        return
    await _edit_or_replace(
        callback, config, format_closed_bill(reconciled), None, logger
    )


async def handle_close_cancel(
    callback: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    session_id = _session_id(callback, "close:cancel")
    allowed = session_id is not None and _waiter_callback(callback, config)
    await _answer(callback, logger)
    if not allowed:
        return
    current = await _safe_bill(backend, session_id, logger)
    if current is None:
        await _send_staff_error(callback, config, logger)
        return
    markup = (
        _close_keyboard(session_id)
        if current["session"]["status"] == "open"
        else None
    )
    text = (
        format_bill(current)
        if current["session"]["status"] == "open"
        else format_closed_bill(current)
    )
    await _edit_or_replace(callback, config, text, markup, logger)


async def handle_tables(
    message: Any, backend: Any, config: Any, logger: Any = _LOGGER
) -> None:
    chat = getattr(message, "chat", None)
    if chat is None or getattr(chat, "id", None) != config.waiter_chat_id:
        return
    try:
        tables = await backend.list_open_tables()
    except BackendApiError:
        logger.error("Waiter open tables request failed")
        await _answer_message(message, _STAFF_ERROR, logger)
        return
    except Exception:
        logger.error("Waiter open tables processing failed")
        await _answer_message(message, _STAFF_ERROR, logger)
        return
    if not isinstance(tables, list) or not all(is_open_table(row) for row in tables):
        logger.error("Waiter open tables response invalid")
        await _answer_message(message, _STAFF_ERROR, logger)
        return
    if not tables:
        await _answer_message(message, "Открытых столов нет.", logger)
        return
    text, displayed = format_open_tables(tables)
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_table_button_text(row["table"]["number"]),
                    callback_data=f"bill:{row['sessionId']}",
                )
            ]
            for row in displayed
        ]
    )
    await _answer_message(message, text, logger, markup)


router.callback_query.register(handle_bill, F.data.regexp(_BILL_PATTERN))
router.callback_query.register(handle_close, F.data.regexp(_CLOSE_PATTERN))
router.callback_query.register(
    handle_close_confirm, F.data.regexp(_CONFIRM_PATTERN)
)
router.callback_query.register(
    handle_close_cancel, F.data.regexp(_CANCEL_PATTERN)
)
router.message.register(handle_tables, Command("tables"))
