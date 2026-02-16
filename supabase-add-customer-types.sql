-- Create customer_types table
CREATE TABLE IF NOT EXISTS customer_types (
  id SERIAL PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  name VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add customer_type_id column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type_id INTEGER REFERENCES customer_types(id) DEFAULT NULL;

-- RLS policies for customer_types
ALTER TABLE customer_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customer types for their business"
  ON customer_types FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can create customer types for their business"
  ON customer_types FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update customer types for their business"
  ON customer_types FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete customer types for their business"
  ON customer_types FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid()));
