import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import type { Customer } from "./use-customers";
import type { Product } from "./use-products";

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
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
          items:order_items(*, product:products(*))
        `);

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error} = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!user?.businessId,
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
          items:order_items(*, product:products(*))
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
      items: { productId: number; quantity: number; discountPercent?: number }[];
      note?: string;
      paymentStatus: string;
      orderDate?: string;
      vatBillNumber?: string;
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      // Fetch products to calculate prices
      const productIds = orderData.items.map(item => item.productId);
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, price, stock_quantity')
        .in('id', productIds);

      if (productsError) throw productsError;
      if (!products || products.length !== productIds.length) {
        throw new Error('Some products not found');
      }

      // Calculate total and prepare order items
      let totalAmount = 0;
      const orderItemsData = orderData.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        
        const discountPercent = item.discountPercent || 0;
        const discount = Math.floor(product.price * (discountPercent / 100));
        const finalPrice = product.price - discount;
        
        totalAmount += finalPrice * item.quantity;
        
        return {
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: product.price,
          discount: discount,
        };
      });

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          business_id: user.businessId,
          customer_id: orderData.customerId,
          status: 'new',
          payment_status: orderData.paymentStatus,
          total_amount: totalAmount,
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

      // Update product stock
      for (const item of orderData.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) continue;

        const newStock = product.stock_quantity - item.quantity;
        
        await supabase
          .from('products')
          .update({ stock_quantity: newStock })
          .eq('id', item.productId);

        // Create inventory movement
        await supabase
          .from('inventory_movements')
          .insert({
            business_id: user.businessId,
            product_id: item.productId,
            movement_type: 'sale',
            quantity_change: -item.quantity,
            balance_after: newStock,
            order_id: order.id,
            notes: `Sale from order #${order.id}`,
            movement_date: orderData.orderDate || new Date().toISOString(),
          });
      }

      // Create ledger entry
      await supabase
        .from('ledger_entries')
        .insert({
          business_id: user.businessId,
          customer_id: orderData.customerId,
          order_id: order.id,
          type: 'purchase',
          amount: totalAmount,
          description: `Order #${order.id} - ${orderData.paymentStatus}`,
          entry_date: orderData.orderDate || new Date().toISOString(),
        });

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
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If cancelling, handle inventory restoration
      if (status === 'cancelled') {
        // This should ideally be done in a database function for atomicity
        // For now, we'll handle it client-side
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('product_id, quantity')
          .eq('order_id', id);

        if (orderItems) {
          for (const item of orderItems) {
            // Restore stock
            const { data: product } = await supabase
              .from('products')
              .select('stock_quantity')
              .eq('id', item.product_id)
              .single();

            if (product) {
              await supabase
                .from('products')
                .update({ stock_quantity: product.stock_quantity + item.quantity })
                .eq('id', item.product_id);
            }
          }
        }

        // Delete inventory movements and ledger entries
        await supabase
          .from('inventory_movements')
          .delete()
          .eq('order_id', id);

        await supabase
          .from('ledger_entries')
          .delete()
          .eq('order_id', id);

        // Reverse customer balance
        const { data: order } = await supabase
          .from('orders')
          .select('customer_id, total_amount, payment_status')
          .eq('id', id)
          .single();

        if (order && order.payment_status === 'Credit') {
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
      }

      return data as Order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
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
export function useNextVatBillNumber() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['vat', 'next-bill-number', user?.businessId],
    queryFn: async () => {
      if (!user?.businessId) return 1;

      const { data, error } = await supabase.rpc('get_next_vat_bill_number', {
        p_business_id: user.businessId,
      });

      // If RPC doesn't exist, calculate manually
      if (error && error.code === '42883') {
        const { data: orders } = await supabase
          .from('orders')
          .select('vat_bill_number')
          .not('vat_bill_number', 'is', null)
          .order('vat_bill_number', { ascending: false })
          .limit(1);

        const lastNumber = orders?.[0]?.vat_bill_number;
        const maxNumber = lastNumber ? parseInt(lastNumber, 10) : 0;
        return maxNumber + 1;
      }

      if (error) throw error;
      return data as number;
    },
    enabled: !!user?.businessId,
  });
}
