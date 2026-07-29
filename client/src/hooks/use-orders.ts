import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import { getCurrentFiscalYear, getFiscalYearDates } from "@/lib/fiscal-year";
import { cancellationEffects, paymentStatusChangeEffects } from '@/lib/ledger-math';
import type { Customer } from "./use-customers";
import type { Product } from "./use-products";

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  unit_price: number;
  discount: number;
  product?: Product;
}

export interface Order {
  id: number;
  business_id: string;
  customer_id: number;
  status: string;
  payment_status: string;
  total_amount: number;
  delivery_fee: number;
  note: string | null;
  vat_bill_number: string | null;
  order_date: string;
  created_at: string;
  location_id: number | null;
  channel: string | null; // 'instagram' | 'facebook' | 'daraz' — D2C only
  customer?: Customer;
  location?: import("./use-customer-locations").CustomerLocation | null;
  items?: OrderItem[];
}

export function useOrders(customerId?: number) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['orders', user?.businessId, customerId],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          location:customer_locations(*),
          items:order_items(*, product:products(*), variant:product_variants(*))
        `);

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(0, 4999);
      
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!user?.businessId,
  });
}

export function usePaginatedOrders(params: {
  status: string;
  page: number;
  pageSize: number;
  search?: string;
  paymentFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [
      'orders', 'paginated', user?.businessId,
      params.status, params.page, params.pageSize,
      params.search, params.paymentFilter, params.dateFrom, params.dateTo,
    ],
    queryFn: async () => {
      const { status, page, pageSize, search, paymentFilter, dateFrom, dateTo } = params;

      let customerIds: number[] | null = null;
      if (search && search.trim()) {
        const searchTerm = search.trim();
        const { data: matchingCustomers } = await supabase
          .from('customers')
          .select('id')
          .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        customerIds = matchingCustomers?.map(c => c.id) || [];
        if (customerIds.length === 0) return { orders: [] as Order[], total: 0 };
      }

      let query = supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          location:customer_locations(*),
          items:order_items(*, product:products(*), variant:product_variants(*))
        `, { count: 'exact' })
        .eq('status', status);

      if (customerIds) query = query.in('customer_id', customerIds);
      if (paymentFilter && paymentFilter !== 'all') query = query.eq('payment_status', paymentFilter);
      if (dateFrom) query = query.gte('order_date', dateFrom);
      if (dateTo) query = query.lte('order_date', dateTo + 'T23:59:59.999Z');

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('order_date', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { orders: (data || []) as Order[], total: count || 0 };
    },
    enabled: !!user?.businessId,
    placeholderData: keepPreviousData,
  });
}

export function useOrderCounts(params?: {
  search?: string;
  paymentFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [
      'orders', 'counts', user?.businessId,
      params?.search, params?.paymentFilter, params?.dateFrom, params?.dateTo,
    ],
    queryFn: async () => {
      const statuses = ['new', 'in-process', 'ready', 'out-for-delivery', 'completed', 'cancelled'];
      const counts: Record<string, number> = {};

      let customerIds: number[] | null = null;
      if (params?.search && params.search.trim()) {
        const searchTerm = params.search.trim();
        const { data: matchingCustomers } = await supabase
          .from('customers')
          .select('id')
          .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        customerIds = matchingCustomers?.map(c => c.id) || [];
        if (customerIds.length === 0) {
          return statuses.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<string, number>);
        }
      }

      const promises = statuses.map(async (status) => {
        let query = supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);

        if (customerIds) query = query.in('customer_id', customerIds);
        if (params?.paymentFilter && params.paymentFilter !== 'all') {
          query = query.eq('payment_status', params.paymentFilter);
        }
        if (params?.dateFrom) query = query.gte('order_date', params.dateFrom);
        if (params?.dateTo) query = query.lte('order_date', params.dateTo + 'T23:59:59.999Z');

        const { count } = await query;
        return { status, count: count || 0 };
      });

      const results = await Promise.all(promises);
      for (const r of results) {
        counts[r.status] = r.count;
      }

      return counts;
    },
    enabled: !!user?.businessId,
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          location:customer_locations(*),
          items:order_items(*, product:products(*), variant:product_variants(*))
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as Order;
    },
    enabled: !!id,
  });
}

