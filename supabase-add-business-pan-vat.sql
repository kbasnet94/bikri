-- Add PAN/VAT number column to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pan_vat_number VARCHAR DEFAULT NULL;
