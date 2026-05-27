ALTER TABLE orders
ADD COLUMN IF NOT EXISTS broker_order_id text,
ADD COLUMN IF NOT EXISTS stop_loss_price double precision,
ADD COLUMN IF NOT EXISTS take_profit_price double precision,
ADD COLUMN IF NOT EXISTS stop_loss_percentage double precision,
ADD COLUMN IF NOT EXISTS take_profit_percentage double precision;
