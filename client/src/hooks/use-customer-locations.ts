import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";

export const MAX_LOCATIONS_PER_CUSTOMER = 10;

export interface CustomerLocation {
  id: number;
  business_id: string;
  customer_id: number;
  order_id: number | null;
  label: string | null;
  formatted_address: string;
  place_id: string | null;
  lat: number;
  lng: number;
  source: string;
  created_by: string | null;
  created_at: string;
}

export function useCustomerLocations(customerId: number | undefined) {
  return useQuery({
    queryKey: ['customer-locations', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_locations')
        .select('*')
        .eq('customer_id', customerId!)
        .is('order_id', null) // branch locations only; order-linked rows are the Daraz flow
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CustomerLocation[];
    },
    enabled: !!customerId,
  });
}

export function useAddCustomerLocation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (loc: {
      customerId: number;
      orderId?: number;
      label?: string;
      formattedAddress: string;
      placeId?: string;
      lat: number;
      lng: number;
      source?: string;
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      const { data, error } = await supabase
        .from('customer_locations')
        .insert({
          business_id: user.businessId,
          customer_id: loc.customerId,
          order_id: loc.orderId ?? null,
          label: loc.label || null,
          formatted_address: loc.formattedAddress,
          place_id: loc.placeId ?? null,
          lat: loc.lat,
          lng: loc.lng,
          source: loc.source ?? 'places',
          created_by: user.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CustomerLocation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customer-locations', data.customer_id] });
    },
  });
}

export function useDeleteCustomerLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, customerId }: { id: number; customerId: number }) => {
      const { error } = await supabase
        .from('customer_locations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { customerId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customer-locations', data.customerId] });
    },
  });
}
