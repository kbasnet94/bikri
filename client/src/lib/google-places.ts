// Thin client for the Places API (New) HTTP endpoints. No Google JS SDK —
// plain fetch with the referrer-restricted browser key keeps the bundle
// clean and works identically on localhost and production.

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export interface PlaceSuggestion {
  placeId: string;
  /** Primary line, e.g. "Bhatbhateni Supermarket" */
  mainText: string;
  /** Secondary line, e.g. "Baluwatar, Kathmandu" */
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

export function placesConfigured(): boolean {
  return !!API_KEY;
}

// Bias (not restrict) results toward Nepal — establishment names like
// per-branch Bhatbhateni resolve, but nothing outside NP outranks them.
const KATHMANDU = { latitude: 27.7172, longitude: 85.324 };

export async function autocompletePlaces(input: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  if (!API_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY is not set');
  if (!input.trim()) return [];

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      input,
      regionCode: 'NP',
      locationBias: { circle: { center: KATHMANDU, radius: 50000 } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places autocomplete failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return (data.suggestions || [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  if (!API_KEY) throw new Error('VITE_GOOGLE_MAPS_API_KEY is not set');

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      // FieldMask keeps this a cheap "Essentials" SKU call.
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Place details failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    placeId: data.id,
    displayName: data.displayName?.text ?? '',
    formattedAddress: data.formattedAddress ?? '',
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  };
}
