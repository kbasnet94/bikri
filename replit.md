# Bikri - Business Management System

## Overview

Bikri is a full-stack wholesale business management application built for tracking inventory, managing customer credit accounts, and processing orders. The system provides a dashboard with analytics (including monthly revenue), inventory management with categories, customer ledger tracking, and order processing with status updates. The app supports light/dark mode switching.

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