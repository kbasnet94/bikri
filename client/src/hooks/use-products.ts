import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import type { Category } from "./use-categories";
import type { ProductVariant } from "./use-product-variants";

export interface Product {
  id: number;
  business_id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  has_variants: boolean;
  category_id: number | null;
  image_url: string | null;
  created_at: string;
  category?: Category | null;
  variants?: ProductVariant[];
}

export interface ProductsQueryParams {
  search?: string;
  categoryId?: number;
}

export function useProducts(params?: ProductsQueryParams) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['products', user?.businessId, params],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          variants:product_variants(*)
        `);

      if (params?.search) {
        query = query.or(`name.ilike.%${params.search}%,sku.ilike.%${params.search}%`);
      }

      if (params?.categoryId) {
        query = query.eq('category_id', params.categoryId);
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user?.businessId,
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          variants:product_variants(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as Product;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (product: {
      name: string;
      sku: string;
      description?: string;
      price: number;
      stockQuantity?: number;
      categoryId?: number;
      imageUrl?: string;
      hasVariants?: boolean;
      variants?: { name: string; sku: string; price: number; stockQuantity?: number; imageUrl?: string | null }[];
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      const { data, error } = await supabase
        .from('products')
        .insert({
          name: product.name,
          sku: product.sku,
          description: product.description || null,
          price: product.hasVariants ? 0 : product.price,
          stock_quantity: product.hasVariants ? 0 : (product.stockQuantity || 0),
          has_variants: product.hasVariants || false,
          category_id: product.categoryId || null,
          image_url: product.imageUrl || null,
          business_id: user.businessId,
        })
        .select(`
          *,
          category:categories(*)
        `)
        .single();

      if (error) throw error;

      // Create variants if applicable
      if (product.hasVariants && product.variants && product.variants.length > 0) {
        const variantInserts = product.variants.map(v => ({
          product_id: data.id,
          name: v.name.trim(),
          sku: v.sku.trim(),
          price: v.price,
          stock_quantity: v.stockQuantity || 0,
          image_url: v.imageUrl || null,
        }));

        const { error: variantError } = await supabase
          .from('product_variants')
          .insert(variantInserts);

        if (variantError) throw variantError;
      }

      return data as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: number;
      name?: string;
      sku?: string;
      description?: string;
      price?: number;
      stockQuantity?: number;
      categoryId?: number;
      imageUrl?: string;
    }) => {
      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.sku !== undefined) updateData.sku = updates.sku;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.price !== undefined) updateData.price = updates.price;
      if (updates.stockQuantity !== undefined) updateData.stock_quantity = updates.stockQuantity;
      if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId;
      if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;

      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          category:categories(*)
        `)
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
