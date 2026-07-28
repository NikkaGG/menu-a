"""Module entry point for ``python -m bot``."""

import asyncio

from bot.main import main


if __name__ == "__main__":
    asyncio.run(main())
