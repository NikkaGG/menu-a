"""Environment configuration for the Telegram bot."""

from __future__ import annotations

from dataclasses import dataclass
import os
import re
from collections.abc import Mapping
from urllib.parse import urlsplit, urlunsplit


_SIGNED_DECIMAL = re.compile(r"[+-]?\d+\Z")
_HTTP_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


class ConfigError(ValueError):
    """Raised when a bot environment variable is invalid."""


@dataclass(frozen=True)
class BotConfig:
    telegram_bot_token: str
    kitchen_chat_id: int
    waiter_chat_id: int
    bot_internal_api_secret: str
    app_url: str
    port: int


def _invalid(name: str) -> ConfigError:
    return ConfigError(f"{name} is invalid")


def _nonempty(environment: Mapping[str, str], name: str) -> str:
    value = environment.get(name)
    if not isinstance(value, str) or not value.strip():
        raise _invalid(name)
    return value


def _chat_id(environment: Mapping[str, str], name: str) -> int:
    value = environment.get(name)
    if not isinstance(value, str) or not _SIGNED_DECIMAL.fullmatch(value):
        raise _invalid(name)
    parsed = int(value)
    if parsed == 0:
        raise _invalid(name)
    return parsed


def _app_url(environment: Mapping[str, str]) -> str:
    value = _nonempty(environment, "APP_URL")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise _invalid("APP_URL") from error
    if (
        parsed.scheme not in {"http", "https"}
        or (
            parsed.scheme == "http"
            and parsed.hostname not in _HTTP_LOOPBACK_HOSTS
        )
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path.strip("/")
    ):
        raise _invalid("APP_URL")
    netloc = parsed.hostname
    if ":" in netloc:
        netloc = f"[{netloc}]"
    if port is not None:
        netloc = f"{netloc}:{port}"
    return urlunsplit((parsed.scheme, netloc, "", "", ""))


def _port(environment: Mapping[str, str]) -> int:
    value = environment.get("PORT", "8080")
    if not isinstance(value, str) or not value.isdecimal():
        raise _invalid("PORT")
    parsed = int(value)
    if not 1 <= parsed <= 65535:
        raise _invalid("PORT")
    return parsed


def load_config(environment: Mapping[str, str] | None = None) -> BotConfig:
    """Load and validate bot configuration without exposing values in errors."""

    env = os.environ if environment is None else environment
    secret = _nonempty(env, "BOT_INTERNAL_API_SECRET")
    if not 32 <= len(secret) <= 1024 or any(
        character.isspace() for character in secret
    ):
        raise _invalid("BOT_INTERNAL_API_SECRET")

    return BotConfig(
        telegram_bot_token=_nonempty(env, "TELEGRAM_BOT_TOKEN"),
        kitchen_chat_id=_chat_id(env, "KITCHEN_CHAT_ID"),
        waiter_chat_id=_chat_id(env, "WAITER_CHAT_ID"),
        bot_internal_api_secret=secret,
        app_url=_app_url(env),
        port=_port(env),
    )
