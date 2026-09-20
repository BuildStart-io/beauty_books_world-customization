# Multi-Tenant Database Customization Guide (Option 2)

This document outlines the standard operating procedures for handling client customizations in the BuildStart multi-tenant architecture. 

Because we are hosting multiple clients on a **single, shared Supabase instance**, we rely on **Row-Level Security (RLS)** using `owner_id` (or `user_id`) to ensure data remains strictly isolated. When you host a custom frontend clone for a client and point it to this database, their data will **never shuffle** as long as RLS is enforced.

Below are the standard guidelines for implementing different types of customizations.

---

## Scenario 1: Minor Data Customizations (Adding New Fields)
* **Example:** Client A wants to save a `delivery_gate_code` on an order. Client B wants to save `loyalty_points` on a customer profile.
* **The Problem:** We cannot use `ALTER TABLE` to add 50 different columns for 50 different clients to the shared `orders` table. It will become an unmaintainable mess.
* **The Solution:** Use a `JSONB` Metadata Column.
* **Implementation Steps:**
  1. Add a single column named `custom_fields` of type `JSONB` to the core tables (`orders`, `customers`, `products`, etc.) with a default value of `{}`.
  2. When Client A's custom frontend saves an order, it sends `{ custom_fields: { "delivery_gate_code": "1234A" } }`.
  3. When Client B's custom frontend saves a customer, it sends `{ custom_fields: { "loyalty_points": 500 } }`.
  4. Supabase (PostgreSQL) natively supports querying JSONB. You can still sort, filter, and search efficiently by these fields without altering the database schema for every client.

## Scenario 2: Major Customizations (Entirely New Features)
* **Example:** Client A pays for a custom "Wholesale Bidding System" or "Fleet Tracking System" that no other client uses.
* **The Problem:** This data doesn't fit into the standard `products` or `orders` tables.
* **The Solution:** Create a dedicated table prefixed with the client's identifier, secured by RLS.
* **Implementation Steps:**
  1. Create a new table in the shared database: `CREATE TABLE clientA_wholesale_bids (...)`.
  2. **CRITICAL:** You must include an `owner_id` column on this new table.
  3. **CRITICAL:** You must enable Row-Level Security (RLS) on this table just like the core tables:
     ```sql
     ALTER TABLE clientA_wholesale_bids ENABLE ROW LEVEL SECURITY;
     CREATE POLICY "Users can only access their own bids" ON clientA_wholesale_bids 
       FOR ALL USING (auth.uid() = owner_id);
     ```
  4. Because only Client A's custom frontend clone possesses the code to query the `clientA_wholesale_bids` table, it remains perfectly isolated, but still benefits from the shared database infrastructure.

## Scenario 3: UI and Frontend Customizations
* **Example:** Client A wants a completely different dashboard layout, custom brand colors, or a different checkout flow.
* **The Solution:** Codebase Clones.
* **Implementation Steps:**
  1. Clone the master frontend repository to a new repository (e.g., `buildstart-frontend-clientA`).
  2. Implement their UI changes directly in their repository.
  3. Deploy their repository (e.g., to Vercel/Netlify) and set the `.env` variables to point to your **Main Shared Supabase Instance**.
  4. When users log into Client A's URL, they authenticate with the shared database, but see a completely customized UI. RLS ensures they only load Client A's data.

## Scenario 4: Custom Backend Logic (Edge Functions/Webhooks)
* **Example:** Client A wants an integration with a local ERP system whenever an order is placed.
* **The Solution:** Client-Specific Edge Functions or Webhooks.
* **Implementation Steps:**
  1. Write a new Edge Function in the backend (e.g., `supabase/functions/webhook-clientA-erp`).
  2. Deploy it to the shared Supabase instance.
  3. In Client A's frontend clone, configure their webhook URL to point to `/functions/v1/webhook-clientA-erp` instead of the default webhook.
  4. Alternatively, if it's a minor logic branch, use the `owner_id` in the existing edge function:
     ```typescript
     if (auth.ownerId === "CLIENT_A_UUID") {
       // execute custom ERP sync
     }
     ```
     *(Note: Branching by UUID is fine for 1 or 2 clients, but if you have many, prefer creating separate edge functions to keep the core code clean).*

## Summary Checklist for Onboarding a Custom Client
1. [ ] Clone the frontend codebase.
2. [ ] Point the clone's `.env` to the shared database.
3. [ ] Register the client via Supabase Auth and generate their `owner_id`.
4. [ ] Build custom UI in their clone.
5. [ ] Store custom field data in the `custom_fields` JSONB column.
6. [ ] Create `clientName_featureName` tables ONLY for massive, completely new modules, and strictly enforce RLS on them.
