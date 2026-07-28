import unittest

from bot.config import ConfigError, load_config


VALID_ENV = {
    "TELEGRAM_BOT_TOKEN": "token-value",
    "KITCHEN_CHAT_ID": "-100123",
    "WAITER_CHAT_ID": "456",
    "BOT_INTERNAL_API_SECRET": "s" * 32,
    "APP_URL": "https://menu.example///",
    "PORT": "9090",
}


class ConfigTests(unittest.TestCase):
    def test_load_config_validates_and_normalizes_values(self):
        config = load_config(VALID_ENV)

        self.assertEqual(config.telegram_bot_token, "token-value")
        self.assertEqual(config.kitchen_chat_id, -100123)
        self.assertEqual(config.waiter_chat_id, 456)
        self.assertFalse(hasattr(config, "database_url"))
        self.assertEqual(config.app_url, "https://menu.example")
        self.assertEqual(config.port, 9090)
        with self.assertRaises(AttributeError):
            config.port = 8081

    def test_port_defaults_to_8080(self):
        environment = {key: value for key, value in VALID_ENV.items() if key != "PORT"}
        self.assertEqual(load_config(environment).port, 8080)

    def test_database_url_is_not_required_by_the_bot(self):
        config = load_config(dict(VALID_ENV))

        self.assertEqual(config.app_url, "https://menu.example")

    def test_invalid_values_name_only_the_variable(self):
        cases = {
            "TELEGRAM_BOT_TOKEN": "",
            "KITCHEN_CHAT_ID": "0",
            "WAITER_CHAT_ID": "12.5",
            "BOT_INTERNAL_API_SECRET": "short",
            "APP_URL": "https://menu.example/path",
            "PORT": "65536",
        }
        for name, value in cases.items():
            with self.subTest(name=name):
                environment = dict(VALID_ENV)
                environment[name] = value
                with self.assertRaises(ConfigError) as context:
                    load_config(environment)
                self.assertEqual(str(context.exception), name + " is invalid")
                if value:
                    self.assertNotIn(value, str(context.exception))

    def test_internal_api_secret_rejects_whitespace_without_exposing_it(self):
        secrets = (
            "s" * 31 + " ",
            "s" * 31 + "\t",
            "s" * 31 + "\n",
            "s" * 16 + " " + "s" * 16,
        )
        for secret in secrets:
            with self.subTest(kind=repr(secret[-1])):
                with self.assertRaises(ConfigError) as context:
                    load_config(
                        dict(VALID_ENV, BOT_INTERNAL_API_SECRET=secret)
                    )
                self.assertEqual(
                    str(context.exception),
                    "BOT_INTERNAL_API_SECRET is invalid",
                )
                self.assertNotIn(secret, str(context.exception))

    def test_app_url_rejects_query_fragment_and_missing_hostname(self):
        for value in ("https://menu.example/?x=1", "https://menu.example/#x", "http:///missing"):
            with self.subTest(value=value):
                environment = dict(VALID_ENV, APP_URL=value)
                with self.assertRaisesRegex(ConfigError, "^APP_URL is invalid$"):
                    load_config(environment)

    def test_app_url_rejects_remote_http_without_exposing_value(self):
        value = "http://remote.example"
        with self.assertRaises(ConfigError) as context:
            load_config(dict(VALID_ENV, APP_URL=value))

        self.assertEqual(str(context.exception), "APP_URL is invalid")
        self.assertNotIn(value, str(context.exception))

    def test_app_url_permits_and_normalizes_http_loopbacks(self):
        cases = {
            "http://localhost:8080///": "http://localhost:8080",
            "http://127.0.0.1/": "http://127.0.0.1",
            "http://[::1]:9090///": "http://[::1]:9090",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                config = load_config(dict(VALID_ENV, APP_URL=value))
                self.assertEqual(config.app_url, expected)

    def test_app_url_permits_remote_https(self):
        config = load_config(
            dict(VALID_ENV, APP_URL="https://remote.example:8443///")
        )
        self.assertEqual(config.app_url, "https://remote.example:8443")


if __name__ == "__main__":
    unittest.main()
