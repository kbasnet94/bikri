import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const DEMO_BUSINESS = "Bikri Mobile Demo";
const ADMIN_EMAIL = "demo.admin@bikri.test";
const SALES_EMAIL = "demo.sales@bikri.test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 100) return null;
  }
  throw new Error(`Could not finish searching Auth users for ${email}`);
}

async function ensureUser(
  admin: SupabaseClient,
  email: string,
  password: string,
  fullName: string,
): Promise<{ user: User; created: boolean }> {
  const existing = await findUserByEmail(admin, email);
  if (existing) return { user: existing, created: false };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, must_change_password: false, demo_account: true },
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
  return { user: data.user, created: true };
}

async function ensureNamedRow(
  admin: SupabaseClient,
  table: "categories" | "customer_types",
  businessId: string,
  name: string,
  additional: Record<string, unknown> = {},
): Promise<any> {
  const { data: existing, error: selectError } = await admin
    .from(table)
    .select("*")
    .eq("business_id", businessId)
    .eq("name", name)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data, error } = await admin
    .from(table)
    .insert({ business_id: businessId, name, ...additional })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function ensureProduct(
  admin: SupabaseClient,
  businessId: string,
  categoryId: number,
  values: { name: string; sku: string; price: number; stock_quantity: number },
): Promise<any> {
  const { data: existing, error: selectError } = await admin
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .eq("sku", values.sku)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data, error } = await admin
    .from("products")
    .insert({
      business_id: businessId,
      category_id: categoryId,
      description: "Synthetic product for Bikri mobile testing",
      has_variants: false,
      ...values,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function ensureCustomer(
  admin: SupabaseClient,
  businessId: string,
  customerTypeId: number,
  values: { name: string; email: string; phone: string; address: string; credit_limit: number },
): Promise<any> {
  const { data: existing, error: selectError } = await admin
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("email", values.email)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data, error } = await admin
    .from("customers")
    .insert({
      business_id: businessId,
      customer_type_id: customerTypeId,
      current_balance: 0,
      default_discount_pct: 0,
      ...values,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function ensureOrder(
  admin: SupabaseClient,
  businessId: string,
  values: {
    code: string;
    customer: any;
    product: any;
    quantity: number;
    status: string;
    paymentStatus: string;
    channel: string | null;
    daysAgo: number;
  },
): Promise<void> {
  const note = `[DEMO DATA] ${values.code}`;
  const { data: existing, error: selectError } = await admin
    .from("orders")
    .select("id")
    .eq("business_id", businessId)
    .eq("note", note)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return;

  const totalAmount = values.product.price * values.quantity;
  const orderDate = new Date(Date.now() - values.daysAgo * 86_400_000).toISOString();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      business_id: businessId,
      customer_id: values.customer.id,
      status: values.status,
      payment_status: values.paymentStatus,
      total_amount: totalAmount,
      delivery_fee: 0,
      note,
      order_date: orderDate,
      channel: values.channel,
    })
    .select("*")
    .single();
  if (orderError) throw orderError;

  const { error: itemError } = await admin.from("order_items").insert({
    order_id: order.id,
    product_id: values.product.id,
    quantity: values.quantity,
    unit_price: values.product.price,
    discount: 0,
  });
  if (itemError) throw itemError;

  const newStock = values.product.stock_quantity - values.quantity;
  const { error: stockError } = await admin
    .from("products")
    .update({ stock_quantity: newStock })
    .eq("id", values.product.id)
    .eq("business_id", businessId);
  if (stockError) throw stockError;
  values.product.stock_quantity = newStock;

  const { error: movementError } = await admin.from("inventory_movements").insert({
    business_id: businessId,
    product_id: values.product.id,
    movement_type: "sale",
    quantity_change: -values.quantity,
    balance_after: newStock,
    order_id: order.id,
    notes: note,
    movement_date: orderDate,
  });
  if (movementError) throw movementError;

  const ledgerRows: Array<Record<string, unknown>> = [
    {
      business_id: businessId,
      customer_id: values.customer.id,
      order_id: order.id,
      type: "purchase",
      amount: totalAmount,
      description: note,
      entry_date: orderDate,
    },
  ];
  if (values.paymentStatus === "COD" || values.paymentStatus === "Bank Transfer/QR") {
    ledgerRows.push({
      business_id: businessId,
      customer_id: values.customer.id,
      order_id: order.id,
      type: "payment",
      amount: totalAmount,
      description: `${note} payment`,
      entry_date: orderDate,
    });
  }
  const { error: ledgerError } = await admin.from("ledger_entries").insert(ledgerRows);
  if (ledgerError) throw ledgerError;

  if (values.paymentStatus === "Credit") {
    const { error: balanceError } = await admin
      .from("customers")
      .update({ current_balance: values.customer.current_balance + totalAmount })
      .eq("id", values.customer.id)
      .eq("business_id", businessId);
    if (balanceError) throw balanceError;
    values.customer.current_balance += totalAmount;
  }
}

async function verifySalesIsolation(
  url: string,
  anonKey: string,
  businessId: string,
  password: string,
): Promise<Record<string, number>> {
  const salesClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginError } = await salesClient.auth.signInWithPassword({
    email: SALES_EMAIL,
    password,
  });
  if (loginError) throw loginError;

  const counts: Record<string, number> = {};
  for (const table of ["businesses", "categories", "products", "customers", "orders"] as const) {
    const columns = table === "businesses" ? "id" : "business_id";
    const { data, error } = await salesClient.from(table).select(columns);
    if (error) throw error;
    const leaked = (data ?? []).some((row: any) =>
      table === "businesses" ? row.id !== businessId : row.business_id !== businessId,
    );
    if (leaked) throw new Error(`RLS isolation failed for ${table}`);
    counts[table] = data?.length ?? 0;
  }

  await salesClient.auth.signOut();
  return counts;
}

async function main() {
  const url = requireEnv("VITE_SUPABASE_URL");
  const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminPassword = requireEnv("DEMO_ADMIN_PASSWORD");
  const salesPassword = requireEnv("DEMO_SALES_PASSWORD");
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdUserIds: string[] = [];
  let createdBusinessId: string | null = null;
  try {
    const adminResult = await ensureUser(admin, ADMIN_EMAIL, adminPassword, "Demo Admin");
    const salesResult = await ensureUser(admin, SALES_EMAIL, salesPassword, "Demo Sales");
    if (adminResult.created) createdUserIds.push(adminResult.user.id);
    if (salesResult.created) createdUserIds.push(salesResult.user.id);

    const { data: existingBusiness, error: businessLookupError } = await admin
      .from("businesses")
      .select("*")
      .eq("name", DEMO_BUSINESS)
      .maybeSingle();
    if (businessLookupError) throw businessLookupError;

    let business = existingBusiness;
    if (!business) {
      const { data, error } = await admin
        .from("businesses")
        .insert({ name: DEMO_BUSINESS, currency: "NPR", owner_id: adminResult.user.id })
        .select("*")
        .single();
      if (error) throw error;
      business = data;
      createdBusinessId = data.id;
    }

    const { error: membershipError } = await admin.from("business_users").upsert(
      [
        {
          business_id: business.id,
          user_id: adminResult.user.id,
          role: "owner",
          roles: ["admin"],
          full_name: "Demo Admin",
          active: true,
        },
        {
          business_id: business.id,
          user_id: salesResult.user.id,
          role: "member",
          roles: ["sales"],
          full_name: "Demo Sales",
          active: true,
        },
      ],
      { onConflict: "business_id,user_id" },
    );
    if (membershipError) throw membershipError;

    const hydration = await ensureNamedRow(admin, "categories", business.id, "Hydration", {
      description: "Synthetic demo inventory",
    });
    const retail = await ensureNamedRow(admin, "customer_types", business.id, "Retail", {
      is_business: true,
    });
    const consumer = await ensureNamedRow(admin, "customer_types", business.id, "Consumer", {
      is_business: false,
    });
    const orange = await ensureProduct(admin, business.id, hydration.id, {
      name: "Hydralyte Orange (Demo)",
      sku: "DEMO-HYD-ORANGE",
      price: 75_000,
      stock_quantity: 120,
    });
    const berry = await ensureProduct(admin, business.id, hydration.id, {
      name: "Hydralyte Berry (Demo)",
      sku: "DEMO-HYD-BERRY",
      price: 75_000,
      stock_quantity: 80,
    });
    const cityPharmacy = await ensureCustomer(admin, business.id, retail.id, {
      name: "Demo City Pharmacy",
      email: "city.pharmacy@example.test",
      phone: "+977-9800000001",
      address: "Lalitpur demo location",
      credit_limit: 2_000_000,
    });
    const walkIn = await ensureCustomer(admin, business.id, consumer.id, {
      name: "Demo Walk-in Customer",
      email: "walkin@example.test",
      phone: "+977-9800000002",
      address: "Kathmandu demo location",
      credit_limit: 0,
    });

    await ensureOrder(admin, business.id, {
      code: "PWA-001",
      customer: cityPharmacy,
      product: orange,
      quantity: 6,
      status: "completed",
      paymentStatus: "Credit",
      channel: null,
      daysAgo: 8,
    });
    await ensureOrder(admin, business.id, {
      code: "PWA-002",
      customer: walkIn,
      product: berry,
      quantity: 2,
      status: "completed",
      paymentStatus: "COD",
      channel: "instagram",
      daysAgo: 3,
    });
    await ensureOrder(admin, business.id, {
      code: "PWA-003",
      customer: cityPharmacy,
      product: berry,
      quantity: 3,
      status: "new",
      paymentStatus: "Credit",
      channel: null,
      daysAgo: 0,
    });

    const isolationCounts = await verifySalesIsolation(url, anonKey, business.id, salesPassword);
    console.log(JSON.stringify({
      businessId: business.id,
      adminUserId: adminResult.user.id,
      salesUserId: salesResult.user.id,
      isolationVerified: true,
      visibleRowsAsSales: isolationCounts,
    }, null, 2));
  } catch (error) {
    if (createdBusinessId) {
      await admin.from("businesses").delete().eq("id", createdBusinessId);
    }
    for (const userId of createdUserIds.reverse()) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
