import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/roles";
import {
  autocompletePlaces,
  getPlaceDetails,
  placesConfigured,
  type PlaceSuggestion,
} from "@/lib/google-places";
import {
  MAX_LOCATIONS_PER_CUSTOMER,
  useAddCustomerLocation,
  useCustomerLocations,
  useDeleteCustomerLocation,
} from "@/hooks/use-customer-locations";
import { useSetOrderLocation } from "@/hooks/use-orders";

/**
 * Google Places search box. Debounced autocomplete against the Places API
 * (New); picking a suggestion resolves details (lat/lng) and calls onPick.
 */
export function PlaceSearchInput({
  onPick,
  placeholder = "Search a place or address...",
  disabled,
  initialQuery,
}: {
  onPick: (place: { placeId: string; displayName: string; formattedAddress: string; lat: number; lng: number }) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Seed the search (e.g. the order's free-text address) so suggestions appear immediately. */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    abortRef.current?.abort();
    if (!query.trim()) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await autocompletePlaces(query, controller.signal);
        if (!controller.signal.aborted) setSuggestions(results);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('[Places] autocomplete error:', err);
          toast({ title: "Place search failed", description: err.message, variant: "destructive" });
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handlePick = async (s: PlaceSuggestion) => {
    setIsResolving(true);
    try {
      const details = await getPlaceDetails(s.placeId);
      if (details.lat == null || details.lng == null) {
        throw new Error('Google returned no coordinates for this place');
      }
      onPick(details);
      setQuery("");
      setSuggestions([]);
    } catch (err: any) {
      toast({ title: "Could not resolve place", description: err.message, variant: "destructive" });
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || isResolving}
          data-testid="input-place-search"
        />
        {(isSearching || isResolving) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent outline-none"
              onClick={() => handlePick(s)}
              data-testid={`place-suggestion-${s.placeId}`}
            >
              <div className="text-sm font-medium">{s.mainText}</div>
              {s.secondaryText && (
                <div className="text-xs text-muted-foreground">{s.secondaryText}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Location model v2: an order POINTS at one of its customer's locations
 * (orders.location_id) — pins live only in customer_locations, the single
 * source for the map. D2C: the pin is the person; B2B: the delivery point
 * (distribution hub) — clients fan out to branches themselves.
 */

export const ORDER_CHANNELS = ["instagram", "facebook", "daraz", "friends", "event"] as const;

export function isD2CCustomer(customer: any): boolean {
  // "Consumer" is the D2C type (spec 2026-07-29); untyped customers are
  // treated as D2C so the channel question is asked rather than skipped.
  const typeName = customer?.customer_type?.name?.toLowerCase() ?? null;
  return typeName == null || typeName === "consumer";
}

/**
 * Pick one of the customer's locations, or search a new place (which is
 * saved as a customer location and then selected). Controlled: reports the
 * chosen CustomerLocation (or null) via onChange. Used in the create-order
 * flow and the order-details footer.
 */
export function CustomerLocationPicker({
  customerId,
  customerAddress,
  value,
  onChange,
  compact,
  isB2B,
}: {
  customerId: number;
  customerAddress?: string | null;
  value: { id: number; label: string | null; formatted_address: string } | null;
  onChange: (loc: any | null) => void;
  compact?: boolean;
  /** B2B customers distinguish storefront vs drop-off when adding. */
  isB2B?: boolean;
}) {
  const { data: locations } = useCustomerLocations(customerId);
  const addLocation = useAddCustomerLocation();
  const { toast } = useToast();
  const [isSearching, setIsSearching] = useState(false);
  const [newKind, setNewKind] = useState<'storefront' | 'dropoff'>('storefront');

  const atCap = (locations?.length ?? 0) >= MAX_LOCATIONS_PER_CUSTOMER;

  const handlePick = async (place: { placeId: string; displayName: string; formattedAddress: string; lat: number; lng: number }) => {
    // Same place picked again → select the existing location, don't duplicate.
    const existing = (locations || []).find((l) => l.place_id === place.placeId);
    if (existing) {
      onChange(existing);
      setIsSearching(false);
      return;
    }
    try {
      const loc = await addLocation.mutateAsync({
        customerId,
        label: place.displayName || undefined,
        formattedAddress: place.formattedAddress,
        placeId: place.placeId,
        lat: place.lat,
        lng: place.lng,
        kind: isB2B ? newKind : 'storefront',
      });
      onChange(loc);
      setIsSearching(false);
    } catch (err: any) {
      toast({ title: "Failed to add location", description: err.message, variant: "destructive" });
    }
  };

  if (isSearching) {
    return (
      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
        {addLocation.isPending ? (
          <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground rounded-md border">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving location...
          </div>
        ) : (
          <PlaceSearchInput
            onPick={handlePick}
            initialQuery={customerAddress ?? ""}
            placeholder="Search a place or area..."
          />
        )}
        <div className="flex items-center gap-2">
          {isB2B && (
          <div className="flex items-center gap-1 text-xs">
              {(['storefront', 'dropoff'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={
                    "rounded-full px-2 py-0.5 border transition-colors " +
                    (newKind === k ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground")
                  }
                  onClick={() => setNewKind(k)}
                >
                  {k === 'storefront' ? 'Storefront' : 'Drop-off'}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setIsSearching(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "flex items-center gap-1.5" : "flex items-center gap-2"} onClick={(e) => e.stopPropagation()}>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm min-w-0 flex-1"
        value={value?.id ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id ? (locations || []).find((l) => l.id === Number(id)) ?? null : null);
        }}
        data-testid="select-order-location"
      >
        <option value="">No location</option>
        {(locations || []).map((l) => (
          <option key={l.id} value={l.id}>
            {(l.label || l.formatted_address) + (isB2B && l.kind === 'dropoff' ? ' [drop-off]' : '')}
          </option>
        ))}
      </select>
      {placesConfigured() && !atCap && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 flex-shrink-0"
          onClick={() => setIsSearching(true)}
          title="Add a new location for this customer"
          data-testid="button-picker-new-location"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

/**
 * Order-footer control: shows/edits which customer location the order went
 * to, plus the D2C channel badge. Quiet metadata next to VAT/Pro Forma.
 */
export function OrderLocationControl({ order }: { order: any }) {
  const setOrderLocation = useSetOrderLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const pin = order.location ?? null;

  const save = async (loc: any | null) => {
    try {
      await setOrderLocation.mutateAsync({ orderId: order.id, locationId: loc?.id ?? null });
      setIsEditing(false);
    } catch (err: any) {
      toast({ title: "Failed to set order location", description: err.message, variant: "destructive" });
    }
  };

  if (isEditing) {
    return (
      <span className="inline-block w-72 align-middle" onClick={(e) => e.stopPropagation()}>
        <CustomerLocationPicker
          customerId={order.customer_id}
          customerAddress={order.customer?.address}
          value={pin}
          onChange={save}
          compact
          isB2B={!isD2CCustomer(order.customer)}
        />
      </span>
    );
  }

  if (pin) {
    return (
      <span className="inline-flex items-center gap-1 text-sm group min-w-0" data-testid={`order-location-${order.id}`}>
        <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <a
          href={
            pin.place_id
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pin.formatted_address)}&query_place_id=${pin.place_id}`
              : `https://www.google.com/maps/search/?api=1&query=${pin.lat},${pin.lng}`
          }
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2 truncate max-w-[240px]"
          title={`Map location (for sales data, not the courier address): ${pin.label ? pin.label + " — " : ""}${pin.formatted_address} (open in Google Maps)`}
        >
          {pin.label || pin.formatted_address}
        </a>
        {order.channel && (
          <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground capitalize">{order.channel}</span>
        )}
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0 text-xs underline underline-offset-2 decoration-dotted"
          onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          data-testid={`button-edit-order-location-${order.id}`}
        >
          change
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
      onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      data-testid={`button-set-order-location-${order.id}`}
    >
      <MapPin className="w-3.5 h-3.5" />
      <span className="underline underline-offset-2 decoration-dotted" title="Map location for sales data — not the courier address">Set location</span>
      {order.channel && (
        <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground capitalize">{order.channel}</span>
      )}
    </button>
  );
}

/**
 * Branch-locations editor for a customer (Info tab). Lists saved locations,
 * adds via Places autocomplete (up to MAX_LOCATIONS_PER_CUSTOMER), deletes.
 * The free-text customers.address field is untouched by design.
 */
export function CustomerLocationsSection({ customerId, customer }: { customerId: number; customer?: any }) {
  const isB2B = customer ? !isD2CCustomer(customer) : false;
  const { data: locations, isLoading } = useCustomerLocations(customerId);
  const addLocation = useAddCustomerLocation();
  const deleteLocation = useDeleteCustomerLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  // Writes are admin/accounts for now (mirrors the RLS policies). Sales will
  // get write access scoped to owned clients once My Clients ships.
  const canEdit = canAccess(user?.roles ?? [], "ledger-edit");

  const count = locations?.length ?? 0;
  const atCap = count >= MAX_LOCATIONS_PER_CUSTOMER;

  const [newKind, setNewKind] = useState<'storefront' | 'dropoff'>('storefront');

  const handlePick = async (place: { placeId: string; displayName: string; formattedAddress: string; lat: number; lng: number }) => {
    if ((locations || []).some((l) => l.place_id === place.placeId)) {
      toast({ title: "That place is already in this customer's locations" });
      setIsAdding(false);
      return;
    }
    try {
      await addLocation.mutateAsync({
        customerId,
        label: place.displayName || undefined,
        formattedAddress: place.formattedAddress,
        placeId: place.placeId,
        lat: place.lat,
        lng: place.lng,
        kind: isB2B ? newKind : 'storefront',
      });
      toast({ title: "Location added" });
      setIsAdding(false);
    } catch (err: any) {
      toast({ title: "Failed to add location", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-muted-foreground">
          Locations{count > 0 ? ` (${count}/${MAX_LOCATIONS_PER_CUSTOMER})` : ""}
        </h4>
        {!isAdding && canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setIsAdding(true)}
            disabled={atCap || !placesConfigured()}
            title={atCap ? `Maximum ${MAX_LOCATIONS_PER_CUSTOMER} locations` : undefined}
            data-testid="button-add-location"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {!placesConfigured() && (
        <p className="text-xs text-muted-foreground">Location search is not configured (missing Google Maps API key).</p>
      )}

      {isAdding && (
        <div className="space-y-1">
          {addLocation.isPending ? (
            <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground rounded-md border">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving location...
            </div>
          ) : (
            <PlaceSearchInput onPick={handlePick} />
          )}
          <div className="flex items-center gap-2">
            {isB2B && (
            <div className="flex items-center gap-1 text-xs">
              {(['storefront', 'dropoff'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={
                    "rounded-full px-2 py-0.5 border transition-colors " +
                    (newKind === k ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground")
                  }
                  onClick={() => setNewKind(k)}
                >
                  {k === 'storefront' ? 'Storefront' : 'Drop-off'}
                </button>
              ))}
            </div>
            )}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading locations...
        </div>
      ) : count === 0 ? (
        !isAdding && <p className="text-sm text-muted-foreground">No locations saved yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {locations!.map((loc) => (
            <li
              key={loc.id}
              className="flex items-start gap-2 text-sm rounded-md border px-2.5 py-1.5 group"
              data-testid={`location-row-${loc.id}`}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
              {/* Opens the pin in Google Maps — quickest way to verify the
                  saved location is right until the in-app map page exists. */}
              <a
                href={
                  loc.place_id
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.formatted_address)}&query_place_id=${loc.place_id}`
                    : `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 hover:underline"
                title="Open in Google Maps"
              >
                {loc.label && (
                  <div className="font-medium truncate">
                    {loc.label}
                    {isB2B && loc.kind === 'dropoff' && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground align-middle">drop-off</span>
                    )}
                  </div>
                )}
                <div className="text-xs text-muted-foreground truncate" title={loc.formatted_address}>
                  {loc.formatted_address}
                </div>
              </a>
              {canEdit && (
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => deleteLocation.mutate({ id: loc.id, customerId })}
                  title="Remove location"
                  data-testid={`button-delete-location-${loc.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
