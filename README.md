# 💳 Payvora — M-Pesa Payment Dashboard & SMS Automation Engine

Payvora (also known as Paykit) is a production-ready, full-stack payment management platform built for modern Kenyan businesses. It provides real-time M-Pesa collection tracking, automated C2B Buy Goods/Till reconciliation, STK Push initiation, and an automated customer SMS receipt engine with multi-provider support.

---

## 🌟 Key Features

* **⚡ Real-Time Payment Dashboard**: Live polling (every 10s) with key financial metrics (Today, Yesterday, Week, Month, Year, and Total Revenue).
* **📊 Analytics & Visualizations**: Interactive revenue trends (Hourly, 7-Day, 30-Day, Yearly) and transaction status distributions powered by Recharts.
* **📱 M-Pesa Integration (Safaricom Daraja API)**:
  * **STK Push (LIPA NA M-PESA Online)**: Trigger STK push payment prompts directly to customer mobile numbers.
  * **C2B Callbacks**: Webhook confirmation (`/api/payments/c2b/confirmation`) & validation endpoints for automatic Paybill & Buy Goods Till collection.
  * **Status Reconciliation**: Automatic status verification (`/mpesa/stkpushquery/v1/query`) for pending transactions.
* **💬 Automated SMS Receipts & Marketing**:
  * **Range-Based Rules**: Define payment amount brackets with customized message templates.
  * **Dynamic Placeholders**: `{customer_name}`, `{phone}`, `{amount}`, `{transaction_code}`, `{date}`, `{business_name}`.
  * **Multi-Provider Dispatch**: Integrated with Onfon Media, Africa's Talking, Safaricom Daraja SMS, and custom HTTP providers.
  * **Hashed MSISDN Support**: Special handling for 64-character SHA-256 hex hashes sent in C2B callbacks to ensure intact delivery via Onfon/Safaricom.
* **🛠️ Developer Debug Tools**: Built-in C2B transaction simulator, diagnostic endpoints, and webhook audit log views.

---

## 🛠️ Technology Stack

* **Frontend & Full-Stack SSR**: React 19, TypeScript, TanStack Start (`@tanstack/react-start`), TanStack Router
* **Build System**: Vite 7 with custom dev-server M-Pesa webhook middleware
* **Styling**: Tailwind CSS v4, custom glassmorphic dark design system, Lucide React icons, Radix UI primitives
* **Database & ORM**: PostgreSQL via Drizzle ORM (`drizzle-orm`)
* **Auth & Security**: JWT session cookies (`jose`), `bcryptjs` password hashing

---

## ⚙️ Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database & Auth
DATABASE_URL="postgres://user:password@localhost:5432/payvora"
JWT_SECRET="your-secure-jwt-secret-key"

# M-Pesa Daraja Configuration
MPESA_ENVIRONMENT="sandbox" # "sandbox" or "production"
MPESA_CONSUMER_KEY="your_consumer_key"
MPESA_CONSUMER_SECRET="your_consumer_secret"
MPESA_PASSKEY="your_passkey"
MPESA_SHORTCODE="6270336"
MPESA_TILL_NUMBER="895858"
MPESA_CALLBACK_URL="https://your-public-domain.com"

# SMS Provider Configuration
SMS_PROVIDER="onfon" # "onfon" | "africastalking" | "safaricom" | "custom"
ONFON_API_KEY="your_onfon_api_key"
ONFON_CLIENT_ID="your_onfon_client_id"
ONFON_SENDER_ID="STAR_CODE"
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migrations
```bash
npx drizzle-kit push
```

### 3. Start Development Server with Tunnel & Auto C2B Registration
The included `start.sh` script launches the Vite dev server on port 8080, establishes an Ngrok HTTPS tunnel, updates `.env`, and registers your C2B URLs automatically with Safaricom Daraja:

```bash
bash start.sh
```

Alternatively, run Vite directly:
```bash
npm run dev
```

---

## 📦 Production Deployment

Payvora includes built-in adapters for multiple deployment targets:

* **Standalone Node Server / Render**: `node api/render-server.js` (serves static assets from `dist/client` and delegates SSR/API requests).
* **Vercel Serverless**: Configured via `vercel.json` and `api/server.js` adapter.

---

## 📝 License

Private & Confidential — Mobosoft Enterprise HQ.
