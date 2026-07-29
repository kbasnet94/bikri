# Bikri 2.0 — Customer Type vs Channel Untangling (Design)

**Date:** 2026-07-29 · **Status:** Approved by Karan (chat, session of 2026-07-29)
Follows the location-model-v2 pointer work (orders.location_id + orders.channel, applied 2026-07-29).

## Problem

The customer-type dropdown mixes two taxonomies: WHO the customer is (Gym,
Retail, Pharmacy) and WHERE orders come from (Daraz, Instagram, Event,
Friends & Family). Segment (B2B vs D2C) is inferred by name-matching the
"Instagram" type — fragile, and confusing at customer creation.

Live data (2026-07-29): types = Daraz(1), Instagram(2), Gym(3), Retail(4),
Friends & Family(5), Event(6), Pharmacy(7); 2,663 customers, 84 untyped.

## Design

**Customer type = identity.** List becomes `Consumer` + B2B categories
(Gym, Retail, Pharmacy, and future additions like Run Club, Educational
Institution). One dropdown, one taxonomy, no `customers` schema change.

**Channel = origin, on the order.** `orders.channel` values:
`instagram | facebook | daraz | friends | event`. Channel UI shows only for
Consumer-typed (or untyped) customers.

**Event is a channel, not a type.** Stall sales = Consumer customer (e.g.
"Herald Run Stall 2026"), channel `event`, order location pin = venue.
Recurring event organizers (run club, school association) = proper B2B
customers with a descriptive type; one-off organizer freebies = Consumer +
channel `event` + discount.

## One-time data migration (SQL, data-only)

Order matters — backfill channel BEFORE moving customers off the legacy types:

1. Backfill `orders.channel` (where NULL) from the customer's current type:
   Daraz→`daraz`, Instagram→`instagram`, Friends & Family→`friends`,
   Event→`event`.
2. Reassign customers typed Daraz/F&F/Event → type id 2 (Instagram).
3. Rename type id 2 to `Consumer`.
4. Delete the now-empty Daraz, Friends & Family, Event types.
5. Untyped customers (84): untouched — app already treats them as D2C.

## Code changes

- `isD2CCustomer`: true when type name (lowercased) is `consumer` OR type is
  missing. Replaces the `instagram` name-match.
- `ORDER_CHANNELS` = `['instagram','facebook','daraz','friends','event']`.
- No other flow changes: channel visibility, the location pointer, and
  billing address already key off these two functions/columns.

## Known consequence (logged follow-up, not in scope)

Dashboard sales-by-type collapses all D2C into one "Consumer" bucket. The
IG-vs-Daraz split moves to `orders.channel` (backfilled, so history intact),
but the dashboard widget needs a follow-up to break Consumer down by channel.

## Rejected alternatives

- `customers.segment` column: explicit but adds a required field + migration
  for something a single type name now expresses.
- `customer_types.is_consumer` flag: only pays off with multiple
  consumer-side types — YAGNI.

## Open question parked for next brainstorm

B2B order location: Bhatbhateni has 4 selling branches + a 5th physical
delivery location; what does the order's pin mean and which locations belong
in the customer's list — selling points, delivery points, or both, and how
does the map distinguish them?