/** Channel + location of a customer's most recent order — used to pre-fill
 * the create-order flow for repeat customers. */
export function useLastOrderMeta(customerId: number | undefined) {
  return useQuery({
    queryKey: ['orders', 'last-meta', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, channel, location_id, location:customer_locations(*)')
        .eq('customer_id', customerId!)
        .order('order_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
    enabled: !!customerId,
  });
}

/** Point an order at one of its customer's locations (or clear it). */
export function useSetOrderLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, locationId, channel }: { orderId: number; locationId: number | null; channel?: string | null }) => {
      const patch: Record<string, any> = { location_id: locationId };
      if (channel !== undefined) patch.channel = channel;
      const { error } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderData: {
      customerId: number;
      items: { productId: number; variantId?: number; quantity: number; discountPercent?: number }[];
      note?: string;
      paymentStatus: string;
      orderDate?: string;
      vatBillNumber?: string;
      deliveryFee?: number;
      locationId?: number;   // pointer to one of the customer's locations
      channel?: string;      // 'instagram' | 'facebook' | 'daraz' — D2C only
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      // Guard against duplicate VAT bill numbers: the suggested number can go
      // stale when orders are created back-to-back. Re-check right before
      // insert and bump to a fresh max+1 if the number is already taken.
      let finalVatBillNumber = orderData.vatBillNumber || null;
      let vatBillNumberAdjusted = false;
      if (finalVatBillNumber) {
        const taken = await isVatBillNumberTaken(user.businessId, finalVatBillNumber);
        if (taken) {
          finalVatBillNumber = String(await fetchNextVatBillNumber(user.businessId));
          vatBillNumberAdjusted = true;
        }
      }

      // Fetch products to calculate prices
      const productIds = [...new Set(orderData.items.map(item => item.productId))];
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, price, stock_quantity, has_variants')
        .in('id', productIds);

      if (productsError) throw productsError;
      if (!products) throw new Error('Products not found');

      // Fetch variants if any items reference them
      const variantIds = orderData.items.filter(i => i.variantId).map(i => i.variantId!);
      let variantsMap: Record<number, { price: number; stock_quantity: number }> = {};
      if (variantIds.length > 0) {
        const { data: variants, error: variantsError } = await supabase
          .from('product_variants')
          .select('id, price, stock_quantity')
          .in('id', variantIds);
        if (variantsError) throw variantsError;
        if (variants) {
          for (const v of variants) {
            variantsMap[v.id] = { price: v.price, stock_quantity: v.stock_quantity };
          }
        }
      }

      // Calculate total and prepare order items
      let totalAmount = 0;
      const orderItemsData = orderData.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);

        // Use variant price if variant is specified, otherwise product price
        const unitPrice = item.variantId && variantsMap[item.variantId]
          ? variantsMap[item.variantId].price
          : product.price;
        
        const discountPercent = item.discountPercent || 0;
        const discount = Math.floor(unitPrice * (discountPercent / 100));
        const finalPrice = unitPrice - discount;
        
        totalAmount += finalPrice * item.quantity;
        
        return {
          product_id: item.productId,
          variant_id: item.variantId || null,
          quantity: item.quantity,
          unit_price: unitPrice,
          discount: discount,
        };
      });

      // Add delivery fee to total (delivery fee is NOT part of VAT calculation)
      const deliveryFee = orderData.deliveryFee || 0;
      totalAmount += deliveryFee;

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          business_id: user.businessId,
          customer_id: orderData.customerId,
          status: 'new',
          payment_status: orderData.paymentStatus,
          total_amount: totalAmount,
          delivery_fee: deliveryFee,
          note: orderData.note || null,
          vat_bill_number: finalVatBillNumber,
          order_date: orderData.orderDate || new Date().toISOString(),
          location_id: orderData.locationId ?? null,
          channel: orderData.channel ?? null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsWithOrderId = orderItemsData.map(item => ({
        ...item,
        order_id: order.id,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsWithOrderId);

      if (itemsError) throw itemsError;

      // Update product/variant stock
      for (const item of orderData.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) continue;

        let newStock: number;

        if (item.variantId && variantsMap[item.variantId]) {
          // Variant-level stock
          const variantStock = variantsMap[item.variantId].stock_quantity;
          newStock = variantStock - item.quantity;
          await supabase
            .from('product_variants')
            .update({ stock_quantity: newStock })
            .eq('id', item.variantId);
        } else {
          // Product-level stock
          newStock = product.stock_quantity - item.quantity;
          await supabase
            .from('products')
            .update({ stock_quantity: newStock })
            .eq('id', item.productId);
        }

        // Create inventory movement
        await supabase
          .from('inventory_movements')
          .insert({
            business_id: user.businessId,
            product_id: item.productId,
            variant_id: item.variantId || null,
            movement_type: 'sale',
            quantity_change: -item.quantity,
            balance_after: newStock,
            order_id: order.id,
            notes: `Sale from order #${order.id}`,
            movement_date: orderData.orderDate || new Date().toISOString(),
          });
      }

      // Create purchase ledger entry (debit)
      let ledgerDesc = `Order #${order.id} - ${orderData.paymentStatus}`;
      if (finalVatBillNumber) ledgerDesc += ` | VAT #${finalVatBillNumber}`;
      if (deliveryFee > 0) ledgerDesc += ` (incl. delivery fee ${(deliveryFee / 100).toFixed(2)})`;

      const entryDate = orderData.orderDate || new Date().toISOString();

      await supabase
        .from('ledger_entries')
        .insert({
          business_id: user.businessId,
          customer_id: orderData.customerId,
          order_id: order.id,
          type: 'purchase',
          amount: totalAmount,
          description: ledgerDesc,
          entry_date: entryDate,
        });

      // For COD and Bank Transfer: auto-create payment ledger entry (deposit)
      if (orderData.paymentStatus === 'COD' || orderData.paymentStatus === 'Bank Transfer/QR') {
        await supabase
          .from('ledger_entries')
          .insert({
            business_id: user.businessId,
            customer_id: orderData.customerId,
            order_id: order.id,
            type: 'payment',
            amount: totalAmount,
            description: `Payment received - Order #${order.id} (${orderData.paymentStatus})`,
            entry_date: entryDate,
          });
      }

      // Update customer balance (only for Credit orders)
      if (orderData.paymentStatus === 'Credit') {
        const { data: customer } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', orderData.customerId)
          .single();

        if (customer) {
          await supabase
            .from('customers')
            .update({ current_balance: customer.current_balance + totalAmount })
            .eq('id', orderData.customerId);
        }
      }

      return { ...(order as Order), vatBillNumberAdjusted };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['vat'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      // Fetch order details before updating (need original data for reversals)
      const { data: order, error: orderFetchError } = await supabase
        .from('orders')
        .select('customer_id, total_amount, payment_status, status, order_date')
        .eq('id', id)
        .single();

      if (orderFetchError) throw orderFetchError;

      // A cancelled order's stock/ledger/balance side effects were already
      // reversed; re-activating would need them re-applied. We don't support
      // that — recreate the order instead (see order #2848 -> #2850 pattern).
      if (order.status === 'cancelled' && status !== 'cancelled') {
        throw new Error('Cancelled orders cannot be reactivated. Create a new order instead.');
      }

      // Update order status
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If cancelling, reverse all side effects
      if (status === 'cancelled' && order.status !== 'cancelled') {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, variant_id, quantity')
          .eq('order_id', id);

        if (orderItems) {
          for (const item of orderItems) {
            let restoredStock: number;

            if (item.variant_id) {
              // Restore variant stock
              const { data: variant } = await supabase
                .from('product_variants')
                .select('stock_quantity')
                .eq('id', item.variant_id)
                .single();

              if (variant) {
                restoredStock = variant.stock_quantity + item.quantity;
                await supabase
                  .from('product_variants')
                  .update({ stock_quantity: restoredStock })
                  .eq('id', item.variant_id);
              } else {
                restoredStock = item.quantity;
              }
            } else {
              // Restore product stock
              const { data: product } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', item.product_id)
                .single();

              if (product) {
                restoredStock = product.stock_quantity + item.quantity;
                await supabase
                  .from('products')
                  .update({ stock_quantity: restoredStock })
                  .eq('id', item.product_id);
              } else {
                restoredStock = item.quantity;
              }
            }

            // Create reversal inventory movement (audit trail)
            if (user?.businessId) {
              await supabase
                .from('inventory_movements')
                .insert({
                  business_id: user.businessId,
                  product_id: item.product_id,
                  variant_id: item.variant_id || null,
                  movement_type: 'return',
                  quantity_change: item.quantity,
                  balance_after: restoredStock,
                  order_id: id,
                  notes: `Cancelled order #${id} - stock restored`,
                  movement_date: new Date().toISOString(),
                });
            }
          }
        }

        const effects = cancellationEffects(order.payment_status, order.total_amount);

        // Reversal ledger entry only for Credit orders. COD/Bank orders already
        // hold purchase+payment entries that net to zero.
        if (effects.createReversalEntry) {
          if (!user?.businessId) throw new Error('No business selected');
          const { error: revErr } = await supabase
            .from('ledger_entries')
            .insert({
              business_id: user.businessId,
              customer_id: order.customer_id,
              order_id: id,
              type: 'credit',
              amount: order.total_amount,
              description: `Order #${id} cancelled - reversed`,
              entry_date: new Date().toISOString(),
            });
          if (revErr) throw revErr;
        }

        if (effects.balanceDelta !== 0) {
          if (!user?.businessId) throw new Error('No business selected');
          const { data: customer } = await supabase
            .from('customers')
            .select('current_balance')
            .eq('id', order.customer_id)
            .single();

          if (customer) {
            const { error: balErr } = await supabase
              .from('customers')
              .update({ current_balance: customer.current_balance + effects.balanceDelta })
              .eq('id', order.customer_id);
            if (balErr) throw balErr;
          }
        }
      }

      return data as Order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['vat'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}

// Full order edit: change quantities/discounts, remove items, add new items.
// Keeps stock, inventory movements, the purchase ledger entry, the auto
// payment entry (COD/Bank) and the customer balance (Credit) in sync with the
// new total — the earlier version only rewrote total_amount and left all of
// those stale.
export function useEditOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }: {
      id: number;
      data: {
        note?: string;
        orderDate?: string;
        items?: {
          itemId?: number; // existing order_items.id; absent = new item
          productId: number;
          variantId?: number | null;
          quantity: number;
          discountPercent: number;
        }[];
      };
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      const { data: order, error: orderFetchError } = await supabase
        .from('orders')
        .select('customer_id, total_amount, delivery_fee, payment_status, status, order_date')
        .eq('id', id)
        .single();

      if (orderFetchError) throw orderFetchError;
      if (order.status === 'cancelled') {
        throw new Error('Cancelled orders cannot be edited.');
      }

      const updates: any = {};
      if (data.note !== undefined) updates.note = data.note;
      if (data.orderDate !== undefined) updates.order_date = data.orderDate;

      if (Object.keys(updates).length > 0) {
        const { error: orderError } = await supabase
          .from('orders')
          .update(updates)
          .eq('id', id);
        if (orderError) throw orderError;
      }

      if (data.items) {
        const { data: existingItems, error: itemsFetchError } = await supabase
          .from('order_items')
          .select('id, product_id, variant_id, quantity, unit_price, discount')
          .eq('order_id', id);
        if (itemsFetchError) throw itemsFetchError;

        const keptIds = new Set(data.items.filter(i => i.itemId).map(i => i.itemId!));
        const removedItems = (existingItems || []).filter(ei => !keptIds.has(ei.id));

        // Applies a stock change and records the inventory movement.
        const adjustStock = async (
          productId: number,
          variantId: number | null,
          delta: number, // positive = stock returned, negative = stock sold
          note: string,
        ) => {
          if (delta === 0) return;
          let newStock: number;
          if (variantId) {
            const { data: variant } = await supabase
              .from('product_variants')
              .select('stock_quantity')
              .eq('id', variantId)
              .single();
            newStock = (variant?.stock_quantity ?? 0) + delta;
            await supabase.from('product_variants').update({ stock_quantity: newStock }).eq('id', variantId);
          } else {
            const { data: product } = await supabase
              .from('products')
              .select('stock_quantity')
              .eq('id', productId)
              .single();
            newStock = (product?.stock_quantity ?? 0) + delta;
            await supabase.from('products').update({ stock_quantity: newStock }).eq('id', productId);
          }
          await supabase.from('inventory_movements').insert({
            business_id: user.businessId,
            product_id: productId,
            variant_id: variantId,
            movement_type: delta > 0 ? 'return' : 'sale',
            quantity_change: delta,
            balance_after: newStock,
            order_id: id,
            notes: note,
            movement_date: new Date().toISOString(),
          });
        };

        // 1. Removed items: restore stock, delete row
        for (const ri of removedItems) {
          await adjustStock(ri.product_id, ri.variant_id, ri.quantity, `Order #${id} edited - item removed, stock restored`);
          const { error: delErr } = await supabase.from('order_items').delete().eq('id', ri.id);
          if (delErr) throw delErr;
        }

        // 2. Existing items: apply quantity delta, update row
        for (const item of data.items.filter(i => i.itemId)) {
          const existing = (existingItems || []).find(ei => ei.id === item.itemId);
          if (!existing) continue;

          const discount = Math.floor(existing.unit_price * (item.discountPercent / 100));
          const qtyDelta = existing.quantity - item.quantity; // positive = stock returned
          await adjustStock(existing.product_id, existing.variant_id, qtyDelta, `Order #${id} edited - quantity ${existing.quantity} → ${item.quantity}`);

          const { error: updErr } = await supabase
            .from('order_items')
            .update({ quantity: item.quantity, discount })
            .eq('id', item.itemId);
          if (updErr) throw updErr;
        }

        // 3. New items: snapshot current price, insert row, deduct stock
        const newItems = data.items.filter(i => !i.itemId);
        for (const item of newItems) {
          let unitPrice: number;
          if (item.variantId) {
            const { data: variant, error: vErr } = await supabase
              .from('product_variants')
              .select('price')
              .eq('id', item.variantId)
              .single();
            if (vErr) throw vErr;
            unitPrice = variant.price;
          } else {
            const { data: product, error: pErr } = await supabase
              .from('products')
              .select('price')
              .eq('id', item.productId)
              .single();
            if (pErr) throw pErr;
            unitPrice = product.price;
          }
          const discount = Math.floor(unitPrice * (item.discountPercent / 100));

          const { error: insErr } = await supabase.from('order_items').insert({
            order_id: id,
            product_id: item.productId,
            variant_id: item.variantId || null,
            quantity: item.quantity,
            unit_price: unitPrice,
            discount,
          });
          if (insErr) throw insErr;

          await adjustStock(item.productId, item.variantId || null, -item.quantity, `Order #${id} edited - item added`);
        }

        // 4. Recalculate total from the DB (items + delivery fee)
        const { data: finalItems, error: finalErr } = await supabase
          .from('order_items')
          .select('quantity, unit_price, discount')
          .eq('order_id', id);
        if (finalErr) throw finalErr;

        const itemsTotal = (finalItems || []).reduce(
          (sum, it) => sum + ((it.unit_price - it.discount) * it.quantity), 0);
        const newTotal = itemsTotal + (order.delivery_fee || 0);
        const totalDelta = newTotal - order.total_amount;

        const { error: totErr } = await supabase
          .from('orders')
          .update({ total_amount: newTotal })
          .eq('id', id);
        if (totErr) throw totErr;

        if (totalDelta !== 0) {
          // 5. Sync the purchase ledger entry amount
          const { error: ledErr } = await supabase
            .from('ledger_entries')
            .update({ amount: newTotal })
            .eq('order_id', id)
            .eq('type', 'purchase');
          if (ledErr) throw ledErr;

          // 6. COD/Bank orders carry an auto payment entry that must match
          if (order.payment_status === 'COD' || order.payment_status === 'Bank Transfer/QR') {
            const { error: payErr } = await supabase
              .from('ledger_entries')
              .update({ amount: newTotal })
              .eq('order_id', id)
              .eq('type', 'payment');
            if (payErr) throw payErr;
          }

          // 7. Credit orders: shift the customer balance by the delta
          if (order.payment_status === 'Credit') {
            const { data: customer } = await supabase
              .from('customers')
              .select('current_balance')
              .eq('id', order.customer_id)
              .single();
            if (customer) {
              const { error: balErr } = await supabase
                .from('customers')
                .update({ current_balance: customer.current_balance + totalDelta })
                .eq('id', order.customer_id);
              if (balErr) throw balErr;
            }
          }
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: number) => {
      const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('customer_id, total_amount, payment_status, status, vat_bill_number')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      // Reverse side effects only if the order wasn't already cancelled
      if (order.status !== 'cancelled') {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, variant_id, quantity')
          .eq('order_id', id);

        if (orderItems) {
          for (const item of orderItems) {
            let restoredStock: number;

            if (item.variant_id) {
              const { data: variant } = await supabase
                .from('product_variants')
                .select('stock_quantity')
                .eq('id', item.variant_id)
                .single();
              restoredStock = (variant?.stock_quantity ?? 0) + item.quantity;
              await supabase.from('product_variants').update({ stock_quantity: restoredStock }).eq('id', item.variant_id);
            } else {
              const { data: product } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', item.product_id)
                .single();
              restoredStock = (product?.stock_quantity ?? 0) + item.quantity;
              await supabase.from('products').update({ stock_quantity: restoredStock }).eq('id', item.product_id);
            }

            if (user?.businessId) {
              await supabase.from('inventory_movements').insert({
                business_id: user.businessId,
                product_id: item.product_id,
                variant_id: item.variant_id || null,
                movement_type: 'return',
                quantity_change: item.quantity,
                balance_after: restoredStock,
                order_id: id,
                notes: `Deleted order #${id} - stock restored`,
                movement_date: new Date().toISOString(),
              });
            }
          }
        }

        // Only reverse customer balance for Credit orders (COD/Bank Transfer don't affect balance on creation)
        if (order.payment_status === 'Credit') {
          const { data: customer } = await supabase
            .from('customers')
            .select('current_balance')
            .eq('id', order.customer_id)
            .single();

          if (customer) {
            await supabase.from('customers')
              .update({ current_balance: customer.current_balance - order.total_amount })
              .eq('id', order.customer_id);
          }
        }
      }

      // Delete ledger entries referencing this order
      await supabase.from('ledger_entries').delete().eq('order_id', id);
      // Delete inventory movements referencing this order
      await supabase.from('inventory_movements').delete().eq('order_id', id);
      // Delete order items (cascade should handle, but explicit)
      await supabase.from('order_items').delete().eq('order_id', id);
      // Delete the order itself
      const { error: delErr } = await supabase.from('orders').delete().eq('id', id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['vat'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, paymentStatus }: { id: number; paymentStatus: string }) => {
      const { data: order, error: fetchErr } = await supabase
        .from('orders')
        .select('customer_id, total_amount, payment_status, status')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      if (order.status === 'cancelled') {
        throw new Error('Cannot change payment status of a cancelled order.');
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ payment_status: paymentStatus })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const effects = paymentStatusChangeEffects(
        order.payment_status,
        paymentStatus,
        order.total_amount,
      );

      if (effects.ledgerAction === 'insert-payment') {
        if (!user?.businessId) throw new Error('No business selected');
        // Order was Credit, is now paid: record the payment.
        const { error: payErr } = await supabase
          .from('ledger_entries')
          .insert({
            business_id: user.businessId,
            customer_id: order.customer_id,
            order_id: id,
            type: 'payment',
            amount: order.total_amount,
            description: `Payment received - Order #${id} (${paymentStatus})`,
            entry_date: new Date().toISOString(),
          });
        if (payErr) throw payErr;
      } else if (effects.ledgerAction === 'delete-auto-payment') {
        // Order was COD/Bank, is now Credit: remove the auto payment entry
        // created at order time. Manual payments have order_id NULL and are
        // never touched by this. Older orders may lack the entry — that's fine.
        const { error: delErr } = await supabase
          .from('ledger_entries')
          .delete()
          .eq('order_id', id)
          .eq('type', 'payment');
        if (delErr) throw delErr;
      }

      if (effects.balanceDelta !== 0) {
        const { data: customer } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', order.customer_id)
          .single();

        if (customer) {
          const { error: balErr } = await supabase
            .from('customers')
            .update({ current_balance: customer.current_balance + effects.balanceDelta })
            .eq('id', order.customer_id);
          if (balErr) throw balErr;
        }
      }

      return data as Order;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger', data.customer_id] });
    },
  });
}

