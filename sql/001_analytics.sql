CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'visit', 'product_view', 'add_to_cart', 'checkout_started', 'order_completed'
  )),
  visitor_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  restaurant_date DATE NOT NULL DEFAULT (((now() AT TIME ZONE 'UTC') + interval '5 hours')::date),
  event_key UUID,
  product_id INTEGER CHECK (product_id IS NULL OR product_id > 0),
  product_name VARCHAR(160),
  category VARCHAR(80),
  quantity_added SMALLINT CHECK (quantity_added IS NULL OR quantity_added BETWEEN 1 AND 99),
  cart_quantity SMALLINT CHECK (cart_quantity IS NULL OR cart_quantity BETWEEN 1 AND 99),
  device_class VARCHAR(16) CHECK (
    device_class IS NULL OR device_class IN ('mobile', 'tablet', 'desktop')
  ),
  browser_family VARCHAR(24) CHECK (
    browser_family IS NULL OR browser_family IN ('chrome', 'safari', 'firefox', 'edge', 'other')
  ),
  delivery_method VARCHAR(16) CHECK (
    delivery_method IS NULL OR delivery_method IN ('delivery', 'pickup')
  ),
  payment_method VARCHAR(24) CHECK (
    payment_method IS NULL OR payment_method IN ('kaspi_invoice', 'card', 'cash')
  ),
  order_total INTEGER CHECK (order_total IS NULL OR order_total >= 0),
  order_items JSONB,
  CHECK (
    event_type <> 'order_completed'
    OR (
      event_key IS NOT NULL
      AND order_total IS NOT NULL
      AND order_items IS NOT NULL
      AND jsonb_typeof(order_items->'items') = 'array'
    )
  )
);

CREATE INDEX IF NOT EXISTS analytics_events_type_occurred_idx
  ON analytics_events (event_type, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_type_restaurant_date_idx
  ON analytics_events (event_type, restaurant_date);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_occurred_idx
  ON analytics_events (visitor_id, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_product_idx
  ON analytics_events (product_id);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_order_key_uidx
  ON analytics_events (event_key)
  WHERE event_type = 'order_completed';
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_daily_visit_uidx
  ON analytics_events (visitor_id, restaurant_date)
  WHERE event_type = 'visit';

-- Retain analytics for 13 months. Run this statement from a future scheduled job:
-- DELETE FROM analytics_events WHERE occurred_at < now() - interval '13 months';
