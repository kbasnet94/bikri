import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  sku: string;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  created_at: string;
}

export function useProductVariants(productId: number) {
  return useQuery({
    queryKey: ['product-variants', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as ProductVariant[];
    },
    enabled: !!productId,
  });
}

export function useCreateProductVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variant: {
      productId: number;
      name: string;
      sku: string;
      price: number;
      stockQuantity?: number;
      imageUrl?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('product_variants')
        .insert({
          product_id: variant.productId,
          name: variant.name.trim(),
          sku: variant.sku.trim(),
          price: variant.price,
          stock_quantity: variant.stockQuantity || 0,
          image_url: variant.imageUrl || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ProductVariant;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProductVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: number;
      name?: string;
      sku?: string;
      price?: number;
      imageUrl?: string | null;
    }) => {
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name.trim();
      if (updates.sku !== undefined) updateData.sku = updates.sku.trim();
      if (updates.price !== undefined) updateData.price = updates.price;
      if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;

      const { data, error } = await supabase
        .from('product_variants')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductVariant;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProductVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: number; productId: number }) => {
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-variants', data.productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
