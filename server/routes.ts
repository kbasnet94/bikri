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

  app.post(api.orders.create.path, isAuthenticated, requireBusiness, async (req: any, res) => {
    try {
      const businessId = req.user.businessId;
      const input = api.orders.create.input.parse(req.body);
      const order = await storage.createOrder(businessId, input.customerId, input.items);
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

  return httpServer;
}
