# Beauty Books World — நேரடி பயன்பாட்டு வழிகாட்டி (Live Deployment & Execution Guide)

இந்த ஆவணத்தில் நாம் செய்த மாற்றங்கள், அந்த மாற்றங்களை Live Server-ல் அமல்படுத்த (Apply செய்ய) Backend மற்றும் Frontend-ல் செய்ய வேண்டிய அனைத்து செய்முறைகளும் (Step-by-step instructions) விரிவாக விளக்கப்பட்டுள்ளன.

---

## 1. நாம் செய்த முழுமையான மாற்றங்கள் (Summary of Changes Made)

| பகுதி (Module) | கோப்பு (File Path) | செய்யப்பட்ட மாற்றம் (What Changed) | நோக்கம் (Why it was done) |
|---|---|---|---|
| **Database Schema** | `db/01_schema.sql`<br>`deploy_db.sql` | 1. `orders` அட்டவணையில் `custom_fields jsonb` சேர்க்கப்பட்டது.<br>2. `products` அட்டவணையில் `pdf_url text`, `audio_url text` சேர்க்கப்பட்டது. | வாடிக்கையாளர் தரும் Branding/Discount விபரங்கள் Orders tab-ல் விழவும், PDF & MP3 லிங்க்களைச் சேமிக்கவும். |
| **Frontend Types** | `frontend/src/integrations/supabase/types.ts` | `orders` மற்றும் `products` table-களுக்கான TypeScript interfaces புதுப்பிக்கப்பட்டது. | Frontend code-ல் type error வராமல் சுத்தமாக build ஆக. |
| **AI System Prompt** | `supabase/functions/ai-chat-beauty-books-world/index.ts` | 1. 7-Step Consultative Sales Flow கட்டாயமாக்கப்பட்டது (`customChatFlow` நிபந்தனை நீக்கப்பட்டது).<br>2. அதிகாரப்பூர்வ Bank Account மற்றும் WhatsApp Slip எண் சேர்க்கப்பட்டது.<br>3. `MAX_TOKENS: 1200` ஆக உயர்த்தப்பட்டது.<br>4. Bot deactivation நீக்கப்பட்டது (`is_taken_over = true` தவிர்க்கப்பட்டது).<br>5. `<PDF_URL>` & `<AUDIO_URL>` catalog tags சேர்க்கப்பட்டது. | AI சுயமாகப் போலி எண்களை உருவாக்குவதைத் தடுக்க, தள்ளுபடி கணக்கிட, வாடிக்கையாளர் branding கேட்டாலும் Bot முடங்காமல் (active-ஆக) உரையாட. |
| **WhatsApp Dispatcher** | `supabase/functions/process-message-beauty-books-world/index.ts` | AI பதிலில் இருந்து PDF & MP3 links எடுக்கப்பட்டு, WAHA வழியாக Document (`/api/sendFile`) மற்றும் Voice Note (`/api/sendVoice`) ஆக அனுப்பும் வசதி சேர்க்கப்பட்டது. | தயாரிப்பு கையேடு (Brochure) மற்றும் குரல் விளக்கங்களை வாடிக்கையாளருக்கு வாட்ஸ்அப்பில் அனுப்ப. |
| **Frontend Products** | `frontend/src/pages/Products.tsx`<br>`ProductPdfUpload.tsx`<br>`ProductAudioUpload.tsx` | தயாரிப்பு பக்கத்தில் PDF e-book மற்றும் MP3 audio பதிவேற்றும் வசதி மற்றும் அட்டவணையில் அதற்கான Badges சேர்க்கப்பட்டது. | அட்மின் இலகுவாக PDF & Audio கோப்புகளை MinIO-வில் பதிவேற்ற. |
| **Frontend Orders** | `frontend/src/pages/Orders.tsx` | Orders பட்டியல் மற்றும் Details pop-up-ல் `custom_fields`, `Branding (LKR 5,000)`, `Manual Follow-Up` badges மொபைல் மற்றும் டெஸ்க்டாப் இரண்டிலும் சேர்க்கப்பட்டது. | விற்பனையாளர் (Sales team) branding கோரிக்கைகளை உடனே கவனித்து வாடிக்கையாளரைத் தொடர்பு கொள்ள. |

