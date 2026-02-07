-- Bikri 2.0 - Supabase Schema Migration
-- Run this in your Supabase SQL Editor: https://zezmnkdinddjqnpfnaoq.supabase.co

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BUSINESS & USER MANAGEMENT TABLES
-- ============================================

-- Businesses table (links to Supabase auth.users)
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  currency VARCHAR NOT NULL DEFAULT 'USD',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business users junction table (many-to-many relationship)
CREATE TABLE business_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL DEFAULT 'member', -- owner, admin, member
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

-- ============================================
-- BUSINESS DATA TABLES
-- ============================================

-- Categories
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);

-- Products
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- in cents
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  pan_vat_number TEXT,
  credit_limit INTEGER NOT NULL DEFAULT 0, -- in cents
  current_balance INTEGER NOT NULL DEFAULT 0, -- in cents
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'new', -- new, in-process, ready, completed, cancelled
  payment_status TEXT NOT NULL DEFAULT 'Credit', -- COD, Bank Transfer/QR, Credit
  total_amount INTEGER NOT NULL, -- in cents
  note TEXT,
  vat_bill_number VARCHAR,
  order_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL, -- in cents
  discount INTEGER NOT NULL DEFAULT 0 -- in cents per unit
);

-- Ledger Entries
CREATE TABLE ledger_entries (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- purchase, credit, adjustment
  amount INTEGER NOT NULL, -- in cents
  description TEXT,
  entry_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory Movements
CREATE TABLE inventory_movements (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL, -- purchase, sale, adjustment, return
  quantity_change INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  notes TEXT,
  movement_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_business_users_user_id ON business_users(user_id);
CREATE INDEX idx_business_users_business_id ON business_users(business_id);
CREATE INDEX idx_categories_business_id ON categories(business_id);
CREATE INDEX idx_products_business_id ON products(business_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_customers_business_id ON customers(business_id);
CREATE INDEX idx_orders_business_id ON orders(business_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_ledger_entries_business_id ON ledger_entries(business_id);
CREATE INDEX idx_ledger_entries_customer_id ON ledger_entries(customer_id);
CREATE INDEX idx_inventory_movements_business_id ON inventory_movements(business_id);
CREATE INDEX idx_inventory_movements_product_id ON inventory_movements(product_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's business IDs
CREATE OR REPLACE FUNCTION auth.user_business_ids()
RETURNS SETOF UUID AS $$
  SELECT business_id FROM business_users WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- Businesses policies
CREATE POLICY "Users can view businesses they belong to"
  ON businesses FOR SELECT
  USING (id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can update their business"
  ON businesses FOR UPDATE
  USING (id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (true);

-- Business users policies
CREATE POLICY "Users can view their business memberships"
  ON business_users FOR SELECT
  USING (user_id = auth.uid() OR business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Admins can manage business users"
  ON business_users FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_users 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Categories policies
CREATE POLICY "Users can view their business categories"
  ON categories FOR SELECT
  USING (business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can manage their business categories"
  ON categories FOR ALL
  USING (business_id IN (SELECT auth.user_business_ids()));

-- Products policies
CREATE POLICY "Users can view their business products"
  ON products FOR SELECT
  USING (business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can manage their business products"
  ON products FOR ALL
  USING (business_id IN (SELECT auth.user_business_ids()));

-- Customers policies
CREATE POLICY "Users can view their business customers"
  ON customers FOR SELECT
  USING (business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can manage their business customers"
  ON customers FOR ALL
  USING (business_id IN (SELECT auth.user_business_ids()));

-- Orders policies
CREATE POLICY "Users can view their business orders"
  ON orders FOR SELECT
  USING (business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can manage their business orders"
  ON orders FOR ALL
  USING (business_id IN (SELECT auth.user_business_ids()));

-- Order items policies (through parent order)
CREATE POLICY "Users can view order items"
  ON order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM orders WHERE business_id IN (SELECT auth.user_business_ids())
  ));

CREATE POLICY "Users can manage order items"
  ON order_items FOR ALL
  USING (order_id IN (
    SELECT id FROM orders WHERE business_id IN (SELECT auth.user_business_ids())
  ));

-- Ledger entries policies
CREATE POLICY "Users can view their business ledger"
  ON ledger_entries FOR SELECT
  USING (business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can manage their business ledger"
  ON ledger_entries FOR ALL
  USING (business_id IN (SELECT auth.user_business_ids()));

-- Inventory movements policies
CREATE POLICY "Users can view their business inventory movements"
  ON inventory_movements FOR SELECT
  USING (business_id IN (SELECT auth.user_business_ids()));

CREATE POLICY "Users can manage their business inventory movements"
  ON inventory_movements FOR ALL
  USING (business_id IN (SELECT auth.user_business_ids()));

-- ============================================
-- DATABASE FUNCTIONS FOR COMPLEX OPERATIONS
-- ============================================

-- Function to get next VAT bill number
CREATE OR REPLACE FUNCTION get_next_vat_bill_number(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  max_bill_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(vat_bill_number AS INTEGER)), 0)
  INTO max_bill_number
  FROM orders
  WHERE business_id = p_business_id
    AND vat_bill_number IS NOT NULL
    AND vat_bill_number ~ '^[0-9]+$';
  
  RETURN max_bill_number + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get stock at a specific date
CREATE OR REPLACE FUNCTION get_stock_at_date(p_product_id INTEGER, p_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
  stock_balance INTEGER;
BEGIN
  SELECT balance_after
  INTO stock_balance
  FROM inventory_movements
  WHERE product_id = p_product_id
    AND movement_date <= p_date
  ORDER BY movement_date DESC, created_at DESC
  LIMIT 1;
  
  IF stock_balance IS NULL THEN
    RETURN 0;
  END IF;
  
  RETURN stock_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update customer balance (for ledger entries)
CREATE OR REPLACE FUNCTION update_customer_balance(p_customer_id INTEGER, p_amount_change INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE customers
  SET current_balance = current_balance + p_amount_change
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp for businesses
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- REALTIME SETUP (Optional - enable for live updates)
-- ============================================

-- Enable realtime for key tables
-- Uncomment these if you want real-time subscriptions:

-- ALTER PUBLICATION supabase_realtime ADD TABLE products;
-- ALTER PUBLICATION supabase_realtime ADD TABLE orders;
-- ALTER PUBLICATION supabase_realtime ADD TABLE customers;
-- ALTER PUBLICATION supabase_realtime ADD TABLE inventory_movements;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Your schema is now ready!
-- Next steps:
-- 1. Run the seed script to populate demo data
-- 2. Test authentication and data access
-- 3. Enable realtime if needed
