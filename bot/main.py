"""Run the Telegram polling process and its health endpoint."""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Callable
from typing import Any

from aiohttp import web
from aiogram import Bot, Dispatcher

from bot.config import BotConfig, load_config
from bot.db import BackendApiClient
from bot.handlers import router as root_router
from bot.internal_api import create_app


logger = logging.getLogger(__name__)


def _create_internal_app(
    app_factory: Callable[..., web.Application],
    *,
    bot: Any,
    config: Any,
    backend: Any,
) -> web.Application:
    dependencies = {
        "bot": bot,
        "config": config,
        "backend": backend,
        "logger": logger,
    }
    parameters = inspect.signature(app_factory).parameters
    if any(
        parameter.kind == inspect.Parameter.VAR_KEYWORD
        for parameter in parameters.values()
    ) or set(dependencies).issubset(parameters):
        return app_factory(**dependencies)
    return app_factory()


async def run(
    *,
    config: BotConfig | Any | None = None,
    bot_factory: Callable[[str], Any] = Bot,
    dispatcher_factory: Callable[[], Any] = Dispatcher,
    backend_factory: Callable[..., Any] = BackendApiClient,
    app_factory: Callable[[], web.Application] = create_app,
    runner_factory: Callable[[web.Application], Any] = web.AppRunner,
    site_factory: Callable[..., Any] = web.TCPSite,
) -> None:
    """Start health polling and Telegram long polling on one event loop."""

    config = load_config() if config is None else config
    bot = None
    backend = None
    runner = None
    primary_error: BaseException | None = None
    cleanup_errors: list[BaseException] = []

    try:
        bot = bot_factory(config.telegram_bot_token)
        dispatcher = dispatcher_factory()
        dispatcher.include_router(root_router)
        backend = backend_factory(
            config.app_url,
            config.bot_internal_api_secret,
        )
        runner = runner_factory(
            _create_internal_app(
                app_factory, bot=bot, config=config, backend=backend
            )
        )
        await runner.setup()
        site = site_factory(runner, "0.0.0.0", config.port)
        await site.start()
        await dispatcher.start_polling(
            bot, backend=backend, config=config
        )
    except BaseException as error:
        primary_error = error
    finally:
        for resource, method in (
            (runner, "cleanup"),
            (backend, "close"),
            (getattr(bot, "session", None), "close"),
        ):
            if resource is None:
                continue
            try:
                await getattr(resource, method)()
            except BaseException as error:
                cleanup_errors.append(error)

    if primary_error is not None:
        raise primary_error
    if cleanup_errors:
        raise cleanup_errors[0]


async def main() -> None:
    """Load environment configuration and run the bot."""

    await run()


if __name__ == "__main__":
    asyncio.run(main())
