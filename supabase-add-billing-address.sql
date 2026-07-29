-- Billing address: the client's registered/invoice address (VAT bills,
-- pro forma). Distinct from `address` (courier handoff text) and from
-- customer_locations (geo pins). Invoice templates: use billing_address,
-- fall back to address when NULL (decided with backlog item 5/5b).
ALTER TABLE customers ADD COLUMN billing_address TEXT;
