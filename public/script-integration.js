
// ═══════════════════════════════════════════════════════════
//  Aadhif's Wood Pressed Oils — Cashfree Payment Integration
//  Drop this file as: public/script-integration.js
// ═══════════════════════════════════════════════════════════

// ── Cart State ───────────────────────────────────────────────
let cart = [];

// ── Cart helpers ─────────────────────────────────────────────
function addToCart(btn) {
  const card  = btn.closest('.product-card');
  const name  = card.dataset.name;
  const price = parseInt(card.dataset.price);
  const emoji = card.dataset.emoji;
  addByName(name, price, emoji);
}

function addByName(name, price, emoji) {
  console.log("ADDING:", name, price);

  const existing = cart.find(i => i.name === name);

  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name, price, emoji, qty: 1 });
  }

  console.log("CART:", cart);

  renderCart();
  openCart();
  showToast('✅ Added — ' + name);
}

function changeQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  renderCart();
}

function calcSubtotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function calcShipping(subtotal) {
  return subtotal >= 499 ? 0 : 60;
}

function calcTotal() {
  const sub = calcSubtotal();
  return sub + calcShipping(sub);
}

// ── Render cart drawer ───────────────────────────────────────
function renderCart() {
  const itemsEl  = document.getElementById('cartItems');
  const emptyEl  = document.getElementById('cartEmpty');
  const footerEl = document.getElementById('cartFooter');
  const countEl  = document.getElementById('cartCount');
  const totalEl  = document.getElementById('cartTotal');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  countEl.textContent = totalQty;

  if (cart.length === 0) {
    emptyEl.style.display = '';
    footerEl.style.display = 'none';
    // Only append if it's not already inside itemsEl
    if (!itemsEl.contains(emptyEl)) {
      itemsEl.innerHTML = '';
      itemsEl.appendChild(emptyEl);
    }
    return;
  }
console.log("emptyEl =", emptyEl);
console.log("footerEl =", footerEl);

if (emptyEl) emptyEl.style.display = 'none';
if (footerEl) footerEl.style.display = '';

  const sub      = calcSubtotal();
  const shipping = calcShipping(sub);
  const total    = sub + shipping;

  // Build items HTML without touching emptyEl
  itemsEl.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item-img">${item.emoji}</div>
      <div style="flex:1;min-width:0;">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="changeQty(${i}, -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${i}, +1)">+</button>
      </div>
    </div>
  `).join('');

  let shippingLine = shipping === 0
    ? '<span style="color:var(--forest);font-size:12px;font-weight:500;">🚚 FREE shipping</span>'
    : `<span style="font-size:13px;color:var(--text-mid);">Shipping: ₹${shipping}</span>`;

  totalEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      ${shippingLine}
    </div>
    ₹${total.toLocaleString('en-IN')}
  `;
}

// ── Cart open/close ──────────────────────────────────────────
function openCart() {
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartDrawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartDrawer').classList.remove('open');
  document.body.style.overflow = '';
}

const cartBtn = document.getElementById('cartBtn');
if (cartBtn) cartBtn.addEventListener('click', openCart);