---

## 2. Backend-ல் செய்ய வேண்டிய செய்முறைகள் (Backend Execution Steps)

Live Server-ல் backend-ஐ புதுப்பிக்க பின்வரும் 3 படிகளை வரிசையாகச் செய்யவும்:

### படி 1: Database Migration-ஐ இயக்குதல் (Run SQL Migration)
Live Server-ல் Docker database container-க்குள் [deploy_db.sql](file:///home/kapilash/Documents/bbw/deploy_db.sql) ஸ்கிரிப்டை இயக்க வேண்டும்:

```bash
# Terminal-ல் bbw திட்ட folder-க்குள் செல்லவும்
cd /home/kapilash/Documents/bbw

# Database container-ல் migration-ஐ நேரடியாக execute செய்யவும்
docker exec -i supabase-db psql -U postgres -d postgres < deploy_db.sql
```

*(குறிப்பு: நீங்கள் Supabase Studio Dashboard (port 3000 அல்லது 3030)-ஐப் பயன்படுத்துபவர் எனில், Studio-வின் **SQL Editor**-ல் சென்று `deploy_db.sql`-ல் உள்ள வரிகளை Paste செய்து Run செய்யலாம்).*

**சரிபார்க்க (Verification):**
```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d beauty_books_world_customization.orders"
# இதில் `custom_fields | jsonb` இருக்கிறதா என்று பார்க்கவும்.
```

---

### படி 2: Edge Functions-ஐ Restart செய்தல் (Reload Edge Functions)
நமது Edge Functions (`ai-chat` மற்றும் `process-message`) கோப்புகளில் செய்யப்பட்ட மாற்றங்கள் Docker container-ல் உடனடியாக அமலுக்கு வர, functions container-ஐ restart செய்ய வேண்டும்:

```bash
# Edge Functions container-ஐ restart செய்யவும்
docker restart supabase-edge-functions

# அல்லது docker-compose பயன்படுத்தினால்:
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml restart functions
```

**சரிபார்க்க (Verification):**
```bash
docker logs supabase-edge-functions --tail 30
# பிழைகள் ஏதுமின்றி runtime தயாராக உள்ளதா எனப் பார்க்கவும்.
```

---

### படி 3: WAHA WhatsApp Engine சரிபார்த்தல் (WAHA Session Check)
WAHA Engine இயங்கிக் கொண்டிருப்பதை உறுதி செய்து கொள்ளவும்:

```bash
docker ps | grep waha
```
- WAHA நின்று போயிருந்தால்: `docker start waha` அல்லது docker-compose வழியே இயக்கவும்.
- முந்தைய தேவையற்ற பழைய session தொந்தரவு தராமல் இருக்க, Beauty Books World-ன் WhatsApp session சரியாக இணைக்கப்பட்டுள்ளதா (Connected status) என WAHA Dashboard (http://localhost:3000) வழியே உறுதி செய்யவும்.

---

## 3. Frontend-ஐ Live ஆக்குவதற்கு செய்ய வேண்டியவை (Frontend Live Steps)

Frontend என்பது ஒரு **React (Vite) Single Page Application**. இதனை Live ஆக்க இரண்டு வழிகள் உள்ளன:

---

### முறை A: Vercel / Netlify வழியாக Live ஆக்குதல் (மிகவும் பரிந்துரைக்கப்படுவது - Recommended)
1. **GitHub Repository-ஐ இணைக்கவும்:**
   - நாம் இப்போது மாற்றங்களை `git@github.com:BuildStart-io/beauty_books_world-customization.git`-க்கு push செய்துவிட்டோம்.
   - [Vercel.com](https://vercel.com) அல்லது [Netlify.com](https://netlify.com)-ல் Login செய்து **New Project** கொடுக்கவும்.
   - இந்த GitHub repository-ஐ தேர்ந்தெடுக்கவும்.

2. **Project Settings அமைக்கவும்:**
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

3. **Environment Variables (சுற்றுச்சூழல் மாறிகள்) சேர்க்கவும்:**
   Vercel / Netlify-ன் Environment Settings-ல் கீழ்வரும் மாறிகளை உள்ளிடவும்:
   ```env
   VITE_SUPABASE_URL=https://<your-live-backend-domain-or-ip>:8000
   VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
   VITE_SUPABASE_PROJECT_ID=beauty_books_world
   ```
4. **Deploy கிளிக் செய்யவும்:** 2 நிமிடங்களில் உங்களது frontend அதிவேகமாக Live ஆகிவிடும்!

---

### முறை B: உங்கள் சொந்த Linux Server-லேயே Production Build செய்து Live ஆக்குதல் (Self-Hosted Nginx / PM2)

#### 1. Dependencies நிறுவி Production Bundle உருவாக்கவும்:
```bash
cd /home/kapilash/Documents/bbw/frontend

# .env கோப்பை உருவாக்கவும் (இல்லையெனில்)
cp .env.example .env
nano .env  # இதில் உங்கள் நேரடி Backend URL மற்றும் ANON KEY-ஐ இடவும்

# Dependencies நிறுவி compile செய்யவும்
npm install
npm run build
```
*(வெற்றிகரமாக முடிந்ததும் `frontend/dist/` என்ற folder உருவாகும்).*

#### 2. PM2 மூலமாக background-ல் இயக்க:
```bash
sudo npm install -g serve pm2

# dist folder-ஐ port 8080-ல் நிரந்தரமாக இயக்க:
pm2 start "serve -s dist -l 8080" --name "bbw-frontend"
pm2 save
pm2 startup
```

#### 3. அல்லது Nginx Reverse Proxy பயன்படுத்தினால்:
Nginx configuration (`/etc/nginx/sites-available/bbw`)-ல்:
```nginx
server {
    listen 80;
    server_name bbw.yourdomain.com;

    root /home/kapilash/Documents/bbw/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
Configuration-ஐ reload செய்யவும்: `sudo systemctl reload nginx`.

---

## 4. எல்லாம் சரியாக இயங்குகிறதா என சோதிக்கும் முறை (End-to-End Testing Checklist)

| சோதனை (Test Item) | எவ்வாறு சோதிப்பது (How to Test) | எதிர்பார்க்கப்படும் முடிவு (Expected Result) |
|---|---|---|
| **1. Product PDF / Audio Upload** | Frontend-ல் `Products` சென்று ஒரு புத்தகத்திற்கு PDF மற்றும் MP3 பதிவேற்றி Save செய்யவும். | Product Card & Table-ல் நீல நிற **PDF** மற்றும் மஞ்சள் நிற **Audio** Badge தெரிய வேண்டும். |
| **2. Consultative AI Chat** | வாடிக்கையாளர் எண்ணிலிருந்து WhatsApp-ல் *"Hi, I want beauty books"* என அனுப்பவும். | AI வரிசையாக (Consultative Sequence) பதிலளித்து, புத்தகத்தின் பயன்களைக் கேட்க வேண்டும். |
| **3. PDF / Voice Request** | *"Can you send brochure or details?"* என கேட்கவும். | WhatsApp-ல் உடனேயே PDF Document பதிவிறக்கம் செய்யக் கிடைக்க வேண்டும். |
| **4. Private Branding (Bot Always Active)** | *"I want private branding with my company logo"* எனக் கூறவும். | Bot **inactive ஆகக்கூடாது**! *"Our sales team will contact you shortly"* எனக் கூறிவிட்டு முகவரி கேட்க வேண்டும். |
| **5. Order Creation & Orders Tab** | வாடிக்கையாளர் பெயர், முகவரி, போன் நம்பர் அனுப்பவும். | **Orders Tab**-ல் உடனடியாக அந்த Order தோன்ற வேண்டும்! அதில் **`Branding (LKR 5,000)`** மற்றும் **`Manual Follow-Up`** Badge தெளிவாகக் காட்டப்பட வேண்டும். |
| **6. Bank Details Accuracy** | Payment விவரங்கள் கேட்கவும். | அதிகாரப்பூர்வ Bank Account மட்டுமே வர வேண்டும், தவறான அல்லது போலி எண்கள் எக்காரணம் கொண்டும் வரக்கூடாது. |
