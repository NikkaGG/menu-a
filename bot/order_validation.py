"""Validation for complete order representations."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID


_ORDER_STATUSES = frozenset({"new", "cooking", "ready"})


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_uuid(value: Any) -> bool:
    if not _nonempty_string(value):
        return False
    try:
        UUID(value)
    except (ValueError, AttributeError):
        return False
    return True


def _valid_total(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(
        value, (str, int, float, Decimal)
    ):
        return False
    try:
        total = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return False
    return (
        total.is_finite()
        and Decimal("0") <= total <= Decimal("99999999.99")
        and total.as_tuple().exponent >= -2
    )


def is_complete_order(value: Any) -> bool:
    """Return whether a value is a complete safe-to-process order."""

    if not isinstance(value, dict):
        return False
    table = value.get("table")
    items = value.get("items")
    if (
        not _valid_uuid(value.get("id"))
        or not _valid_uuid(value.get("sessionId"))
        or value.get("status") not in _ORDER_STATUSES
        or not _valid_total(value.get("total"))
        or not isinstance(table, dict)
        or not _nonempty_string(table.get("number"))
        or not isinstance(items, list)
        or not items
    ):
        return False
    return all(
        isinstance(item, dict)
        and _nonempty_string(item.get("dishName"))
        and isinstance(item.get("quantity"), int)
        and not isinstance(item.get("quantity"), bool)
        and item["quantity"] > 0
        for item in items
    )


def is_complete_bill(value: Any) -> bool:
    """Return whether a backend bill is safe to render or mutate from."""

    if not isinstance(value, dict):
        return False
    session = value.get("session")
    table = value.get("table")
    orders = value.get("orders")
    if (
        not isinstance(session, dict)
        or not _valid_uuid(session.get("id"))
        or session.get("status") not in {"open", "closed"}
        or not isinstance(table, dict)
        or not _nonempty_string(table.get("number"))
        or not isinstance(orders, list)
        or not _valid_total(value.get("total"))
    ):
        return False
    for order in orders:
        if (
            not isinstance(order, dict)
            or not _valid_uuid(order.get("id"))
            or not _valid_uuid(order.get("sessionId"))
            or order["sessionId"] != session["id"]
            or order.get("status") not in _ORDER_STATUSES
            or not _valid_total(order.get("total"))
            or not isinstance(order.get("items"), list)
            or not order["items"]
        ):
            return False
        if not all(
            isinstance(item, dict)
            and _nonempty_string(item.get("dishName"))
            and isinstance(item.get("quantity"), int)
            and not isinstance(item.get("quantity"), bool)
            and item["quantity"] > 0
            and _valid_total(item.get("subtotal"))
            for item in order["items"]
        ):
            return False
    return True


def is_open_table(value: Any) -> bool:
    """Return whether an open-table summary is safe to render."""

    if not isinstance(value, dict):
        return False
    table = value.get("table")
    return (
        _valid_uuid(value.get("sessionId"))
        and isinstance(table, dict)
        and _nonempty_string(table.get("number"))
        and isinstance(value.get("orderCount"), int)
        and not isinstance(value.get("orderCount"), bool)
        and value["orderCount"] >= 0
        and _valid_total(value.get("total"))
    )
