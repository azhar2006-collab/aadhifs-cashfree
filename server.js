// ═══════════════════════════════════════════════
//  Aadhif's Wood Pressed Oils
//  Cashfree Payment + WhatsApp Notification
// ═══════════════════════════════════════════════
const nodemailer = require('nodemailer');

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// ── Cashfree Config ───────────────────────────
const CF_APP_ID   = process.env.CASHFREE_APP_ID;
const CF_SECRET   = process.env.CASHFREE_SECRET_KEY;
const CF_ENV      = process.env.CASHFREE_ENV || 'TEST';
const CF_BASE_URL = CF_ENV === 'PROD'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

// ── In-memory pending orders store ────────────
// (declared early so all routes can access it)
const pendingOrders = {};

// ── Middleware ────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Inject cf-env meta tag into index.html ────
// This tells the frontend JS which Cashfree mode to use (sandbox vs production)
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Inject meta tag right after <head>
  html = html.replace(
    '<head>',
    `<head>\n<meta name="cf-env" content="${CF_ENV}">`
  );
  res.send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Product Prices (server-side truth) ────────
const PRICES = {
   "Groundnut Oil 250ml": 82,
  'Groundnut Oil 500ml':  159,
  'Groundnut Oil 1L':     299,
  'Groundnut Oil 2L':     580,
  'Groundnut Oil 5L':    1400,
  'Gingelly Oil 250ml':   111,
  'Gingelly Oil 500ml':   219,
  'Gingelly Oil 1L':      420,
  'Gingelly Oil 2L':      820,
  'Gingelly Oil 5L':     2000,
   'Coconut Oil 250ml':    120,
  'Coconut Oil 500ml':    239,
  'Coconut Oil 1L':       450,
  'Coconut Oil 2L':       880,
  'Coconut Oil 5L':      2150,
  'Pure Desi Ghee 250ml':      369,
  'Pure Desi Ghee 500ml':      699,
  'Pure Desi Ghee 1L':        1349,
};

// ── Shipping ──────────────────────────────────
function calcShipping(subtotal) {
  return subtotal >= 499 ? 0 : 60;
}

// ── Generate Order ID ─────────────────────────
function generateOrderId() {
  return 'AADHIF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5).toUpperCase();
}

// ── Build WhatsApp Message ────────────────────
function buildWhatsAppMessage(order) {
  const now  = new Date();
  const date = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  let msg = `🌿 *New Order — Aadhif's Wood Pressed Oils*\n`;
  msg += `─────────────────────────\n`;
  msg += `🆔 Order ID: *${order.orderId}*\n`;
  msg += `📅 ${date} 🕐 ${time}\n`;
  msg += `─────────────────────────\n`;
  msg += `👤 *Customer Details:*\n`;
  msg += `Name: ${order.customer.name}\n`;
  msg += `Phone: ${order.customer.phone}\n`;
  msg += `Address: ${order.customer.address}\n`;
  msg += `Pincode: ${order.customer.pincode}\n`;
  msg += `─────────────────────────\n`;
  msg += `🛒 *Order Details:*\n\n`;

  order.items.forEach((item, i) => {
    msg += `${i + 1}. ${item.emoji || '🛢️'} *${item.name}*\n`;
    msg += `   Qty: ${item.qty} × ₹${item.price} = *₹${item.price * item.qty}*\n\n`;
  });

  msg += `─────────────────────────\n`;
  if (order.shipping > 0) {
    msg += `🚚 Shipping: ₹${order.shipping}\n`;
  } else {
    msg += `🚚 Shipping: *FREE* ✅\n`;
  }
  msg += `💰 *Total Paid: ₹${order.total}*\n`;
  msg += `─────────────────────────\n`;
  msg += `✅ *Payment Status: CONFIRMED*\n`;
  msg += `🔐 Payment ID: ${order.paymentId}\n`;
  msg += `─────────────────────────\n`;
  msg += `_Please ship at the earliest. Thank you!_ 🙏`;

  return msg;
}

