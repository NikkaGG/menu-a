import importlib
import inspect
import sys
import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bot import main as main_module
from bot.handlers.kitchen import handle_cooking, handle_ready


class FakeBot:
    def __init__(self, token):
        self.token = token
        self.session = self
        self.closed = False

    async def close(self):
        self.closed = True


class FakeDispatcher:
    def __init__(self, events):
        self.events = events
        self.included = []

    def include_router(self, router):
        self.included.append(router)

    async def start_polling(self, bot, **workflow_data):
        self.events.append(("polling", bot, workflow_data))


class FakeBackend:
    def __init__(self, *args):
        self.closed = False

    async def close(self):
        self.closed = True


class FakeRunner:
    def __init__(self, events):
        self.events = events

    async def setup(self):
        self.events.append("runner.setup")

    async def cleanup(self):
        self.events.append("runner.cleanup")


class FakeSite:
    def __init__(self, runner, host, port, events):
        self.events = events
        self.host = host
        self.port = port

    async def start(self):
        self.events.append(("site.start", self.host, self.port))


class MainLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.config = SimpleNamespace(
            telegram_bot_token="token",
            app_url="https://backend.example",
            bot_internal_api_secret="secret",
            port=9876,
        )
        self.events = []
        self.bot = None
        self.dispatcher = None
        self.backend = None
        self.runner = None

    async def test_starts_health_before_polling_and_cleans_everything(self):
        app_dependencies = {}

        def bot_factory(token):
            self.bot = FakeBot(token)
            return self.bot

        def dispatcher_factory():
            self.dispatcher = FakeDispatcher(self.events)
            return self.dispatcher

        def backend_factory(*args):
            self.backend = FakeBackend(*args)
            return self.backend

        def runner_factory(app):
            self.runner = FakeRunner(self.events)
            return self.runner

        def site_factory(runner, host, port):
            return FakeSite(runner, host, port, self.events)

        def app_factory(**dependencies):
            app_dependencies.update(dependencies)
            return object()

        await main_module.run(
            config=self.config,
            bot_factory=bot_factory,
            dispatcher_factory=dispatcher_factory,
            backend_factory=backend_factory,
            app_factory=app_factory,
            runner_factory=runner_factory,
            site_factory=site_factory,
        )

        self.assertEqual(
            self.events,
            [
                "runner.setup",
                ("site.start", "0.0.0.0", 9876),
                (
                    "polling",
                    self.bot,
                    {"backend": self.backend, "config": self.config},
                ),
                "runner.cleanup",
            ],
        )
        self.assertEqual(self.dispatcher.included, [main_module.root_router])
        self.assertIs(app_dependencies["bot"], self.bot)
        self.assertIs(app_dependencies["config"], self.config)
        self.assertIs(app_dependencies["backend"], self.backend)
        self.assertIs(app_dependencies["logger"], main_module.logger)
        self.assertTrue(self.backend.closed)
        self.assertTrue(self.bot.closed)

    async def test_polling_workflow_resolves_kitchen_handler_dependencies(self):
        workflow_data = {}

        class DependencyCheckingDispatcher(FakeDispatcher):
            async def start_polling(self, bot, **data):
                workflow_data.update(data)

        backend = FakeBackend()
        await main_module.run(
            config=self.config,
            bot_factory=FakeBot,
            dispatcher_factory=lambda: DependencyCheckingDispatcher(
                self.events
            ),
            backend_factory=lambda *args: backend,
            app_factory=lambda: object(),
            runner_factory=lambda app: FakeRunner(self.events),
            site_factory=lambda runner, host, port: FakeSite(
                runner, host, port, self.events
            ),
        )

        for handler in (handle_cooking, handle_ready):
            dependencies = set(inspect.signature(handler).parameters) - {
                "callback",
                "logger",
            }
            self.assertTrue(dependencies.issubset(workflow_data))
        self.assertIs(workflow_data["backend"], backend)
        self.assertIs(workflow_data["config"], self.config)

    async def test_cleans_after_polling_failure_without_replacing_primary_error(self):
        class FailingDispatcher(FakeDispatcher):
            async def start_polling(self, bot, **workflow_data):
                raise RuntimeError("polling failed")

        self.dispatcher = FailingDispatcher(self.events)
        self.backend = FakeBackend()
        self.bot = FakeBot("token")
        self.runner = FakeRunner(self.events)

        async def invoke():
            await main_module.run(
                config=self.config,
                bot_factory=lambda token: self.bot,
                dispatcher_factory=lambda: self.dispatcher,
                backend_factory=lambda *args: self.backend,
                app_factory=lambda: object(),
                runner_factory=lambda app: self.runner,
                site_factory=lambda runner, host, port: FakeSite(
                    runner, host, port, self.events
                ),
            )

        with self.assertRaisesRegex(RuntimeError, "polling failed"):
            await invoke()
        self.assertEqual(self.events[-1], "runner.cleanup")
        self.assertTrue(self.backend.closed)
        self.assertTrue(self.bot.closed)

    async def test_cleans_runner_and_resources_when_server_startup_fails(self):
        self.backend = FakeBackend()
        self.bot = FakeBot("token")
        self.runner = FakeRunner(self.events)

        class FailingSite(FakeSite):
            async def start(self):
                raise OSError("bind failed")

        with self.assertRaisesRegex(OSError, "bind failed"):
            await main_module.run(
                config=self.config,
                bot_factory=lambda token: self.bot,
                dispatcher_factory=lambda: FakeDispatcher(self.events),
                backend_factory=lambda *args: self.backend,
                app_factory=lambda: object(),
                runner_factory=lambda app: self.runner,
                site_factory=lambda runner, host, port: FailingSite(
                    runner, host, port, self.events
                ),
            )
        self.assertEqual(self.events, ["runner.setup", "runner.cleanup"])
        self.assertTrue(self.backend.closed)
        self.assertTrue(self.bot.closed)

    async def test_attempts_all_cleanup_steps_and_keeps_primary_error(self):
        events = self.events = []

        class FailingCleanup:
            async def setup(self):
                events.append("runner.setup")

            async def cleanup(self):
                events.append("runner.cleanup")
                raise RuntimeError("cleanup failed")

        class FailingBackend(FakeBackend):
            async def close(self):
                events.append("backend.close")
                raise RuntimeError("backend close failed")

        class FailingBot(FakeBot):
            async def close(self):
                events.append("bot.close")
                raise RuntimeError("bot close failed")

        runner = FailingCleanup()
        backend = FailingBackend()
        bot = FailingBot("token")

        class FailingDispatcher(FakeDispatcher):
            async def start_polling(self, _bot, **workflow_data):
                events.clear()
                raise ValueError("primary")

        with self.assertRaisesRegex(ValueError, "primary"):
            await main_module.run(
                config=self.config,
                bot_factory=lambda token: bot,
                dispatcher_factory=lambda: FailingDispatcher(self.events),
                backend_factory=lambda *args: backend,
                app_factory=lambda: object(),
                runner_factory=lambda app: runner,
                site_factory=lambda runner, host, port: FakeSite(
                    runner, host, port, events
                ),
            )
        self.assertEqual(
            events,
            ["runner.cleanup", "backend.close", "bot.close"],
        )

    def test_main_has_no_webhook_usage(self):
        self.assertNotIn("webhook", inspect.getsource(main_module).lower())

    async def test_importing_main_module_does_not_run_main(self):
        sys.modules.pop("bot.__main__", None)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            with patch.object(
                main_module, "main", new_callable=AsyncMock
            ) as mocked_main:
                importlib.import_module("bot.__main__")

        mocked_main.assert_not_awaited()
        self.assertFalse(
            any("never awaited" in str(warning.message) for warning in caught)
        )


if __name__ == "__main__":
    unittest.main()
