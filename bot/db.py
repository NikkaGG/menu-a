"""Safe HTTP boundary between the bot and backend persistence."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import aiohttp


class BackendApiError(RuntimeError):
    """Backend failure represented without response bodies or secrets."""

    def __init__(self, code: str, status: int | None = None):
        self.code = code
        self.status = status
        super().__init__(code)


class BackendApiClient:
    def __init__(
        self,
        app_url: str,
        secret: str,
        *,
        session: aiohttp.ClientSession | None = None,
        session_factory: Callable[..., aiohttp.ClientSession] | None = None,
        timeout: aiohttp.ClientTimeout | float = 10,
        owns_session: bool = False,
    ):
        if session is not None and session_factory is not None:
            raise ValueError("session and session_factory are mutually exclusive")
        self._app_url = app_url.rstrip("/")
        self._secret = secret
        self._session = session
        self._session_factory = session_factory or aiohttp.ClientSession
        self._timeout = (
            timeout
            if isinstance(timeout, aiohttp.ClientTimeout)
            else aiohttp.ClientTimeout(total=timeout)
        )
        self._owns_session = owns_session if session is not None else True

    async def __aenter__(self) -> BackendApiClient:
        self._get_session()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def close(self) -> None:
        if self._session is not None and self._owns_session:
            await self._session.close()

    async def get_order(self, identifier: object) -> Any:
        payload = await self._request(
            "GET", f"/api/orders/{self._encoded(identifier)}"
        )
        return self._required_dict(payload, "order")

    async def update_order_status(self, identifier: object, status: str) -> Any:
        payload = await self._request(
            "POST",
            f"/api/orders/{self._encoded(identifier)}/status",
            json={"status": status},
        )
        return self._required_dict(payload, "order")

    async def get_session_bill(self, identifier: object) -> dict[str, Any]:
        payload = await self._request(
            "GET", f"/api/sessions/{self._encoded(identifier)}/bill"
        )
        self._required_dict(payload, "session")
        self._required_dict(payload, "table")
        if not isinstance(self._required(payload, "orders"), list):
            raise BackendApiError("invalid_response")
        if not isinstance(self._required(payload, "total"), str):
            raise BackendApiError("invalid_response")
        return payload

    async def close_session(self, identifier: object) -> Any:
        payload = await self._request(
            "POST",
            f"/api/sessions/{self._encoded(identifier)}/close",
            json={},
        )
        return self._required_dict(payload, "session")

    async def save_telegram_message_id(
        self, order_id: object, message_id: int
    ) -> Any:
        payload = await self._request(
            "POST",
            f"/api/orders/{self._encoded(order_id)}/telegram-message",
            json={"telegram_message_id": message_id},
        )
        return self._required_dict(payload, "order")

    async def get_waiter_message_id(self, order_id: object) -> Any:
        payload = await self._request(
            "GET",
            f"/api/orders/{self._encoded(order_id)}/waiter-message",
        )
        return self._required_dict(payload, "order")

    async def claim_waiter_notification(self, order_id: object) -> Any:
        payload = await self._request(
            "POST",
            f"/api/orders/{self._encoded(order_id)}/waiter-notification-claim",
            json={},
        )
        return self._required_dict(payload, "order")

    async def release_waiter_notification(
        self, order_id: object, claim_token: str
    ) -> dict[str, bool]:
        payload = await self._request(
            "DELETE",
            f"/api/orders/{self._encoded(order_id)}/waiter-notification-claim",
            json={"claim_token": claim_token},
        )
        released = self._required(payload, "released")
        if not isinstance(released, bool):
            raise BackendApiError("invalid_response")
        return {"released": released}

    async def save_waiter_message_id(
        self, order_id: object, message_id: int, claim_token: str
    ) -> Any:
        payload = await self._request(
            "POST",
            f"/api/orders/{self._encoded(order_id)}/waiter-message",
            json={
                "waiter_message_id": message_id,
                "claim_token": claim_token,
            },
        )
        return self._required_dict(payload, "order")

    async def list_open_tables(self) -> list[Any]:
        payload = await self._request("GET", "/api/sessions/open")
        tables = self._required(payload, "tables")
        if not isinstance(tables, list) or not all(
            self._valid_open_table(table) for table in tables
        ):
            raise BackendApiError("invalid_response")
        return tables

    def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = self._session_factory(timeout=self._timeout)
        return self._session

    async def _request(
        self, method: str, path: str, **kwargs: Any
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self._secret}",
            "Accept": "application/json",
        }
        try:
            async with self._get_session().request(
                method,
                self._app_url + path,
                headers=headers,
                timeout=self._timeout,
                **kwargs,
            ) as response:
                if not 200 <= response.status < 300:
                    raise BackendApiError("http", response.status)
                try:
                    payload = await response.json()
                except (
                    aiohttp.ContentTypeError,
                    aiohttp.ClientPayloadError,
                    TypeError,
                    ValueError,
                ):
                    raise BackendApiError("invalid_response") from None
        except BackendApiError:
            raise
        except asyncio.TimeoutError:
            raise BackendApiError("timeout") from None
        except (aiohttp.ClientError, ConnectionError, OSError):
            raise BackendApiError("connection") from None
        if not isinstance(payload, dict):
            raise BackendApiError("invalid_response")
        return payload

    @staticmethod
    def _required(payload: dict[str, Any], key: str) -> Any:
        if key not in payload:
            raise BackendApiError("invalid_response")
        return payload[key]

    @classmethod
    def _required_dict(
        cls, payload: dict[str, Any], key: str
    ) -> dict[str, Any]:
        value = cls._required(payload, key)
        if not isinstance(value, dict):
            raise BackendApiError("invalid_response")
        return value

    @staticmethod
    def _valid_open_table(value: Any) -> bool:
        if not isinstance(value, dict):
            return False
        table = value.get("table")
        return (
            isinstance(value.get("sessionId"), str)
            and isinstance(table, dict)
            and isinstance(table.get("id"), str)
            and isinstance(table.get("number"), str)
            and isinstance(value.get("orderCount"), int)
            and not isinstance(value.get("orderCount"), bool)
            and isinstance(value.get("total"), str)
        )

    @staticmethod
    def _encoded(identifier: object) -> str:
        return quote(str(identifier), safe="")
