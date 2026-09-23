// ---------- Shared state ----------
let products = [];
let selectedProductId = null;
let currentView = 'dashboard';
let currentInsight = null;
let adminToken = localStorage.getItem('vivekAdminToken') || null;

const badgeColors = {
  RESERVED: 'bg-secondary-container text-on-secondary-container',
  PAYMENT_PENDING: 'bg-secondary-container text-on-secondary-container',
  FULFILLED: 'bg-tertiary-container text-tertiary-fixed-dim',
  PAYMENT_FAILED: 'bg-error-container text-on-error-container',
  EXPIRED: 'bg-error-container text-on-error-container',
  CANCELLED: 'bg-surface-container text-on-surface-variant',
  WAITING: 'bg-surface-container-high text-on-surface-variant',
};
const intentColors = { HIGH: 'bg-tertiary-container text-tertiary-fixed-dim', MEDIUM: 'bg-secondary-container text-on-secondary-container', LOW: 'bg-error-container text-on-error-container' };
function badge(status) { return `<span class="px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${badgeColors[status]||'bg-surface-container text-on-surface-variant'}">${status}</span>`; }
function intentBadge(intent) { return `<span class="px-1.5 py-0.5 rounded font-label-sm text-label-sm font-semibold ${intentColors[intent]||''}">${intent}</span>`; }
function timeLeft(iso) { const ms = new Date(iso).getTime() - Date.now(); return ms <= 0 ? '0s' : Math.ceil(ms/1000) + 's'; }
function inr(n) { return '₹' + Number(n||0).toLocaleString('en-IN'); }

// ---------- Navigation ----------
document.querySelectorAll('.navlink[data-view]').forEach(el => {
  el.addEventListener('click', () => switchView(el.dataset.view));
});
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.navlink[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + view));
  renderCurrentView();
}

// ---------- Product selector ----------
async function loadProducts() {
  const res = await fetch('/storefront/products');
  products = await res.json();
  const sel = document.getElementById('product-select');
  sel.innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (!selectedProductId) selectedProductId = products.find(p => p.is_flash_deal)?.id || products[0]?.id;
  sel.value = selectedProductId;
}
document.getElementById('product-select').addEventListener('change', (e) => {
  selectedProductId = Number(e.target.value);
  currentInsight = null;
  renderCurrentView();
});

// ---------- Dashboard ----------
async function renderDashboard() {
  const res = await fetch('/flash-sale/dashboard/summary');
  const d = await res.json();
  const el = document.getElementById('view-dashboard');
  el.innerHTML = `
    <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Dashboard</h1>
    <div class="grid grid-cols-4 gap-space-sm mb-space-lg">
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Active Reservations</div><div class="font-headline-lg text-headline-lg font-bold">${d.totals.reserved}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Total Queue</div><div class="font-headline-lg text-headline-lg font-bold">${d.totals.queueSize}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Units Sold</div><div class="font-headline-lg text-headline-lg font-bold text-tertiary-fixed-dim">${d.totals.sold}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Revenue</div><div class="font-headline-lg text-headline-lg font-bold">${inr(d.totals.revenue)}</div></div>
    </div>
    <div class="flex items-center justify-between mb-space-sm">
      <h2 class="font-headline-md text-headline-md text-on-surface">Live Products</h2>
      <span class="font-label-sm text-label-sm text-on-surface-variant">${d.customerCount} customers in CRM</span>
    </div>
    <table class="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <thead class="bg-surface-container-low"><tr>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Product</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Stock</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Available</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Reserved</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Queue</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Sold</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Revenue</th>
      </tr></thead>
      <tbody>${d.products.map(p => `
        <tr class="border-t border-outline-variant/30">
          <td class="p-space-sm font-label-md text-label-md">${p.is_flash_deal ? '⚡ ' : ''}${p.name}</td>
          <td class="p-space-sm font-label-md text-label-md">${p.stock}</td>
          <td class="p-space-sm font-label-md text-label-md ${p.available === 0 ? 'text-error font-semibold' : ''}">${p.available}</td>
          <td class="p-space-sm font-label-md text-label-md">${p.reserved}</td>
          <td class="p-space-sm font-label-md text-label-md">${p.queueSize}</td>
          <td class="p-space-sm font-label-md text-label-md">${p.sold}</td>
          <td class="p-space-sm font-label-md text-label-md">${inr(p.revenue)}</td>
        </tr>`).join('')}</tbody>
    </table>
  `;
}

