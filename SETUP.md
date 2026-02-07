# Bikri 2.0 - Setup Guide for Demo

Follow these steps to get your demo app up and running!

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database (local or cloud)

## Quick Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Your Database

You have two options:

#### Option A: Use a Free Cloud Database (Easiest)

1. Sign up for a free PostgreSQL database:
   - **Supabase**: https://supabase.com (recommended)
   - **Neon**: https://neon.tech
   - **Railway**: https://railway.app

2. Copy your database connection string

3. Update the `.env` file with your connection string:
   ```
   DATABASE_URL=postgresql://your-connection-string-here
   ```

#### Option B: Use Local PostgreSQL

1. Make sure PostgreSQL is installed and running
2. Create a new database:
   ```bash
   createdb bikri_db
   ```
3. Update the `.env` file with your local credentials:
   ```
   DATABASE_URL=postgresql://your_username:your_password@localhost:5432/bikri_db
   ```

### 3. Create Database Tables

Run the Drizzle migration to create all necessary tables:

```bash
npm run db:push
```

This will create all tables:
- users, businesses, sessions (authentication)
- categories, products (inventory)
- customers, orders, order_items (orders)
- ledger_entries (financial tracking)
- inventory_movements (stock history)

### 4. Seed Demo Data

Populate the database with sample data:

```bash
npm run db:seed
```

This creates:
- **Demo Business**: "Bikri Wholesale Co."
- **Demo User**: email: `demo@bikri.com`, password: `demo123`
- **5 Product Categories**: Electronics, Furniture, Stationery, Textiles, Hardware
- **15 Products**: Various items with different stock levels
- **6 Customers**: With different credit limits and contact info
- **3 Sample Orders**: With different statuses (completed, in-progress, new)
- **Ledger Entries**: Payment records and credit tracking
- **Inventory Movements**: Stock purchase and sale history

### 5. Start the Development Server

```bash
npm run dev
```

The app should now be running at: **http://localhost:5000**

### 6. Login

Use these credentials to log in:

```
Email: demo@bikri.com
Password: demo123
```

## What You Can Demonstrate

Once logged in, you can showcase:

### Dashboard
- Monthly revenue analytics
- Charts and statistics
- Quick overview of business metrics

### Products & Inventory
- Browse products by category
- View stock levels
- Track inventory movements
- Record new stock purchases

### Customers
- View customer list with credit limits
- Check customer balances
- View ledger history
- Add payments and adjustments

### Orders
- Create new orders
- View orders by status (new, in-process, ready, completed, cancelled)
- Different payment types (COD, Bank Transfer, Credit)
- VAT bill number tracking
- Edit order status

### Bulk Upload
- Upload customers via CSV
- Upload orders via CSV
- Upload ledger entries via CSV

## Troubleshooting

### Database Connection Error
- Make sure your `DATABASE_URL` is correct
- Verify your database is running (if using local PostgreSQL)
- Check that your database allows connections from your IP

### Tables Not Found
- Run `npm run db:push` to create the tables

### Port Already in Use
- The app runs on port 5000 by default
- Stop any other services using that port

## Next Steps

- Explore the UI and test different features
- Create new orders with various payment statuses
- Add customers and track their credit
- Use bulk CSV upload features
- Try the inventory tracking features

## Need Help?

If you encounter any issues:
1. Check the console for error messages
2. Verify all environment variables are set correctly
3. Ensure database connection is working
4. Make sure all npm packages are installed

Enjoy demonstrating Bikri! 🚀