// Compute the next VAT bill number directly from the DB.
// Scoped to the current Nepali fiscal year (Shrawan 1 – Ashad 31).
// VAT bill numbering resets to 1 at the start of each fiscal year.
// Paginates in 1000-row batches — PostgREST caps a single fetch at 1000 rows,
// which silently hid the true max once a fiscal year exceeded 1000 VAT bills.
export async function fetchNextVatBillNumber(businessId: string): Promise<number> {
  const { start, end } = getFiscalYearDates(getCurrentFiscalYear());
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  let maxNumber = 0;
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('vat_bill_number')
      .eq('business_id', businessId)
      .not('vat_bill_number', 'is', null)
      .gte('order_date', startISO)
      .lte('order_date', endISO)
      .range(from, from + batchSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const o of data) {
      const n = parseInt(o.vat_bill_number!, 10);
      if (!isNaN(n) && n > maxNumber) maxNumber = n;
    }

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return maxNumber + 1;
}

// Checks whether a VAT bill number is already used in the current fiscal year.
export async function isVatBillNumberTaken(businessId: string, vatBillNumber: string): Promise<boolean> {
  const { start, end } = getFiscalYearDates(getCurrentFiscalYear());
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('vat_bill_number', vatBillNumber)
    .gte('order_date', start.toISOString())
    .lte('order_date', end.toISOString());

  if (error) throw error;
  return (count ?? 0) > 0;
}

