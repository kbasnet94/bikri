-- Add image_url column to product_variants
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- Create a storage bucket for product images (run this in the Supabase dashboard under Storage if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
