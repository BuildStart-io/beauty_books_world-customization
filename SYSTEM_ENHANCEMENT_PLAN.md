# Beauty Books World — Full System Fix & Enhancement Plan
> **Status:** Architecture & Design Plan (No application code modified yet)  
> **Date:** September 2026  
> **Target System:** Beauty Books World Self-Hosted Supabase, WAHA & Frontend Stack

---

## 1. Executive Summary

This document brings together all the issues identified, their root causes, and the exact specifications for implementing:
1. **Previous Fixes:** Database `custom_fields` column, AI system prompt sequence activation, discount calculation, payment slip number accuracy, token truncation fix.
2. **New Feature 1 — PDF & MP3 Product Attachments:** Enabling PDF brochures and MP3 voice previews in product management and having the bot send them via WhatsApp when requested.
3. **New Feature 2 — Complete Product Listing:** Resolving why the bot omits products and adding clear rules to display all products when requested.
4. **New Feature 3 — Keeping the Bot Continuously Active:** Removing automatic bot deactivation (`chat_takeovers`) during manual verification and branding so the bot keeps conversing while flagging the order in the Orders tab.

---

## 2. Database Schema Migrations

### A. Add Missing `custom_fields` to `orders` Table
* **Issue:** When the AI extracts an order, it saves extra fields (`purchase_type`, `quantity`, `branding_req`, `discount_amount`, `manual_handoff_status`) inside `custom_fields`. Because this column does not exist in `orders`, PostgreSQL rejects the insert, causing zero orders to appear in the Orders tab.
* **SQL Migration:**
  ```sql
  ALTER TABLE beauty_books_world_customization.orders 
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
  ```

### B. Add `pdf_url` and `audio_url` to `products` Table
* **Feature:** Store public URLs for product PDF brochures/e-books and MP3 audio guides/previews.
* **SQL Migration:**
  ```sql
  ALTER TABLE beauty_books_world_customization.products 
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT;
  ```

---

## 3. Bot Active Behavior & Manual Verification (New Requirement)

### A. The Current Problem:
Currently, when a customer indicates interest in Private Branding ("Yes") or inquires about custom formulas, the code executes:
```typescript
await supabase.from("chat_takeovers").upsert({
  user_id: userId,
  phone_number: phoneNumber,
  is_taken_over: true,
  updated_at: new Date().toISOString(),
});
```
When `is_taken_over: true`, `process-message` triggers:
```typescript
if (takeoverData) {
  console.log(`Chat with ${phoneNumber} is taken over, skipping AI`);
  return; // Bot stops responding completely!
}
```
This shuts down the bot for that customer, making the customer think the bot crashed or stopped working.

### B. The New Solution:
1. **Do NOT mark `is_taken_over: true` automatically.** The bot should NEVER stop responding to the customer.
2. When branding or manual inquiry happens:
   - The bot replies politely: `"Our sales team will contact you shortly regarding your branding / custom formula requirements."`
   - The bot continues assisting the customer with the rest of their order (e.g. collecting delivery address, answering questions).
   - In the order payload `<ORDER_JSON>`, `"branding_req": "Yes"` and `"manual_handoff_status": "Manual Follow-Up Required"` are preserved.
   - In `frontend/src/pages/Orders.tsx`, the order displays the amber **`Branding (LKR 5,000)`** and **`Manual Follow-Up`** badges so the sales team can review it.
   - The customer can still interact with the AI without any interruption.

---

## 4. Product PDF & MP3 WhatsApp Support

### A. How It Works:
* **Storage:** Files are uploaded to MinIO via `media-storage-beauty-books-world` (up to 50MB).
* **Delivery Engine:** `send-whatsapp-beauty-books-world/index.ts` already has native handlers:
  - `.pdf` -> sends via WAHA `/api/sendFile` (renders as a downloadable PDF document in WhatsApp).
  - `.mp3` -> sends via WAHA `/api/sendVoice` (renders as an audio / voice note in WhatsApp).

### B. AI System Prompt Integration (`ai-chat-beauty-books-world/index.ts`):
1. In `productCatalog` generation:
   ```typescript
   if (p.pdf_url) line += ` | PDF/Brochure: ${p.pdf_url}`;
   if (p.audio_url) line += ` | Audio Guide: ${p.audio_url}`;
   ```
