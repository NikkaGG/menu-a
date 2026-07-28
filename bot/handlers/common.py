"""Handlers shared by all staff chats."""

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message


router = Router(name="common")


@router.message(CommandStart())
async def handle_start(message: Message) -> None:
    """Explain the bot's staff purpose without revealing configuration."""

    await message.answer(
        "Этот бот предназначен для персонала. "
        "Настройка рабочих чатов выполняется администратором."
    )
