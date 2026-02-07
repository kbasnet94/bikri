-- Manually create business and link for your existing user
-- Run this in Supabase SQL Editor

-- Step 1: Find your user ID
SELECT id, email FROM auth.users WHERE email = 'karan.b.basnet@gmail.com';

-- Step 2: Create a business (copy the user ID from step 1 and replace YOUR_USER_ID)
-- Replace YOUR_USER_ID with the actual UUID from step 1
INSERT INTO businesses (name, currency, owner_id)
VALUES ('Prime Nutrition Trade Pvt. Ltd.', 'USD', 'YOUR_USER_ID')
RETURNING id, name;

-- Step 3: Link user to business (copy business ID from step 2 and user ID from step 1)
-- Replace YOUR_BUSINESS_ID and YOUR_USER_ID with actual UUIDs
INSERT INTO business_users (business_id, user_id, role)
VALUES ('YOUR_BUSINESS_ID', 'YOUR_USER_ID', 'owner')
RETURNING *;

-- EASIER ALTERNATIVE: Run this all-in-one query
-- Just replace the email with yours
DO $$
DECLARE
  v_user_id UUID;
  v_business_id UUID;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'karan.b.basnet@gmail.com';
  
  -- Check if user already has a business
  IF EXISTS (SELECT 1 FROM business_users WHERE user_id = v_user_id) THEN
    RAISE NOTICE 'User already has a business';
  ELSE
    -- Create business
    INSERT INTO businesses (name, currency, owner_id)
    VALUES ('Prime Nutrition Trade Pvt. Ltd.', 'USD', v_user_id)
    RETURNING id INTO v_business_id;
    
    -- Link user to business
    INSERT INTO business_users (business_id, user_id, role)
    VALUES (v_business_id, v_user_id, 'owner');
    
    RAISE NOTICE 'Business created and linked successfully!';
  END IF;
END $$;

-- Step 4: Verify it worked
SELECT 
  u.email,
  b.name as business_name,
  bu.role
FROM auth.users u
LEFT JOIN business_users bu ON u.id = bu.user_id
LEFT JOIN businesses b ON bu.business_id = b.id
WHERE u.email = 'karan.b.basnet@gmail.com';
