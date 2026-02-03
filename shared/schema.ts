import { pgTable, text, serial, integer, boolean, timestamp, decimal, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./models/auth";
import { businesses } from "./models/auth";

// === TABLE DEFINITIONS ===

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  businessId: varchar("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  description: text("description"),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  businessId: varchar("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // in cents
  stockQuantity: integer("stock_quantity").notNull().default(0),
  categoryId: integer("category_id").references(() => categories.id),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  businessId: varchar("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  creditLimit: integer("credit_limit").notNull().default(0), // in cents
  currentBalance: integer("current_balance").notNull().default(0), // in cents. Positive means they owe money.
  createdAt: timestamp("created_at").defaultNow(),
});

// Order status values: new, in-process, ready, completed, cancelled
export const ORDER_STATUS_VALUES = ["new", "in-process", "ready", "completed", "cancelled"] as const;
export type OrderStatusType = typeof ORDER_STATUS_VALUES[number];

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  businessId: varchar("business_id").notNull().references(() => businesses.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  status: text("status").notNull().default("new"), // new, in-process, ready, completed, cancelled
  totalAmount: integer("total_amount").notNull(), // in cents
  note: text("note"), // optional order note
  orderDate: timestamp("order_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(), // snapshot of price at time of order
  discount: integer("discount").notNull().default(0), // discount in cents per unit
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  businessId: varchar("business_id").notNull().references(() => businesses.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  type: text("type").notNull(), // debit (increase balance), credit (decrease balance/payment), purchase, adjustment
  amount: integer("amount").notNull(), // in cents
  description: text("description"),
  entryDate: timestamp("entry_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  ledgerEntries: many(ledgerEntries),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  customer: one(customers, {
    fields: [ledgerEntries.customerId],
    references: [customers.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, businessId: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, businessId: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, currentBalance: true, businessId: true }); // currentBalance should be updated via ledger
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, totalAmount: true, businessId: true }); // totalAmount calculated from items
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({ id: true, createdAt: true, businessId: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;

// Request types
export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;

export type CreateCustomerRequest = InsertCustomer;
export type UpdateCustomerRequest = Partial<InsertCustomer>;

// Order creation is complex - it involves items
export type CreateOrderRequest = {
  customerId: number;
  items: {
    productId: number;
    quantity: number;
    discountPercent?: number; // discount as percentage (0-100)
  }[];
  note?: string; // optional order note
};
export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES)
});
export type UpdateOrderRequest = z.infer<typeof updateOrderSchema>;

export const editOrderSchema = z.object({
  note: z.string().optional(),
  items: z.array(z.object({
    id: z.number(), // existing order item ID
    quantity: z.number().min(1),
    discountPercent: z.number().min(0).max(100),
  })),
});
export type EditOrderRequest = z.infer<typeof editOrderSchema>;

export type CreateLedgerEntryRequest = InsertLedgerEntry;

// Response types
export type ProductResponse = Product & { category?: Category | null };
export type CustomerResponse = Customer;
export type OrderResponse = Order & { 
  customer?: Customer; 
  items?: (OrderItem & { product?: Product })[] 
};
export type LedgerEntryResponse = LedgerEntry;

// Query types
export interface ProductsQueryParams {
  search?: string;
  categoryId?: number;
}
