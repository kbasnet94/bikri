import { db } from "./db";
import { eq, desc, sql, sum, and } from "drizzle-orm";
import {
  categories, products, customers, orders, orderItems, ledgerEntries,
  type InsertCategory, type InsertProduct, type InsertCustomer,
  type InsertLedgerEntry, type Product, type Category, type Customer, type Order, type LedgerEntry,
  type ProductResponse, type OrderResponse
} from "@shared/schema";

export interface IStorage {
  // Categories
  getCategories(businessId: string): Promise<Category[]>;
  createCategory(businessId: string, category: InsertCategory): Promise<Category>;
  deleteCategory(businessId: string, id: number): Promise<boolean>;

  // Products
  getProducts(businessId: string, query?: { search?: string; categoryId?: number }): Promise<ProductResponse[]>;
  getProduct(businessId: string, id: number): Promise<Product | undefined>;
  createProduct(businessId: string, product: InsertProduct): Promise<Product>;
  updateProduct(businessId: string, id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(businessId: string, id: number): Promise<void>;

  // Customers
  getCustomers(businessId: string, query?: { search?: string }): Promise<Customer[]>;
  getCustomer(businessId: string, id: number): Promise<Customer | undefined>;
  createCustomer(businessId: string, customer: InsertCustomer): Promise<Customer>;
  updateCustomer(businessId: string, id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  updateCustomerBalance(businessId: string, id: number, amountDelta: number): Promise<void>;

  // Orders
  getOrders(businessId: string, query?: { customerId?: number }): Promise<OrderResponse[]>;
  getOrder(businessId: string, id: number): Promise<OrderResponse | undefined>;
  createOrder(businessId: string, customerId: number, items: { productId: number; quantity: number; discountPercent?: number }[], note?: string): Promise<Order>;
  updateOrderStatus(businessId: string, id: number, status: string): Promise<Order | undefined>;
  editOrder(businessId: string, id: number, data: { note?: string; items: { id: number; quantity: number; discountPercent: number }[] }): Promise<OrderResponse | undefined>;

  // Ledger
  getLedgerEntries(businessId: string, customerId: number): Promise<LedgerEntry[]>;
  createLedgerEntry(businessId: string, entry: InsertLedgerEntry): Promise<LedgerEntry>;
}

export class DatabaseStorage implements IStorage {
  // Categories
  async getCategories(businessId: string): Promise<Category[]> {
    return await db.select().from(categories).where(eq(categories.businessId, businessId));
  }

  async createCategory(businessId: string, category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values({ ...category, businessId }).returning();
    return newCategory;
  }

  async deleteCategory(businessId: string, id: number): Promise<boolean> {
    const result = await db.delete(categories).where(and(eq(categories.id, id), eq(categories.businessId, businessId))).returning();
    return result.length > 0;
  }

  // Products
  async getProducts(businessId: string, query?: { search?: string; categoryId?: number }): Promise<ProductResponse[]> {
    return await db.query.products.findMany({
      with: { category: true },
      where: (products, { eq: eqOp, or, ilike, and: andOp }) => {
        const conditions = [eqOp(products.businessId, businessId)];
        if (query?.search) {
          conditions.push(or(
            ilike(products.name, `%${query.search}%`),
            ilike(products.sku, `%${query.search}%`)
          )!);
        }
        if (query?.categoryId) {
          conditions.push(eqOp(products.categoryId, query.categoryId));
        }
        return andOp(...conditions);
      },
      orderBy: [desc(products.createdAt)],
    });
  }

  async getProduct(businessId: string, id: number): Promise<Product | undefined> {
    return await db.query.products.findFirst({
      where: and(eq(products.id, id), eq(products.businessId, businessId)),
    });
  }

  async createProduct(businessId: string, product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values({ ...product, businessId }).returning();
    return newProduct;
  }

  async updateProduct(businessId: string, id: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updatedProduct] = await db.update(products).set(updates).where(and(eq(products.id, id), eq(products.businessId, businessId))).returning();
    return updatedProduct;
  }

  async deleteProduct(businessId: string, id: number): Promise<void> {
    await db.delete(products).where(and(eq(products.id, id), eq(products.businessId, businessId)));
  }

  // Customers
  async getCustomers(businessId: string, query?: { search?: string }): Promise<Customer[]> {
    return await db.query.customers.findMany({
      where: (customers, { eq: eqOp, or, ilike, and: andOp }) => {
        const conditions = [eqOp(customers.businessId, businessId)];
        if (query?.search) {
          conditions.push(or(
            ilike(customers.name, `%${query.search}%`),
            ilike(customers.email, `%${query.search}%`)
          )!);
        }
        return andOp(...conditions);
      },
      orderBy: [desc(customers.createdAt)],
    });
  }

  async getCustomer(businessId: string, id: number): Promise<Customer | undefined> {
    return await db.query.customers.findFirst({
      where: and(eq(customers.id, id), eq(customers.businessId, businessId)),
    });
  }

  async createCustomer(businessId: string, customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values({ ...customer, businessId }).returning();
    return newCustomer;
  }

  async updateCustomer(businessId: string, id: number, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [updatedCustomer] = await db.update(customers).set(updates).where(and(eq(customers.id, id), eq(customers.businessId, businessId))).returning();
    return updatedCustomer;
  }

  async updateCustomerBalance(businessId: string, id: number, amountDelta: number): Promise<void> {
    await db.update(customers)
      .set({ currentBalance: sql`${customers.currentBalance} + ${amountDelta}` })
      .where(and(eq(customers.id, id), eq(customers.businessId, businessId)));
  }

  // Orders
  async getOrders(businessId: string, query?: { customerId?: number }): Promise<OrderResponse[]> {
    return await db.query.orders.findMany({
      where: (orders, { eq: eqOp, and: andOp }) => {
        const conditions = [eqOp(orders.businessId, businessId)];
        if (query?.customerId) {
          conditions.push(eqOp(orders.customerId, query.customerId));
        }
        return andOp(...conditions);
      },
      with: { 
        customer: true,
        items: {
          with: { product: true }
        }
      },
      orderBy: [desc(orders.createdAt)],
    });
  }

  async getOrder(businessId: string, id: number): Promise<OrderResponse | undefined> {
    return await db.query.orders.findFirst({
      where: and(eq(orders.id, id), eq(orders.businessId, businessId)),
      with: {
        customer: true,
        items: {
          with: { product: true }
        }
      }
    });
  }

  async createOrder(businessId: string, customerId: number, items: { productId: number; quantity: number; discountPercent?: number }[], note?: string, paymentStatus: string = "Credit"): Promise<Order> {
    let totalAmount = 0;
    const finalItems: { productId: number; quantity: number; unitPrice: number; discount: number }[] = [];

    return await db.transaction(async (tx) => {
      for (const item of items) {
        const product = await tx.query.products.findFirst({
          where: and(eq(products.id, item.productId), eq(products.businessId, businessId))
        });
        
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.stockQuantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);

        const discountPercent = Math.min(100, Math.max(0, item.discountPercent || 0));
        const discountAmount = Math.round(product.price * discountPercent / 100);
        const effectivePrice = Math.max(0, product.price - discountAmount);
        const itemTotal = effectivePrice * item.quantity;
        totalAmount += itemTotal;
        finalItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
          discount: discountAmount
        });

        await tx.update(products)
          .set({ stockQuantity: product.stockQuantity - item.quantity })
          .where(eq(products.id, item.productId));
      }

      const [newOrder] = await tx.insert(orders).values({
        businessId,
        customerId,
        totalAmount,
        status: "new",
        paymentStatus,
        note: note || null,
        orderDate: new Date()
      }).returning();

      for (const item of finalItems) {
        await tx.insert(orderItems).values({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount
        });
      }

      // Always create a purchase ledger entry (increases customer balance)
      await tx.insert(ledgerEntries).values({
        businessId,
        customerId,
        type: "purchase",
        amount: totalAmount,
        description: `Order #${newOrder.id}`,
        entryDate: new Date()
      });

      // If COD or Bank Transfer/QR, also create a payment entry (decreases balance)
      if (paymentStatus === "COD" || paymentStatus === "Bank Transfer/QR") {
        await tx.insert(ledgerEntries).values({
          businessId,
          customerId,
          type: "credit",
          amount: totalAmount,
          description: `Payment for Order #${newOrder.id} (${paymentStatus})`,
          entryDate: new Date()
        });
        // Balance stays the same (purchase + payment cancel out)
      } else {
        // Credit: balance increases by purchase amount
        await tx.update(customers)
          .set({ currentBalance: sql`${customers.currentBalance} + ${totalAmount}` })
          .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
      }

      return newOrder;
    });
  }

  async updateOrderStatus(businessId: string, id: number, status: string): Promise<Order | undefined> {
    const [updatedOrder] = await db.update(orders).set({ status }).where(and(eq(orders.id, id), eq(orders.businessId, businessId))).returning();
    return updatedOrder;
  }

  async updatePaymentStatus(businessId: string, id: number, newPaymentStatus: string): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      const existingOrder = await tx.query.orders.findFirst({
        where: and(eq(orders.id, id), eq(orders.businessId, businessId))
      });
      
      if (!existingOrder) return undefined;

      // If current payment status is Credit, it cannot be changed
      if (existingOrder.paymentStatus === "Credit") {
        throw new Error("Cannot change payment status once set to Credit");
      }

      // Cannot switch to Credit from other statuses
      if (newPaymentStatus === "Credit") {
        throw new Error("Cannot change payment status to Credit");
      }

      // Switching between COD and Bank Transfer/QR is allowed (no ledger changes needed)
      const [updatedOrder] = await tx.update(orders)
        .set({ paymentStatus: newPaymentStatus })
        .where(and(eq(orders.id, id), eq(orders.businessId, businessId)))
        .returning();
      
      return updatedOrder;
    });
  }

  async editOrder(businessId: string, id: number, data: { note?: string; items: { id: number; quantity: number; discountPercent: number }[] }): Promise<OrderResponse | undefined> {
    return await db.transaction(async (tx) => {
      // First verify the order belongs to this business
      const existingOrder = await tx.query.orders.findFirst({
        where: and(eq(orders.id, id), eq(orders.businessId, businessId)),
        with: { items: { with: { product: true } } }
      });
      
      if (!existingOrder) return undefined;

      // Update each item's quantity and discount
      let newTotal = 0;
      for (const itemUpdate of data.items) {
        const existingItem = existingOrder.items.find(i => i.id === itemUpdate.id);
        if (!existingItem) continue;
        
        const discountAmount = Math.round(existingItem.unitPrice * itemUpdate.discountPercent / 100);
        const effectivePrice = existingItem.unitPrice - discountAmount;
        const lineTotal = effectivePrice * itemUpdate.quantity;
        newTotal += lineTotal;

        await tx.update(orderItems)
          .set({ 
            quantity: itemUpdate.quantity, 
            discount: discountAmount 
          })
          .where(eq(orderItems.id, itemUpdate.id));
      }

      // Update order note and total
      await tx.update(orders)
        .set({ 
          note: data.note !== undefined ? data.note : existingOrder.note,
          totalAmount: newTotal 
        })
        .where(and(eq(orders.id, id), eq(orders.businessId, businessId)));

      // Return the updated order
      return await this.getOrder(businessId, id);
    });
  }

  // Ledger
  async getLedgerEntries(businessId: string, customerId: number): Promise<LedgerEntry[]> {
    return await db.query.ledgerEntries.findMany({
      where: and(eq(ledgerEntries.businessId, businessId), eq(ledgerEntries.customerId, customerId)),
      orderBy: [desc(ledgerEntries.entryDate)],
    });
  }

  async createLedgerEntry(businessId: string, entry: InsertLedgerEntry): Promise<LedgerEntry> {
    return await db.transaction(async (tx) => {
      const [newEntry] = await tx.insert(ledgerEntries).values({ ...entry, businessId }).returning();

      // Update balance based on type
      let delta = 0;
      if (entry.type === 'debit' || entry.type === 'purchase') {
        delta = entry.amount; // Increases balance (money owed)
      } else if (entry.type === 'credit' || entry.type === 'payment') {
        delta = -entry.amount; // Decreases balance
      }

      await tx.update(customers)
        .set({ currentBalance: sql`${customers.currentBalance} + ${delta}` })
        .where(and(eq(customers.id, entry.customerId), eq(customers.businessId, businessId)));

      return newEntry;
    });
  }
}

export const storage = new DatabaseStorage();