// ---------- Inventory & Warehouses ----------
async function renderInventory() {
  if (!selectedProductId) return;
  const res = await fetch('/flash-sale/state/' + selectedProductId);
  const state = await res.json();
  const el = document.getElementById('view-inventory');
  el.innerHTML = `
    <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Inventory &amp; Warehouses — ${state.product.name}</h1>
    <div class="grid grid-cols-4 gap-space-sm mb-space-lg">
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Total</div><div class="font-headline-lg text-headline-lg font-bold">${state.stats.totalStock}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Available</div><div class="font-headline-lg text-headline-lg font-bold text-error">${state.stats.available}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Reserved</div><div class="font-headline-lg text-headline-lg font-bold text-secondary">${state.stats.reserved}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Sold</div><div class="font-headline-lg text-headline-lg font-bold text-tertiary-fixed-dim">${state.stats.allocated}</div></div>
    </div>
    <h2 class="font-headline-md text-headline-md text-on-surface mb-space-sm">Warehouse Network</h2>
    <div class="grid grid-cols-3 gap-space-sm">
      ${(state.warehouseBreakdown||[]).map(w => `
        <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md">
          <div class="font-label-lg text-label-lg text-on-surface">${w.warehouse_name}</div>
          <div class="font-label-sm text-label-sm text-on-surface-variant">${w.city} · batch ${w.batch} · mfg ${w.mfg_date}</div>
          <div class="flex items-baseline gap-1 mt-1">
            <span class="font-headline-md text-headline-md font-bold ${w.available > 0 ? 'text-tertiary-fixed-dim' : 'text-error'}">${w.available}</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">available of ${w.physical}</span>
          </div>
        </div>`).join('') || '<div class="text-on-surface-variant font-label-md text-label-md">No warehouse data — run a load test first.</div>'}
    </div>
  `;
}

// ---------- Reservations & Queue ----------
async function renderReservations() {
  if (!selectedProductId) return;
  const res = await fetch('/flash-sale/state/' + selectedProductId);
  const state = await res.json();
  const el = document.getElementById('view-reservations');
  const active = state.reservations.filter(r => r.status === 'RESERVED' || r.status === 'PAYMENT_PENDING');
  const queue = state.queue.filter(q => q.status === 'WAITING').slice(0, 30);
  el.innerHTML = `
    <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Reservations &amp; Queue — ${state.product.name}</h1>
    <div class="grid grid-cols-2 gap-space-lg">
      <div>
        <div class="flex items-center justify-between mb-space-sm"><h2 class="font-headline-md text-headline-md">Active Reservations</h2><span class="font-label-sm text-label-sm text-on-surface-variant">${active.length}</span></div>
        <div class="flex flex-col gap-space-sm max-h-[560px] overflow-y-auto pr-1">
          ${active.map(r => `
            <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <span class="font-label-lg text-label-lg text-on-surface">${r.customer_name}</span>
                ${badge(r.status)}
              </div>
              <div class="flex items-center justify-between">
                <span class="font-label-sm text-label-sm text-on-surface-variant">RES-${r.id} · ${r.customer_city||'—'}</span>
                <span class="font-label-sm text-label-sm font-mono text-error">${timeLeft(r.expires_at)}</span>
              </div>
              ${intentBadge(r.intent||'MEDIUM')}
            </div>`).join('') || '<div class="text-on-surface-variant font-label-md text-label-md py-space-md">None active</div>'}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-space-sm"><h2 class="font-headline-md text-headline-md">Queue</h2><span class="font-label-sm text-label-sm text-on-surface-variant">${state.stats.queueSize} waiting</span></div>
        <div class="flex flex-col gap-space-sm max-h-[560px] overflow-y-auto pr-1">
          ${queue.map((q,i) => `
            <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex items-center justify-between">
              <span class="font-label-lg text-label-lg text-on-surface">#${i+1} ${q.customer_name}</span>
              ${badge(q.status)}
            </div>`).join('') || '<div class="text-on-surface-variant font-label-md text-label-md py-space-md">Queue is empty</div>'}
        </div>
      </div>
    </div>
    <h2 class="font-headline-md text-headline-md text-on-surface mt-space-lg mb-space-sm">Audit Trail</h2>
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md flex flex-col divide-y divide-outline-variant/30 max-h-64 overflow-y-auto">
      ${state.auditTrail.slice(0,40).map(a => `
        <div class="flex items-center justify-between py-1.5 gap-2">
          <span class="font-label-md text-label-md text-on-surface">${a.event_type} — ${a.entity_type} #${a.entity_id}</span>
          <span class="font-label-sm text-label-sm font-mono text-on-surface-variant">${a.created_at}</span>
        </div>`).join('')}
    </div>
  `;
}