2. In `systemPrompt` instructions:
   > "If the customer asks for a product brochure, catalog, sample pages, or book PDF: include `<PDF_URL>https://...</PDF_URL>` at the end of your reply."  
   > "If the customer asks for an audio explanation, voice guide, or audio sample: include `<AUDIO_URL>https://...</AUDIO_URL>` at the end of your reply."
3. In response parsing:
   - Extract `<PDF_URL>` and `<AUDIO_URL>`.
   - Strip them from the clean user response text.
   - Return `{ ..., pdfUrl, audioUrl }`.

### C. Message Dispatcher (`process-message-beauty-books-world/index.ts`):
In the outbound message section:
- If `replyPdfUrl` exists: call `sendWhatsAppMedia(..., replyPdfUrl)` (sends PDF).
- If `replyAudioUrl` exists: call `sendWhatsAppMedia(..., replyAudioUrl)` (sends MP3).
- Then send the text reply.

---

## 5. Product Listing Fix (Listing All Products)

### A. Why products are currently omitted:
1. **Rule conflict:** Line 193 enforces: `"KEEP IT SHORT... Aim for 2-4 short lines max per response. Never send walls of text."` This forces Gemini to omit most products when asked for a list.
2. **Token limit:** `MAX_TOKENS = 500` cuts off large text lists.

### B. How to fix:
1. **Update System Prompt rule:**
   > "EXCEPTION TO SHORTNESS RULE: If the customer explicitly asks to view all products (e.g. 'show all products', 'what are your products', 'product list thanga'), you MUST list all available active products grouped by category with their prices. Format cleanly with bullet points and emojis."
2. **Increase `MAX_TOKENS`:**
   Change `const MAX_TOKENS = 500;` to `1000` (or `1200`).

---

## 6. System Prompt Sequence & Payment Slip Number Fixes

### A. Unconditional Consultative Sales Flow:
* Remove `${customChatFlow ? ... : ...}` ternary in `ai-chat-beauty-books-world/index.ts` line 209.
* Make the 7-step consultative sales sequence permanent for Beauty Books World.

### B. Dedicated Payment Information Block:
* Add a global `--- PAYMENT INFORMATION ---` section to `systemPrompt`:
  ```
  --- PAYMENT INFORMATION ---
  Bank Accounts:
  [Configured bank accounts from dashboard settings]

  Dedicated Payment Slip WhatsApp Number: ${paymentSlipNumber}
  CRITICAL RULE: The ONLY official WhatsApp number for sending payment slips or deposit receipts is ${paymentSlipNumber}. Never invent, guess, or mention any other phone number under any circumstances!
  ```

---

## 7. Frontend UI Enhancements

### A. Products Page (`frontend/src/pages/Products.tsx`):
1. Add PDF Brochure uploader component (`accept=".pdf"`).
2. Add MP3 Audio Preview uploader component (`accept=".mp3,.wav,.m4a"`).
3. Display PDF and Audio indicator icons in the product table row.

### B. Orders Page (`frontend/src/pages/Orders.tsx`):
1. Display the order details with `custom_fields` (Purchase Type, Quantity, Branding: Yes/No, Discount Amount).
2. Orders marked `"Manual Follow-Up Required"` will have the **Manual Follow-Up** badge clearly displayed for the business owner.

---

## 8. Execution Checklist

| Step | Area | Action Item |
|------|------|-------------|
| 1 | Database | Execute `ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_fields JSONB` |
| 2 | Database | Execute `ALTER TABLE products ADD COLUMN IF NOT EXISTS pdf_url TEXT, ADD COLUMN IF NOT EXISTS audio_url TEXT` |
| 3 | Edge Function | Update `ai-chat` prompt: remove `customChatFlow` condition, add payment block, add PDF/MP3 rules, increase token limit |
| 4 | Edge Function | Update `ai-chat`: remove automatic `chat_takeovers` so bot stays active |
| 5 | Edge Function | Update `process-message`: dispatch `replyPdfUrl` and `replyAudioUrl` via WAHA |
| 6 | Frontend | Update `Products.tsx`: add PDF and MP3 upload controls |
| 7 | Dashboard | Clean up zombie WAHA sessions (`Glowix_cosmetics`) to stop error loops |
