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

/**
 * Google Places search box. Debounced autocomplete against the Places API
 * (New); picking a suggestion resolves details (lat/lng) and calls onPick.
 */
export function PlaceSearchInput({
  onPick,
  placeholder = "Search a place or address...",
  disabled,
}: {
  onPick: (place: { placeId: string; displayName: string; formattedAddress: string; lat: number; lng: number }) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
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
 * Branch-locations editor for a customer (Info tab). Lists saved locations,
 * adds via Places autocomplete (up to MAX_LOCATIONS_PER_CUSTOMER), deletes.
 * The free-text customers.address field is untouched by design.
 */
export function CustomerLocationsSection({ customerId }: { customerId: number }) {
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

  const handlePick = async (place: { placeId: string; displayName: string; formattedAddress: string; lat: number; lng: number }) => {
    try {
      await addLocation.mutateAsync({
        customerId,
        label: place.displayName || undefined,
        formattedAddress: place.formattedAddress,
        placeId: place.placeId,
        lat: place.lat,
        lng: place.lng,
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
          <PlaceSearchInput onPick={handlePick} disabled={addLocation.isPending} />
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setIsAdding(false)}>
            Cancel
          </Button>
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
                {loc.label && <div className="font-medium truncate">{loc.label}</div>}
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
