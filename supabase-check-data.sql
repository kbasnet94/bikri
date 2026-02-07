-- Check if your user, business, and business_users link exist
-- Run this in Supabase SQL Editor to diagnose the issue

-- 1. Check if your business was created
SELECT id, name, owner_id, created_at 
FROM businesses 
ORDER BY created_at DESC 
LIMIT 5;

-- 2. Check if business_users link exists
SELECT bu.*, b.name as business_name
FROM business_users bu
LEFT JOIN businesses b ON bu.business_id = b.id
ORDER BY bu.created_at DESC
LIMIT 5;

-- 3. Check auth users (to get your user ID)
SELECT id, email, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- If you see your email but no business_users entry, we need to manually link them:
-- Replace YOUR_USER_ID and YOUR_BUSINESS_ID with values from queries above
-- 
-- INSERT INTO business_users (business_id, user_id, role)
-- VALUES ('YOUR_BUSINESS_ID', 'YOUR_USER_ID', 'owner');
