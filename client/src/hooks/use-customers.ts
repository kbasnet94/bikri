import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import { ledgerBalanceDelta } from '@/lib/ledger-math';

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

export interface CustomerAging {
  id: number;
  bucket_0_30: number;     // cents
  bucket_31_60: number;    // cents
  bucket_61_90: number;    // cents
  bucket_90_plus: number;  // cents
  total_unpaid: number;    // cents
}

export interface CustomerWithAging extends Customer {
  aging: {
    bucket_0_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_90_plus: number;
    total_unpaid: number;
  };
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

export function useCustomersWithAging(search?: string, includeAll?: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['customers-with-aging', user?.businessId, search, includeAll ?? false],
    queryFn: async () => {
      // Fetch customers and aging buckets in parallel. We join client-side
      // by id rather than via a Supabase nested-select because customer_aging
      // is a view (no FK), and joining server-side would require extra config.
      // PostgREST silently caps result sets (~1000 rows); page through so
      // the categorize view (includeAll) sees every customer, not the
      // first 1000 by balance.
      const buildQuery = () => {
        let q = supabase
          .from('customers')
          .select('*, customer_type:customer_types(id, name)');
        if (search) {
          // While searching, look across ALL customers (incl. zero-balance
          // cash/COD clients) so they remain findable.
          q = q.or(
            `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
          );
        } else if (!includeAll) {
          // Default A/R view: only credit clients — those who currently owe.
          // Zero-balance cash/COD clients have nothing to age and would only
          // bloat the list past the row cap.
          q = q.gt('current_balance', 0);
        }
        // includeAll (type-filter active): fetch every customer so the
        // categorize workflow can reach zero-balance uncategorized clients.
        return q
          .order('current_balance', { ascending: false })
          .order('name', { ascending: true })
          .order('id', { ascending: true });
      };

      const customers: Customer[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await buildQuery().range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        customers.push(...(data as Customer[]));
        if (data.length < batchSize) break;
        from += batchSize;
      }

      // Fetch aging rows for exactly the customers we're about to render,
      // keyed by id and chunked. We do NOT blindly select the whole
      // customer_aging view: PostgREST silently caps result sets (~1000 rows),
      // so with 2400+ customers a single fetch drops rows and their buckets
      // render as zero even though the DB has the correct values. Querying by
      // id-chunks guarantees every rendered customer gets its aging row.
      const agingById = new Map<number, CustomerAging>();
      const ids = customers.map((c) => c.id);
      const CHUNK = 200;
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

      const agingResults = await Promise.all(
        chunks.map((slice) =>
          supabase
            .from('customer_aging')
            .select('id, bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus, total_unpaid')
            .in('id', slice)
        )
      );

      for (const res of agingResults) {
        if (res.error) throw res.error;
        for (const row of (res.data || []) as CustomerAging[]) {
          agingById.set(row.id, row);
        }
      }

      return customers.map((c: Customer) => {
        const a = agingById.get(c.id);
        return {
          ...c,
          aging: {
            bucket_0_30: a?.bucket_0_30 ?? 0,
            bucket_31_60: a?.bucket_31_60 ?? 0,
            bucket_61_90: a?.bucket_61_90 ?? 0,
            bucket_90_plus: a?.bucket_90_plus ?? 0,
            total_unpaid: a?.total_unpaid ?? 0,
          },
        } as CustomerWithAging;
      });
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

export function useUpdateCustomerType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId, customerTypeId }: { customerId: number; customerTypeId: number }) => {
      const { error } = await supabase
        .from('customers')
        .update({ customer_type_id: customerTypeId })
        .eq('id', customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-aging'] });
    },
  });
}

export function useBulkUpdateCustomerType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerIds, customerTypeId }: { customerIds: number[]; customerTypeId: number }) => {
      const { error } = await supabase
        .from('customers')
        .update({ customer_type_id: customerTypeId })
        .in('id', customerIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-aging'] });
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
      // Sign convention lives in ledgerBalanceDelta (credit/payment decrease, others increase)
      const balanceChange = ledgerBalanceDelta(entry.type, entry.amount);

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
      // PostgREST silently caps result sets (~1000 rows), so page through
      // by id to guarantee the map covers every customer — a missing entry
      // makes that customer's orders render as "Uncategorized" on the
      // dashboard even when a type is assigned.
      const map = new Map<number, number | null>();
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('customers')
          .select('id, customer_type_id')
          .order('id', { ascending: true })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          map.set(row.id, row.customer_type_id);
        }
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return map;
    },
    enabled: !!user?.businessId,
  });
}