// ---------- Demand AI ----------
async function generateInsightAdmin() {
  const r = await fetch(`/ai-insights/${selectedProductId}/generate`, { method: 'POST' });
  currentInsight = await r.json();
  renderAI();
}
async function decideAdmin(decision, qty) {
  const body = { decision, decidedBy: 'Admin Console' };
  if (qty) body.qty = qty;
  const r = await fetch(`/ai-insights/${currentInsight.id}/decision`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  currentInsight = await r.json();
  renderAI();
}
function promptModifyAdmin() {
  const qty = prompt('Approved reorder quantity:', currentInsight.recommended_reorder_qty);
  if (qty && Number(qty) >= 0) decideAdmin('MODIFIED', Number(qty));
}
async function renderAI() {
  const el = document.getElementById('view-ai');
  if (!currentInsight) {
    el.innerHTML = `<h1 class="font-headline-lg text-headline-lg mb-space-md">Demand AI</h1><button id="gen-btn" class="bg-primary text-on-primary rounded-lg px-space-md py-space-sm font-label-lg text-label-lg">Generate recommendation</button>`;
    document.getElementById('gen-btn').addEventListener('click', generateInsightAdmin);
    return;
  }
  const i = currentInsight;
  const riskColors = { CRITICAL: 'bg-error-container text-on-error-container', HIGH: 'bg-error-container text-on-error-container', MEDIUM: 'bg-secondary-container text-on-secondary-container', LOW: 'bg-tertiary-container text-tertiary-fixed-dim' };
  el.innerHTML = `
    <div class="flex items-center justify-between mb-space-md">
      <h1 class="font-headline-lg text-headline-lg">Demand AI</h1>
      <button id="gen-btn" class="font-label-sm text-label-sm text-secondary px-2 py-1 rounded bg-surface-container">Refresh</button>
    </div>
    <div class="grid grid-cols-3 gap-space-sm mb-space-md">
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Demand hits</div><div class="font-headline-lg text-headline-lg font-bold">${i.demand_hits}</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Burn rate</div><div class="font-headline-lg text-headline-lg font-bold">${i.burn_rate_per_sec.toFixed(2)}/s</div></div>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-md"><div class="font-label-sm text-label-sm text-on-surface-variant">Depletion</div><div class="font-headline-lg text-headline-lg font-bold text-error">${i.depletion_seconds==null?'—':Math.round(i.depletion_seconds)+'s'}</div></div>
    </div>
    <div class="bg-primary-container text-surface rounded-xl p-space-lg flex flex-col gap-space-sm">
      <div class="flex items-center justify-between">
        <span class="font-label-lg text-label-lg">AI Recommended Action</span>
        <span class="px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${riskColors[i.stockout_risk]}">${i.stockout_risk} RISK</span>
      </div>
      <p class="font-body-md text-body-md text-surface-bright">Reorder ${i.recommended_reorder_qty} units.</p>
      <ul class="font-label-sm text-label-sm text-primary-fixed-dim list-disc pl-4 space-y-0.5">${i.justification.map(j=>`<li>${j}</li>`).join('')}</ul>
      ${i.status === 'PENDING' ? `
        <div class="flex gap-space-sm pt-space-xs">
          <button id="approve-btn" class="flex-1 bg-surface-container-lowest text-on-surface rounded-lg py-2 font-label-sm text-label-sm font-semibold">Approve &amp; Submit PO</button>
          <button id="modify-btn" class="px-3 bg-surface-container-lowest/20 text-surface rounded-lg py-2 font-label-sm text-label-sm font-semibold">Modify</button>
          <button id="reject-btn" class="px-3 bg-surface-container-lowest/20 text-surface rounded-lg py-2 font-label-sm text-label-sm font-semibold">Decline</button>
        </div>` : `<div class="font-label-sm text-label-sm text-tertiary-fixed-dim pt-space-xs">${i.status} — ${i.decided_qty} units by ${i.decided_by}</div>`}
    </div>
  `;
  document.getElementById('gen-btn').addEventListener('click', generateInsightAdmin);
  if (i.status === 'PENDING') {
    document.getElementById('approve-btn').addEventListener('click', () => decideAdmin('APPROVED'));
    document.getElementById('modify-btn').addEventListener('click', promptModifyAdmin);
    document.getElementById('reject-btn').addEventListener('click', () => decideAdmin('REJECTED'));
  }
}

// ---------- Orders ----------
async function renderOrders() {
  const res = await fetch('/flash-sale/orders/all');
  const orders = await res.json();
  const el = document.getElementById('view-orders');
  el.innerHTML = `
    <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Orders</h1>
    <table class="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <thead class="bg-surface-container-low"><tr>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Order</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Product</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Customer</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Warehouse</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Distance</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">When</th>
      </tr></thead>
      <tbody>${orders.map(o => `
        <tr class="border-t border-outline-variant/30">
          <td class="p-space-sm font-label-md text-label-md font-mono">#${o.id}</td>
          <td class="p-space-sm font-label-md text-label-md">${o.product_name}</td>
          <td class="p-space-sm font-label-md text-label-md">${o.customer_name}</td>
          <td class="p-space-sm font-label-md text-label-md">${o.warehouse||'—'}</td>
          <td class="p-space-sm font-label-md text-label-md">${o.distance_km!=null?o.distance_km+' km':'—'}</td>
          <td class="p-space-sm font-label-sm text-label-sm text-on-surface-variant">${o.created_at}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="p-space-md text-center text-on-surface-variant">No orders yet</td></tr>`}</tbody>
    </table>
  `;
}

// ---------- Customers (CRM) — requires login ----------
async function renderCustomers() {
  const el = document.getElementById('view-customers');
  if (!adminToken) {
    el.innerHTML = `
      <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Customers (CRM)</h1>
      <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg max-w-sm flex flex-col gap-space-sm">
        <p class="font-label-md text-label-md text-on-surface-variant">Sign in with an ERP account to view CRM records.</p>
        <input id="login-email" placeholder="admin@erp.local" class="h-10 px-3 rounded-lg border border-outline-variant"/>
        <input id="login-password" placeholder="Admin@123" type="password" class="h-10 px-3 rounded-lg border border-outline-variant"/>
        <button id="login-btn" class="bg-primary text-on-primary rounded-lg py-2 font-label-lg text-label-lg">Sign in</button>
        <span id="login-error" class="font-label-sm text-label-sm text-error"></span>
      </div>
    `;
    document.getElementById('login-btn').addEventListener('click', async () => {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const r = await fetch('/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
      if (!r.ok) { document.getElementById('login-error').textContent = 'Invalid credentials'; return; }
      const data = await r.json();
      adminToken = data.token;
      localStorage.setItem('vivekAdminToken', adminToken);
      renderCustomers();
    });
    return;
  }
  const res = await fetch('/customers', { headers: { Authorization: 'Bearer ' + adminToken } });
  if (!res.ok) { adminToken = null; localStorage.removeItem('vivekAdminToken'); renderCustomers(); return; }
  const customers = await res.json();
  const list = Array.isArray(customers) ? customers : customers.data || [];
  el.innerHTML = `
    <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Customers (CRM)</h1>
    <table class="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <thead class="bg-surface-container-low"><tr>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Name</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Mobile</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Type</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Status</th>
        <th class="text-left font-label-sm text-label-sm text-on-surface-variant p-space-sm">Address / City</th>
      </tr></thead>
      <tbody>${list.map(c => `
        <tr class="border-t border-outline-variant/30">
          <td class="p-space-sm font-label-md text-label-md">${c.name}</td>
          <td class="p-space-sm font-label-md text-label-md">${c.mobile}</td>
          <td class="p-space-sm font-label-md text-label-md">${c.customer_type}</td>
          <td class="p-space-sm font-label-md text-label-md">${c.status}</td>
          <td class="p-space-sm font-label-md text-label-md">${c.address||'—'}</td>
        </tr>`).join('')}</tbody>
    </table>
  `;
}

// ---------- Load Test ----------
function renderLoadTest() {
  const el = document.getElementById('view-loadtest');
  el.innerHTML = `
    <h1 class="font-headline-lg text-headline-lg text-on-surface mb-space-md">Load Test</h1>
    <p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md">Generates synthetic concurrent buyers against the selected product to stress-test the reservation engine — this does not affect the real storefront's live customers.</p>
    <div class="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg max-w-lg flex flex-col gap-space-sm">
      <div class="grid grid-cols-3 gap-space-sm">
        <label class="flex flex-col gap-0.5"><span class="font-label-sm text-label-sm text-on-surface-variant">Stock</span><input id="lt-stock" type="number" value="10" class="h-9 px-2 rounded-lg border border-outline-variant"/></label>
        <label class="flex flex-col gap-0.5"><span class="font-label-sm text-label-sm text-on-surface-variant">Buyers</span><input id="lt-customers" type="number" value="300" class="h-9 px-2 rounded-lg border border-outline-variant"/></label>
        <label class="flex flex-col gap-0.5"><span class="font-label-sm text-label-sm text-on-surface-variant">Window (s)</span><input id="lt-seconds" type="number" value="20" class="h-9 px-2 rounded-lg border border-outline-variant"/></label>
      </div>
      <button id="lt-run" class="bg-primary text-on-primary rounded-lg py-space-sm font-label-lg text-label-lg">Run Load Test</button>
      <button id="lt-reset" class="bg-surface-container text-on-surface-variant rounded-lg py-2 font-label-sm text-label-sm">Reset this product's demo state</button>
      <div id="lt-result" class="font-label-md text-label-md text-on-surface-variant"></div>
    </div>
  `;
  document.getElementById('lt-run').addEventListener('click', async () => {
    const product = products.find(p => p.id === selectedProductId);
    const stock = Number(document.getElementById('lt-stock').value);
    const customers = Number(document.getElementById('lt-customers').value);
    const reservationSeconds = Number(document.getElementById('lt-seconds').value);
    const r = await fetch('/flash-sale/simulate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ productName: product.name, sku: product.sku, stock, customers, reservationSeconds }) });
    const data = await r.json();
    document.getElementById('lt-result').textContent = `Reserved: ${data.results.reserved}, Queued: ${data.results.queued}`;
  });
  document.getElementById('lt-reset').addEventListener('click', async () => {
    const stock = Number(document.getElementById('lt-stock').value);
    const reservationSeconds = Number(document.getElementById('lt-seconds').value);
    await fetch(`/flash-sale/${selectedProductId}/reset`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ stock, reservationSeconds }) });
    document.getElementById('lt-result').textContent = 'Reset complete.';
  });
}

// ---------- Main render dispatch ----------
function renderCurrentView() {
  if (currentView === 'dashboard') renderDashboard();
  else if (currentView === 'inventory') renderInventory();
  else if (currentView === 'reservations') renderReservations();
  else if (currentView === 'ai') renderAI();
  else if (currentView === 'orders') renderOrders();
  else if (currentView === 'customers') renderCustomers();
  else if (currentView === 'loadtest') renderLoadTest();
}

async function init() {
  await loadProducts();
  switchView('dashboard');
  setInterval(() => {
    if (['dashboard','inventory','reservations'].includes(currentView)) renderCurrentView();
  }, 2000);
}
init();