// ── Mobile nav ───────────────────────────────────────────────
function closeMobileNav() {
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('mobileNavOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

const menuBtn = document.getElementById('menuBtn');
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    document.getElementById('mobileNav').classList.add('open');
    document.getElementById('mobileNavOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  });
}

// ── Toast ────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Wishlist toggle ──────────────────────────────────────────
function toggleWish(btn) {
  btn.classList.toggle('active');
  btn.querySelector('svg').style.fill = btn.classList.contains('active') ? '#e53e3e' : 'none';
}

// ════════════════════════════════════════════════════════════
//  CASHFREE PAYMENT FLOW
// ════════════════════════════════════════════════════════════

function injectCustomerModal() {
  if (document.getElementById('cfCustomerModal')) return;

  const html = `
  <style>
    .cf-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      z-index: 600; display: flex; align-items: center; justify-content: center;
      padding: 16px; opacity: 0; pointer-events: none;
      transition: opacity 0.3s; backdrop-filter: blur(4px);
    }
    .cf-overlay.open { opacity: 1; pointer-events: all; }
    .cf-modal {
      background: #FDFAF2; border-radius: 20px; width: 100%;
      max-width: 460px; max-height: 94vh; overflow-y: auto;
      box-shadow: 0 24px 80px rgba(0,0,0,0.22);
      transform: scale(0.94) translateY(16px);
      transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
    }
    .cf-overlay.open .cf-modal { transform: scale(1) translateY(0); }
    .cf-header {
      background: linear-gradient(135deg, #1B4332 0%, #2D6A4F 60%, #40916C 100%);
      padding: 22px 24px 18px; border-radius: 20px 20px 0 0; position: relative;
    }
    .cf-header-close {
      position: absolute; top: 14px; right: 14px; width: 30px; height: 30px;
      background: rgba(255,255,255,0.15); border: none; border-radius: 50%;
      color: white; font-size: 15px; cursor: pointer; display: flex;
      align-items: center; justify-content: center; transition: background 0.2s;
    }
    .cf-header-close:hover { background: rgba(255,255,255,0.28); }
    .cf-header-title {
      font-family: 'Cormorant Garamond', serif; font-size: 22px;
      font-weight: 600; color: #fff; margin-bottom: 4px;
    }
    .cf-header-sub { font-size: 13px; color: rgba(255,255,255,0.75); }
    .cf-body { padding: 22px 24px; }
    .cf-order-summary {
      background: rgba(27,67,50,0.06); border: 1px solid rgba(27,67,50,0.13);
      border-radius: 12px; padding: 14px 16px; margin-bottom: 20px;
    }
    .cf-summary-label {
      font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: #7A7A62; margin-bottom: 10px;
    }
    .cf-summary-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
    .cf-summary-item {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 13px; color: #1A1A14;
    }
    .cf-summary-item span:last-child {
      font-family: 'Cormorant Garamond', serif; font-size: 16px;
      font-weight: 600; color: #1B4332;
    }
    .cf-summary-divider { height: 1px; background: rgba(27,67,50,0.13); margin: 8px 0; }
    .cf-summary-total { display: flex; justify-content: space-between; align-items: center; }
    .cf-summary-total-label { font-size: 14px; font-weight: 600; color: #1A1A14; }
    .cf-summary-total-val {
      font-family: 'Cormorant Garamond', serif; font-size: 26px;
      font-weight: 600; color: #1B4332;
    }
    .cf-form-group { margin-bottom: 16px; }
    .cf-label {
      display: block; font-size: 12px; font-weight: 600;
      color: #444438; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;
    }
    .cf-label span { color: #e53e3e; }
    .cf-input, .cf-textarea {
      width: 100%; border: 1.5px solid rgba(27,67,50,0.18);
      border-radius: 9px; padding: 11px 14px; font-family: 'DM Sans', sans-serif;
      font-size: 14px; color: #1A1A14; background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s; outline: none;
    }
    .cf-input:focus, .cf-textarea:focus {
      border-color: #1B4332; box-shadow: 0 0 0 3px rgba(27,67,50,0.1);
    }
    .cf-input.error { border-color: #e53e3e; }
    .cf-textarea { resize: vertical; min-height: 76px; }
    .cf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .cf-error-msg { font-size: 11.5px; color: #e53e3e; margin-top: 4px; display: none; }
    .cf-pay-btn {
      width: 100%; background: #1B4332; color: #F5F0E3;
      border: none; padding: 15px 20px; border-radius: 12px;
      font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      gap: 10px; transition: background 0.2s, transform 0.15s;
      letter-spacing: 0.03em; box-shadow: 0 4px 18px rgba(27,67,50,0.3); margin-top: 4px;
    }
    .cf-pay-btn:hover:not(:disabled) { background: #2D6A4F; transform: translateY(-2px); }
    .cf-pay-btn:disabled { background: #888; cursor: not-allowed; transform: none; box-shadow: none; }
    .cf-pay-btn .spinner {
      width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.35);
      border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .cf-secure-note {
      font-size: 11.5px; color: #7A7A62; text-align: center;
      margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 5px;
    }
    .cf-cancel-btn {
      width: 100%; background: transparent; color: #7A7A62;
      border: 1px solid rgba(27,67,50,0.18); padding: 11px; border-radius: 10px;
      font-family: 'DM Sans', sans-serif; font-size: 13px; cursor: pointer;
      transition: border-color 0.2s, color 0.2s; margin-top: 8px;
    }
    .cf-cancel-btn:hover { border-color: rgba(27,67,50,0.35); color: #1A1A14; }
    @media (max-width: 480px) {
      .cf-row { grid-template-columns: 1fr; gap: 0; }
      .cf-body { padding: 18px; }
      .cf-header { padding: 18px 18px 14px; }
    }
  </style>
  <div class="cf-overlay" id="cfCustomerModal" onclick="closeCfModalOnOverlay(event)">
    <div class="cf-modal">
      <div class="cf-header">
        <button class="cf-header-close" onclick="closeCfModal()">✕</button>
        <div class="cf-header-title">Complete Your Order</div>
        <div class="cf-header-sub">Secure payment powered by Cashfree</div>
      </div>
      <div class="cf-body">
        <div class="cf-order-summary">
          <div class="cf-summary-label">Order Summary</div>
          <div class="cf-summary-items" id="cfSummaryItems"></div>
          <div class="cf-summary-divider"></div>
          <div class="cf-summary-total">
            <span class="cf-summary-total-label">Total Payable</span>
            <span class="cf-summary-total-val" id="cfTotalVal">₹0</span>
          </div>
        </div>
        <div class="cf-form-group">
          <label class="cf-label">Full Name <span>*</span></label>
          <input class="cf-input" id="cfName" type="text" placeholder="Your full name" autocomplete="name">
          <div class="cf-error-msg" id="cfNameErr">Please enter your name</div>
        </div>
        <div class="cf-row">
          <div class="cf-form-group">
            <label class="cf-label">Phone <span>*</span></label>
            <input class="cf-input" id="cfPhone" type="tel" placeholder="10-digit mobile" maxlength="10" autocomplete="tel">
            <div class="cf-error-msg" id="cfPhoneErr">Valid 10-digit number required</div>
          </div>
          <div class="cf-form-group">
            <label class="cf-label">Pincode <span>*</span></label>
            <input class="cf-input" id="cfPincode" type="text" placeholder="6-digit pincode" maxlength="6">
            <div class="cf-error-msg" id="cfPincodeErr">Valid pincode required</div>
          </div>
        </div>
        <div class="cf-form-group">
          <label class="cf-label">Delivery Address <span>*</span></label>
          <textarea class="cf-textarea" id="cfAddress" placeholder="House No / Street / Area / District, Tamil Nadu"></textarea>
          <div class="cf-error-msg" id="cfAddressErr">Please enter your address</div>
        </div>
        <div class="cf-form-group">
          <label class="cf-label">Email (optional)</label>
          <input class="cf-input" id="cfEmail" type="email" placeholder="for order confirmation" autocomplete="email">
        </div>
        <button class="cf-pay-btn" id="cfPayBtn" onclick="initiateCashfreePayment()">
          🔒 Pay Securely — ₹<span id="cfPayBtnAmount">0</span>
        </button>
        <div class="cf-secure-note">🔒 100% secure · Powered by Cashfree</div>
        <button class="cf-cancel-btn" onclick="closeCfModal()">← Back to cart</button>
      </div>
    </div>
  </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

function openWaModal() {
  if (cart.length === 0) {
    showToast('🛒 Your cart is empty!');
    return;
  }
  injectCustomerModal();
  populateCfSummary();
  document.getElementById('cfCustomerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function populateCfSummary() {
  const sub      = calcSubtotal();
  const shipping = calcShipping(sub);
  const total    = sub + shipping;

  const itemsHtml = cart.map(item => `
    <div class="cf-summary-item">
      <span>${item.emoji} ${item.name} × ${item.qty}</span>
      <span>₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
    </div>
  `).join('');

  const shippingLine = shipping === 0
    ? `<div class="cf-summary-item"><span>🚚 Shipping</span><span style="color:#1B4332;font-size:13px;font-weight:600;">FREE</span></div>`
    : `<div class="cf-summary-item"><span>🚚 Shipping</span><span>₹${shipping}</span></div>`;

  document.getElementById('cfSummaryItems').innerHTML = itemsHtml + shippingLine;
  document.getElementById('cfTotalVal').textContent   = '₹' + total.toLocaleString('en-IN');
  document.getElementById('cfPayBtnAmount').textContent = total.toLocaleString('en-IN');
}

function closeCfModal() {
  const el = document.getElementById('cfCustomerModal');
  if (el) el.classList.remove('open');
  document.body.style.overflow = '';
}

function closeCfModalOnOverlay(e) {
  if (e.target.id === 'cfCustomerModal') closeCfModal();
}

// ── Form validation ──────────────────────────────────────────
function validateCfForm() {
  let valid = true;
  const fields = [
    { id: 'cfName',    errId: 'cfNameErr',    test: v => v.trim().length >= 2 },
    { id: 'cfPhone',   errId: 'cfPhoneErr',   test: v => /^[6-9]\d{9}$/.test(v.trim()) },
    { id: 'cfPincode', errId: 'cfPincodeErr', test: v => /^\d{6}$/.test(v.trim()) },
    { id: 'cfAddress', errId: 'cfAddressErr', test: v => v.trim().length >= 10 },
  ];
  fields.forEach(({ id, errId, test }) => {
    const input = document.getElementById(id);
    const err   = document.getElementById(errId);
    const ok    = test(input.value);
    input.classList.toggle('error', !ok);
    err.style.display = ok ? 'none' : 'block';
    if (!ok) valid = false;
  });
  return valid;
}

// ── Initiate Cashfree Payment ────────────────────────────────
async function initiateCashfreePayment() {
  if (!validateCfForm()) return;

  const btn = document.getElementById('cfPayBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Creating order…';

  const customer = {
    name:    document.getElementById('cfName').value.trim(),
    phone:   document.getElementById('cfPhone').value.trim(),
    address: document.getElementById('cfAddress').value.trim(),
    pincode: document.getElementById('cfPincode').value.trim(),
    email:   document.getElementById('cfEmail').value.trim(),
  };

  const items = cart.map(i => ({
    name:  i.name,
    qty:   i.qty,
    price: i.price,
    emoji: i.emoji,
  }));

  try {
    const createRes = await fetch('/api/create-order', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items, customer }),
    });
    const createData = await createRes.json();
    if (!createData.success) throw new Error(createData.message || 'Order creation failed');

    const { orderId, paymentSessionId, total } = createData;

    await loadCashfreeSDK();
    const cashfree = await Cashfree({ mode: getCashfreeMode() });
    const result   = await cashfree.checkout({ paymentSessionId, redirectTarget: '_modal' });

    if (result.error) throw new Error(result.error.message || 'Payment failed');

    if (result.paymentDetails) {
      btn.innerHTML = '<div class="spinner"></div> Verifying…';
      await verifyPayment(orderId, customer, total);
    }
  } catch (err) {
    console.error('Payment error:', err);
    btn.disabled = false;
    btn.innerHTML = '🔒 Pay Securely — ₹' + calcTotal().toLocaleString('en-IN');
    showToast('❌ ' + (err.message || 'Payment failed. Please try again.'));
  }
}

function loadCashfreeSDK() {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) { resolve(); return; }
    const script = document.createElement('script');
    script.src     = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload  = resolve;
    script.onerror = () => reject(new Error('Failed to load payment SDK'));
    document.head.appendChild(script);
  });
}

function getCashfreeMode() {
  const meta = document.querySelector('meta[name="cf-env"]');
  return (meta && meta.content === 'PROD') ? 'production' : 'sandbox';
}

async function verifyPayment(orderId, customer, total) {
  const verifyRes  = await fetch('/api/verify-payment', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ orderId }),
  });
  const verifyData = await verifyRes.json();

  if (verifyData.success) {
    cart = [];
    renderCart();
    closeCfModal();
    closeCart();
    showPaymentSuccess(orderId, customer.name, total, verifyData.paymentId);
  } else {
    throw new Error('Payment verification failed. Please contact us on WhatsApp.');
  }
}

// ── Success Screen ───────────────────────────────────────────
function showPaymentSuccess(orderId, name, total, paymentId) {
  const existing = document.getElementById('cfSuccessOverlay');
  if (existing) existing.remove();

  const html = `
  <style>
    .cf-success-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      z-index: 800; display: flex; align-items: center; justify-content: center;
      padding: 16px; backdrop-filter: blur(6px); animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .cf-success-modal {
      background: #FDFAF2; border-radius: 20px; width: 100%;
      max-width: 400px; padding: 36px 28px; text-align: center;
      box-shadow: 0 24px 80px rgba(0,0,0,0.25);
      animation: slideUp 0.35s cubic-bezier(0.4,0,0.2,1);
    }
    @keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .cf-success-tick { font-size: 56px; margin-bottom: 12px; }
    .cf-success-title { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 600; color: #1B4332; margin-bottom: 8px; }
    .cf-success-msg { font-size: 14px; color: #444438; line-height: 1.6; margin-bottom: 20px; }
    .cf-success-details { background: rgba(27,67,50,0.06); border-radius: 10px; padding: 14px 16px; margin-bottom: 22px; text-align: left; }
    .cf-success-detail-row { display: flex; justify-content: space-between; font-size: 13px; color: #444438; padding: 4px 0; }
    .cf-success-detail-row span:last-child { font-weight: 600; color: #1B4332; }
    .cf-success-wa-btn {
      width: 100%; background: #25D366; color: #fff; border: none;
      padding: 14px; border-radius: 12px; font-family: 'DM Sans', sans-serif;
      font-size: 14px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 9px;
      box-shadow: 0 4px 18px rgba(37,211,102,0.35); margin-bottom: 10px;
      transition: background 0.2s, transform 0.15s;
    }
    .cf-success-wa-btn:hover { background: #1ebe5c; transform: translateY(-1px); }
    .cf-success-close-btn {
      width: 100%; background: transparent; color: #7A7A62;
      border: 1px solid rgba(27,67,50,0.18); padding: 11px; border-radius: 10px;
      font-family: 'DM Sans', sans-serif; font-size: 13px; cursor: pointer;
    }
  </style>
  <div class="cf-success-overlay" id="cfSuccessOverlay">
    <div class="cf-success-modal">
      <div class="cf-success-tick">✅</div>
      <div class="cf-success-title">Payment Successful!</div>
      <div class="cf-success-msg">
        Thank you, <strong>${name}</strong>! Your payment of
        <strong>₹${Number(total).toLocaleString('en-IN')}</strong> was received.
        We'll ship your order as soon as possible.
      </div>
      <div class="cf-success-details">
        <div class="cf-success-detail-row"><span>Order ID</span><span>${orderId}</span></div>
        <div class="cf-success-detail-row"><span>Payment ID</span><span>${paymentId || '—'}</span></div>
        <div class="cf-success-detail-row"><span>Amount Paid</span><span>₹${Number(total).toLocaleString('en-IN')}</span></div>
      </div>
      <button class="cf-success-wa-btn" onclick="openWhatsAppConfirm('${orderId}', '${name}', ${total})">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
        Chat with us on WhatsApp
      </button>
      <button class="cf-success-close-btn" onclick="document.getElementById('cfSuccessOverlay').remove()">
        Continue Shopping
      </button>
    </div>
  </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

function openWhatsAppConfirm(orderId, name, total) {
  const msg = encodeURIComponent(
    `✅ Payment Done!\n\nOrder ID: ${orderId}\nName: ${name}\nAmount Paid: ₹${total}\n\nPlease confirm my order. Thank you! 🙏`
  );
  window.open(`https://wa.me/919500887900?text=${msg}`, '_blank');
}

// ── Stub out old WA modal functions (no longer used) ─────────
function closeWaModal() {}
function closeWaModalOnOverlay() {}
function copyUpiId() {}
function openGPay() {}
function openPhonePe() {}
function openPaytm() {}
function sendWhatsAppOrder() {}

// ── Init ─────────────────────────────────────────────────────
renderCart();
