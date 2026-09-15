// ═══════════════════════════════════════════════════════════════
//  Aadhif's Wood Pressed Oils
//  Cashfree Payment + WhatsApp + Admin Management Server
// ═══════════════════════════════════════════════════════════════

const nodemailer     = require('nodemailer');
const multer         = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Email Setup ─────────────────────────────────
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

// ── Cashfree Config ─────────────────────────────
const CF_APP_ID   = process.env.CASHFREE_APP_ID;
const CF_SECRET   = process.env.CASHFREE_SECRET_KEY;
const CF_ENV      = process.env.CASHFREE_ENV || 'TEST';
const CF_BASE_URL = CF_ENV === 'PROD'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

// ── Admin Config ────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const adminSessions  = new Set(); // in-memory session tokens

// ── Data Directories & Files ────────────────────
const DATA_DIR      = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');
const UPLOAD_DIR    = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadProductsData() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) {
      const defaults = { products: [] };
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error loading products:', e.message);
    return { products: [] };
  }
}

function saveProductsData(data) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadOrdersData() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) {
      const defaults = { orders: [] };
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error loading orders:', e.message);
    return { orders: [] };
  }
}

function saveOrderRecord(order) {
  try {
    const data = loadOrdersData();
    const idx  = data.orders.findIndex(o => o.orderId === order.orderId);
    if (idx >= 0) {
      data.orders[idx] = { ...data.orders[idx], ...order, updatedAt: new Date().toISOString() };
    } else {
      data.orders.unshift({ ...order, recordedAt: new Date().toISOString() });
    }
    // keep last 500 orders
    if (data.orders.length > 500) data.orders = data.orders.slice(0, 500);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving order record:', e.message);
  }
}

// Build dynamic PRICE table from products.json
function buildPrices() {
  const { products } = loadProductsData();
  const prices = {};
  products.forEach(p => {
    if (!p.variants) return;
    p.variants.forEach(v => {
      // E.g. "Groundnut Oil 250ml": 82
      prices[`${p.name} ${v.size}`] = Number(v.price);
    });
  });
  return prices;
}

// ── In-Memory Active Orders (for pending payment session) ──
const pendingOrders = {};

// ── Multer Image Upload ─────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `product-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WebP, etc.) are allowed'));
    }
  }
});

// ── Middlewares ─────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin Authentication Middleware
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized — Please login to access admin panel' });
  }
  next();
}

// ── Shipping Calculation ────────────────────────
function calcShipping(subtotal) {
  return subtotal >= 499 ? 0 : 60;
}

// ── Order ID Generator ──────────────────────────
function generateOrderId() {
  return 'AADHIF_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ── Meta injection for index.html ───────────────
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.send('Website under maintenance');
  }
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace('<head>', `<head>\n<meta name="cf-env" content="${CF_ENV}">`);
  res.send(html);
});

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════════════════════
//  PUBLIC API: Get Products
//  GET /api/products
// ════════════════════════════════════════════════
app.get('/api/products', (_req, res) => {
  const { products } = loadProductsData();
  res.json({ success: true, products });
});

// ════════════════════════════════════════════════
//  ADMIN API: Auth Routes
// ════════════════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Incorrect admin password' });
  }
  const token = uuidv4();
  adminSessions.add(token);
  res.json({ success: true, token });
});

app.get('/api/admin/check-auth', requireAdmin, (_req, res) => {
  res.json({ success: true, message: 'Authenticated' });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  adminSessions.delete(req.headers['x-admin-token']);
  res.json({ success: true, message: 'Logged out successfully' });
});

// ════════════════════════════════════════════════
//  ADMIN API: Product Management CRUD
// ════════════════════════════════════════════════

// Get all products (admin view)
app.get('/api/admin/products', requireAdmin, (_req, res) => {
  const data = loadProductsData();
  res.json({ success: true, products: data.products });
});

