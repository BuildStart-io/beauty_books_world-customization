# Backend Deployment & Release Instructions for Beauty Books World

> **Target Audience:** Backend Engineer / DevOps Engineer  
> **Repository:** `BuildStart-io/beauty_books_world-customization`  
> **Release Target:** Self-Hosted Supabase, PostgreSQL, Docker Edge Runtime, WAHA Engine  
> **Schema:** `beauty_books_world_customization`  
> **Date:** September 2026  

---

## 1. Release Overview

This release introduces critical enhancements to the Beauty Books World system:
1. **Orders Database Fix:** Adds a `custom_fields` (`JSONB`) column to `beauty_books_world_customization.orders`. This resolves the issue where AI orders with custom metadata (e.g. branding, discounts, manual follow-up status) failed to insert into PostgreSQL.
2. **Product Media Columns:** Adds `pdf_url` (`TEXT`) and `audio_url` (`TEXT`) columns to `beauty_books_world_customization.products` to store brochure e-books and MP3 audio previews.
3. **AI Consultative Flow & Payment Enforcement:** Eliminates payment slip WhatsApp number hallucinations by dynamically binding official account information and dedicated WhatsApp slip receipt number.
4. **Active Bot Behavior (No Deactivation):** When customers request private branding or manual assistance, the bot flags the order in `custom_fields` for sales team follow-up while remaining active to converse with the customer.
5. **WhatsApp Media Dispatch:** Dispatches PDF documents (`/api/sendFile`) and MP3 voice notes (`/api/sendVoice`) via the WAHA WhatsApp API.

---

## 2. Quick Deployment Checklist (For the Engineer)

| Step | Action | Command / Method | Estimated Time |
|---|---|---|---|
| **Step 1** | Pull latest changes | `git pull origin main` | 10 seconds |
| **Step 2** | Run Database Migration | Execute `deploy_db.sql` into PostgreSQL | 10 seconds |
| **Step 3** | Reload Edge Functions | `docker restart supabase-edge-functions` | 15 seconds |
| **Step 4** | Verify WAHA Webhook & Session | Check WAHA status & webhook endpoint | 1 minute |
| **Step 5** | Run Verification Queries | Verify PostgreSQL columns and container logs | 30 seconds |

---

## 3. Step-by-Step Execution Guide

### Step 1: Pull the Latest Code
Navigate to the project root directory on the production server and pull the latest changes from `main`:

```bash
cd /path/to/bbw
git fetch origin
git pull origin main
```

Verify that the working directory is on commit containing `deploy_db.sql`:
```bash
git log -n 1 --oneline
# Should show the latest commit from origin/main
```

---

### Step 2: Apply Database Schema Migrations

The repository contains `deploy_db.sql` at the root. It contains safe, idempotent `IF NOT EXISTS` schema updates.

#### Method A: Via Docker CLI (Recommended)
If your PostgreSQL instance is running inside the `supabase-db` Docker container:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < deploy_db.sql
```

#### Method B: Via Supabase Studio SQL Editor
If you prefer using the Supabase Studio dashboard:
1. Open Supabase Studio in your browser (`http://<server-ip>:3000` or `3030`).
2. Navigate to **SQL Editor** -> **New Query**.
3. Copy and paste the contents of `deploy_db.sql` and click **Run**.

#### What this migration executes:
```sql
-- 1. Ensure permissions on the tenant schema
GRANT USAGE ON SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beauty_books_world_customization TO anon, authenticated, service_role;

-- 2. Add custom_fields column to orders table (safe, idempotent)
ALTER TABLE IF EXISTS beauty_books_world_customization.orders 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- 3. Add PDF & Audio media columns to products table
ALTER TABLE IF EXISTS beauty_books_world_customization.products 
ADD COLUMN IF NOT EXISTS pdf_url TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- 4. Ensures trigger consistency for user creation on auth.users
```

---

### Step 3: Reload Edge Functions

The code in `supabase/functions/ai-chat-beauty-books-world` and `supabase/functions/process-message-beauty-books-world` has been updated. 

To ensure the Deno runtime compiles and loads the updated code, restart the edge runtime container:

```bash
# Direct Docker restart:
docker restart supabase-edge-functions

# OR if managing via docker compose:
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml restart functions
```

Check the startup logs:
```bash
docker logs supabase-edge-functions --tail 30
```
Expected output: No fatal compile errors. The edge runtime should show listening on port `8000`.

---

### Step 4: Verify WAHA WhatsApp Engine & Webhook

Ensure the WAHA WhatsApp container is running and healthy:

```bash
docker ps --filter "name=waha"
```

1. **WAHA Webhook Target:**
   Ensure WAHA is configured to post inbound messages to:
   `https://<your-public-domain-or-ip>/functions/v1/webhook-wsender-beauty-books-world`

2. **Check for Orphaned Sessions:**
   In case WAHA was previously configured with defunct or mismatched session names, verify active sessions in the WAHA Dashboard (`http://<server-ip>:3000` or API `GET /api/sessions`).
   Ensure the session assigned to the Beauty Books World owner account is in `WORKING` status.

---

### Step 5: Verification & Smoke Test

Run the following sanity checks to confirm everything is operational:

#### 1. Verify Database Schema:
```bash
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'beauty_books_world_customization' 
  AND table_name = 'orders' 
  AND column_name = 'custom_fields';
"
```
**Expected Output:** `custom_fields | jsonb`

```bash
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'beauty_books_world_customization' 
  AND table_name = 'products' 
  AND column_name IN ('pdf_url', 'audio_url');
"
```
**Expected Output:** Both `pdf_url` and `audio_url` listed with data type `text`.

#### 2. Verify Edge Function Processing:
Monitor the runtime logs during a test WhatsApp interaction:
```bash
docker logs -f supabase-edge-functions | grep -E "process-message|ai-chat"
```
During a test message, you should see logs such as:
- `[Info] [process-message] Done. Processed 1 messages.`
- Outbound payload with `direction: "outbound"`.
- If an order is created: `Saving order to database: {...}` with `custom_fields` stored successfully.

---

## 4. Rollback Plan (If Required)

In the highly unlikely event of a rollback:
1. **Database:**
   The added columns are nullable with default values and do not alter existing schema constraints. No database rollback is required. If necessary:
   ```sql
   ALTER TABLE beauty_books_world_customization.orders DROP COLUMN IF EXISTS custom_fields;
   ALTER TABLE beauty_books_world_customization.products DROP COLUMN IF EXISTS pdf_url, DROP COLUMN IF EXISTS audio_url;
   ```
2. **Edge Functions:**
   Revert git commit:
   ```bash
   git revert HEAD --no-edit
   docker restart supabase-edge-functions
   ```

---

## 5. Support & Contacts
If you encounter any edge runtime worker boot errors or database permission issues, verify that:
- The database schema `beauty_books_world_customization` exists and has permissions granted to `anon, authenticated, service_role`.
- `AI_GENERATE_URL` and `BOT_API_KEY` environment variables are correctly populated in the `supabase-edge-functions` container environment.
