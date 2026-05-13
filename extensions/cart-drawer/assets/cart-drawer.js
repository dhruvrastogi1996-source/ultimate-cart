/**
 * Ultimate Cart Drawer - Vanilla JS Theme App Extension
 * Injects a slide-in cart drawer replacing the default Shopify cart
 */

(function () {
  'use strict';

  let cartConfig = null;
  let cartData = null;
  let undoTimer = null;
  let removedItem = null;

  // ── Fetch merchant config from app proxy ─────────────────────────────────
  async function fetchConfig() {
    try {
      const market = document.documentElement.lang?.split('-')[1]?.toUpperCase() || 'IN';
      const res = await fetch(`/apps/proxy/cart-config?market=${market}`);
      if (res.ok) cartConfig = await res.json();
    } catch (e) {
      cartConfig = { milestones: [], trustBadges: [], noteRules: [], theme: {}, upsells: [] };
  }
}

  // ── Fetch current Shopify cart ────────────────────────────────────────────
  async function fetchCart() {
    const res = await fetch('/cart.js');
    cartData = await res.json();
    return cartData;
  }

  // ── Calculate active milestone ────────────────────────────────────────────
  function getActiveMilestone(cartTotal) {
        if (!cartConfig?.milestones?.length) return null;
    const sorted = [...cartConfig.milestones].sort((a, b) => b.threshold - a.threshold);
    for (const m of sorted) {
            if (cartTotal >= m.threshold) return m;
  }
    return null;
}

  function getNextMilestone(cartTotal) {
        if (!cartConfig?.milestones?.length) return null;
    const sorted = [...cartConfig.milestones].sort((a, b) => a.threshold - b.threshold);
    return sorted.find((m) => m.threshold > cartTotal) || null;
  }

  // ── Format currency ───────────────────────────────────────────────────────
  function formatMoney(cents) {
        const currency = cartConfig?.currency || 'INR';
    const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;
    return `${symbol}${(cents / 100).toFixed(0)}`;
  }

  // ── Build milestone progress bar ─────────────────────────────────────────
  function buildMilestoneBar(cart) {
        const milestones = cartConfig?.milestones || [];
    if (!milestones.length || !cart.item_count) return '';

    const cartTotal = cart.total_price / 100;
    const maxThreshold = Math.max(...milestones.map((m) => m.threshold));
    const progress = Math.min((cartTotal / maxThreshold) * 100, 100);
    const activeMilestone = getActiveMilestone(cartTotal);
    const nextMilestone = getNextMilestone(cartTotal);

    let headline = '';
    if (progress >= 100) {
      headline = cartConfig.allUnlockedMessage || 'All rewards unlocked!';
} else if (nextMilestone) {
      const remaining = nextMilestone.threshold - cartTotal;
      headline = `Add ${formatMoney(remaining * 100)} more to get ${nextMilestone.rewardLabel}`;
}

    const checkpoints = milestones
      .sort((a, b) => a.threshold - b.threshold)
      .map((m) => {
        const pct = (m.threshold / maxThreshold) * 100;
        const reached = cartTotal >= m.threshold;
        const icon = m.icon === 'Gift' ? '🎁' : m.icon === 'Sparkles' ? '✨' : '🚚';
        return `
          <div class="uc-milestone-checkpoint" style="left:${pct}%;position:absolute;top:50%;transform:translate(-50%,-50%)">
            <div class="uc-checkpoint-icon" style="
              width:28px;height:28px;border-radius:50%;
              background:${reached ? (cartConfig.theme?.accentColor || '#8B0000') : '#e5e7eb'};
              display:flex;align-items:center;justify-content:center;
              font-size:12px;transition:background 0.3s;
            ">${reached ? '✓' : icon}</div>
            <div style="position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:10px;white-space:nowrap;color:${reached ? (cartConfig.theme?.accentColor || '#8B0000') : '#9ca3af'}">${m.rewardLabel}</div>
          </div>`;
}).join('');

    return `
      <div class="uc-milestone-bar" style="padding:16px 0 24px;border-bottom:1px solid #f3f4f6">
        <div style="font-size:12px;text-align:center;margin-bottom:12px;color:${cartConfig.theme?.textColor || '#1a1a1a'}">${headline}</div>
        <div style="position:relative;height:6px;background:#e5e7eb;border-radius:3px;margin:0 14px">
          <div style="width:${progress}%;height:100%;background:${cartConfig.theme?.accentColor || '#8B0000'};border-radius:3px;transition:width 0.4s ease"></div>
          ${checkpoints}
        </div>
      </div>`;
}

  // ── Build line items ──────────────────────────────────────────────────────
  function buildLineItems(cart) {
    const activeMilestone = getActiveMilestone(cart.total_price / 100);
    const hasDiscount = activeMilestone && activeMilestone.rewardType !== 'no_discount';
    const accentColor = cartConfig?.theme?.accentColor || '#8B0000';
    const headingFont = cartConfig?.theme?.headingFont || 'Georgia';

    return cart.items.map((item) => {
      let discountedPrice = item.final_price;
      if (hasDiscount) {
        if (activeMilestone.rewardType === 'pct_off') {
          discountedPrice = Math.round(item.original_price * (1 - activeMilestone.discountPct / 100));
} else if (activeMilestone.rewardType === 'flat_off') {
          discountedPrice = Math.max(0, item.original_price - (activeMilestone.fixedDiscount * 100 / cart.item_count));
}
}

      const priceDisplay = hasDiscount
        ? `<span style="text-decoration:line-through;opacity:0.5;margin-right:6px">${formatMoney(item.original_price)}</span>
           <span style="color:${accentColor};font-weight:600">${formatMoney(discountedPrice)}</span>`
        : `<span>${formatMoney(item.final_price)}</span>`;

      return `
        <div class="uc-line-item" data-key="${item.key}" style="display:flex;gap:12px;padding:16px 0;border-bottom:1px solid #f3f4f6">
          <img src="${item.image || ''}" alt="${item.title}" style="width:72px;height:96px;object-fit:cover;border-radius:4px;flex-shrink:0">
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-family:${headingFont};font-style:italic;font-size:14px;margin-bottom:2px">${item.product_title}</div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:0.5;margin-bottom:8px">${item.variant_title || ''}</div>
              </div>
              <button class="uc-remove-btn" data-key="${item.key}" style="background:none;border:none;cursor:pointer;opacity:0.4;padding:4px;font-size:16px;line-height:1">×</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div class="uc-qty-stepper" style="display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:4px;padding:4px 8px">
                <button class="uc-qty-btn" data-key="${item.key}" data-delta="-1" style="background:none;border:none;cursor:pointer;font-size:16px;line-height:1;padding:0 4px">−</button>
                <span style="font-size:13px;min-width:16px;text-align:center">${item.quantity}</span>
                <button class="uc-qty-btn" data-key="${item.key}" data-delta="1" style="background:none;border:none;cursor:pointer;font-size:16px;line-height:1;padding:0 4px">+</button>
              </div>
              <div style="font-size:14px">${priceDisplay}</div>
            </div>
          </div>
        </div>`;
}).join('');
}

  // ── Build upsells carousel ────────────────────────────────────────────────
  function buildUpsells() {
    const upsells = cartConfig?.upsells || [];
    if (!upsells.length) return '';
          const headingFont = cartConfig?.theme?.headingFont || 'Georgia';
    const accentColor = cartConfig?.theme?.accentColor || '#8B0000';

    const cards = upsells.map((p) => `
      <div style="flex-shrink:0;width:120px;cursor:pointer">
        <img src="${p.imageUrl}" alt="${p.productTitle}" style="width:120px;height:150px;object-fit:cover;border-radius:4px;margin-bottom:6px">
        <div style="font-family:${headingFont};font-style:italic;font-size:12px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.productTitle}</div>
        <div style="font-size:11px;opacity:0.6;margin-bottom:6px">${p.price}</div>
        <button onclick="window.location='/products/${p.productHandle}'" style="width:100%;padding:6px;background:transparent;border:1px solid currentColor;font-size:10px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border-radius:2px">ADD</button>
      </div>`).join('');

    return `
      <div style="padding:16px 0;border-bottom:1px solid #f3f4f6">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;opacity:0.4;margin-bottom:12px">YOU MAY ALSO LIKE</div>
        <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none">${cards}</div>
      </div>`;
}

  // ── Build cart note ───────────────────────────────────────────────────────
  function buildCartNote(cart) {
    const rules = cartConfig?.noteRules || [];
    const activeRule = rules.find((r) => {
      if (!r.enabled) return false;
      if (r.trigger === 'always') return true;
      if (r.trigger === 'product') {
        const ids = JSON.parse(r.selectedProducts || '[]');
        return cart.items.some((i) => ids.includes(String(i.product_id)));
}
      if (r.trigger === 'variant') {
        const ids = JSON.parse(r.selectedVariants || '[]');
        return cart.items.some((i) => ids.includes(String(i.variant_id)));
}
      return false;
});

    if (!activeRule) return '';

    return `
      <div style="padding:16px 0;border-bottom:1px solid #f3f4f6">
        <div style="font-size:12px;margin-bottom:8px">
          ${activeRule.required ? '<span style="color:#ef4444;margin-right:4px">*</span>' : ''}
          ${activeRule.prompt}
        </div>
        <textarea id="uc-cart-note" placeholder="${activeRule.placeholder}" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px;resize:none;height:80px;font-family:inherit;box-sizing:border-box">${cart.note || ''}</textarea>
        ${activeRule.required ? '<div id="uc-note-error" style="color:#ef4444;font-size:11px;margin-top:4px;display:none">Required to checkout</div>' : ''}
      </div>`;
}

  // ── Build trust badges ────────────────────────────────────────────────────
  function buildTrustBadges() {
    const badges = cartConfig?.trustBadges || [];
    if (!badges.length) return '';
          return `
      <div style="display:flex;gap:16px;justify-content:center;padding:12px 0;flex-wrap:wrap">
                    ${badges.map((b) => `<span style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.4">${b}</span>`).join('')}
      </div>`;
            }

              // ── Render full drawer ────────────────────────────────────────────────────
              function renderDrawer(cart) {
                const theme = cartConfig?.theme || {};
                const bg = theme.bgColor || '#ffffff';
    const text = theme.textColor || '#1a1a1a';
    const accent = theme.accentColor || '#8B0000';
    const headingFont = theme.headingFont || 'Georgia, serif';
    const bodyFont = theme.bodyFont || 'Inter, sans-serif';
    const btnRadius = theme.buttonStyle === 'pill' ? '100px' : theme.buttonStyle === 'rounded' ? '8px' : '0';

    const activeMilestone = getActiveMilestone(cart.total_price / 100);
    const hasDiscount = activeMilestone && activeMilestone.rewardType !== 'no_discount';

    let savingsAmount = 0;
    if (hasDiscount && activeMilestone.rewardType === 'pct_off') {
      savingsAmount = Math.round(cart.total_price * activeMilestone.discountPct / 100);
} else if (hasDiscount && activeMilestone.rewardType === 'flat_off') {
      savingsAmount = activeMilestone.fixedDiscount * 100;
}

    const discountedTotal = cart.total_price - savingsAmount;

    const emptyState = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center">
        <div style="font-size:32px;margin-bottom:16px;opacity:0.3">♡</div>
        <div style="font-family:${headingFont};font-style:italic;font-size:18px;opacity:0.5">Your cart is waiting for something beautiful.</div>
      </div>`;

    const cartContent = cart.item_count > 0 ? `
      <div class="uc-body" style="flex:1;overflow-y:auto;padding:0 20px">
        ${buildMilestoneBar(cart)}
        <div class="uc-items">${buildLineItems(cart)}</div>
        ${buildUpsells()}
        ${buildCartNote(cart)}
      </div>
      <div class="uc-footer" style="padding:16px 20px;border-top:1px solid #f3f4f6">
        ${buildTrustBadges()}
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:12px;opacity:0.6">Subtotal</span>
          <span style="font-size:12px">${formatMoney(cart.total_price)}</span>
        </div>
        ${hasDiscount ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:12px;color:${accent}">Milestone savings</span>
          <span style="font-size:12px;color:${accent}">-${formatMoney(savingsAmount)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
          <span style="font-family:${headingFont};font-size:18px;font-style:italic">Total</span>
          <span style="font-family:${headingFont};font-size:18px">${formatMoney(discountedTotal)}</span>
        </div>
        ${hasDiscount ? `<div style="font-style:italic;font-size:12px;color:${accent};text-align:center;margin-bottom:12px">You're saving ${formatMoney(savingsAmount)}</div>` : ''}
        <button id="uc-checkout-btn" style="
          width:100%;padding:16px;background:${text};color:${bg};border:none;
          font-family:${bodyFont};font-size:12px;letter-spacing:3px;text-transform:uppercase;
          cursor:pointer;border-radius:${btnRadius};transition:background 0.2s;
        " onmouseover="this.style.background='${accent}'" onmouseout="this.style.background='${text}'">
          CHECKOUT · ${formatMoney(discountedTotal)}
        </button>
      </div>` : emptyState;

    document.getElementById('uc-drawer').innerHTML = `
      <div id="uc-drawer-inner" style="
        position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);
        background:${bg};color:${text};font-family:${bodyFont};
        display:flex;flex-direction:column;z-index:99999;
        box-shadow:-4px 0 24px rgba(0,0,0,0.12);
        transform:translateX(0);transition:transform 0.3s ease;
      ">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:20px 20px 12px;border-bottom:1px solid #f3f4f6">
          <div>
            <div style="font-size:9px;letter-spacing:3px;text-transform:uppercase;opacity:0.4;margin-bottom:2px">${cartConfig?.shopName || ''}</div>
            <div style="font-family:${headingFont};font-style:italic;font-size:20px">Your Cart · ${cart.item_count}</div>
          </div>
          <button id="uc-close-btn" style="background:none;border:none;cursor:pointer;font-size:24px;opacity:0.5;padding:4px;line-height:1">×</button>
        </div>
        ${cartContent}
        ${undoTimer ? `<div id="uc-undo-toast" style="position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:4px;font-size:12px;display:flex;gap:12px;align-items:center;white-space:nowrap">
          Item removed <button onclick="window.__ucUndo()" style="background:none;border:1px solid rgba(255,255,255,0.4);color:#fff;padding:2px 10px;cursor:pointer;font-size:11px;border-radius:2px">Undo</button>
        </div>` : ''}
      </div>
      <div id="uc-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);z-index:99998" onclick="window.__ucClose()"></div>`;

    bindEvents(cart);
}

  // ── Bind events ───────────────────────────────────────────────────────────
  function bindEvents(cart) {
    document.getElementById('uc-close-btn')?.addEventListener('click', closeDrawer);

    document.querySelectorAll('.uc-qty-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        const delta = parseInt(e.currentTarget.dataset.delta);
        const item = cart.items.find((i) => i.key === key);
        if (!item) return;
        await updateCartItem(key, Math.max(0, item.quantity + delta));
});
});

    document.querySelectorAll('.uc-remove-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.key;
        removedItem = cart.items.find((i) => i.key === key);
        await updateCartItem(key, 0);
        startUndoTimer();
});
});

    document.getElementById('uc-checkout-btn')?.addEventListener('click', () => {
      const noteEl = document.getElementById('uc-cart-note');
      const rules = cartConfig?.noteRules || [];
      const requiredRule = rules.find((r) => r.required && r.enabled);
      if (requiredRule && noteEl && !noteEl.value.trim()) {
        document.getElementById('uc-note-error')?.style.setProperty('display', 'block');
        noteEl.focus();
        return;
}
      if (noteEl) saveCartNote(noteEl.value);
      window.location.href = '/checkout';
});

    document.getElementById('uc-cart-note')?.addEventListener('blur', (e) => {
      saveCartNote(e.target.value);
});
}

  // ── Cart operations ───────────────────────────────────────────────────────
  async function updateCartItem(key, quantity) {
    await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key, quantity }),
});
    await refreshCart();
}

  async function saveCartNote(note) {
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
});
}

  async function refreshCart() {
    const cart = await fetchCart();
    renderDrawer(cart);
}

  // ── Undo toast ────────────────────────────────────────────────────────────
  function startUndoTimer() {
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undoTimer = null; removedItem = null; }, 5000);
}

  window.__ucUndo = async function () {
    if (!removedItem) return;
    await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: removedItem.variant_id, quantity: removedItem.quantity }),
});
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null; removedItem = null;
    await refreshCart();
};

  // ── Open / Close drawer ───────────────────────────────────────────────────
  async function openDrawer() {
    const drawer = document.getElementById('uc-drawer');
    if (!drawer) return;
    if (!cartConfig) await fetchConfig();
    const cart = await fetchCart();
    renderDrawer(cart);
    drawer.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

  function closeDrawer() {
    const drawer = document.getElementById('uc-drawer');
    if (drawer) { drawer.style.display = 'none'; drawer.innerHTML = ''; }
    document.body.style.overflow = '';
    window.__ucClose = closeDrawer;
}

  window.__ucClose = closeDrawer;

  // ── Intercept cart triggers ───────────────────────────────────────────────
  function interceptCartLinks() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('a[href="/cart"], button[name="checkout"], [data-open-cart], .cart-icon-bubble');
      if (el) {
        e.preventDefault();
        openDrawer();
}
});
}

  // ── Cart drawer container ─────────────────────────────────────────────────
  function injectDrawerContainer() {
    if (!document.getElementById('uc-drawer')) {
      const div = document.createElement('div');
      div.id = 'uc-drawer';
      div.style.display = 'none';
      document.body.appendChild(div);
}
}

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectDrawerContainer();
    interceptCartLinks();
    fetchConfig();
    // Expose for theme liquid usage
    window.UltimatCart = { open: openDrawer, close: closeDrawer, refresh: refreshCart };
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
