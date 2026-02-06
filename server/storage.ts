import { db } from "./db";
import { eq, desc, sql, sum, and, lte, gte } from "drizzle-orm";
import {
  categories, products, customers, orders, orderItems, ledgerEntries, inventoryMovements,
  type InsertCategory, type InsertProduct, type InsertCustomer,
  type InsertLedgerEntry, type Product, type Category, type Customer, type Order, type LedgerEntry,
  type ProductResponse, type OrderResponse, type InventoryMovement, type InventoryMovementResponse,
  type CreateInventoryMovementRequest
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
  createOrder(businessId: string, customerId: number, items: { productId: number; quantity: number; discountPercent?: number }[], note?: string, paymentStatus?: string, orderDate?: string, vatBillNumber?: string): Promise<Order>;
  getNextVatBillNumber(businessId: string): Promise<string>;
  updateOrderStatus(businessId: string, id: number, status: string): Promise<Order | undefined>;
  updatePaymentStatus(businessId: string, id: number, newPaymentStatus: string): Promise<Order | undefined>;
  editOrder(businessId: string, id: number, data: { note?: string; orderDate?: string; items: { id: number; quantity: number; discountPercent: number }[] }): Promise<OrderResponse | undefined>;

  // Ledger
  getLedgerEntries(businessId: string, customerId: number): Promise<LedgerEntry[]>;
  createLedgerEntry(businessId: string, entry: InsertLedgerEntry): Promise<LedgerEntry>;

  // Inventory Movements
  getInventoryMovements(businessId: string, productId: number): Promise<InventoryMovementResponse[]>;
  getInventoryMovementsByDateRange(businessId: string, startDate: Date, endDate: Date): Promise<InventoryMovementResponse[]>;
  createInventoryMovement(businessId: string, data: CreateInventoryMovementRequest): Promise<InventoryMovement>;
  getInventoryAtDate(businessId: string, productId: number, date: Date): Promise<number>;
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

  async getNextVatBillNumber(businessId: string): Promise<string> {
    const result = await db.select({ vatBillNumber: orders.vatBillNumber })
      .from(orders)
      .where(and(eq(orders.businessId, businessId), sql`${orders.vatBillNumber} IS NOT NULL`))
      .orderBy(desc(orders.id));
    
    let maxNum = 0;
    for (const row of result) {
      const num = parseInt(row.vatBillNumber || "0", 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
    return String(maxNum + 1);
  }

  async createOrder(businessId: string, customerId: number, items: { productId: number; quantity: number; discountPercent?: number }[], note?: string, paymentStatus: string = "Credit", orderDate?: string, vatBillNumber?: string): Promise<Order> {
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
        vatBillNumber: vatBillNumber || null,
        orderDate: orderDate ? new Date(orderDate) : new Date()
      }).returning();

      for (const item of finalItems) {
        await tx.insert(orderItems).values({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount
        });

        // Record inventory movement for each item (sale)
        const product = await tx.query.products.findFirst({
          where: and(eq(products.id, item.productId), eq(products.businessId, businessId))
        });
        await tx.insert(inventoryMovements).values({
          businessId,
          productId: item.productId,
          movementType: "sale",
          quantityChange: -item.quantity,
          balanceAfter: product?.stockQuantity ?? 0, // Current stock after deduction
          orderId: newOrder.id,
          notes: `Order #${newOrder.id}`,
          movementDate: orderDate ? new Date(orderDate) : new Date()
        });
      }

      // Always create a purchase ledger entry (increases customer balance)
      await tx.insert(ledgerEntries).values({
        businessId,
        customerId,
        orderId: newOrder.id,
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
          orderId: newOrder.id,
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
    return await db.transaction(async (tx) => {
      // Get the order first to check current status and get customerId
      const existingOrder = await tx.query.orders.findFirst({
        where: and(eq(orders.id, id), eq(orders.businessId, businessId))
      });
      
      if (!existingOrder) return undefined;
      
      // If cancelling an order, reverse ledger entries and restore inventory
      if (status === "cancelled" && existingOrder.status !== "cancelled") {
        // Get order items to restore inventory
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        
        // Restore inventory for each item
        for (const item of items) {
          await tx.update(products)
            .set({ stockQuantity: sql`${products.stockQuantity} + ${item.quantity}` })
            .where(and(eq(products.id, item.productId), eq(products.businessId, businessId)));
        }
        
        // Get all ledger entries for this order
        const orderLedgerEntries = await tx.select().from(ledgerEntries)
          .where(and(eq(ledgerEntries.orderId, id), eq(ledgerEntries.businessId, businessId)));
        
        // Calculate net balance change to reverse
        // purchase entries increased balance, credit entries decreased balance
        let balanceToReverse = 0;
        for (const entry of orderLedgerEntries) {
          if (entry.type === "purchase") {
            balanceToReverse += entry.amount; // This was added to balance
          } else if (entry.type === "credit") {
            balanceToReverse -= entry.amount; // This was subtracted from balance
          }
        }
        
        // For Credit orders: balance was increased by totalAmount (balanceToReverse = totalAmount)
        // For COD/Bank Transfer: balance was unchanged (balanceToReverse = totalAmount - totalAmount = 0)
        
        if (balanceToReverse !== 0) {
          await tx.update(customers)
            .set({ currentBalance: sql`${customers.currentBalance} - ${balanceToReverse}` })
            .where(and(eq(customers.id, existingOrder.customerId), eq(customers.businessId, businessId)));
        }
        
        // Delete ledger entries for this order
        await tx.delete(ledgerEntries)
          .where(and(eq(ledgerEntries.orderId, id), eq(ledgerEntries.businessId, businessId)));

        // Delete inventory movements for this order
        await tx.delete(inventoryMovements)
          .where(and(eq(inventoryMovements.orderId, id), eq(inventoryMovements.businessId, businessId)));
      }
      
      const [updatedOrder] = await tx.update(orders)
        .set({ status })
        .where(and(eq(orders.id, id), eq(orders.businessId, businessId)))
        .returning();
      
      return updatedOrder;
    });
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

  async editOrder(businessId: string, id: number, data: { note?: string; orderDate?: string; items: { id: number; quantity: number; discountPercent: number }[] }): Promise<OrderResponse | undefined> {
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

      // Update order note, date, and total
      const updateData: { note?: string | null; orderDate?: Date; totalAmount: number } = {
        totalAmount: newTotal
      };
      if (data.note !== undefined) {
        updateData.note = data.note;
      }
      if (data.orderDate) {
        updateData.orderDate = new Date(data.orderDate);
      }
      
      await tx.update(orders)
        .set(updateData)
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

  // Inventory Movements
  async getInventoryMovements(businessId: string, productId: number): Promise<InventoryMovementResponse[]> {
    return await db.query.inventoryMovements.findMany({
      where: and(eq(inventoryMovements.businessId, businessId), eq(inventoryMovements.productId, productId)),
      with: { product: true },
      orderBy: [desc(inventoryMovements.movementDate)],
    });
  }

  async getInventoryMovementsByDateRange(businessId: string, startDate: Date, endDate: Date): Promise<InventoryMovementResponse[]> {
    return await db.query.inventoryMovements.findMany({
      where: and(
        eq(inventoryMovements.businessId, businessId),
        gte(inventoryMovements.movementDate, startDate),
        lte(inventoryMovements.movementDate, endDate)
      ),
      with: { product: true },
      orderBy: [desc(inventoryMovements.movementDate)],
    });
  }

  async createInventoryMovement(businessId: string, data: CreateInventoryMovementRequest): Promise<InventoryMovement> {
    return await db.transaction(async (tx) => {
      // Get current product stock
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, data.productId), eq(products.businessId, businessId))
      });
      
      if (!product) throw new Error(`Product ${data.productId} not found`);
      
      const newStock = product.stockQuantity + data.quantityChange;
      if (newStock < 0) throw new Error(`Insufficient stock. Current: ${product.stockQuantity}, Change: ${data.quantityChange}`);
      
      // Update product stock
      await tx.update(products)
        .set({ stockQuantity: newStock })
        .where(and(eq(products.id, data.productId), eq(products.businessId, businessId)));
      
      // Create movement record
      const [movement] = await tx.insert(inventoryMovements).values({
        businessId,
        productId: data.productId,
        movementType: data.movementType,
        quantityChange: data.quantityChange,
        balanceAfter: newStock,
        notes: data.notes || null,
        movementDate: data.movementDate ? new Date(data.movementDate) : new Date()
      }).returning();
      
      return movement;
    });
  }

  async getInventoryAtDate(businessId: string, productId: number, date: Date): Promise<number> {
    // Find the most recent movement on or before the given date
    const movement = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.businessId, businessId),
        eq(inventoryMovements.productId, productId),
        lte(inventoryMovements.movementDate, date)
      ),
      orderBy: [desc(inventoryMovements.movementDate)],
    });
    
    // If no movement found before date, return 0 (no recorded history)
    return movement?.balanceAfter ?? 0;
  }
}

export const storage = new DatabaseStorage();
