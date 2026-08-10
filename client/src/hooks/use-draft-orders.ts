import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import type { DraftOrderRow } from "@/lib/draft-mapping";

// draft_orders is written by the IG order-bot (Task 4 schema). It may not
// exist yet in every environment the bot hasn't shipped to — queries here
// swallow "relation does not exist" (Postgres 42P01) and PostgREST's
// schema-cache miss (PGRST205) so the Drafts tab renders an empty state
// instead of crashing the page.
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTableError(error: any): boolean {
  return !!error && MISSING_TABLE_CODES.has(error.code);
}

export function useDraftOrders() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['draft-orders', 'pending', user?.businessId],
    queryFn: async (): Promise<DraftOrderRow[]> => {
      const { data, error } = await supabase
        .from('draft_orders')
        .select('*')
        .eq('status', 'pending')
        .order('id', { ascending: true });

      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return (data || []) as DraftOrderRow[];
    },
    enabled: !!user?.businessId,
    // Polled rather than realtime-subscribed: drafts arrive from an
    // out-of-band IG bot, and this is a low-traffic review queue.
    refetchInterval: 60_000,
  });
}

export interface ReviewDraftInput {
  id: number;
  status: 'confirmed' | 'rejected';
  rejectReason?: string;
  bikriOrderId?: number;
}

export function useReviewDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, rejectReason, bikriOrderId }: ReviewDraftInput) => {
      const { data, error } = await supabase
        .from('draft_orders')
        .update({
          status,
          reject_reason: rejectReason ?? null,
          bikri_order_id: bikriOrderId ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as DraftOrderRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-orders'] });
    },
  });
}

// Signed URLs for evidence screenshots stored in the bot's private
// `bot-media` bucket. Short-lived (1 hour) — fetched on render, not cached
// across sessions.
export function useDraftEvidenceUrls(evidenceUrls: string[] | undefined) {
  return useQuery({
    queryKey: ['draft-orders', 'evidence', evidenceUrls],
    queryFn: async (): Promise<string[]> => {
      if (!evidenceUrls || evidenceUrls.length === 0) return [];
      const results = await Promise.all(
        evidenceUrls.map(async (path) => {
          const { data, error } = await supabase.storage
            .from('bot-media')
            .createSignedUrl(path, 3600);
          if (error || !data) return null;
          return data.signedUrl;
        })
      );
      return results.filter((u): u is string => !!u);
    },
    enabled: !!evidenceUrls && evidenceUrls.length > 0,
  });
}
