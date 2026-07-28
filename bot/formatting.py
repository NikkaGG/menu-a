"""Plain-text Telegram order card formatting."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any


TELEGRAM_TEXT_LIMIT = 4096
_CARD_LIMIT = 4000
_FIELD_LIMIT = 180


def _truncate(value: Any, limit: int = _FIELD_LIMIT) -> str:
    text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _total(value: Any) -> str:
    try:
        return f"{Decimal(str(value)):.2f}"
    except (InvalidOperation, ValueError):
        return _truncate(value)


def format_new_order(order: dict[str, Any]) -> str:
    """Render an intake card without Telegram markup or parse mode."""

    return _format_kitchen_order(order, "Принят")


def format_cooking_order(order: dict[str, Any]) -> str:
    """Render the kitchen card after cooking starts."""

    return _format_kitchen_order(order, "Готовится")


def format_ready_order(order: dict[str, Any]) -> str:
    """Render the final kitchen card."""

    return _format_kitchen_order(order, "Готово")


def _format_kitchen_order(order: dict[str, Any], status: str) -> str:
    """Render a bounded plain-text kitchen card."""

    table = _truncate(order["table"]["number"], 80)
    header = [
        f"🔔 НОВЫЙ ЗАКАЗ — СТОЛ {table}",
        f"Заказ {_truncate(order['id'], 100)}",
        "",
    ]
    footer = [
        "",
        f"Итого: {_total(order['total'])} ₸",
        f"Статус: {status}",
    ]
    item_lines: list[str] = []
    for item in order["items"]:
        item_line = f"{item['quantity']} × {_truncate(item['dishName'])}"
        candidate = "\n".join(header + item_lines + [item_line] + footer)
        if len(candidate) > _CARD_LIMIT:
            marker = "… остальные позиции сокращены"
            while item_lines and len(
                "\n".join(header + item_lines + [marker] + footer)
            ) > _CARD_LIMIT:
                item_lines.pop()
            item_lines.append(marker)
            break
        item_lines.append(item_line)
    return "\n".join(header + item_lines + footer)


def format_waiter_notification(order: dict[str, Any]) -> str:
    """Render a short bounded ready-order notification for waiters."""

    header = [
        f"✅ ЗАКАЗ ГОТОВ — СТОЛ {_truncate(order['table']['number'], 80)}",
        f"Заказ {_truncate(order['id'], 100)}",
        "",
    ]
    item_lines: list[str] = []
    for item in order["items"]:
        line = f"{item['quantity']} × {_truncate(item['dishName'], 120)}"
        if len("\n".join(header + item_lines + [line])) > _CARD_LIMIT:
            item_lines.append("… остальные позиции сокращены")
            break
        item_lines.append(line)
    return "\n".join(header + item_lines)


def _money(value: Any) -> str:
    """Render validated money values consistently."""

    return f"{Decimal(str(value)):.2f}"


def format_bill(bill: dict[str, Any]) -> str:
    """Render a detailed bill while retaining its table and final total."""

    header = [f"Стол №{_truncate(bill['table']['number'], 80)}", ""]
    footer = ["", f"Итого по столу: {_money(bill['total'])} ₸"]
    details: list[str] = []
    truncated = False

    for order in bill["orders"]:
        order_lines = [f"Заказ {_truncate(order['id'], 100)}"]
        for item in order["items"]:
            order_lines.append(
                f"{item['quantity']} × {_truncate(item['dishName'], 160)}"
                f" — {_money(item['subtotal'])} ₸"
            )
        order_lines.append(f"Итого заказа: {_money(order['total'])} ₸")
        order_lines.append("")
        candidate = "\n".join(header + details + order_lines + footer)
        if len(candidate) > TELEGRAM_TEXT_LIMIT:
            truncated = True
            break
        details.extend(order_lines)

    if truncated:
        marker = "… детали счёта сокращены"
        while details and len(
            "\n".join(header + details + [marker] + footer)
        ) > TELEGRAM_TEXT_LIMIT:
            details.pop()
        details.append(marker)

    text = "\n".join(header + details + footer)
    if len(text) <= TELEGRAM_TEXT_LIMIT:
        return text
    # Header/footer fields are bounded, but keep this defensive final guard.
    return "\n".join(header + ["… детали счёта сокращены"] + footer)


def format_close_confirmation(bill: dict[str, Any]) -> str:
    return (
        f"Подтвердите закрытие стола №"
        f"{_truncate(bill['table']['number'], 80)} "
        f"на сумму {_money(bill['total'])} ₸"
    )


def format_closed_bill(bill: dict[str, Any]) -> str:
    return (
        f"Стол №{_truncate(bill['table']['number'], 80)} закрыт.\n"
        f"Итого: {_money(bill['total'])} ₸"
    )


def format_open_tables(
    tables: list[dict[str, Any]], limit: int = 50
) -> tuple[str, list[dict[str, Any]]]:
    """Render a bounded table list and return entries safe for buttons."""

    displayed: list[dict[str, Any]] = []
    lines = ["Открытые столы:"]
    truncated = False
    for table in tables:
        if len(displayed) >= limit:
            truncated = True
            break
        line = (
            f"Стол №{_truncate(table['table']['number'], 80)}"
            f" — заказов: {table['orderCount']}"
            f" — {_money(table['total'])} ₸"
        )
        if len("\n".join(lines + [line, "… список сокращён"])) > TELEGRAM_TEXT_LIMIT:
            truncated = True
            break
        lines.append(line)
        displayed.append(table)
    if len(displayed) < len(tables):
        truncated = True
    if truncated:
        lines.append(f"… список сокращён, показано {len(displayed)} из {len(tables)}")
    return "\n".join(lines), displayed
