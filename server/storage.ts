import { db } from "./db";
import { eq, desc, sql, sum } from "drizzle-orm";
import {
  categories, products, customers, orders, orderItems, ledgerEntries,
  type InsertCategory, type InsertProduct, type InsertCustomer,
  type InsertLedgerEntry, type Product, type Category, type Customer, type Order, type LedgerEntry,
  type ProductResponse, type OrderResponse
} from "@shared/schema";

export interface IStorage {
  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;

  // Products
  getProducts(query?: { search?: string; categoryId?: number }): Promise<ProductResponse[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;

  // Customers
  getCustomers(query?: { search?: string }): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  updateCustomerBalance(id: number, amountDelta: number): Promise<void>;

  // Orders
  getOrders(query?: { customerId?: number }): Promise<OrderResponse[]>;
  getOrder(id: number): Promise<OrderResponse | undefined>;
  createOrder(customerId: number, items: { productId: number; quantity: number }[]): Promise<Order>;
  updateOrderStatus(id: number, status: string): Promise<Order | undefined>;

  // Ledger
  getLedgerEntries(customerId: number): Promise<LedgerEntry[]>;
  createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry>;
}

export class DatabaseStorage implements IStorage {
  // Categories
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  // Products
  async getProducts(query?: { search?: string; categoryId?: number }): Promise<ProductResponse[]> {
    let q = db.select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      description: products.description,
      price: products.price,
      stockQuantity: products.stockQuantity,
      categoryId: products.categoryId,
      imageUrl: products.imageUrl,
      createdAt: products.createdAt,
      category: categories,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id));

    if (query?.search) {
      q.where(sql`${products.name} ILIKE ${`%${query.search}%`} OR ${products.sku} ILIKE ${`%${query.search}%`}`);
    }

    if (query?.categoryId) {
      q.where(eq(products.categoryId, query.categoryId));
    }

    const results = await q.orderBy(desc(products.createdAt));
    
    // Map result to simpler structure if needed, but the join return structure matches roughly
    // We need to flatten it a bit to match ProductResponse exactly if needed, 
    // but Drizzle's join result is { products: ..., categories: ... } usually.
    // Let's use `db.query` for cleaner relation fetching.
    
    return await db.query.products.findMany({
      with: { category: true },
      where: (products, { eq, or, ilike, and }) => {
        const conditions = [];
        if (query?.search) {
          conditions.push(or(
            ilike(products.name, `%${query.search}%`),
            ilike(products.sku, `%${query.search}%`)
          ));
        }
        if (query?.categoryId) {
          conditions.push(eq(products.categoryId, query.categoryId));
        }
        return conditions.length ? and(...conditions) : undefined;
      },
      orderBy: [desc(products.createdAt)],
    });
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return await db.query.products.findFirst({
      where: eq(products.id, id),
    });
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updatedProduct] = await db.update(products).set(updates).where(eq(products.id, id)).returning();
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Customers
  async getCustomers(query?: { search?: string }): Promise<Customer[]> {
    return await db.query.customers.findMany({
      where: (customers, { or, ilike }) => 
        query?.search ? or(
          ilike(customers.name, `%${query.search}%`),
          ilike(customers.email, `%${query.search}%`)
        ) : undefined,
      orderBy: [desc(customers.createdAt)],
    });
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    return await db.query.customers.findFirst({
      where: eq(customers.id, id),
    });
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updatedCustomer] = await db.update(customers).set(updates).where(eq(customers.id, id)).returning();
    return updatedCustomer;
  }

  async updateCustomerBalance(id: number, amountDelta: number): Promise<void> {
    await db.update(customers)
      .set({ currentBalance: sql`${customers.currentBalance} + ${amountDelta}` })
      .where(eq(customers.id, id));
  }

  // Orders
  async getOrders(query?: { customerId?: number }): Promise<OrderResponse[]> {
    return await db.query.orders.findMany({
      where: query?.customerId ? eq(orders.customerId, query.customerId) : undefined,
      with: { customer: true },
      orderBy: [desc(orders.createdAt)],
    });
  }

  async getOrder(id: number): Promise<OrderResponse | undefined> {
    return await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        customer: true,
        items: {
          with: { product: true }
        }
      }
    });
  }

  async createOrder(customerId: number, items: { productId: number; quantity: number }[]): Promise<Order> {
    // 1. Calculate total and verify stock
    let totalAmount = 0;
    const finalItems = [];

    // Note: In a real app we'd use a transaction here.
    // Drizzle transaction:
    return await db.transaction(async (tx) => {
      for (const item of items) {
        const product = await tx.query.products.findFirst({
          where: eq(products.id, item.productId)
        });
        
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.stockQuantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

        const itemTotal = product.price * item.quantity;
        totalAmount += itemTotal;
        finalItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price
        });

        // Decrement stock
        await tx.update(products)
          .set({ stockQuantity: product.stockQuantity - item.quantity })
          .where(eq(products.id, item.productId));
      }

      // 2. Create Order
      const [newOrder] = await tx.insert(orders).values({
        customerId,
        totalAmount,
        status: "completed", // Assume immediate completion for MVP
        orderDate: new Date()
      }).returning();

      // 3. Create Order Items
      for (const item of finalItems) {
        await tx.insert(orderItems).values({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        });
      }

      // 4. Update Customer Ledger (Purchase)
      await tx.insert(ledgerEntries).values({
        customerId,
        type: "purchase",
        amount: totalAmount,
        description: `Order #${newOrder.id}`,
        entryDate: new Date()
      });

      // 5. Update Customer Balance
      await tx.update(customers)
        .set({ currentBalance: sql`${customers.currentBalance} + ${totalAmount}` })
        .where(eq(customers.id, customerId));

      return newOrder;
    });
  }

  async updateOrderStatus(id: number, status: string): Promise<Order | undefined> {
    const [updatedOrder] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning();
    return updatedOrder;
  }

  // Ledger
  async getLedgerEntries(customerId: number): Promise<LedgerEntry[]> {
    return await db.query.ledgerEntries.findMany({
      where: eq(ledgerEntries.customerId, customerId),
      orderBy: [desc(ledgerEntries.entryDate)],
    });
  }

  async createLedgerEntry(entry: InsertLedgerEntry): Promise<LedgerEntry> {
    return await db.transaction(async (tx) => {
      const [newEntry] = await tx.insert(ledgerEntries).values(entry).returning();

      // Update balance based on type
      let delta = 0;
      if (entry.type === 'debit' || entry.type === 'purchase') {
        delta = entry.amount; // Increases balance (money owed)
      } else if (entry.type === 'credit' || entry.type === 'payment') {
        delta = -entry.amount; // Decreases balance
      }

      await tx.update(customers)
        .set({ currentBalance: sql`${customers.currentBalance} + ${delta}` })
        .where(eq(customers.id, entry.customerId));

      return newEntry;
    });
  }
}

export const storage = new DatabaseStorage();
