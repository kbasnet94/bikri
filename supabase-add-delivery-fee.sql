-- Add delivery fee column to orders table (in cents, default 0)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee INTEGER NOT NULL DEFAULT 0;
