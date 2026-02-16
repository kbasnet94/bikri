import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import type { Product } from "./use-products";

export interface InventoryMovement {
  id: number;
  business_id: string;
  product_id: number;
  variant_id: number | null;
  movement_type: string;
  quantity_change: number;
  balance_after: number;
  order_id: number | null;
  notes: string | null;
  movement_date: string;
  created_at: string;
  product?: Product;
  variant?: { id: number; name: string; sku: string } | null;
}

export function useInventoryMovements(productId: number, variantId?: number | null) {
  return useQuery({
    queryKey: ['inventory-movements', 'product', productId, variantId],
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select(`
          *,
          product:products(*),
          variant:product_variants(id, name, sku)
        `)
        .eq('product_id', productId);

      if (variantId) {
        query = query.eq('variant_id', variantId);
      }

      const { data, error } = await query.order('movement_date', { ascending: false });

      if (error) throw error;
      return data as InventoryMovement[];
    },
    enabled: !!productId,
  });
}

export function useInventoryMovementsByDateRange(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: ['inventory-movements', 'date-range', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select(`
          *,
          product:products(*)
        `)
        .gte('movement_date', startDate)
        .lte('movement_date', endDate)
        .order('movement_date', { ascending: false });

      if (error) throw error;
      return data as InventoryMovement[];
    },
    enabled: enabled && !!startDate && !!endDate,
  });
}

export function useStockAtDate(productId: number, date: string, enabled = true) {
  return useQuery({
    queryKey: ['stock-at-date', productId, date],
    queryFn: async () => {
      console.log('[StockAtDate] Fetching stock for product', productId, 'on date', date);
      
      // Try using the RPC function first
      const { data, error } = await supabase.rpc('get_stock_at_date', {
        p_product_id: productId,
        p_date: date,
      });

      // If RPC doesn't exist, calculate manually
      if (error && error.code === '42883') {
        console.log('[StockAtDate] RPC function not found, calculating manually');
        const { data: movements } = await supabase
          .from('inventory_movements')
          .select('balance_after')
          .eq('product_id', productId)
          .lte('movement_date', date)
          .order('movement_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        const stockQuantity = movements?.[0]?.balance_after ?? 0;
        console.log('[StockAtDate] Manual calculation result:', stockQuantity);
        return { productId, date, stockQuantity };
      }

      if (error) {
        console.error('[StockAtDate] RPC error:', error);
        throw error;
      }
      
      console.log('[StockAtDate] RPC result:', data);
      return { productId, date, stockQuantity: data as number };
    },
    enabled: enabled && !!productId && !!date,
  });
}

export function useCreateInventoryMovement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (movement: {
      productId: number;
      variantId?: number | null;
      movementType: string;
      quantityChange: number;
      notes?: string;
      movementDate?: string;
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      let newBalance: number;

      if (movement.variantId) {
        // Variant-level stock management
        const { data: variant, error: variantError } = await supabase
          .from('product_variants')
          .select('stock_quantity')
          .eq('id', movement.variantId)
          .single();

        if (variantError) throw variantError;
        if (!variant) throw new Error('Variant not found');

        newBalance = variant.stock_quantity + movement.quantityChange;
        if (newBalance < 0) throw new Error('Insufficient stock');

        // Update variant stock
        const { error: updateError } = await supabase
          .from('product_variants')
          .update({ stock_quantity: newBalance })
          .eq('id', movement.variantId);

        if (updateError) throw updateError;
      } else {
        // Product-level stock management (existing behavior)
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', movement.productId)
          .single();

        if (productError) throw productError;
        if (!product) throw new Error('Product not found');

        newBalance = product.stock_quantity + movement.quantityChange;
        if (newBalance < 0) throw new Error('Insufficient stock');

        // Update product stock
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock_quantity: newBalance })
          .eq('id', movement.productId);

        if (updateError) throw updateError;
      }

      // Create inventory movement
      const { data: inventoryMovement, error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          business_id: user.businessId,
          product_id: movement.productId,
          variant_id: movement.variantId || null,
          movement_type: movement.movementType,
          quantity_change: movement.quantityChange,
          balance_after: newBalance,
          notes: movement.notes || null,
          movement_date: movement.movementDate || new Date().toISOString(),
        })
        .select()
        .single();

      if (movementError) throw movementError;

      return inventoryMovement as InventoryMovement;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements', 'product', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['products', variables.productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
