BEGIN;

CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON orders (created_at);

COMMIT;
