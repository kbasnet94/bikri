import { useState } from "react";
import { useDraftOrders, useReviewDraft, useDraftEvidenceUrls, DraftAlreadyReviewedError } from "@/hooks/use-draft-orders";
import { useProducts } from "@/hooks/use-products";
import { useCurrency } from "@/hooks/use-currency";
import { mapDraftToOrderPrefill, isPrefillError, type DraftOrderRow, type OrderPrefill } from "@/lib/draft-mapping";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, ImageOff, Loader2, ShieldCheck } from "lucide-react";

const NEPALI_PHONE_RE = /^9[678]\d{8}$/;

// The IG bot quotes consumers a total that INCLUDES Rs 100 delivery
// (e.g. Rs 2,050 for one box). The recomputed items total above excludes
// delivery, so staff need the delivery line to compare against the bot's
// quote. Display-only — order-total math is untouched.
const CONSUMER_DELIVERY_FEE_CENTS = 10000;

function lastCodLine(transcript: string): string | null {
  const lines = (transcript || "").split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/cod/i.test(lines[i])) return lines[i].trim();
  }
  return null;
}

interface DraftCardProps {
  draft: DraftOrderRow;
  onConfirm: (prefill: OrderPrefill, draftId: number) => void;
}

function DraftCard({ draft, onConfirm }: DraftCardProps) {
  const { data: products } = useProducts();
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const reviewDraft = useReviewDraft();
  const { data: evidenceUrls, isLoading: evidenceLoading } = useDraftEvidenceUrls(
    draft.payment_method === "qr" ? draft.evidence_urls : undefined
  );

  const [verifiedInBank, setVerifiedInBank] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const mapped = products ? mapDraftToOrderPrefill(draft, products) : null;
  const mappingError = mapped && isPrefillError(mapped) ? mapped.error : null;
  const phoneValid = NEPALI_PHONE_RE.test(draft.phone);

  const recomputedTotal = (draft.items || []).reduce((sum, item) => {
    const match = (products || []).find(
      (p: any) =>
        p.name.trim().toLowerCase().includes(item.sku.trim().toLowerCase()) ||
        item.sku.trim().toLowerCase().includes(p.name.trim().toLowerCase())
    );
    const unitPrice = match ? match.price : item.unit_price_cents;
    return sum + unitPrice * item.qty;
  }, 0);

  const codLine = draft.payment_method === "cod" ? lastCodLine(draft.transcript) : null;

  const canConfirm =
    !!mapped &&
    !isPrefillError(mapped) &&
    (draft.payment_method !== "qr" || verifiedInBank);

  const handleConfirm = () => {
    if (!mapped || isPrefillError(mapped)) return;
    onConfirm(mapped, draft.id);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({ title: "Reject reason is required", variant: "destructive" });
      return;
    }
    try {
      await reviewDraft.mutateAsync({ id: draft.id, status: "rejected", rejectReason: rejectReason.trim() });
      toast({ title: `Draft #${draft.id} rejected` });
    } catch (error: any) {
      if (error instanceof DraftAlreadyReviewedError) {
        toast({
          title: "Already reviewed by someone else",
          description: `Draft #${draft.id} was reviewed elsewhere before this reject landed — refresh the tab before acting on it again.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to reject draft", description: error.message, variant: "destructive" });
      }
    }
  };

  return (
    <Card className="p-4 space-y-3" data-testid={`draft-card-${draft.id}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{draft.customer_name}</span>
            <Badge
              variant="outline"
              className={
                phoneValid
                  ? "text-xs bg-muted text-muted-foreground"
                  : "text-xs bg-red-500/10 text-red-600 border-red-500/30"
              }
              data-testid={`draft-phone-${draft.id}`}
            >
              {draft.phone || "no phone"}
            </Badge>
            <Badge
              variant="outline"
              className={
                draft.payment_method === "qr"
                  ? "text-xs bg-blue-500/10 text-blue-600 border-blue-500/30"
                  : "text-xs bg-green-500/10 text-green-600 border-green-500/30"
              }
            >
              {draft.payment_method === "qr" ? "Bank/QR" : "COD"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">{draft.address || "no address"}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Recomputed total</div>
          <div className="font-mono font-medium">{formatCurrency(recomputedTotal)}</div>
          <div className="text-xs text-muted-foreground" data-testid={`draft-delivery-${draft.id}`}>
            + {formatCurrency(CONSUMER_DELIVERY_FEE_CENTS)} delivery
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {(draft.items || []).map((item, i) => (
          <div key={i} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
            <span>{item.sku} × {item.qty}</span>
            <span className="font-mono">{formatCurrency(item.unit_price_cents * item.qty)}</span>
          </div>
        ))}
      </div>

      {mappingError && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span data-testid={`draft-error-${draft.id}`}>{mappingError}</span>
        </div>
      )}

      {draft.payment_method === "qr" ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Payment evidence</div>
          {evidenceLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading evidence...
            </div>
          ) : evidenceUrls && evidenceUrls.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {evidenceUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt={`Payment evidence ${i + 1}`}
                    className="w-20 h-20 rounded object-cover border"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageOff className="w-4 h-4" /> No evidence uploaded
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={verifiedInBank}
              onCheckedChange={(v) => setVerifiedInBank(v === true)}
              data-testid={`draft-verified-${draft.id}`}
            />
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified in bank
            </span>
          </label>
        </div>
      ) : (
        codLine && (
          <div className="text-sm italic text-muted-foreground border-l-2 pl-2">"{codLine}"</div>
        )
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Full transcript</summary>
        <div className="mt-2 whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-64 overflow-y-auto">
          {draft.transcript || "(no transcript)"}
        </div>
      </details>

      {showRejectForm ? (
        <div className="space-y-2 border-t pt-3">
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejecting this draft..."
            rows={2}
            data-testid={`draft-reject-reason-${draft.id}`}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowRejectForm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReject}
              disabled={reviewDraft.isPending}
              data-testid={`draft-confirm-reject-${draft.id}`}
            >
              Confirm reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 justify-end border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRejectForm(true)}
            data-testid={`draft-reject-${draft.id}`}
          >
            Reject
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid={`draft-confirm-${draft.id}`}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Confirm
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function DraftsTab({
  onConfirm,
}: {
  onConfirm: (prefill: OrderPrefill, draftId: number) => void;
}) {
  const { data: drafts, isLoading, isError } = useDraftOrders();

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading drafts...</div>;
  }

  // use-draft-orders.ts already swallows the missing-table codes (42P01 /
  // PGRST205) into an empty array, so isError here means a REAL query
  // failure (network, RLS, etc.) — say so instead of pretending the queue
  // is empty.
  if (isError) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="drafts-load-error">
        Couldn't load drafts — check connection.
      </div>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No pending drafts.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} onConfirm={onConfirm} />
      ))}
    </div>
  );
}
