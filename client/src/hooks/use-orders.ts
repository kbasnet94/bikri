import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import { getCurrentFiscalYear, getFiscalYearDates } from "@/lib/fiscal-year";
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
  customer?: Customer;
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
      const statuses = ['new', 'in-process', 'ready', 'completed', 'cancelled'];
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
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

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
          vat_bill_number: orderData.vatBillNumber || null,
          order_date: orderData.orderDate || new Date().toISOString(),
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
      if (orderData.vatBillNumber) ledgerDesc += ` | VAT #${orderData.vatBillNumber}`;
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

      return order as Order;
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

        // Create reversal ledger entry (credit back) instead of deleting
        if (user?.businessId) {
          await supabase
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
        }

        // Reverse customer balance (for all payment types, since ledger entry is always created)
        const { data: customer } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', order.customer_id)
          .single();

        if (customer) {
          await supabase
            .from('customers')
            .update({ current_balance: customer.current_balance - order.total_amount })
            .eq('id', order.customer_id);
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
    },
  });
}

export function useEditOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: {
      id: number;
      data: {
        note?: string;
        orderDate?: string;
        items?: { id: number; quantity: number; discountPercent: number }[];
      };
    }) => {
      const updates: any = {};
      if (data.note !== undefined) updates.note = data.note;
      if (data.orderDate !== undefined) updates.order_date = data.orderDate;

      // Update order
      const { error: orderError } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id);

      if (orderError) throw orderError;

      // Update order items if provided
      if (data.items) {
        for (const item of data.items) {
          // Fetch product price to recalculate
          const { data: orderItem } = await supabase
            .from('order_items')
            .select('*, product:products(price)')
            .eq('id', item.id)
            .single();

          if (orderItem) {
            const product = orderItem.product as any;
            const discount = Math.floor(product.price * (item.discountPercent / 100));

            await supabase
              .from('order_items')
              .update({
                quantity: item.quantity,
                discount: discount,
              })
              .eq('id', item.id);
          }
        }

        // Recalculate total
        const { data: items } = await supabase
          .from('order_items')
          .select('quantity, unit_price, discount')
          .eq('order_id', id);

        if (items) {
          const total = items.reduce((sum, item) => {
            return sum + ((item.unit_price - item.discount) * item.quantity);
          }, 0);

          await supabase
            .from('orders')
            .update({ total_amount: total })
            .eq('id', id);
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, paymentStatus }: { id: number; paymentStatus: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ payment_status: paymentStatus })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Helper function to get next VAT bill number
// Scoped to the current Nepali fiscal year (Shrawan 1 – Ashad 31).
// VAT bill numbering resets to 1 at the start of each fiscal year.
// Within a fiscal year, it finds the highest existing number and returns +1.
export function useNextVatBillNumber() {
  const { user } = useAuth();
  const currentFY = getCurrentFiscalYear();

  return useQuery({
    queryKey: ['vat', 'next-bill-number', user?.businessId, currentFY],
    queryFn: async () => {
      if (!user?.businessId) return 1;

      // Get current fiscal year date range
      const { start, end } = getFiscalYearDates(currentFY);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      // Fetch VAT bill numbers only from orders within the current fiscal year
      const { data: orders, error } = await supabase
        .from('orders')
        .select('vat_bill_number')
        .eq('business_id', user.businessId)
        .not('vat_bill_number', 'is', null)
        .gte('order_date', startISO)
        .lte('order_date', endISO);

      if (error) throw error;

      if (!orders || orders.length === 0) return 1;

      // Parse all VAT bill numbers as integers and find the max
      const numbers = orders
        .map(o => parseInt(o.vat_bill_number!, 10))
        .filter(n => !isNaN(n));

      if (numbers.length === 0) return 1;

      const maxNumber = Math.max(...numbers);
      return maxNumber + 1;
    },
    enabled: !!user?.businessId,
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
