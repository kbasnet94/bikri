# Bikri - Business Management System

## Overview

Bikri is a full-stack wholesale business management application built for tracking inventory, managing customer credit accounts, and processing orders. The system provides a dashboard with analytics (including monthly revenue), inventory management with categories, customer ledger tracking, and order processing with multi-stage status workflow and payment tracking. The app supports light/dark mode switching.

### VAT Bill Numbers
Orders can optionally include a VAT bill number:
- **Include VAT checkbox**: When creating a new order, users can check "Include VAT"
- **Auto-suggested number**: The system suggests the next bill number (last used + 1, or 1 if first time)
- **Editable**: Users can modify the suggested bill number
- **Displayed in table**: VAT Bill # column shown in the orders table
- **API**: `GET /api/vat/next-bill-number` returns the next suggested VAT bill number for the business

### Order Payment Status
Orders have a payment status field with three options:
- **COD (Cash on Delivery)**: Order is paid at delivery. Automatically creates a payment ledger entry.
- **Bank Transfer/QR**: Customer paid via bank/QR. Automatically creates a payment ledger entry.
- **Credit**: Customer pays later. Balance increases; user adds payment manually to ledger.

**Rules**:
- Credit status cannot be changed once set (locked)
- Non-credit orders can switch between COD and Bank Transfer/QR but cannot change to Credit
- COD/Bank Transfer orders auto-record payment in ledger (customer balance stays zero)

### Order Cancellation
When an order is cancelled:
- All ledger entries linked to that order are deleted
- Customer balance is reversed (Credit orders decrease balance back to original)
- Product inventory is restored (stock quantities are added back)
- Inventory movement records linked to that order are deleted

### Inventory Tracking
The system tracks all inventory movements for each product:
- **Movement Types**: Purchase (stock in), Sale (automatic from orders), Adjustment (manual correction), Return (customer return)
- **Automatic Recording**: When an order is created, a "sale" movement is automatically recorded for each item
- **Manual Recording**: Users can record purchase arrivals, returns, or adjustments via the "Record Stock" dialog in the Inventory page
- **Historical View**: Users can see inventory movement history for each product and check what the stock level was on any past date
- **Balance Tracking**: Each movement records the stock balance after the movement for historical accuracy

**API Endpoints**:
- `GET /api/products/:productId/inventory-movements` - Get all movements for a product
- `GET /api/inventory-movements?startDate=X&endDate=Y` - Get movements in a date range
- `POST /api/inventory-movements` - Create a new movement
- `GET /api/products/:productId/stock-at-date?date=X` - Get stock quantity on a specific date

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **Charts**: Recharts for dashboard analytics visualization

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for validation
- **Development Server**: Vite dev server proxied through Express for HMR support
- **Production Build**: esbuild bundles server code, Vite builds client assets

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema-to-validation integration
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit manages schema migrations in `./migrations`

### Authentication
- **Provider**: Email/Password authentication with bcrypt password hashing
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple
- **Features**: Login, Registration, and Password Setup for legacy SSO users
- **Implementation**: Custom auth in `server/replit_integrations/auth/`

### Business Accounts (Multi-Tenancy)
- **Structure**: One business account can have multiple users; all data is scoped to a business
- **Data Isolation**: Categories, products, customers, and orders are all scoped to a business account via `businessId`
- **User Roles**: `owner` (full access), `admin` (can manage users/settings), `member` (read/write access)
- **Registration**: New users can optionally create a business during registration
- **User Management**: Owners/admins can add users by email; new users set their password via "Set Password" flow
- **Security**: Cross-business user reassignment is prevented - users already belonging to another business cannot be added
- **Currency Settings**: Businesses can set their preferred currency (USD, EUR, GBP, INR, AED, SAR, PKR, BDT, CNY, JPY, CAD, AUD)
- **API Protection**: All data endpoints require authentication and a valid business association; requests without a business return 403
- **SKU Uniqueness**: SKU codes are unique per-business only (different businesses can have same SKU)
- **API Endpoints**:
  - `GET /api/business` - Get current user's business
  - `PUT /api/business` - Update business name (owner/admin only)
  - `GET /api/business/users` - List business team members
  - `POST /api/business/users` - Add user to business (owner/admin only)
  - `PATCH /api/business/users/:userId/role` - Update user role (owner only)
  - `DELETE /api/business/users/:userId` - Remove user from business (owner/admin only)

### Project Structure
```
├── client/src/          # React frontend application
│   ├── components/      # Reusable UI components
│   ├── hooks/           # Custom React hooks for data fetching
│   ├── pages/           # Route page components
│   └── lib/             # Utilities and query client
├── server/              # Express backend
│   ├── routes.ts        # API route definitions
│   ├── storage.ts       # Database access layer
│   └── replit_integrations/auth/  # Authentication logic
├── shared/              # Shared code between client/server
│   ├── schema.ts        # Drizzle database schema
│   └── routes.ts        # API contract definitions with Zod
└── migrations/          # Database migration files
```

### Key Design Patterns
- **Shared API Contracts**: The `shared/routes.ts` file defines API endpoints with Zod schemas for both input validation and response typing, ensuring type safety across the stack
- **Custom Hooks Pattern**: Each data domain (products, customers, orders, categories) has dedicated hooks in `client/src/hooks/` wrapping React Query mutations and queries
- **Storage Interface**: The `IStorage` interface in `server/storage.ts` abstracts database operations, making it easier to swap implementations
- **Monorepo-style Paths**: TypeScript path aliases (`@/`, `@shared/`) enable clean imports across the codebase

## External Dependencies

### Database
- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe queries and migrations

### Authentication
- Email/Password authentication with bcrypt
- Requires `SESSION_SECRET` environment variable

### Third-Party Libraries
- **UI Components**: Radix UI primitives (dialogs, dropdowns, forms, etc.)
- **Date Handling**: date-fns for formatting
- **Validation**: Zod for runtime type checking
- **Data Fetching**: TanStack React Query for caching and synchronization

### Build Tools
- Vite for frontend development and production builds
- esbuild for server bundling
- TypeScript for type checking across the entire codebase