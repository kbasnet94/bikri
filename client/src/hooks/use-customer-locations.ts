import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";

export const MAX_LOCATIONS_PER_CUSTOMER = 10;

export interface CustomerLocation {
  id: number;
  business_id: string;
  customer_id: number;
  label: string | null;
  formatted_address: string;
  place_id: string | null;
  lat: number;
  lng: number;
  kind: string; // 'storefront' | 'dropoff'
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
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CustomerLocation[];
    },
    enabled: !!customerId,
  });
}

/** The single precise-delivery pin for an order (Daraz/IG/FB/any channel). */
export function useOrderLocation(orderId: number | undefined) {
  return useQuery({
    queryKey: ['order-location', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_locations')
        .select('*')
        .eq('order_id', orderId!)
        .maybeSingle();

      if (error) throw error;
      return (data as CustomerLocation | null) ?? null;
    },
    enabled: !!orderId,
  });
}

export function useAddCustomerLocation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (loc: {
      customerId: number;
      label?: string;
      formattedAddress: string;
      placeId?: string;
      lat: number;
      lng: number;
      kind?: string;
      source?: string;
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      const { data, error } = await supabase
        .from('customer_locations')
        .insert({
          business_id: user.businessId,
          customer_id: loc.customerId,
          label: loc.label || null,
          formatted_address: loc.formattedAddress,
          place_id: loc.placeId ?? null,
          lat: loc.lat,
          lng: loc.lng,
          kind: loc.kind ?? 'storefront',
          source: loc.source ?? 'places',
          created_by: user.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CustomerLocation;
    },
    onSuccess: (data) => {
      // Seed the cache immediately so pickers can select the new location
      // without waiting for a refetch (slow networks left the dropdown on
      // "No location" long enough to invite duplicate adds).
      queryClient.setQueryData<CustomerLocation[]>(
        ['customer-locations', data.customer_id],
        (prev) => (prev ? [...prev.filter((l) => l.id !== data.id), data] : [data])
      );
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
      // an order pointing at a deleted location gets location_id nulled by the FK
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