export function useNextVatBillNumber() {
  const { user } = useAuth();
  const currentFY = getCurrentFiscalYear();

  return useQuery({
    queryKey: ['vat', 'next-bill-number', user?.businessId, currentFY],
    queryFn: async () => {
      if (!user?.businessId) return 1;
      return fetchNextVatBillNumber(user.businessId);
    },
    enabled: !!user?.businessId,
    // Always re-read on mount/focus — a stale suggestion here is what caused
    // duplicate VAT bill numbers when creating orders back-to-back.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useDashboardStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard', 'stats', user?.businessId],
    queryFn: async () => {
      // Fetch only total_amount + order_date + status for all orders (no joins = lightweight)
      const allOrders: { total_amount: number; order_date: string; status: string; customer_id: number; created_at: string }[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('total_amount, order_date, status, customer_id, created_at')
          .range(from, from + batchSize - 1)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) break;
        allOrders.push(...data);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      const completedOrders = allOrders.filter(o => o.status === 'completed');
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

      return {
        allOrders,
        completedOrders,
        totalRevenue,
        totalOrderCount: allOrders.length,
      };
    },
    enabled: !!user?.businessId,
  });
}

export function useOrderTabTotals(params: {
  status: string;
  search?: string;
  paymentFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [
      'orders', 'tab-totals', user?.businessId,
      params.status, params.search, params.paymentFilter, params.dateFrom, params.dateTo,
    ],
    queryFn: async () => {
      const { status, search, paymentFilter, dateFrom, dateTo } = params;

      let customerIds: number[] | null = null;
      if (search && search.trim()) {
        const searchTerm = search.trim();
        const { data: matchingCustomers } = await supabase
          .from('customers')
          .select('id')
          .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        customerIds = matchingCustomers?.map(c => c.id) || [];
        if (customerIds.length === 0) return { totalRevenue: 0, totalUnits: 0 };
      }

      const allRows: { total_amount: number; items: { quantity: number }[] }[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        let query = supabase
          .from('orders')
          .select('total_amount, items:order_items(quantity)')
          .eq('status', status);

        if (customerIds) query = query.in('customer_id', customerIds);
        if (paymentFilter && paymentFilter !== 'all') query = query.eq('payment_status', paymentFilter);
        if (dateFrom) query = query.gte('order_date', dateFrom);
        if (dateTo) query = query.lte('order_date', dateTo + 'T23:59:59.999Z');

        const { data, error } = await query
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...(data as any[]));
        if (data.length < batchSize) break;
        from += batchSize;
      }

      const totalRevenue = allRows.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const totalUnits = allRows.reduce((sum, o) => {
        const items = o.items || [];
        return sum + items.reduce((iSum, item) => iSum + (item.quantity || 0), 0);
      }, 0);

      return { totalRevenue, totalUnits };
    },
    enabled: !!user?.businessId,
    placeholderData: keepPreviousData,
  });
}

export function useRecentOrders(limit: number = 5) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['orders', 'recent', user?.businessId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as Order[];
    },
    enabled: !!user?.businessId,
  });
}
