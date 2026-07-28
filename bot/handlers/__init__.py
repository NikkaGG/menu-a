"""Telegram update handlers."""

from aiogram import Router

from bot.handlers.common import router as common_router
from bot.handlers.kitchen import router as kitchen_router
from bot.handlers.waiter import router as waiter_router


router = Router(name="root")
router.include_routers(common_router, kitchen_router, waiter_router)
