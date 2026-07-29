-- Location kind (spec addendum 2026-07-29): storefront = selling location
-- (coverage layer on the map); dropoff = warehouse/delivery point (order
-- default for B2B, excluded from coverage). D2C locations stay 'storefront'.
ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'storefront'; -- 'storefront' | 'dropoff'
