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
        .select('*');

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      return data as Customer[];
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
        .select('*')
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
        .order('entry_date', { ascending: false });

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