// ════════════════════════════════════════════════
//  API 1: Create Cashfree Order
//  POST /api/create-order
// ════════════════════════════════════════════════
app.post('/api/create-order', async (req, res) => {
  try {
    const { items, customer } = req.body;

    // Validate customer details
    if (!customer?.name || !customer?.phone || !customer?.address || !customer?.pincode) {
      return res.status(400).json({ success: false, message: 'Please fill all customer details' });
    }

    // Validate & recalculate prices server-side
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const sanitisedItems = items.map(item => {
      const price = PRICES[item.name];
      if (!price) throw new Error(`Unknown product: ${item.name}`);
      return { ...item, price, qty: Math.max(1, parseInt(item.qty) || 1) };
    });

    const subtotal = sanitisedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const shipping = calcShipping(subtotal);
    const total    = subtotal + shipping;
    const orderId  = generateOrderId();

    // Create order on Cashfree
    const cfResponse = await axios.post(
      `${CF_BASE_URL}/orders`,
      {
        order_id:       orderId,
        order_amount:   total,
        order_currency: 'INR',
        customer_details: {
          customer_id:    customer.phone,
          customer_name:  customer.name,
          customer_phone: customer.phone,
          customer_email: customer.email || 'customer@aadhifsoils.com',
        },
        order_meta: {
          return_url: `${process.env.WEBSITE_URL}/payment-success?order_id={order_id}`,
          notify_url: `${process.env.WEBSITE_URL}/api/webhook`,
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

    const { payment_session_id } = cfResponse.data;

    // Store order temporarily in memory (for webhook lookup)
    pendingOrders[orderId] = {
      orderId,
      items: sanitisedItems,
      customer,
      subtotal,
      shipping,
      total,
      paymentSessionId: payment_session_id,
      createdAt: new Date().toISOString(),
    };

    console.log(`📦 Order created: ${orderId} — ₹${total}`);

    res.json({
      success: true,
      orderId,
      paymentSessionId: payment_session_id,
      total,
    });

  } catch (err) {
    console.error('Create order error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Payment setup failed. Please try again.' });
  }
});

// ════════════════════════════════════════════════
//  API 2: Verify Payment
//  POST /api/verify-payment
// ════════════════════════════════════════════════
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { orderId } = req.body;

    // Check payment status on Cashfree
    const cfResponse = await axios.get(
      `${CF_BASE_URL}/orders/${orderId}/payments`,
      {
        headers: {
          'x-api-version':   '2023-08-01',
          'x-client-id':     CF_APP_ID,
          'x-client-secret': CF_SECRET,
        }
      }
    );

    const payments       = cfResponse.data;
    const successPayment = payments.find(p => p.payment_status === 'SUCCESS');

    if (!successPayment) {
      return res.json({ success: false, message: 'Payment not completed yet' });
    }

    // Get order details
    const order = pendingOrders[orderId];
    if (order) {
      order.paymentId = successPayment.cf_payment_id;

      // Send WhatsApp notification to owner
      await sendWhatsAppNotification(order);

      // Clean up
      delete pendingOrders[orderId];
    }

    res.json({ success: true, paymentId: successPayment.cf_payment_id });

  } catch (err) {
    console.error('Verify payment error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// ════════════════════════════════════════════════
//  API 3: Cashfree Webhook
//  POST /api/webhook
//  Cashfree calls this automatically on payment
// ════════════════════════════════════════════════
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody   = req.body.toString();
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    // Verify webhook signature
    const signedPayload = timestamp + rawBody;
    const expectedSig   = crypto
      .createHmac('sha256', CF_SECRET)
      .update(signedPayload)
      .digest('base64');

    if (signature !== expectedSig) {
      console.warn('⚠️ Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(rawBody);
    console.log('📡 Webhook received:', event.type);

    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId = event.data.order.order_id;
      const order   = pendingOrders[orderId];

      if (order) {
        order.paymentId = event.data.payment.cf_payment_id;
        await sendWhatsAppNotification(order);
        await transporter.sendMail({
  from: EMAIL_USER,
  to: 'aadhifshomemade@gmail.com',
  subject: `New Paid Order - ${order.orderId}`,
  text: `
Order ID: ${order.orderId}

Customer Name: ${order.customer.name}
Phone: ${order.customer.phone}
Address: ${order.customer.address}
Pincode: ${order.customer.pincode}

Total Amount: ₹${order.total}

Payment ID: ${order.paymentId}

Payment Status: PAID
`
});
        delete pendingOrders[orderId];
        console.log(`✅ Payment confirmed via webhook for order ${orderId}`);
      }
    }

    res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).send('Error');
  }
});

// ════════════════════════════════════════════════
//  WhatsApp Notification
// ════════════════════════════════════════════════
async function sendWhatsAppNotification(order) {
  try {
    const message = buildWhatsAppMessage(order);
    const waUrl   = `https://api.whatsapp.com/send?phone=${process.env.OWNER_WHATSAPP}&text=${encodeURIComponent(message)}`;
    console.log(`📲 WhatsApp notification ready for order ${order.orderId}`);
    console.log(`   WA Link: ${waUrl}`);
    // Note: This logs the link. For auto-sending, integrate WhatsApp Business API.
  } catch (err) {
    console.error('WhatsApp notification error:', err.message);
  }
}

// ── Payment Success Page ──────────────────────
app.get('/payment-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// ── Health Check ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    business: process.env.BUSINESS_NAME,
    cashfree_env: CF_ENV,
  });
});

// ── Serve index.html for all other routes ─────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ──────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🌿 Aadhif's Wood Pressed Oils          ║
║   Running on http://localhost:${PORT}        ║
║   Cashfree: ${CF_ENV} MODE                   ║
╚═══════════════════════════════════════════╝
  `);
});
