(function() {
  'use strict';
  const UC = window.UltimateCart = window.UltimateCart || {};
  let cartConfig = null;
  let cartData = null;

  function money(cents, currency) {
    const sym = currency || window.Shopify?.currency?.active || 'USD';
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency: sym }).format(cents / 100);
    } catch(e) { return (cents/100).toFixed(2); }
  }

  async function loadConfig() {
    try {
      const appUrl = document.getElementById('uc-drawer')?.dataset.appUrl;
      if (!appUrl) return;
      const market = window.Shopify?.markets?.handle || 'primary';
      const res = await fetch(appUrl + '/api/cart-config?market=' + encodeURIComponent(market), { headers: { 'Accept': 'application/json' } });
      if (res.ok) cartConfig = await res.json();
    } catch(e) { console.warn('UC: config load failed', e); }
  }

  async function fetchCart() {
    const res = await fetch('/cart.js');
    cartData = await res.json();
    return cartData;
  }

  async function updateQty(key, qty) {
    setLoading(true);
    await fetch('/cart/change.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: key, quantity: qty }) });
    await fetchCart();
    renderCart();
    setLoading(false);
  }

  async function updateNote(note) {
    await fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
  }

  async function addToCart(variantId) {
    setLoading(true);
    await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: variantId, quantity: 1 }) });
    await fetchCart();
    renderCart();
    setLoading(false);
  }

  function setLoading(on) {
    document.querySelector('.uc-body')?.classList.toggle('uc-loading', on);
    document.querySelector('.uc-footer')?.classList.toggle('uc-loading', on);
  }

  function renderMilestone(container) {
    if (!container || !cartConfig?.milestones?.length || !cartData) return;
    const cfg = cartConfig;
    const milestones = cfg.milestones;
    const triggerType = cfg.triggerType || 'cartValue';
    const currentVal = triggerType === 'itemCount' ? cartData.item_count : cartData.total_price;
    const last = milestones[milestones.length - 1];
    const allUnlocked = currentVal >= last.threshold;
    let msg = '', progressPct = 0, segmentIndex = 0;

    if (allUnlocked) {
      msg = cfg.allUnlockedMessage || "You've unlocked all rewards!";
      progressPct = 100; segmentIndex = milestones.length;
    } else {
      const next = milestones.find(m => currentVal < m.threshold);
      const remaining = next.threshold - currentVal;
      const displayRem = triggerType === 'itemCount' ? remaining + ' item' + (remaining !== 1 ? 's' : '') : money(remaining, cfg.currency);
      msg = 'Add ' + displayRem + ' more to unlock ' + (next.label || 'reward') + '!';
      const prevIdx = milestones.indexOf(next) - 1;
      const prevThreshold = prevIdx >= 0 ? milestones[prevIdx].threshold : 0;
      progressPct = ((currentVal - prevThreshold) / (next.threshold - prevThreshold)) * 100;
      segmentIndex = milestones.indexOf(next);
    }

    const style = cfg.barStyle || 'sequential';
    let barHtml = '';
    if (style === 'segmented') {
      const segs = milestones.map((m, i) => {
        if (i < segmentIndex) return '<div class="uc-segment filled"></div>';
        if (i === segmentIndex && !allUnlocked) return '<div class="uc-segment"><div class="uc-segment-inner" style="width:' + progressPct + '%"></div></div>';
        return '<div class="uc-segment"></div>';
      }).join('');
      barHtml = '<div class="uc-segments">' + segs + '</div>';
    } else {
      const pct = Math.min(100, (currentVal / last.threshold) * 100);
      barHtml = '<div class="uc-progress-track"><div class="uc-progress-fill" style="width:' + pct + '%"></div></div>';
    }
    container.innerHTML = '<div class="uc-milestone"><div class="uc-milestone-msg">' + msg + '</div>' + barHtml + '</div>';
  }

  function renderNote(container) {
    if (!container || !cartConfig?.noteRules?.length || !cartData) { if(container) container.innerHTML = ''; return; }
    const cartProductIds = cartData.items.map(i => String(i.product_id));
    const cartVariantTitles = cartData.items.flatMap(i => i.variant_title ? [i.variant_title] : []);
    let matchedRule = null;
    for (const rule of cartConfig.noteRules) {
      if (!rule.enabled) continue;
      if (rule.trigger === 'always') { matchedRule = rule; break; }
      if (rule.trigger === 'product' && (rule.selectedProducts || []).some(pid => cartProductIds.includes(String(pid)))) { matchedRule = rule; break; }
      if (rule.trigger === 'variant' && (rule.selectedVariants || []).some(v => cartVariantTitles.includes(v))) { matchedRule = rule; break; }
    }
    if (!matchedRule) { container.innerHTML = ''; return; }
    const label = matchedRule.prompt || 'Order Note';
    const placeholder = matchedRule.placeholder || 'Add a note...';
    const required = matchedRule.required ? ' *' : '';
    container.innerHTML = '<div class="uc-note"><label for="uc-note-input">' + label + required + '</label><textarea id="uc-note-input" placeholder="' + placeholder + '">' + (cartData.note || '') + '</textarea></div>';
    const ta = container.querySelector('#uc-note-input');
    let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => updateNote(ta.value), 600); });
  }

  function renderUpsells(container) {
    if (!container || !cartConfig?.upsells?.length) { if(container) container.innerHTML = ''; return; }
    const inCart = new Set(cartData.items.map(i => i.variant_id));
    const avail = cartConfig.upsells.filter(u => !inCart.has(u.variantId));
    if (!avail.length) { container.innerHTML = ''; return; }
    const cards = avail.map(u => '<div class="uc-upsell-card"><img src="' + (u.image||'') + '" alt="' + u.title + '" loading="lazy"><div class="uc-upsell-name">' + u.title + '</div><div class="uc-upsell-price">' + money(u.price, cartConfig.currency) + '</div><button class="uc-upsell-add" data-vid="' + u.variantId + '">+ Add</button></div>').join('');
    container.innerHTML = '<div class="uc-upsells"><div class="uc-upsells-title">You may also like</div><div class="uc-upsells-scroll">' + cards + '</div></div>';
    container.querySelectorAll('.uc-upsell-add').forEach(btn => btn.addEventListener('click', () => addToCart(Number(btn.dataset.vid))));
  }

  function renderCart() {
    const drawer = document.getElementById('uc-drawer');
    if (!drawer || !cartData) return;
    const body = drawer.querySelector('.uc-body');
    const footer = drawer.querySelector('.uc-footer');
    if (!body || !footer) return;

    if (cartConfig?.theme) {
      const t = cartConfig.theme;
      if (t.accentColor) drawer.style.setProperty('--uc-accent', t.accentColor);
      if (t.btnBg) drawer.style.setProperty('--uc-btn-bg', t.btnBg);
      if (t.btnColor) drawer.style.setProperty('--uc-btn-color', t.btnColor);
    }

    if (cartData.item_count === 0) {
      body.innerHTML = '<div class="uc-empty"><p>Your cart is empty</p><a href="/collections/all" class="uc-continue-btn">Continue Shopping</a></div>';
      footer.innerHTML = '';
      return;
    }

    const itemsHtml = cartData.items.map(item => {
      const img = item.featured_image?.url || item.image || '';
      const variant = item.variant_title && item.variant_title !== 'Default Title' ? '<div class="uc-item-variant">' + item.variant_title + '</div>' : '';
      const disc = item.discounted_price, orig = item.original_price;
      const priceHtml = disc < orig
        ? '<span class="original">' + money(orig * item.quantity, cartData.currency) + '</span><span>' + money(disc * item.quantity, cartData.currency) + '</span>'
        : '<span>' + money(orig * item.quantity, cartData.currency) + '</span>';
      return '<div class="uc-item" data-key="' + item.key + '"><img class="uc-item-img" src="' + img + '" alt="' + item.product_title + '" loading="lazy"><div class="uc-item-info"><div class="uc-item-title">' + item.product_title + '</div>' + variant + '<div class="uc-item-price">' + priceHtml + '</div><div class="uc-qty-controls"><button class="uc-qty-btn" data-key="' + item.key + '" data-qty="' + (item.quantity-1) + '">&#8722;</button><span class="uc-qty-val">' + item.quantity + '</span><button class="uc-qty-btn" data-key="' + item.key + '" data-qty="' + (item.quantity+1) + '">+</button></div></div><button class="uc-item-remove" data-key="' + item.key + '" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>';
    }).join('');

    body.innerHTML = '<div id="uc-milestone-area"></div>' + itemsHtml + '<div id="uc-note-area"></div><div id="uc-upsell-area"></div>';

    body.querySelectorAll('.uc-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => { const q = parseInt(btn.dataset.qty); updateQty(btn.dataset.key, Math.max(0, q)); });
    });
    body.querySelectorAll('.uc-item-remove').forEach(btn => btn.addEventListener('click', () => updateQty(btn.dataset.key, 0)));

    renderMilestone(document.getElementById('uc-milestone-area'));
    renderNote(document.getElementById('uc-note-area'));
    renderUpsells(document.getElementById('uc-upsell-area'));

    const trust = cartConfig?.trustBadge ? '<div class="uc-trust">' + cartConfig.trustBadge + '</div>' : '';
    footer.innerHTML = trust + '<div class="uc-subtotal"><span>Subtotal</span><span>' + money(cartData.total_price, cartData.currency) + '</span></div><a href="/checkout" class="uc-checkout-btn">Checkout</a>';
  }

  function openDrawer() {
    document.getElementById('uc-drawer')?.classList.add('open');
    document.getElementById('uc-overlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    refreshCart();
  }

  function closeDrawer() {
    document.getElementById('uc-drawer')?.classList.remove('open');
    document.getElementById('uc-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  async function refreshCart() {
    await fetchCart();
    renderCart();
  }

  function interceptAddToCart() {
    const origFetch = window.fetch;
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const result = await origFetch.apply(this, arguments);
      if (url.includes('/cart/add')) {
        result.clone().json().then(() => fetchCart().then(() => { renderCart(); openDrawer(); })).catch(() => {});
      }
      return result;
    };

    document.addEventListener('submit', function(e) {
      const form = e.target;
      const action = form.getAttribute('action') || '';
      if (action.includes('/cart/add') || form.id === 'product_form' || form.dataset.productForm !== undefined) {
        const fd = new FormData(form);
        if (fd.get('id') || fd.get('form_type') === 'product') {
          e.preventDefault();
          fetch('/cart/add.js', { method: 'POST', headers: { 'Accept': 'application/json' }, body: fd })
            .then(() => fetchCart().then(() => { renderCart(); openDrawer(); }));
        }
      }
    }, true);
  }

  async function init() {
    await loadConfig();
    await fetchCart();
    renderCart();
    interceptAddToCart();

    document.getElementById('uc-overlay')?.addEventListener('click', closeDrawer);
    document.querySelector('.uc-close')?.addEventListener('click', closeDrawer);

    document.addEventListener('click', function(e) {
      const trigger = e.target.closest('a[href="/cart"], .cart-link, [data-cart], .header__icon--cart, .cart-icon-bubble');
      if (trigger && !trigger.closest('#uc-drawer')) {
        const href = trigger.getAttribute('href') || '';
        if (!href.includes('checkout')) {
          e.preventDefault();
          e.stopPropagation();
          openDrawer();
        }
      }
    });

    UC.open = openDrawer;
    UC.close = closeDrawer;
    UC.refresh = refreshCart;
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();