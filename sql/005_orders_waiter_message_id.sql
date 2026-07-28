BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS waiter_message_id BIGINT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS waiter_notification_claimed_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS waiter_notification_claim_token UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_waiter_message_id_positive'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_waiter_message_id_positive
      CHECK (waiter_message_id IS NULL OR waiter_message_id > 0);
  END IF;
END
$$;

COMMIT;
