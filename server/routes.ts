import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Categories
  app.get(api.categories.list.path, async (req, res) => {
    const categories = await storage.getCategories();
    res.json(categories);
  });

  app.post(api.categories.create.path, async (req, res) => {
    try {
      const input = api.categories.create.input.parse(req.body);
      const category = await storage.createCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Products
  app.get(api.products.list.path, async (req, res) => {
    const query = {
      search: req.query.search as string | undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined
    };
    const products = await storage.getProducts(query);
    res.json(products);
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post(api.products.create.path, async (req, res) => {
    try {
      const input = api.products.create.input.parse(req.body);
      const product = await storage.createProduct(input);
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.products.update.path, async (req, res) => {
    try {
      const input = api.products.update.input.parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.status(204).send();
  });

  // Customers
  app.get(api.customers.list.path, async (req, res) => {
    const query = {
      search: req.query.search as string | undefined
    };
    const customers = await storage.getCustomers(query);
    res.json(customers);
  });

  app.get(api.customers.get.path, async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post(api.customers.create.path, async (req, res) => {
    try {
      const input = api.customers.create.input.parse(req.body);
      const customer = await storage.createCustomer(input);
      res.status(201).json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.customers.update.path, async (req, res) => {
    try {
      const input = api.customers.update.input.parse(req.body);
      const customer = await storage.updateCustomer(Number(req.params.id), input);
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
  app.get(api.orders.list.path, async (req, res) => {
    const query = {
      customerId: req.query.customerId ? Number(req.query.customerId) : undefined
    };
    const orders = await storage.getOrders(query);
    res.json(orders);
  });

  app.get(api.orders.get.path, async (req, res) => {
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  });

  app.post(api.orders.create.path, async (req, res) => {
    try {
      const input = api.orders.create.input.parse(req.body);
      const order = await storage.createOrder(input.customerId, input.items);
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

  app.patch(api.orders.updateStatus.path, async (req, res) => {
    try {
      const { status } = api.orders.updateStatus.input.parse(req.body);
      const order = await storage.updateOrderStatus(Number(req.params.id), status);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Ledger
  app.get(api.ledger.list.path, async (req, res) => {
    const entries = await storage.getLedgerEntries(Number(req.params.customerId));
    res.json(entries);
  });

  app.post(api.ledger.create.path, async (req, res) => {
    try {
      const input = api.ledger.create.input.parse(req.body);
      const entry = await storage.createLedgerEntry(input);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Seed database
  // In a real app, this would be a separate script or conditional check
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingCustomers = await storage.getCustomers();
  if (existingCustomers.length > 0) return;

  console.log("Seeding database...");

  // Categories
  const catElec = await storage.createCategory({ name: "Electronics", description: "Gadgets and devices" });
  const catHome = await storage.createCategory({ name: "Home & Garden", description: "Furniture and decor" });

  // Products
  const p1 = await storage.createProduct({
    name: "Laptop Pro",
    sku: "LAP-001",
    description: "High performance laptop",
    price: 120000, // $1200.00
    stockQuantity: 10,
    categoryId: catElec.id
  });

  const p2 = await storage.createProduct({
    name: "Wireless Mouse",
    sku: "MOU-001",
    description: "Ergonomic mouse",
    price: 4500, // $45.00
    stockQuantity: 50,
    categoryId: catElec.id
  });

  const p3 = await storage.createProduct({
    name: "Office Chair",
    sku: "CHR-001",
    description: "Comfortable mesh chair",
    price: 15000, // $150.00
    stockQuantity: 5,
    categoryId: catHome.id
  });

  // Customers
  const c1 = await storage.createCustomer({
    name: "Acme Corp",
    email: "contact@acme.com",
    phone: "555-0100",
    address: "123 Business Rd",
    creditLimit: 500000 // $5000.00
  });

  const c2 = await storage.createCustomer({
    name: "John Doe",
    email: "john@example.com",
    phone: "555-0101",
    address: "456 Home Ln",
    creditLimit: 100000 // $1000.00
  });

  // Create an initial order
  await storage.createOrder(c1.id, [
    { productId: p1.id, quantity: 1 },
    { productId: p2.id, quantity: 2 }
  ]);

  console.log("Database seeded!");
}
