# 🚀 Run SQL Migration in Supabase

## Quick Steps:

### 1. Open Supabase SQL Editor
Go to: **https://zezmnkdinddjqnpfnaoq.supabase.co/project/zezmnkdinddjqnpfnaoq/sql/new**

### 2. Copy the SQL
- Open the file `supabase-migration.sql` in this project
- **Select All** (Ctrl+A) and **Copy** (Ctrl+C)

### 3. Paste and Run
- Paste into the SQL Editor
- Click the **"RUN"** button (or press Ctrl+Enter)
- Wait for "Success. No rows returned" message

### 4. Verify
You should see these tables created in your database:
- ✅ businesses
- ✅ business_users  
- ✅ categories
- ✅ products
- ✅ customers
- ✅ orders
- ✅ order_items
- ✅ ledger_entries
- ✅ inventory_movements

---

## What This Creates:

✅ **All database tables** with proper relationships
✅ **Row Level Security** policies for multi-tenant isolation
✅ **Helper functions** for VAT bill numbers and stock history
✅ **Indexes** for query performance
✅ **Triggers** for automatic timestamp updates

---

## After Running:

Once you see the success message, come back here and let me know. I'll then:
1. ✅ Migrate all React hooks to use Supabase
2. ✅ Update authentication to use Supabase Auth
3. ✅ Remove the Express backend
4. ✅ Create a seed script for demo data

---

**Estimated time:** 2-3 minutes to run the migration
