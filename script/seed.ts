import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.ts";
import { businesses, users } from "../shared/models/auth.ts";
import bcrypt from "bcrypt";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { ...schema, businesses, users } });

async function seed() {
  console.log("🌱 Starting database seed...\n");

  try {
    // 1. Create Demo Business
    console.log("Creating demo business...");
    const [business] = await db.insert(businesses).values({
      name: "Bikri Wholesale Co.",
      currency: "USD",
    }).returning();
    console.log(`✓ Created business: ${business.name} (${business.id})\n`);

    // 2. Create Demo User (Owner)
    console.log("Creating demo user...");
    const hashedPassword = await bcrypt.hash("demo123", 10);
    const [user] = await db.insert(users).values({
      email: "demo@bikri.com",
      password: hashedPassword,
      firstName: "Demo",
      lastName: "User",
      businessId: business.id,
      role: "owner",
    }).returning();
    console.log(`✓ Created user: ${user.email} (password: demo123)\n`);

    // 3. Create Categories
    console.log("Creating categories...");
    const categoriesData = [
      { name: "Electronics", description: "Electronic devices and accessories" },
      { name: "Furniture", description: "Office and home furniture" },
      { name: "Stationery", description: "Office supplies and stationery items" },
      { name: "Textiles", description: "Fabrics and textile products" },
      { name: "Hardware", description: "Tools and hardware supplies" },
    ];

    const createdCategories = await db.insert(schema.categories).values(
      categoriesData.map(cat => ({ ...cat, businessId: business.id }))
    ).returning();
    console.log(`✓ Created ${createdCategories.length} categories\n`);

    // 4. Create Products
    console.log("Creating products...");
    const productsData = [
      // Electronics
      { name: "Laptop Dell XPS 13", sku: "LAP-DEL-001", price: 89999, stockQuantity: 15, categoryId: createdCategories[0].id, description: "High-performance laptop" },
      { name: "Wireless Mouse Logitech", sku: "MOU-LOG-001", price: 2999, stockQuantity: 50, categoryId: createdCategories[0].id, description: "Ergonomic wireless mouse" },
      { name: "USB-C Hub 7-in-1", sku: "HUB-USB-001", price: 4999, stockQuantity: 30, categoryId: createdCategories[0].id, description: "Multi-port USB hub" },
      { name: "LED Monitor 27\"", sku: "MON-LED-001", price: 24999, stockQuantity: 8, categoryId: createdCategories[0].id, description: "4K LED monitor" },
      
      // Furniture
      { name: "Office Chair Executive", sku: "CHR-OFF-001", price: 15999, stockQuantity: 12, categoryId: createdCategories[1].id, description: "Ergonomic office chair" },
      { name: "Standing Desk Adjustable", sku: "DSK-STD-001", price: 34999, stockQuantity: 5, categoryId: createdCategories[1].id, description: "Electric standing desk" },
      { name: "Filing Cabinet 4-Drawer", sku: "CAB-FIL-001", price: 12999, stockQuantity: 10, categoryId: createdCategories[1].id, description: "Metal filing cabinet" },
      
      // Stationery
      { name: "A4 Paper Ream (500 sheets)", sku: "PAP-A4-001", price: 599, stockQuantity: 200, categoryId: createdCategories[2].id, description: "Premium copy paper" },
      { name: "Ballpoint Pen Box (50pcs)", sku: "PEN-BAL-001", price: 999, stockQuantity: 100, categoryId: createdCategories[2].id, description: "Blue ballpoint pens" },
      { name: "Stapler Heavy Duty", sku: "STP-HVY-001", price: 1499, stockQuantity: 25, categoryId: createdCategories[2].id, description: "Industrial stapler" },
      
      // Textiles
      { name: "Cotton Fabric Roll (50m)", sku: "FAB-COT-001", price: 7999, stockQuantity: 20, categoryId: createdCategories[3].id, description: "100% cotton fabric" },
      { name: "Silk Fabric Roll (25m)", sku: "FAB-SLK-001", price: 14999, stockQuantity: 8, categoryId: createdCategories[3].id, description: "Premium silk fabric" },
      
      // Hardware
      { name: "Screwdriver Set 12-piece", sku: "TLS-SCR-001", price: 2999, stockQuantity: 40, categoryId: createdCategories[4].id, description: "Professional screwdriver set" },
      { name: "Power Drill Cordless", sku: "TLS-DRL-001", price: 8999, stockQuantity: 15, categoryId: createdCategories[4].id, description: "18V cordless drill" },
      { name: "Measuring Tape 25ft", sku: "TLS-MSR-001", price: 899, stockQuantity: 60, categoryId: createdCategories[4].id, description: "Heavy-duty measuring tape" },
    ];

    const createdProducts = await db.insert(schema.products).values(
      productsData.map(prod => ({ ...prod, businessId: business.id }))
    ).returning();
    console.log(`✓ Created ${createdProducts.length} products\n`);

    // 5. Create Customers
    console.log("Creating customers...");
    const customersData = [
      { name: "TechMart Retail", email: "orders@techmart.com", phone: "555-0101", address: "123 Market St, NY", panVatNumber: "1234567890", creditLimit: 5000000 },
      { name: "Office Solutions Inc", email: "procurement@officesolutions.com", phone: "555-0102", address: "456 Business Ave, CA", panVatNumber: "2345678901", creditLimit: 10000000 },
      { name: "HomeStyle Furnishings", email: "buyer@homestyle.com", phone: "555-0103", address: "789 Design Blvd, TX", panVatNumber: "3456789012", creditLimit: 7500000 },
      { name: "QuickShop Retailers", email: "supply@quickshop.com", phone: "555-0104", address: "321 Commerce Dr, FL", panVatNumber: "4567890123", creditLimit: 3000000 },
      { name: "BuildPro Hardware", email: "orders@buildpro.com", phone: "555-0105", address: "654 Industrial Rd, IL", panVatNumber: "5678901234", creditLimit: 8000000 },
      { name: "Fashion Fabrics Ltd", email: "purchasing@fashionfabrics.com", phone: "555-0106", address: "987 Textile Lane, MA", panVatNumber: "6789012345", creditLimit: 6000000 },
    ];

    const createdCustomers = await db.insert(schema.customers).values(
      customersData.map(cust => ({ ...cust, businessId: business.id }))
    ).returning();
    console.log(`✓ Created ${createdCustomers.length} customers\n`);

    // 6. Create Orders with Items
    console.log("Creating orders with items...");
    
    // Order 1: Completed COD Order
    const order1Items = [
      { productId: createdProducts[0].id, quantity: 2, discountPercent: 5 }, // Laptops
      { productId: createdProducts[1].id, quantity: 5, discountPercent: 0 }, // Mice
    ];
    const order1Total = Math.floor(
      createdProducts[0].price * 2 * 0.95 + createdProducts[1].price * 5
    );
    const [order1] = await db.insert(schema.orders).values({
      businessId: business.id,
      customerId: createdCustomers[0].id,
      status: "completed",
      paymentStatus: "COD",
      totalAmount: order1Total,
      note: "Rush delivery requested",
      vatBillNumber: "001",
      orderDate: new Date("2024-01-15"),
    }).returning();

    await db.insert(schema.orderItems).values(
      order1Items.map(item => ({
        orderId: order1.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: createdProducts.find(p => p.id === item.productId)!.price,
        discount: Math.floor(createdProducts.find(p => p.id === item.productId)!.price * (item.discountPercent / 100)),
      }))
    );

    // Update stock and create inventory movements for order 1
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[0].stockQuantity - 2 })
      .where(schema.products.id.eq(createdProducts[0].id));
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[1].stockQuantity - 5 })
      .where(schema.products.id.eq(createdProducts[1].id));

    await db.insert(schema.inventoryMovements).values([
      {
        businessId: business.id,
        productId: createdProducts[0].id,
        movementType: "sale",
        quantityChange: -2,
        balanceAfter: createdProducts[0].stockQuantity - 2,
        orderId: order1.id,
        notes: `Sale from order #${order1.id}`,
        movementDate: new Date("2024-01-15"),
      },
      {
        businessId: business.id,
        productId: createdProducts[1].id,
        movementType: "sale",
        quantityChange: -5,
        balanceAfter: createdProducts[1].stockQuantity - 5,
        orderId: order1.id,
        notes: `Sale from order #${order1.id}`,
        movementDate: new Date("2024-01-15"),
      },
    ]);

    // Create ledger entry for COD payment
    await db.insert(schema.ledgerEntries).values({
      businessId: business.id,
      customerId: createdCustomers[0].id,
      orderId: order1.id,
      type: "purchase",
      amount: order1Total,
      description: `Order #${order1.id} - COD Payment`,
      entryDate: new Date("2024-01-15"),
    });

    // Order 2: Credit Order (In Progress)
    const order2Items = [
      { productId: createdProducts[4].id, quantity: 3, discountPercent: 10 }, // Office Chairs
      { productId: createdProducts[5].id, quantity: 2, discountPercent: 10 }, // Standing Desks
    ];
    const order2Total = Math.floor(
      createdProducts[4].price * 3 * 0.90 + createdProducts[5].price * 2 * 0.90
    );
    const [order2] = await db.insert(schema.orders).values({
      businessId: business.id,
      customerId: createdCustomers[1].id,
      status: "in-process",
      paymentStatus: "Credit",
      totalAmount: order2Total,
      note: "Office renovation project",
      orderDate: new Date("2024-01-20"),
    }).returning();

    await db.insert(schema.orderItems).values(
      order2Items.map(item => ({
        orderId: order2.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: createdProducts.find(p => p.id === item.productId)!.price,
        discount: Math.floor(createdProducts.find(p => p.id === item.productId)!.price * (item.discountPercent / 100)),
      }))
    );

    // Update customer balance for credit order
    await db.update(schema.customers)
      .set({ currentBalance: order2Total })
      .where(schema.customers.id.eq(createdCustomers[1].id));

    // Create ledger entry for credit purchase
    await db.insert(schema.ledgerEntries).values({
      businessId: business.id,
      customerId: createdCustomers[1].id,
      orderId: order2.id,
      type: "purchase",
      amount: order2Total,
      description: `Order #${order2.id} - Credit Purchase`,
      entryDate: new Date("2024-01-20"),
    });

    // Update stock for order 2
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[4].stockQuantity - 3 })
      .where(schema.products.id.eq(createdProducts[4].id));
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[5].stockQuantity - 2 })
      .where(schema.products.id.eq(createdProducts[5].id));

    await db.insert(schema.inventoryMovements).values([
      {
        businessId: business.id,
        productId: createdProducts[4].id,
        movementType: "sale",
        quantityChange: -3,
        balanceAfter: createdProducts[4].stockQuantity - 3,
        orderId: order2.id,
        notes: `Sale from order #${order2.id}`,
        movementDate: new Date("2024-01-20"),
      },
      {
        businessId: business.id,
        productId: createdProducts[5].id,
        movementType: "sale",
        quantityChange: -2,
        balanceAfter: createdProducts[5].stockQuantity - 2,
        orderId: order2.id,
        notes: `Sale from order #${order2.id}`,
        movementDate: new Date("2024-01-20"),
      },
    ]);

    // Order 3: New Bank Transfer Order
    const order3Items = [
      { productId: createdProducts[7].id, quantity: 50, discountPercent: 15 }, // A4 Paper
      { productId: createdProducts[8].id, quantity: 20, discountPercent: 10 }, // Pens
      { productId: createdProducts[9].id, quantity: 10, discountPercent: 0 }, // Staplers
    ];
    const order3Total = Math.floor(
      createdProducts[7].price * 50 * 0.85 + 
      createdProducts[8].price * 20 * 0.90 + 
      createdProducts[9].price * 10
    );
    const [order3] = await db.insert(schema.orders).values({
      businessId: business.id,
      customerId: createdCustomers[2].id,
      status: "new",
      paymentStatus: "Bank Transfer/QR",
      totalAmount: order3Total,
      note: "Quarterly stationery order",
      vatBillNumber: "002",
      orderDate: new Date("2024-01-25"),
    }).returning();

    await db.insert(schema.orderItems).values(
      order3Items.map(item => ({
        orderId: order3.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: createdProducts.find(p => p.id === item.productId)!.price,
        discount: Math.floor(createdProducts.find(p => p.id === item.productId)!.price * (item.discountPercent / 100)),
      }))
    );

    // Create ledger entry for bank transfer payment
    await db.insert(schema.ledgerEntries).values({
      businessId: business.id,
      customerId: createdCustomers[2].id,
      orderId: order3.id,
      type: "purchase",
      amount: order3Total,
      description: `Order #${order3.id} - Bank Transfer Payment`,
      entryDate: new Date("2024-01-25"),
    });

    // Update stock for order 3
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[7].stockQuantity - 50 })
      .where(schema.products.id.eq(createdProducts[7].id));
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[8].stockQuantity - 20 })
      .where(schema.products.id.eq(createdProducts[8].id));
    await db.update(schema.products)
      .set({ stockQuantity: createdProducts[9].stockQuantity - 10 })
      .where(schema.products.id.eq(createdProducts[9].id));

    await db.insert(schema.inventoryMovements).values([
      {
        businessId: business.id,
        productId: createdProducts[7].id,
        movementType: "sale",
        quantityChange: -50,
        balanceAfter: createdProducts[7].stockQuantity - 50,
        orderId: order3.id,
        notes: `Sale from order #${order3.id}`,
        movementDate: new Date("2024-01-25"),
      },
      {
        businessId: business.id,
        productId: createdProducts[8].id,
        movementType: "sale",
        quantityChange: -20,
        balanceAfter: createdProducts[8].stockQuantity - 20,
        orderId: order3.id,
        notes: `Sale from order #${order3.id}`,
        movementDate: new Date("2024-01-25"),
      },
      {
        businessId: business.id,
        productId: createdProducts[9].id,
        movementType: "sale",
        quantityChange: -10,
        balanceAfter: createdProducts[9].stockQuantity - 10,
        orderId: order3.id,
        notes: `Sale from order #${order3.id}`,
        movementDate: new Date("2024-01-25"),
      },
    ]);

    console.log("✓ Created 3 orders with items\n");

    // 7. Add some payment ledger entries for the credit customer
    console.log("Creating additional ledger entries...");
    
    // Partial payment from credit customer
    const payment1Amount = 5000000; // $50,000.00
    await db.insert(schema.ledgerEntries).values({
      businessId: business.id,
      customerId: createdCustomers[1].id,
      type: "credit",
      amount: payment1Amount,
      description: "Partial payment received",
      entryDate: new Date("2024-01-22"),
    });

    // Update customer balance
    const newBalance = order2Total - payment1Amount;
    await db.update(schema.customers)
      .set({ currentBalance: newBalance })
      .where(schema.customers.id.eq(createdCustomers[1].id));

    console.log("✓ Created payment ledger entries\n");

    // 8. Create some inventory purchase movements
    console.log("Creating inventory purchase movements...");
    
    await db.insert(schema.inventoryMovements).values([
      {
        businessId: business.id,
        productId: createdProducts[0].id,
        movementType: "purchase",
        quantityChange: 10,
        balanceAfter: createdProducts[0].stockQuantity + 10,
        notes: "Restocking from supplier",
        movementDate: new Date("2024-01-10"),
      },
      {
        businessId: business.id,
        productId: createdProducts[7].id,
        movementType: "purchase",
        quantityChange: 100,
        balanceAfter: createdProducts[7].stockQuantity + 100,
        notes: "Bulk purchase for Q1",
        movementDate: new Date("2024-01-05"),
      },
    ]);

    console.log("✓ Created inventory movements\n");

    console.log("✅ Database seeding completed successfully!\n");
    console.log("═══════════════════════════════════════════");
    console.log("📋 Demo Account Credentials:");
    console.log("═══════════════════════════════════════════");
    console.log(`   Email: demo@bikri.com`);
    console.log(`   Password: demo123`);
    console.log(`   Business: ${business.name}`);
    console.log("═══════════════════════════════════════════");
    console.log("\n🚀 You can now run: npm run dev\n");

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed();
