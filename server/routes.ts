import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

// Helper to require businessId from user
function requireBusiness(req: any, res: Response, next: NextFunction) {
  if (!req.user?.businessId) {
    return res.status(403).json({ message: "No business account associated. Please create or join a business." });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Categories - require auth and business
  app.get(api.categories.list.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const categories = await storage.getCategories(businessId);
    res.json(categories);
  });

  app.post(api.categories.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.categories.create.input.parse(req.body);
      const category = await storage.createCategory(businessId, input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.categories.delete.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCategory(businessId, id);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({ success: true });
  });

  // Products
  app.get(api.products.list.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const query = {
      search: req.query.search as string | undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined
    };
    const products = await storage.getProducts(businessId, query);
    res.json(products);
  });

  app.get(api.products.get.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const product = await storage.getProduct(businessId, Number(req.params.id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post(api.products.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.products.create.input.parse(req.body);
      const product = await storage.createProduct(businessId, input);
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.products.update.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.products.update.input.parse(req.body);
      const product = await storage.updateProduct(businessId, Number(req.params.id), input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.products.delete.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    await storage.deleteProduct(businessId, Number(req.params.id));
    res.status(204).send();
  });

  // Customers
  app.get(api.customers.list.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const query = {
      search: req.query.search as string | undefined
    };
    const customers = await storage.getCustomers(businessId, query);
    res.json(customers);
  });

  app.get(api.customers.get.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const customer = await storage.getCustomer(businessId, Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post(api.customers.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.customers.create.input.parse(req.body);
      const customer = await storage.createCustomer(businessId, input);
      res.status(201).json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.customers.update.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.customers.update.input.parse(req.body);
      const customer = await storage.updateCustomer(businessId, Number(req.params.id), input);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Orders
  app.get(api.orders.list.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const query = {
      customerId: req.query.customerId ? Number(req.query.customerId) : undefined
    };
    const orders = await storage.getOrders(businessId, query);
    res.json(orders);
  });

  app.get(api.orders.get.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const order = await storage.getOrder(businessId, Number(req.params.id));
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  });

  app.get(api.vat.nextBillNumber.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const nextBillNumber = await storage.getNextVatBillNumber(businessId);
      res.json({ nextBillNumber });
    } catch (err) {
      throw err;
    }
  });

  app.post(api.orders.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.orders.create.input.parse(req.body);
      const order = await storage.createOrder(businessId, input.customerId, input.items, input.note, input.paymentStatus, input.orderDate, input.vatBillNumber);
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.patch(api.orders.updateStatus.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const { status } = api.orders.updateStatus.input.parse(req.body);
      const order = await storage.updateOrderStatus(businessId, Number(req.params.id), status);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch(api.orders.updatePaymentStatus.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const { paymentStatus } = api.orders.updatePaymentStatus.input.parse(req.body);
      const order = await storage.updatePaymentStatus(businessId, Number(req.params.id), paymentStatus);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.patch(api.orders.edit.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.orders.edit.input.parse(req.body);
      const order = await storage.editOrder(businessId, Number(req.params.id), input);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Ledger - require auth and businessId for full isolation
  app.get(api.ledger.list.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    // Verify customer belongs to this business
    const customer = await storage.getCustomer(businessId, Number(req.params.customerId));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const entries = await storage.getLedgerEntries(businessId, Number(req.params.customerId));
    res.json(entries);
  });

  app.post(api.ledger.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.ledger.create.input.parse(req.body);
      // Verify customer belongs to this business
      const customer = await storage.getCustomer(businessId, input.customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const entry = await storage.createLedgerEntry(businessId, input);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Inventory Movements
  app.get(api.inventoryMovements.listByProduct.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    const businessId = req.user.businessId;
    const productId = Number(req.params.productId);
    // Verify product belongs to this business
    const product = await storage.getProduct(businessId, productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const movements = await storage.getInventoryMovements(businessId, productId);
    res.json(movements);
  });

  app.get(api.inventoryMovements.listByDateRange.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      const movements = await storage.getInventoryMovementsByDateRange(businessId, startDate, endDate);
      res.json(movements);
    } catch (err) {
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post(api.inventoryMovements.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.inventoryMovements.create.input.parse(req.body);
      // Verify product belongs to this business
      const product = await storage.getProduct(businessId, input.productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      const movement = await storage.createInventoryMovement(businessId, input);
      res.status(201).json(movement);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get(api.inventoryMovements.getStockAtDate.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const productId = Number(req.params.productId);
      const dateStr = req.query.date as string;
      // Verify product belongs to this business
      const product = await storage.getProduct(businessId, productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      const date = new Date(dateStr);
      const stockQuantity = await storage.getInventoryAtDate(businessId, productId, date);
      res.json({ productId, date: dateStr, stockQuantity });
    } catch (err) {
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  // ============================================
  // BULK UPLOAD ENDPOINTS
  // ============================================

  // Bulk upload customers
  app.post('/api/bulk/customers', isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const rows: any[] = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      const errors: { row: number; message: string }[] = [];
      const validRows: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowErrors: string[] = [];

        if (!row.name || String(row.name).trim() === '') {
          rowErrors.push('name is required');
        }
        if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email).trim())) {
          rowErrors.push('invalid email format');
        }
        if (row.panVatNumber && !/^\d+$/.test(String(row.panVatNumber).trim())) {
          rowErrors.push('PAN/VAT number must be numeric only');
        }
        if (row.creditLimit !== undefined && row.creditLimit !== '' && isNaN(Number(row.creditLimit))) {
          rowErrors.push('creditLimit must be a number');
        }

        if (rowErrors.length > 0) {
          errors.push({ row: i + 1, message: rowErrors.join('; ') });
        } else {
          validRows.push({
            name: String(row.name).trim(),
            email: row.email ? String(row.email).trim() : null,
            phone: row.phone ? String(row.phone).trim() : null,
            address: row.address ? String(row.address).trim() : null,
            panVatNumber: row.panVatNumber ? String(row.panVatNumber).trim() : null,
            creditLimit: row.creditLimit ? Math.round(Number(row.creditLimit) * 100) : 0,
          });
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: `${errors.length} row(s) have errors`, errors });
      }

      const duplicatePhones: { row: number; phone: string }[] = [];
      const created: any[] = [];

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        if (row.phone) {
          const existing = await storage.getCustomers(businessId, { search: row.phone });
          const match = existing.find((c: any) => c.phone === row.phone);
          if (match) {
            duplicatePhones.push({ row: i + 1, phone: row.phone });
          }
        }
        const customer = await storage.createCustomer(businessId, row);
        created.push(customer);
      }

      res.status(201).json({
        created: created.length,
        duplicatePhones,
      });
    } catch (err) {
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      throw err;
    }
  });

  // Bulk upload orders + order items
  app.post('/api/bulk/orders', isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const orderRows: any[] = req.body.orders;
      const itemRows: any[] = req.body.items;

      if (!Array.isArray(orderRows) || orderRows.length === 0) {
        return res.status(400).json({ message: "No order rows provided" });
      }
      if (!Array.isArray(itemRows) || itemRows.length === 0) {
        return res.status(400).json({ message: "No order item rows provided" });
      }

      const validStatuses = ['new', 'in-process', 'ready', 'completed'];
      const validPaymentStatuses = ['COD', 'Bank Transfer/QR', 'Credit'];
      const errors: { row: number; file: string; message: string }[] = [];

      const orderMap = new Map<string, any>();
      for (let i = 0; i < orderRows.length; i++) {
        const row = orderRows[i];
        const rowErrors: string[] = [];

        if (!row.orderRef || String(row.orderRef).trim() === '') {
          rowErrors.push('orderRef is required');
        }
        if (!row.customerRefID || isNaN(Number(row.customerRefID))) {
          rowErrors.push('customerRefID must be a valid number');
        }
        if (row.status && !validStatuses.includes(String(row.status).trim())) {
          rowErrors.push(`status must be one of: ${validStatuses.join(', ')}`);
        }
        if (row.paymentStatus && !validPaymentStatuses.includes(String(row.paymentStatus).trim())) {
          rowErrors.push(`paymentStatus must be one of: ${validPaymentStatuses.join(', ')}`);
        }
        if (row.orderDate && isNaN(Date.parse(String(row.orderDate)))) {
          rowErrors.push('orderDate must be a valid date (YYYY-MM-DD)');
        }
        if (row.vatBillNumber && !/^\d+$/.test(String(row.vatBillNumber).trim())) {
          rowErrors.push('vatBillNumber must be numeric only');
        }

        if (rowErrors.length > 0) {
          errors.push({ row: i + 1, file: 'orders', message: rowErrors.join('; ') });
        } else {
          const ref = String(row.orderRef).trim();
          if (orderMap.has(ref)) {
            errors.push({ row: i + 1, file: 'orders', message: `Duplicate orderRef: ${ref}` });
          } else {
            orderMap.set(ref, {
              customerRefID: Number(row.customerRefID),
              status: row.status ? String(row.status).trim() : 'new',
              paymentStatus: row.paymentStatus ? String(row.paymentStatus).trim() : 'Credit',
              note: row.note ? String(row.note).trim() : null,
              vatBillNumber: row.vatBillNumber ? String(row.vatBillNumber).trim() : null,
              orderDate: row.orderDate ? String(row.orderDate).trim() : undefined,
              items: []
            });
          }
        }
      }

      // Validate items
      for (let i = 0; i < itemRows.length; i++) {
        const row = itemRows[i];
        const rowErrors: string[] = [];

        if (!row.orderRef || String(row.orderRef).trim() === '') {
          rowErrors.push('orderRef is required');
        } else if (!orderMap.has(String(row.orderRef).trim())) {
          rowErrors.push(`orderRef "${row.orderRef}" does not match any order`);
        }
        if (!row.productSKU || String(row.productSKU).trim() === '') {
          rowErrors.push('productSKU is required');
        }
        if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) <= 0 || !Number.isInteger(Number(row.quantity))) {
          rowErrors.push('quantity must be a positive integer');
        }
        if (!row.unitPrice || isNaN(Number(row.unitPrice)) || Number(row.unitPrice) <= 0) {
          rowErrors.push('unitPrice must be a positive number');
        }
        if (row.discountPercent !== undefined && row.discountPercent !== '') {
          const dp = Number(row.discountPercent);
          if (isNaN(dp) || dp < 0 || dp > 100) {
            rowErrors.push('discountPercent must be 0-100 (e.g. 50 means 50% off)');
          }
        }

        if (rowErrors.length > 0) {
          errors.push({ row: i + 1, file: 'orderItems', message: rowErrors.join('; ') });
        } else {
          const ref = String(row.orderRef).trim();
          const order = orderMap.get(ref);
          if (order) {
            order.items.push({
              productSKU: String(row.productSKU).trim(),
              quantity: Number(row.quantity),
              unitPrice: Math.round(Number(row.unitPrice) * 100),
              discountPercent: row.discountPercent !== undefined && row.discountPercent !== '' ? Number(row.discountPercent) : 0,
            });
          }
        }
      }

      // Check orders with no items
      Array.from(orderMap.entries()).forEach(([ref, order]) => {
        if (order.items.length === 0) {
          errors.push({ row: 0, file: 'orders', message: `Order "${ref}" has no matching items` });
        }
      });

      if (errors.length > 0) {
        return res.status(400).json({ message: `${errors.length} error(s) found`, errors });
      }

      // Validate customer IDs and product SKUs exist
      const allProducts = await storage.getProducts(businessId);
      const skuMap = new Map<string, any>();
      for (const p of allProducts) {
        skuMap.set(p.sku, p);
      }

      const orderEntries = Array.from(orderMap.entries());
      for (let idx = 0; idx < orderEntries.length; idx++) {
        const [ref, order] = orderEntries[idx];
        const customer = await storage.getCustomer(businessId, order.customerRefID);
        if (!customer) {
          errors.push({ row: 0, file: 'orders', message: `Customer ID ${order.customerRefID} not found (orderRef: ${ref})` });
        }
        for (const item of order.items) {
          if (!skuMap.has(item.productSKU)) {
            errors.push({ row: 0, file: 'orderItems', message: `Product SKU "${item.productSKU}" not found (orderRef: ${ref})` });
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: `${errors.length} error(s) found`, errors });
      }

      // All valid - create orders using existing createOrder logic
      const createdOrders: any[] = [];
      const allOrderEntries = Array.from(orderMap.entries());
      for (let idx = 0; idx < allOrderEntries.length; idx++) {
        const [ref, orderData] = allOrderEntries[idx];
        const items = orderData.items.map((item: any) => {
          const product = skuMap.get(item.productSKU)!;
          return {
            productId: product.id,
            quantity: item.quantity,
            discountPercent: item.discountPercent,
          };
        });

        const order = await storage.createOrder(
          businessId,
          orderData.customerRefID,
          items,
          orderData.note,
          orderData.paymentStatus,
          orderData.orderDate,
          orderData.vatBillNumber
        );
        createdOrders.push(order);
      }

      res.status(201).json({ created: createdOrders.length });
    } catch (err) {
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      throw err;
    }
  });

  // Bulk upload ledger entries
  app.post('/api/bulk/ledger', isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const rows: any[] = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      const validTypes = ['credit', 'adjustment'];
      const errors: { row: number; message: string }[] = [];
      const validRows: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowErrors: string[] = [];

        if (!row.customerRefID || isNaN(Number(row.customerRefID))) {
          rowErrors.push('customerRefID must be a valid number');
        }
        if (!row.type || !validTypes.includes(String(row.type).trim().toLowerCase())) {
          rowErrors.push('type must be "credit" or "adjustment"');
        }
        if (!row.amount || isNaN(Number(row.amount)) || Number(row.amount) <= 0) {
          rowErrors.push('amount must be a positive number');
        }
        if (row.entryDate && isNaN(Date.parse(String(row.entryDate)))) {
          rowErrors.push('entryDate must be a valid date (YYYY-MM-DD)');
        }

        if (rowErrors.length > 0) {
          errors.push({ row: i + 1, message: rowErrors.join('; ') });
        } else {
          validRows.push({
            customerRefID: Number(row.customerRefID),
            type: String(row.type).trim().toLowerCase(),
            amount: Math.round(Number(row.amount) * 100),
            description: row.description ? String(row.description).trim() : null,
            entryDate: row.entryDate ? new Date(String(row.entryDate)) : new Date(),
          });
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: `${errors.length} row(s) have errors`, errors });
      }

      // Validate all customer IDs
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const customer = await storage.getCustomer(businessId, row.customerRefID);
        if (!customer) {
          errors.push({ row: i + 1, message: `Customer ID ${row.customerRefID} not found` });
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ message: `${errors.length} row(s) have errors`, errors });
      }

      const created: any[] = [];
      for (const row of validRows) {
        const entry = await storage.createLedgerEntry(businessId, {
          customerId: row.customerRefID,
          type: row.type,
          amount: row.amount,
          description: row.description,
        });
        created.push(entry);
      }

      res.status(201).json({ created: created.length });
    } catch (err) {
      if (err instanceof Error) return res.status(400).json({ message: err.message });
      throw err;
    }
  });

  return httpServer;
}
