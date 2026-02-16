import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface CustomerType {
  id: number;
  business_id: string;
  name: string;
  created_at: string;
}

export function useCustomerTypes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['customer-types', user?.businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_types')
        .select('*')
        .eq('business_id', user!.businessId)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as CustomerType[];
    },
    enabled: !!user?.businessId,
  });
}

export function useCreateCustomerType() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!user?.businessId) throw new Error('No business selected');

      const { data, error } = await supabase
        .from('customer_types')
        .insert({
          business_id: user.businessId,
          name: name.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      return data as CustomerType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
    },
  });
}

export function useDeleteCustomerType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      // First, unlink any customers that reference this type
      await supabase
        .from('customers')
        .update({ customer_type_id: null })
        .eq('customer_type_id', id);

      // Then delete the type
      const { error } = await supabase
        .from('customer_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
