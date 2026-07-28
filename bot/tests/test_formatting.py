import unittest

from bot.formatting import (
    format_cooking_order,
    format_new_order,
    format_ready_order,
    format_waiter_notification,
)


class NewOrderFormattingTests(unittest.TestCase):
    def test_formats_plain_text_order_card(self):
        text = format_new_order(
            {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "status": "new",
                "total": "1250.50",
                "items": [{"dishName": "Ролл <Тест>", "quantity": 2}],
                "table": {"number": "12"},
            }
        )

        self.assertEqual(
            text,
            "🔔 НОВЫЙ ЗАКАЗ — СТОЛ 12\n"
            "Заказ 123e4567-e89b-12d3-a456-426614174000\n\n"
            "2 × Ролл <Тест>\n\n"
            "Итого: 1250.50 ₸\n"
            "Статус: Принят",
        )

    def test_caps_card_below_telegram_limit_and_truncates_safely(self):
        text = format_new_order(
            {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "status": "new",
                "total": "1.00",
                "items": [
                    {"dishName": f"{index}-" + ("Очень длинное блюдо " * 80), "quantity": 1}
                    for index in range(200)
                ],
                "table": {"number": "1234567890" * 20},
            }
        )

        self.assertLessEqual(len(text), 4000)
        self.assertIn("…", text)
        self.assertTrue(text.endswith("Статус: Принят"))
        self.assertNotIn("Статус: new", text)

    def test_formats_kitchen_status_cards_and_waiter_notification(self):
        order = {
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "sessionId": "223e4567-e89b-12d3-a456-426614174000",
            "status": "new",
            "total": "1250.50",
            "items": [{"dishName": "Ролл <Тест>", "quantity": 2}],
            "table": {"number": "12"},
        }

        cooking = format_cooking_order(order)
        ready = format_ready_order(order)
        waiter = format_waiter_notification(order)

        self.assertIn("Статус: Готовится", cooking)
        self.assertIn("Статус: Готово", ready)
        self.assertNotIn("new", cooking)
        self.assertNotIn("new", ready)
        self.assertEqual(
            waiter,
            "✅ ЗАКАЗ ГОТОВ — СТОЛ 12\n"
            "Заказ 123e4567-e89b-12d3-a456-426614174000\n\n"
            "2 × Ролл <Тест>",
        )
        for text in (cooking, ready, waiter):
            self.assertLessEqual(len(text), 4000)


if __name__ == "__main__":
    unittest.main()
