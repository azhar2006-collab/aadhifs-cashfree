# 🌿 Aadhif's Wood Pressed Oils — Full-Stack E-Commerce

A complete Node.js e-commerce website for **Aadhif's Wood Pressed Oils** with Cashfree Payment Gateway, Admin Product Management Panel, WhatsApp notifications, and email order alerts.

## 🌐 Live Demo
> Deploy on Render — see deployment guide below

---

## ✨ Features

### 🛒 Storefront
- Beautiful product catalog with dynamic loading from admin
- Size variant selector (250ml / 500ml / 1L / 2L / 5L) with live price update
- Shopping cart with shipping calculation (Free above ₹499)
- Secure checkout powered by **Cashfree Payment Gateway**
- Payment success screen with order summary
- WhatsApp order confirmation + Gmail email notification

### 🔧 Admin Dashboard (`/admin`)
- Secure password-protected login
- **Add / Edit / Delete Product Cards** with:
  - Product name, category, emoji icon, subtitle
  - Image upload from device OR paste an image URL
  - Multiple size variants with custom prices (₹)
  - In-Stock / Out-of-Stock toggle
  - Feature on homepage toggle
- Real-time Stats: Total products, in-stock count, orders, payment mode
- Order history table with customer details
- Live sync to storefront — product changes reflect instantly

---

## 🚀 Deploy on Render (Free)

1. Fork / clone this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service → Connect repo
3. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add these **Environment Variables**:

```env
PORT=3000
WEBSITE_URL=https://YOUR-APP.onrender.com
ADMIN_PASSWORD=YourAdminPassword
CASHFREE_ENV=TEST
CASHFREE_APP_ID=your_cashfree_app_id
CASHFREE_SECRET_KEY=your_cashfree_secret_key
OWNER_WHATSAPP=919500887900
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_gmail_app_password
BUSINESS_NAME=Aadhif's Wood Pressed Oils
```

5. Deploy → Your site goes live!

---

## 💳 Cashfree Payment Setup

1. Create account at [merchant.cashfree.com](https://merchant.cashfree.com)
2. Go to **Developers → API Keys** → Copy TEST or PROD keys
3. Set `CASHFREE_ENV=TEST` for sandbox, `PROD` for live payments
4. Add webhook in Cashfree dashboard: `https://YOUR-APP.onrender.com/api/webhook`

### Test Card (Sandbox)
- Card: `4111 1111 1111 1111`
- Expiry: Any future date | CVV: Any

---

## 📁 Project Structure

```
├── server.js              # Express backend — API, admin, payments
├── package.json
├── data/
│   ├── products.json      # Product catalog (managed via admin)
│   └── orders.json        # Order history log
├── public/
│   ├── index.html         # Storefront
│   ├── admin.html         # Admin dashboard
│   ├── script-integration.js  # Cart + Cashfree payment JS
│   ├── success.html       # Payment success page
│   └── uploads/           # Uploaded product images
├── .env.example           # Environment variable template
└── .gitignore
```

---

## 🔗 URLs

| Page | Route |
|---|---|
| Storefront | `/` |
| Admin Panel | `/admin` |
| Payment Success | `/payment-success` |
| Health Check | `/health` |
| Products API | `/api/products` |

---

## 🧑‍💻 Local Development

```bash
git clone https://github.com/azhar2006-collab/aadhifs-cashfree.git
cd aadhifs-cashfree
cp .env.example .env       # Fill in your credentials
npm install
node server.js
# Open http://localhost:3000
# Admin: http://localhost:3000/admin (password: admin1234)
```

---

## 📞 Business Contact
**Aadhif's Wood Pressed Oils** | Velandipalayam, Coimbatore 641025  
📞 9500887900 | ✉️ aadhifshomemade@gmail.com

FSSAI: 12426003001014 | MSME Udyam Registered