// Add a new product card
app.post('/api/admin/products', requireAdmin, upload.single('image'), (req, res) => {
  try {
    const { name, category, emoji, subtitle, description, variants, inStock, featured, imageUrl } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }

    let parsedVariants = [];
    try {
      parsedVariants = typeof variants === 'string' ? JSON.parse(variants || '[]') : (variants || []);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid variants format' });
    }

    // Ensure variants have size and numeric price
    parsedVariants = parsedVariants.map(v => ({
      size: (v.size || '').trim(),
      price: Number(v.price) || 0
    })).filter(v => v.size && v.price > 0);

    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    } else if (imageUrl && imageUrl.trim()) {
      imagePath = imageUrl.trim();
    }

    const data = loadProductsData();
    const newProduct = {
      id:          'prod_' + uuidv4().slice(0, 8),
      name:        name.trim(),
      category:    (category || 'Oils').trim(),
      emoji:       (emoji || '🛢️').trim(),
      subtitle:    (subtitle || '').trim(),
      description: (description || '').trim(),
      image:       imagePath,
      variants:    parsedVariants,
      inStock:     inStock === true || inStock === 'true',
      featured:    featured === true || featured === 'true',
      createdAt:   new Date().toISOString()
    };

    data.products.push(newProduct);
    saveProductsData(data);

    console.log(`✅ [ADMIN] Added product: ${newProduct.name} (${newProduct.id})`);
    res.json({ success: true, product: newProduct });
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update an existing product
app.put('/api/admin/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  try {
    const { id } = req.params;
    const data   = loadProductsData();
    const idx    = data.products.findIndex(p => p.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const existing = data.products[idx];
    const { name, category, emoji, subtitle, description, variants, inStock, featured, imageUrl, removeImage } = req.body;

    let parsedVariants = existing.variants;
    if (variants !== undefined) {
      try {
        const raw = typeof variants === 'string' ? JSON.parse(variants) : variants;
        parsedVariants = raw.map(v => ({
          size: (v.size || '').trim(),
          price: Number(v.price) || 0
        })).filter(v => v.size && v.price > 0);
      } catch (e) {}
    }

    // Determine image
    let image = existing.image;
    if (req.file) {
      // If previous was a local uploaded file, clean it up
      if (existing.image && existing.image.startsWith('/uploads/')) {
        const oldFile = path.join(__dirname, 'public', existing.image);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      image = `/uploads/${req.file.filename}`;
    } else if (imageUrl && imageUrl.trim()) {
      image = imageUrl.trim();
    } else if (removeImage === 'true') {
      if (existing.image && existing.image.startsWith('/uploads/')) {
        const oldFile = path.join(__dirname, 'public', existing.image);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      image = null;
    }

    data.products[idx] = {
      ...existing,
      name:        name !== undefined ? name.trim() : existing.name,
      category:    category !== undefined ? category.trim() : existing.category,
      emoji:       emoji !== undefined ? emoji.trim() : existing.emoji,
      subtitle:    subtitle !== undefined ? subtitle.trim() : existing.subtitle,
      description: description !== undefined ? description.trim() : existing.description,
      image,
      variants:    parsedVariants,
      inStock:     inStock !== undefined ? (inStock === true || inStock === 'true') : existing.inStock,
      featured:    featured !== undefined ? (featured === true || featured === 'true') : existing.featured,
      updatedAt:   new Date().toISOString()
    };

    saveProductsData(data);
    console.log(`✏️ [ADMIN] Updated product: ${data.products[idx].name}`);
    res.json({ success: true, product: data.products[idx] });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Quick toggle stock status
app.patch('/api/admin/products/:id/toggle-stock', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const data   = loadProductsData();
    const idx    = data.products.findIndex(p => p.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    data.products[idx].inStock = !data.products[idx].inStock;
    data.products[idx].updatedAt = new Date().toISOString();
    saveProductsData(data);

    res.json({ success: true, inStock: data.products[idx].inStock, product: data.products[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete product
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const data   = loadProductsData();
    const idx    = data.products.findIndex(p => p.id === id);

    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const prod = data.products[idx];
    if (prod.image && prod.image.startsWith('/uploads/')) {
      const f = path.join(__dirname, 'public', prod.image);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    data.products.splice(idx, 1);
    saveProductsData(data);

    console.log(`🗑️ [ADMIN] Deleted product: ${prod.name}`);
    res.json({ success: true, message: `Deleted ${prod.name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════
//  ADMIN API: Orders & Dashboard Stats
// ════════════════════════════════════════════════
app.get('/api/admin/orders', requireAdmin, (_req, res) => {
  const data = loadOrdersData();
  res.json({ success: true, orders: data.orders });
});

app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  const pData = loadProductsData();
  const oData = loadOrdersData();
  const products = pData.products || [];
  const orders   = oData.orders || [];

  const inStockCount = products.filter(p => p.inStock).length;
  const totalRevenue = orders.filter(o => o.status === 'PAID').reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  res.json({
    success: true,
    stats: {
      totalProducts: products.length,
      inStockCount,
      outOfStockCount: products.length - inStockCount,
      totalOrders: orders.length,
      paidOrders: orders.filter(o => o.status === 'PAID').length,
      totalRevenue,
      cashfreeEnv: CF_ENV,
      port: PORT
    }
  });
});

// ════════════════════════════════════════════════
//  PUBLIC API: Payment & Orders (Cashfree)
// ════════════════════════════════════════════════

app.post('/api/create-order', async (req, res) => {
  try {
    const { items, customer } = req.body;

    if (!customer?.name || !customer?.phone || !customer?.address || !customer?.pincode) {
      return res.status(400).json({ success: false, message: 'Please fill all customer details' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const PRICES = buildPrices();

    const sanitisedItems = items.map(item => {
      const price = PRICES[item.name] || Number(item.price);
      if (!price) throw new Error(`Unknown or unpriced product: ${item.name}`);
      return {
        ...item,
        price,
        qty: Math.max(1, parseInt(item.qty) || 1)
      };
    });

    const subtotal = sanitisedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const shipping = calcShipping(subtotal);
    const total    = subtotal + shipping;
    const orderId  = generateOrderId();

    let paymentSessionId = null;

    // Call Cashfree API if keys configured
    if (CF_APP_ID && CF_APP_ID !== 'YOUR_CASHFREE_APP_ID') {
      const cfResponse = await axios.post(
        `${CF_BASE_URL}/orders`,
        {
          order_id:       orderId,
          order_amount:   total,
          order_currency: 'INR',
          customer_details: {
            customer_id:    customer.phone.replace(/[^0-9]/g, '') || 'cust_' + Date.now(),
            customer_name:  customer.name,
            customer_phone: customer.phone,
            customer_email: customer.email || 'customer@aadhifsoils.com',
          },
          order_meta: {
            return_url: `${process.env.WEBSITE_URL || 'http://localhost:' + PORT}/payment-success?order_id={order_id}`,
            notify_url: `${process.env.WEBSITE_URL || 'http://localhost:' + PORT}/api/webhook`,
          },
          order_note: `Aadhif's Oils — ${sanitisedItems.map(i => i.name).join(', ')}`,
        },
        {
          headers: {
            'x-api-version':   '2023-08-01',
            'x-client-id':     CF_APP_ID,
            'x-client-secret': CF_SECRET,
            'Content-Type':    'application/json',
          }
        }
      );
      paymentSessionId = cfResponse.data.payment_session_id;
    } else {
      // Mock session for local development/testing without real keys
      paymentSessionId = 'sandbox_session_' + Date.now();
      console.log(`ℹ️ [TEST MODE] Using mock payment session for Order: ${orderId}`);
    }

    const orderRecord = {
      orderId,
      items: sanitisedItems,
      customer,
      subtotal,
      shipping,
      total,
      paymentSessionId,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    pendingOrders[orderId] = orderRecord;
    saveOrderRecord(orderRecord);

    console.log(`📦 Order created: ${orderId} — ₹${total}`);
    res.json({
      success: true,
      orderId,
      paymentSessionId,
      total,
      isMock: !CF_APP_ID || CF_APP_ID === 'YOUR_CASHFREE_APP_ID'
    });

  } catch (err) {
    console.error('Create order error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Order setup failed: ' + (err.response?.data?.message || err.message) });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  try {
    const { orderId } = req.body;
    let paymentId = 'PAY_' + Date.now();
    let isSuccess = false;

    if (CF_APP_ID && CF_APP_ID !== 'YOUR_CASHFREE_APP_ID') {
      const cfResponse = await axios.get(
        `${CF_BASE_URL}/orders/${orderId}/payments`,
        {
          headers: {
            'x-api-version':   '2023-08-01',
            'x-client-id':     CF_APP_ID,
            'x-client-secret': CF_SECRET
          }
        }
      );
      const payments       = cfResponse.data;
      const successPayment = payments.find(p => p.payment_status === 'SUCCESS');
      if (successPayment) {
        isSuccess = true;
        paymentId = successPayment.cf_payment_id;
      }
    } else {
      // Allow testing flow in mock mode
      isSuccess = true;
    }

    if (!isSuccess) {
      return res.json({ success: false, message: 'Payment not completed yet' });
    }

    const order = pendingOrders[orderId] || { orderId };
    order.paymentId = paymentId;
    order.status    = 'PAID';
    order.paidAt    = new Date().toISOString();

    saveOrderRecord(order);
    await sendWhatsAppNotification(order);
    delete pendingOrders[orderId];

    res.json({ success: true, paymentId });
  } catch (err) {
    console.error('Verify payment error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// Cashfree Webhook
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody   = req.body.toString();
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (CF_SECRET && CF_SECRET !== 'YOUR_CASHFREE_SECRET_KEY') {
      const signedPayload = timestamp + rawBody;
      const expectedSig   = crypto.createHmac('sha256', CF_SECRET).update(signedPayload).digest('base64');
      if (signature !== expectedSig) {
        console.warn('⚠️ Invalid webhook signature');
        return res.status(401).send('Invalid signature');
      }
    }

    const event = JSON.parse(rawBody);
    console.log('📡 Webhook received:', event.type);

    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId = event.data.order.order_id;
      const order   = pendingOrders[orderId] || { orderId };

      order.paymentId = event.data.payment.cf_payment_id;
      order.status    = 'PAID';
      order.paidAt    = new Date().toISOString();

      saveOrderRecord(order);
      await sendWhatsAppNotification(order);

      if (EMAIL_USER && EMAIL_USER !== 'your@gmail.com') {
        await transporter.sendMail({
          from:    EMAIL_USER,
          to:      'aadhifshomemade@gmail.com',
          subject: `New Paid Order - ${order.orderId}`,
          text:    `Order ID: ${order.orderId}\n\nCustomer: ${order.customer?.name || 'Customer'}\nPhone: ${order.customer?.phone || 'N/A'}\nAddress: ${order.customer?.address || 'N/A'}\nPincode: ${order.customer?.pincode || 'N/A'}\n\nTotal: ₹${order.total}\nPayment ID: ${order.paymentId}\nStatus: PAID`
        }).catch(e => console.error('Email error:', e.message));
      }

      delete pendingOrders[orderId];
      console.log(`✅ Payment confirmed via webhook for order ${orderId}`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).send('Error');
  }
});

// WhatsApp Notification Helper
function buildWhatsAppMessage(order) {
  const now  = new Date();
  const date = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  let msg = `🌿 *New Order — Aadhif's Wood Pressed Oils*\n`;
  msg += `─────────────────────────\n`;
  msg += `🆔 Order ID: *${order.orderId}*\n📅 ${date} 🕐 ${time}\n`;
  msg += `─────────────────────────\n👤 *Customer Details:*\n`;
  msg += `Name: ${order.customer?.name || 'Customer'}\nPhone: ${order.customer?.phone || ''}\n`;
  msg += `Address: ${order.customer?.address || ''}\nPincode: ${order.customer?.pincode || ''}\n`;
  msg += `─────────────────────────\n🛒 *Order Details:*\n\n`;

  if (order.items && order.items.length) {
    order.items.forEach((item, i) => {
      msg += `${i + 1}. ${item.emoji || '🛢️'} *${item.name}*\n`;
      msg += `   Qty: ${item.qty} × ₹${item.price} = *₹${item.price * item.qty}*\n\n`;
    });
  }

  msg += `─────────────────────────\n`;
  msg += order.shipping > 0 ? `🚚 Shipping: ₹${order.shipping}\n` : `🚚 Shipping: *FREE* ✅\n`;
  msg += `💰 *Total Paid: ₹${order.total}*\n`;
  msg += `─────────────────────────\n✅ *Payment Status: CONFIRMED*\n`;
  msg += `🔐 Payment ID: ${order.paymentId || 'N/A'}\n─────────────────────────\n`;
  msg += `_Please ship at the earliest. Thank you!_ 🙏`;

  return msg;
}

async function sendWhatsAppNotification(order) {
  try {
    const message = buildWhatsAppMessage(order);
    const phone   = process.env.OWNER_WHATSAPP || '919500887900';
    const waUrl   = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    console.log(`📲 WhatsApp order link ready: ${waUrl}`);
  } catch (err) {
    console.error('WhatsApp notification error:', err.message);
  }
}

// ── Specific Views ──────────────────────────────
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/payment-success', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// ── Health Check ────────────────────────────────
app.get('/health', (_req, res) => {
  const { products } = loadProductsData();
  res.json({
    status: 'ok',
    business: process.env.BUSINESS_NAME || "Aadhif's Wood Pressed Oils",
    cashfree_env: CF_ENV,
    total_products: products.length
  });
});

// ── Fallback ────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ────────────────────────────────
app.listen(PORT, () => {
  const { products } = loadProductsData();
  console.log(`
╔════════════════════════════════════════════════════════╗
║   🌿 Aadhif's Wood Pressed Oils                        ║
║   Storefront : http://localhost:${PORT}                    ║
║   Admin Panel: http://localhost:${PORT}/admin               ║
║   Cashfree   : ${CF_ENV} MODE                         ║
║   Products   : ${products.length} active in catalog                  ║
╚════════════════════════════════════════════════════════╝
  `);
});
