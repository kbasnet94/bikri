import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";

export interface Customer {
  id: number;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  pan_vat_number: string | null;
  credit_limit: number;
  current_balance: number;
  customer_type_id: number | null;
  customer_type?: { id: number; name: string } | null;
  created_at: string;
}

export interface LedgerEntry {
  id: number;
  business_id: string;
  customer_id: number;
  order_id: number | null;
  type: string;
  amount: number;
  description: string | null;
  entry_date: string;
  created_at: string;
}

export function useCustomers(search?: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['customers', user?.businessId, search],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*, customer_type:customer_types(id, name)');

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      // Sort by balance descending (highest debt first), then by name
      // Supabase defaults to 1000 rows max; raise the limit to handle large customer lists
      const { data, error } = await query
        .order('current_balance', { ascending: false })
        .order('name', { ascending: true })
        .limit(10000);
      
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user?.businessId,
  });
}

export function useCustomerStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['customer-stats', user?.businessId],
    queryFn: async () => {
      // Get exact count using Supabase's head count (no row data transferred)
      const { count, error: countError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      // Get total outstanding credit balance
      const { data: balanceData, error: balanceError } = await supabase
        .from('customers')
        .select('current_balance')
        .gt('current_balance', 0);

      if (balanceError) throw balanceError;

      const totalCreditBalance = (balanceData || []).reduce(
        (sum, c) => sum + c.current_balance, 0
      );

      return {
        totalCustomers: count || 0,
        totalCreditBalance,
      };
    },
    enabled: !!user?.businessId,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, customer_type:customer_types(id, name)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as Customer;
    },
    enabled: !!id,
  });
}

export function useCustomerLedger(customerId: number) {
  return useQuery({
    queryKey: ['ledger', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*')
        .eq('customer_id', customerId)
        .order('entry_date', { ascending: true });

      if (error) throw error;
      return data as LedgerEntry[];
    },
    enabled: !!customerId,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (customer: {
      name: string;
      email?: string;
      phone?: string;
      address?: string;
      panVatNumber?: string;
      creditLimit?: number;
      customerTypeId?: number | null;
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      const { data, error } = await supabase
        .from('customers')
        .insert({
          name: customer.name,
          email: customer.email || null,
          phone: customer.phone || null,
          address: customer.address || null,
          pan_vat_number: customer.panVatNumber || null,
          credit_limit: customer.creditLimit || 0,
          current_balance: 0,
          business_id: user.businessId,
          customer_type_id: customer.customerTypeId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useCreateLedgerEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (entry: {
      customerId: number;
      type: string;
      amount: number;
      description?: string;
      entryDate?: string;
    }) => {
      if (!user?.businessId) throw new Error('No business selected');

      // First create the ledger entry
      const { data: ledgerEntry, error: ledgerError } = await supabase
        .from('ledger_entries')
        .insert({
          customer_id: entry.customerId,
          type: entry.type,
          amount: entry.amount,
          description: entry.description || null,
          entry_date: entry.entryDate || new Date().toISOString(),
          business_id: user.businessId,
        })
        .select()
        .single();

      if (ledgerError) throw ledgerError;

      // Update customer balance
      // Credit entries decrease balance, other entries increase balance
      const balanceChange = entry.type === 'credit' ? -entry.amount : entry.amount;

      const { error: balanceError } = await supabase.rpc('update_customer_balance', {
        p_customer_id: entry.customerId,
        p_amount_change: balanceChange,
      });

      // If RPC doesn't exist yet, do it manually
      if (balanceError && balanceError.code === '42883') {
        const { data: customer } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', entry.customerId)
          .single();

        if (customer) {
          await supabase
            .from('customers')
            .update({ current_balance: customer.current_balance + balanceChange })
            .eq('id', entry.customerId);
        }
      } else if (balanceError) {
        throw balanceError;
      }

      return ledgerEntry as LedgerEntry;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ledger', data.customer_id] });
      queryClient.invalidateQueries({ queryKey: ['customers', data.customer_id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useCustomerTypeMap() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['customers', 'type-map', user?.businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_type_id')
        .limit(50000);

      if (error) throw error;

      const map = new Map<number, number | null>();
      for (const row of data || []) {
        map.set(row.id, row.customer_type_id);
      }
      return map;
    },
    enabled: !!user?.businessId,
  });
}
