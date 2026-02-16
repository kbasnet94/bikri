-- Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  sku VARCHAR NOT NULL,
  price INTEGER NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add has_variants flag to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT FALSE;

-- Add variant_id to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) DEFAULT NULL;

-- Add variant_id to inventory_movements
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) DEFAULT NULL;

-- RLS policies for product_variants
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view variants for their business products"
  ON product_variants FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())));

CREATE POLICY "Users can create variants for their business products"
  ON product_variants FOR INSERT
  WITH CHECK (product_id IN (SELECT id FROM products WHERE business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())));

CREATE POLICY "Users can update variants for their business products"
  ON product_variants FOR UPDATE
  USING (product_id IN (SELECT id FROM products WHERE business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())));

CREATE POLICY "Users can delete variants for their business products"
  ON product_variants FOR DELETE
  USING (product_id IN (SELECT id FROM products WHERE business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid())));
