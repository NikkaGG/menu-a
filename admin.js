(() => {
  'use strict';

  const SB = 'https://osyphouhtjanfoujcbid.supabase.co';
  const KEY = 'sb_publishable_FJcKpYUD2sH6Ai2psVe97Q_59HenbRO';
  const TK = 'menu-admin-token-v1', CK = 'menu-admin-client-v1';
  const THEME_KEY = 'menu-admin-theme-v2';

  // State
  const S = {
    token: sessionStorage.getItem(TK) || '',
    days: 7,
    data: null,
    selected: new Set(),
    q: '',
    cat: '',
    status: '',
    dishSort: 'manual', // 'manual' | 'name' | 'price_asc' | 'price_desc'
    dishPage: 1,
    dishPageSize: 25,
    analyticsQ: '',
    analyticsSort: 'score', // 'score' | 'views' | 'cart_adds' | 'whatsapp_clicks' | 'conversion'
    analyticsPage: 1,
    analyticsPageSize: 10,
    dragDish: null,
    dragCat: null,
    activeSection: 'dashboard'
  };

  // DOM Helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const fmt = n => new Intl.NumberFormat('ru-RU').format(Number(n || 0));
  const money = n => fmt(Math.round(Number(n || 0))) + ' ₸';
  const localInput = v => v ? new Date(v).toISOString().slice(0, 16) : '';
  const iso = v => v ? new Date(v).toISOString() : null;

  function clientKey() {
    let v = localStorage.getItem(CK);
    if (!v) {
      v = (crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(CK, v);
    }
    return v;
  }

  function iconSvg(name) {
    switch (name) {
      case 'drag':
        return '<svg class="icon icon-drag" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>';
      case 'more':
      case 'ellipsis':
        return '<svg class="icon icon-more" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';
      case 'arrow-up':
        return '<svg class="icon icon-arrow-up" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
      case 'arrow-down':
        return '<svg class="icon icon-arrow-down" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
      case 'photo':
      case 'image':
        return '<svg class="icon icon-photo" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
      case 'photo-sm':
        return '<svg class="icon icon-photo-sm" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
      case 'plus':
        return '<svg class="icon icon-plus" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      default:
        return '';
    }
  }

  const mobileMq = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null;

  function isMobileView() {
    return mobileMq ? mobileMq.matches : (window.innerWidth <= 900);
  }

  function syncSidebarInert() {
    const sidebar = $('#sidebar');
    const main = $('#mainContent') || $('.admin-main');
    if (!sidebar) return;

    if (isMobileView()) {
      const isOpen = document.body.classList.contains('sidebar-open');
      sidebar.inert = !isOpen;
      if (main) main.inert = isOpen;
    } else {
      sidebar.inert = false;
      if (main) main.inert = false;
    }
  }
  // Theme Management (three-theme preference: light / dark / system)
  function getStoredThemePreference() {
    try {
      const val = localStorage.getItem(THEME_KEY);
      if (val === 'light' || val === 'dark' || val === 'system') return val;
    } catch (_) {}
    return 'system';
  }

  function resolveTheme(pref) {
    if (pref === 'dark' || pref === 'light') return pref;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function syncThemeControls() {
    const pref = getStoredThemePreference();
    const effective = resolveTheme(pref);
    const dark = effective === 'dark';

    // Sync all selects with [data-theme-select]
    $$('select[data-theme-select]').forEach(sel => {
      sel.value = pref;
    });

    // Sync any fallback buttons with [data-theme-toggle]
    $$('[data-theme-toggle]').forEach(btn => {
      const label = btn.querySelector('.theme-label');
      if (label) label.textContent = dark ? 'Светлая' : 'Тёмная';
      btn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      btn.setAttribute('title', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
      meta.setAttribute('content', computedBg || (dark ? '#0b0f17' : '#f8fafc'));
    }
  }

  function applyTheme(theme, persist = true) {
    const pref = (theme === 'dark' || theme === 'light' || theme === 'system') ? theme : 'system';
    if (persist) {
      try { localStorage.setItem(THEME_KEY, pref); } catch (_) {}
    }
    const effective = resolveTheme(pref);
    document.documentElement.dataset.theme = effective;
    document.documentElement.dataset.themePreference = pref;
    syncThemeControls();
  }

  function toggleTheme() {
    const cur = currentTheme();
    applyTheme(cur === 'dark' ? 'light' : 'dark', true);
  }

  function initSystemThemeListener() {
    if (!window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getStoredThemePreference() === 'system') {
        applyTheme('system', false);
      }
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
    } else if (mql.addListener) {
      mql.addListener(handler);
    }
  }

  // Network & RPC
  async function rpc(fn, body, skip) {
    const r = await fetch(SB + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const t = await r.text();
    let p = null;
    try { p = t ? JSON.parse(t) : null; } catch { p = t; }
    if (!r.ok) {
      const m = (p && p.message) || (p && p.error) || (typeof p === 'string' ? p : 'Ошибка запроса');
      if (!skip && /ADMIN_SESSION_INVALID|invalid authorization specification/i.test(m)) {
        forceLogout('Сессия истекла. Войдите снова.');
      }
      throw new Error(m);
    }
    return p;
  }

  // Toasts
  function toast(m, type) {
    const host = $('#toastHost') || document.body;
    const n = document.createElement('div');
    n.className = 'toast' + (type === 'error' ? ' error' : '');
    n.setAttribute('role', type === 'error' ? 'alert' : 'status');
    n.textContent = m;
    host.appendChild(n);
    setTimeout(() => {
      n.classList.add('toast-fade-out');
      setTimeout(() => n.remove(), 250);
    }, 3200);
  }

  // Saving indicator & load status
  function saving(on, text) {
    const ind = $('#saveIndicator');
    if (ind) ind.textContent = text || (on ? 'Сохраняем…' : 'Все изменения сохранены');
  }

  function setLoadStatus(visible, msg) {
    const bar = $('#loadStatus');
    if (!bar) return;
    if (!visible) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const msgEl = $('#loadStatusMsg') || bar.querySelector('.load-status-msg');
    if (msgEl) msgEl.textContent = msg || 'Ошибка загрузки данных';
  }

  // Busy Button Helper
  async function withBusy(btn, fn) {
    if (!btn || btn.disabled) return;
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = oldHtml;
    }
  }

  // Accessible Form Validation & Error Summary
  function clearFormValidation(form) {
    if (!form) return;
    $$('.form-field-error', form).forEach(el => el.remove());
    $$('[aria-invalid="true"]', form).forEach(el => {
      el.removeAttribute('aria-invalid');
      const desc = el.getAttribute('aria-describedby') || '';
      const cleaned = desc.split(/\s+/).filter(id => !id.endsWith('-error')).join(' ').trim();
      if (cleaned) el.setAttribute('aria-describedby', cleaned);
      else el.removeAttribute('aria-describedby');
    });
    const summary = form.querySelector('.form-error-summary');
    if (summary) summary.remove();
  }

  function getFieldLabelText(input) {
    if (!input) return 'Поле';
    const label = input.closest('label');
    if (label) {
      const textSpan = label.querySelector('.label-text, .filter-label, span:not(.field-hint):not(.sr-only)');
      if (textSpan && textSpan.textContent.trim()) return textSpan.textContent.trim();
    }
    if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
    return input.placeholder || input.name || 'Поле';
  }

  function getFriendlyValidationMessage(input) {
    if (!input.validity) return input.validationMessage || 'Неверное значение';
    const label = getFieldLabelText(input);
    if (input.validity.valueMissing) return `Поле «${label}» обязательно для заполнения`;
    if (input.validity.typeMismatch) {
      if (input.type === 'url') return `В поле «${label}» укажите корректную ссылку (URL)`;
      if (input.type === 'email') return `В поле «${label}» укажите корректный email`;
    }
    if (input.validity.rangeUnderflow) return `Значение в поле «${label}» не может быть меньше ${input.min}`;
    if (input.validity.rangeOverflow) return `Значение в поле «${label}» не может быть больше ${input.max}`;
    if (input.validity.stepMismatch) return `Значение в поле «${label}» не соответствует допустимому шагу`;
    if (input.validity.tooShort) return `Минимальная длина поля «${label}»: ${input.minLength} символов`;
    if (input.validity.tooLong) return `Максимальная длина поля «${label}»: ${input.maxLength} символов`;
    return input.validationMessage || 'Пожалуйста, проверьте значение поля';
  }

  function setFieldError(input, message) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    const formId = (input.form && input.form.getAttribute('id')) || '';
    const inputId = input.getAttribute('id') || ((formId ? formId + '-' : '') + (input.name || 'field'));
    if (!input.getAttribute('id')) input.setAttribute('id', inputId);
    const errorId = inputId + '-error';

    const curDesc = input.getAttribute('aria-describedby') || '';
    if (!curDesc.includes(errorId)) {
      input.setAttribute('aria-describedby', (curDesc + ' ' + errorId).trim());
    }

    let errEl = document.getElementById(errorId);
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.id = errorId;
      errEl.className = 'form-field-error';
      errEl.setAttribute('role', 'alert');
      const container = input.closest('.form-field') || input.closest('label') || input.parentElement;
      container.appendChild(errEl);
    }
    errEl.textContent = message;
    errEl.hidden = false;
  }

  function showFormValidationErrors(form, errors) {
    clearFormValidation(form);
    if (!errors || !errors.length) return;

    errors.forEach(err => setFieldError(err.input, err.message));

    const summary = document.createElement('div');
    summary.className = 'form-error-summary';
    summary.setAttribute('role', 'alert');
    summary.setAttribute('tabindex', '-1');

    const itemsHtml = errors.map(err => {
      const fieldId = err.input.id;
      const label = getFieldLabelText(err.input);
      return `<li><a href="#${fieldId}">${esc(label)}: ${esc(err.message)}</a></li>`;
    }).join('');

    summary.innerHTML = `
      <div class="form-error-summary-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>Пожалуйста, исправьте следующие ошибки:</strong>
      </div>
      <ul class="form-error-summary-list">${itemsHtml}</ul>
    `;

    $$('a[href^="#"]', summary).forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const targetId = link.getAttribute('href').slice(1);
        const target = document.getElementById(targetId);
        if (target) {
          target.focus();
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });

    form.prepend(summary);
    summary.focus();
  }

  function setFormServerSummaryError(form, serverMessage) {
    clearFormValidation(form);
    const summary = document.createElement('div');
    summary.className = 'form-error-summary form-error-server';
    summary.setAttribute('role', 'alert');
    summary.setAttribute('tabindex', '-1');
    summary.innerHTML = `
      <div class="form-error-summary-head">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>Ошибка сохранения:</strong>
      </div>
      <p class="form-error-summary-desc">${esc(serverMessage)}</p>
    `;
    form.prepend(summary);
    summary.focus();
  }

  // Native Dialogs with Focus Restoration & inert/Escape handling
  const dialogReturnFocusMap = new WeakMap();

  function getModal(idOrEl) {
    return typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  }

  function openModal(idOrEl) {
    const el = getModal(idOrEl);
    if (!el) return;

    if (!el.open && !dialogReturnFocusMap.has(el)) {
      const active = document.activeElement;
      if (active && active !== document.body) {
        dialogReturnFocusMap.set(el, {
          element: active,
          dishId: active.dataset ? active.dataset.editDish : null,
          catId: active.dataset ? active.dataset.editCat : null,
          elementId: active.id || null
        });
      }
    }
    clearFormValidation(el);

    if (typeof el.showModal === 'function') {
      if (!el.open) {
        el.showModal();
      }
    } else {
      el.hidden = false;
      el.setAttribute('open', '');
    }

    const focusTarget = el.querySelector('form input:not([type="hidden"]):not([disabled]), form select:not([disabled]), form textarea:not([disabled])') ||
                        el.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  function closeModal(idOrEl) {
    const el = getModal(idOrEl);
    if (!el) return;
    if (typeof el.close === 'function') {
      if (el.open) {
        el.close();
      }
    } else {
      el.hidden = true;
      el.removeAttribute('open');
    }

    const triggerInfo = dialogReturnFocusMap.get(el);
    dialogReturnFocusMap.delete(el);

    if (triggerInfo) {
      let target = triggerInfo.element;

      // If target element was removed or re-rendered during load, find its stable DOM counterpart
      if (!target || !document.contains(target)) {
        if (triggerInfo.dishId) {
          target = document.querySelector(`[data-edit-dish="${triggerInfo.dishId}"]`);
        } else if (triggerInfo.catId) {
          target = document.querySelector(`[data-edit-cat="${triggerInfo.catId}"]`);
        } else if (triggerInfo.elementId) {
          target = document.getElementById(triggerInfo.elementId);
        }
      }

      // Fallback to visible section primary action button if counterpart not found
      if (!target || !document.contains(target)) {
        if (el.id === 'dishModal') {
          target = document.getElementById('newDishBtn');
        } else if (el.id === 'categoryModal') {
          target = document.getElementById('newCategoryBtn');
        }
      }

      if (target && typeof target.focus === 'function' && document.contains(target)) {
        const parentDialog = target.closest('dialog');
        if (!parentDialog || parentDialog.open) {
          try { target.focus(); } catch (_) {}
        }
      }
    }
  }

  // Native Confirmation Dialog
  function showConfirm({ title, description, confirmText = 'Подтвердить', cancelText = 'Отмена', isDanger = false }) {
    return new Promise(resolve => {
      const dialog = $('#confirmDialog');
      if (!dialog || typeof dialog.showModal !== 'function') {
        const ok = window.confirm(title + '\n\n' + description);
        resolve(ok);
        return;
      }

      const titleEl = $('#confirmTitle');
      const descEl = $('#confirmDescription');
      const acceptBtn = $('#confirmAccept');
      const cancelBtn = $('#confirmCancel');

      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = description;
      if (acceptBtn) {
        acceptBtn.textContent = confirmText;
        acceptBtn.className = isDanger ? 'primary-btn danger-btn' : 'primary-btn';
      }
      if (cancelBtn) cancelBtn.textContent = cancelText;

      let handled = false;
      const finish = result => {
        if (handled) return;
        handled = true;
        dialog.removeEventListener('close', onClose);
        if (acceptBtn) acceptBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        closeModal(dialog);
        resolve(result);
      };

      const onClose = () => finish(false);
      dialog.addEventListener('close', onClose, { once: true });

      if (acceptBtn) acceptBtn.onclick = () => finish(true);
      if (cancelBtn) cancelBtn.onclick = () => finish(false);

      openModal(dialog);
    });
  }

  // Authentication & Session
  function forceLogout(msg) {
    S.token = '';
    S.data = null;
    sessionStorage.removeItem(TK);

    // Close any open native dialogs to prevent trapping the login screen
    $$('dialog').forEach(dialog => {
      if (dialog.open) {
        if (typeof dialog.close === 'function') {
          try { dialog.close(); } catch (_) {}
        }
        dialog.removeAttribute('open');
      }
      dialog.hidden = true;
    });

    document.body.classList.remove('sidebar-open');
    document.body.style.overflow = '';

    $('#adminApp').hidden = true;
    $('#loginScreen').hidden = false;
    const passInput = $('#loginPassword');
    if (passInput) passInput.value = '';
    const errBox = $('#loginError');
    if (errBox) {
      if (msg) {
        errBox.textContent = msg;
        errBox.hidden = false;
      } else {
        errBox.hidden = true;
      }
    }
  }

  async function login(pass) {
    const x = await rpc('admin_login', { p_password: pass, p_client_key: clientKey() }, true);
    if (!x || !x.ok || !x.token) throw new Error((x && x.error) || 'Не удалось войти');
    S.token = x.token;
    sessionStorage.setItem(TK, S.token);
    await boot();
  }

  async function logout() {
    try {
      if (S.token) await rpc('admin_logout', { p_token: S.token }, true);
    } catch (_) {}
    forceLogout();
  }

  async function mutate(a, p) {
    saving(true);
    try {
      const x = await rpc('admin_mutate', { p_token: S.token, p_action: a, p_payload: p || {} });
      saving(false);
      return x;
    } catch (e) {
      saving(false, 'Ошибка сохранения');
      throw e;
    }
  }

  function renderSkeletons() {
    if (S.data) return; // local skeleton initial only, never layout shift on refresh
    const kpis = $('#dashboardKpis');
    if (kpis) {
      kpis.innerHTML = Array(4).fill(0).map(() => '<div class="kpi-card skeleton-card"><div class="skeleton-line short"></div><div class="skeleton-line large"></div><div class="skeleton-line"></div></div>').join('');
    }
    const funnelEl = $('#dashboardFunnel');
    if (funnelEl) {
      funnelEl.innerHTML = Array(5).fill(0).map(() => '<div class="funnel-row skeleton-row"><div class="funnel-label skeleton-line short"></div><div class="funnel-track"><div class="funnel-fill skeleton-line" style="width:50%"></div></div><div class="funnel-value skeleton-line short"></div></div>').join('');
    }
    const chartEl = $('#activityChart');
    if (chartEl) {
      chartEl.innerHTML = '<div class="skeleton-card" style="height:200px;width:100%;"></div>';
    }
    const topDishes = $('#dashboardTopDishes');
    if (topDishes) {
      topDishes.innerHTML = Array(6).fill(0).map((_, i) => `<div class="rank-item skeleton-row"><div class="rank-index">${i + 1}</div><div class="rank-copy"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div><div class="rank-value skeleton-line short"></div></div>`).join('');
    }
    const health = $('#menuHealth');
    if (health) {
      health.innerHTML = Array(5).fill(0).map(() => '<div class="health-card skeleton-card"><div class="skeleton-line large"></div><div class="skeleton-line short"></div></div>').join('');
    }
    const body = $('#dishesBody');
    if (body) {
      body.innerHTML = Array(6).fill(0).map(() => '<tr><td colspan="6"><div class="skeleton-row"></div></td></tr>').join('');
    }
    const cats = $('#categoriesList');
    if (cats) {
      cats.innerHTML = Array(4).fill(0).map(() => '<div class="category-row skeleton-card"><div class="skeleton-line"></div></div>').join('');
    }
  }

  async function load(days, silent) {
    setLoadStatus(false);
    if (!silent) {
      saving(true, 'Загружаем данные…');
      if (!S.data) renderSkeletons();
    }
    try {
      const d = await rpc('admin_bootstrap', { p_token: S.token, p_days: days || S.days });
      S.data = d;
      S.days = Number(d.periodDays || days || 7);
      renderAll();
      if (!silent) saving(false);
      return d;
    } catch (e) {
      if (!silent) saving(false, 'Ошибка загрузки');
      if (S.data) {
        setLoadStatus(true, 'Не удалось обновить данные: ' + e.message);
      } else {
        setLoadStatus(true, 'Ошибка загрузки данных: ' + e.message);
      }
      throw e;
    }
  }

  async function boot() {
    $('#loginScreen').hidden = true;
    $('#adminApp').hidden = false;
    const errBox = $('#loginError');
    if (errBox) errBox.hidden = true;
    await load(S.days);
  }

  // Navigation & Mobile Sidebar
  const META = {
    dashboard: ['Обзор', 'Главные показатели меню'],
    analytics: ['Аналитика', 'Поведение посетителей'],
    dishes: ['Блюда', 'Управление каталогом'],
    categories: ['Категории', 'Структура меню'],
    content: ['Контент сайта', 'Контакты, график, адрес и тексты']
  };

  function openSidebar() {
    document.body.classList.add('sidebar-open');
    const toggle = $('#menuToggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    syncSidebarInert();
    const closeBtn = $('#sidebarClose');
    if (closeBtn) closeBtn.focus();
  }

  function closeSidebar() {
    if (!document.body.classList.contains('sidebar-open')) {
      syncSidebarInert();
      return;
    }
    document.body.classList.remove('sidebar-open');
    const toggle = $('#menuToggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      try { toggle.focus(); } catch (_) {}
    }
    syncSidebarInert();
  }

  function go(sec) {
    S.activeSection = sec;
    $$('.nav-item').forEach(x => {
      const active = x.dataset.section === sec;
      x.classList.toggle('active', active);
      if (active) {
        x.setAttribute('aria-current', 'page');
      } else {
        x.removeAttribute('aria-current');
      }
    });
    $$('.page-section').forEach(x => x.classList.toggle('active', x.id === 'section-' + sec));

    const m = META[sec] || ['Админ-панель', ''];
    if ($('#pageTitle')) $('#pageTitle').textContent = m[0];
    if ($('#breadcrumbSection')) $('#breadcrumbSection').textContent = m[0];
    if ($('#pageSub')) $('#pageSub').textContent = m[1];

    closeSidebar();
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  }

  function period(n) {
    n = Number(n);
    if (!n || n === S.days) return;
    S.days = n;
    $$('[data-period-host] button').forEach(b => {
      const active = Number(b.dataset.days) === n;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    load(n).catch(e => toast(e.message, 'error'));
  }

  // Dashboard & Analytics Visualizations
  function kpi(l, v, n) {
    return `<div class="kpi-card"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${esc(v)}</div><div class="kpi-note">${esc(n || '')}</div></div>`;
  }

  function renderKpis(host, cart) {
    if (!host) return;
    const m = S.data && S.data.analytics && S.data.analytics.metrics || {};
    const a = cart ? [
      ['Открыли корзину', fmt(m.cart_open), 'за период'],
      ['Добавили товары', fmt(m.cart_add), 'добавлений'],
      ['Открыли оформление', fmt(m.checkout_open), 'переход к данным'],
      ['Средняя корзина', money(m.avg_cart_total), 'перед оформлением']
    ] : [
      ['Посетители', fmt(m.visitors), 'уникальные устройства'],
      ['Просмотры блюд', fmt(m.product_view), 'открытия карточек'],
      ['Добавления в корзину', fmt(m.cart_add), 'действия на сайте'],
      ['Переходы в WhatsApp', fmt(m.whatsapp_click), (m.whatsapp_conversion || 0) + '% от открытий меню']
    ];
    host.innerHTML = a.map(x => kpi(x[0], x[1], x[2])).join('');
  }

  function chart(host) {
    if (!host) return;
    const d = S.data && S.data.analytics && S.data.analytics.byDay || [];
    if (!d.length) {
      host.innerHTML = '<div class="empty-state">Статистика появится после первых посещений меню.</div>';
      return;
    }
    const w = 700, h = 220, p = 24;
    const max = Math.max(1, ...d.map(x => Number(x.visitors || 0)));
    const xx = i => p + (d.length === 1 ? 0 : i * (w - p * 2) / (d.length - 1));
    const yy = v => h - p - Number(v || 0) * (h - p * 2) / max;
    const pts = d.map((x, i) => xx(i) + ',' + yy(x.visitors)).join(' ');
    const area = p + ',' + (h - p) + ' ' + pts + ' ' + xx(d.length - 1) + ',' + (h - p);
    const labs = d.map((x, i) => i % Math.max(1, Math.ceil(d.length / 6)) === 0 ? '<text class="chart-label" x="' + xx(i) + '" y="' + (h - 4) + '" text-anchor="middle">' + esc(String(x.date).slice(5)) + '</text>' : '').join('');
    const dots = d.map((x, i) => '<circle class="chart-dot" cx="' + xx(i) + '" cy="' + yy(x.visitors) + '" r="4" tabindex="0" aria-label="' + esc(x.date) + ': ' + fmt(x.visitors) + ' посетителей"><title>' + esc(x.date) + ': ' + fmt(x.visitors) + ' посетителей</title></circle>').join('');
    host.innerHTML = '<svg class="chart-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="Посетители по дням"><title>График: Посетители по дням</title><line class="chart-grid" x1="' + p + '" y1="' + (h - p) + '" x2="' + (w - p) + '" y2="' + (h - p) + '"/><line class="chart-grid" x1="' + p + '" y1="' + (h / 2) + '" x2="' + (w - p) + '" y2="' + (h / 2) + '"/><polygon class="chart-area" points="' + area + '"/><polyline class="chart-line" points="' + pts + '"/>' + dots + labs + '</svg>';
  }

  function funnel(host, rows) {
    if (!host) return;
    rows = rows || S.data && S.data.analytics && S.data.analytics.funnel || [];
    const max = Math.max(1, ...rows.map(x => Number(x.value || 0)));
    host.innerHTML = rows.map(r => `
      <div class="funnel-row">
        <div class="funnel-label">${esc(r.label)}</div>
        <div class="funnel-track" role="progressbar" aria-valuenow="${Math.max(1, Math.round(Number(r.value || 0) / max * 100))}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(r.label)}: ${fmt(r.value)}">
          <div class="funnel-fill" style="width:${Math.max(1, Number(r.value || 0) / max * 100)}%"></div>
        </div>
        <div class="funnel-value">${fmt(r.value)}</div>
      </div>
    `).join('') || '<div class="empty-state">Пока нет данных.</div>';
  }

  function score(r) {
    return Number(r.whatsapp || 0) * 8 + Number(r.cart_adds || 0) * 5 + Number(r.favorites || 0) * 3 + Number(r.views || 0);
  }

  function ranks(rows, val, sub, max) {
    if (!rows || !rows.length) return '<div class="empty-state">Пока недостаточно данных.</div>';
    return rows.slice(0, max || 6).map((r, i) => `
      <div class="rank-item">
        <div class="rank-index">${i + 1}</div>
        <div class="rank-copy">
          <strong>${esc(r.name || r.query || '—')}</strong>
          <span>${esc(sub ? sub(r) : '')}</span>
        </div>
        <div class="rank-value">${esc(val(r))}</div>
      </div>
    `).join('');
  }

  function bars(host, rows) {
    if (!host) return;
    const list = (rows || []).map(r => ({
      name: r.name || r.device || r.browser || 'Другое',
      count: Number(r.count != null ? r.count : r.value || 0)
    }));
    const total = list.reduce((s, x) => s + x.count, 0);
    if (!total) {
      host.innerHTML = '<div class="empty-state">Пока нет данных.</div>';
      return;
    }
    host.innerHTML = list.map(r => {
      const p = total > 0 ? Math.round(r.count / total * 100) : 0;
      return `
        <div class="stat-bar-item">
          <div class="stat-row-head">
            <span>${esc(r.name)}</span>
            <strong>${p}%</strong>
          </div>
          <div class="stat-track" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(r.name)}: ${p}%">
            <div class="stat-fill" style="width:${p}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function dashboard() {
    renderKpis($('#dashboardKpis'));
    chart($('#activityChart'));
    funnel($('#dashboardFunnel'));
    const st = [...(S.data && S.data.analytics && S.data.analytics.dishStats || [])].sort((a, b) => score(b) - score(a));
    const topDishes = $('#dashboardTopDishes');
    if (topDishes) {
      topDishes.innerHTML = ranks(st, r => fmt(score(r)), r => fmt(r.views) + ' просмотров · ' + fmt(r.cart_adds) + ' в корзину');
    }
    const d = S.data && S.data.dishes || [];
    const c = S.data && S.data.categories || [];
    const hidden = d.filter(x => !x.is_available).length;
    const scheduled = d.filter(x => x.scheduled_price && x.scheduled_price_at).length;
    const h = [
      ['Всего блюд', d.length],
      ['Опубликовано', d.length - hidden],
      ['Скрыто', hidden],
      ['Категорий', c.filter(x => x.is_visible).length],
      ['Цены запланированы', scheduled]
    ];
    const health = $('#menuHealth');
    if (health) {
      health.innerHTML = h.map(x => '<div class="health-card"><strong>' + fmt(x[1]) + '</strong><span>' + esc(x[0]) + '</span></div>').join('');
    }
  }

  function renderDishAnalytics() {
    const raw = (S.data && S.data.analytics && S.data.analytics.dishStats) || [];
    const q = (S.analyticsQ || '').toLowerCase().trim();
    let list = raw.filter(r => {
      if (!q) return true;
      const name = String(r.name || '').toLowerCase();
      const cat = String(r.category || '').toLowerCase();
      const pid = String(r.product_id || '').toLowerCase();
      return name.includes(q) || cat.includes(q) || pid.includes(q);
    });

    const sortMode = S.analyticsSort || 'score';
    list.sort((a, b) => {
      if (sortMode === 'views') return Number(b.views || 0) - Number(a.views || 0);
      if (sortMode === 'cart_adds') return Number(b.cart_adds || 0) - Number(a.cart_adds || 0);
      if (sortMode === 'whatsapp_clicks') return Number(b.whatsapp || 0) - Number(a.whatsapp || 0);
      if (sortMode === 'conversion') return Number(b.cart_conversion || 0) - Number(a.cart_conversion || 0);
      return score(b) - score(a);
    });

    const total = list.length;
    const pageSize = S.analyticsPageSize || 10;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (S.analyticsPage > totalPages) S.analyticsPage = totalPages;
    if (S.analyticsPage < 1) S.analyticsPage = 1;

    const start = (S.analyticsPage - 1) * pageSize;
    const pageRows = list.slice(start, start + pageSize);

    const body = $('#dishAnalyticsBody');
    if (body) {
      if (!raw.length) {
        body.innerHTML = '<tr><td colspan="6"><div class="empty-state">Данные появятся после первых действий пользователей.</div></td></tr>';
      } else if (!pageRows.length) {
        body.innerHTML = '<tr><td colspan="6"><div class="empty-state">По запросу «' + esc(q) + '» ничего не найдено.</div></td></tr>';
      } else {
        body.innerHTML = pageRows.map(r => `
          <tr>
            <td>
              <div class="product-copy">
                <strong>${esc(r.name || '#' + r.product_id)}</strong>
                <span>${esc(r.category || '')}</span>
              </div>
            </td>
            <td>${fmt(r.views)}</td>
            <td>${fmt(r.favorites)}</td>
            <td>${fmt(r.cart_adds)}</td>
            <td>${fmt(r.whatsapp)}</td>
            <td>${Number(r.cart_conversion || 0).toFixed(1)}%</td>
          </tr>
        `).join('');
      }
    }

    renderPagination($('#analyticsPagination'), S.analyticsPage, totalPages, p => {
      S.analyticsPage = p;
      renderDishAnalytics();
    });
  }

  function analytics() {
    renderKpis($('#analyticsKpis'));
    renderKpis($('#cartKpis'), true);
    chart($('#analyticsChart'));
    funnel($('#analyticsFunnel'));
    funnel($('#cartFunnel'), (S.data && S.data.analytics && S.data.analytics.funnel || []).filter(x => ['cart_add', 'checkout_open', 'whatsapp_click'].includes(x.key)));
    renderDishAnalytics();

    const searches = $('#searchRanking');
    if (searches) {
      searches.innerHTML = ranks(S.data && S.data.analytics && S.data.analytics.searches || [], r => fmt(r.count), () => 'поисковых запросов', 50);
    }
    const catRanking = $('#categoryRanking');
    if (catRanking) {
      catRanking.innerHTML = ranks(S.data && S.data.analytics && S.data.analytics.categories || [], r => fmt(r.views), r => fmt(r.cart_adds) + ' добавлений в корзину', 20);
    }
    bars($('#deviceStats'), S.data && S.data.analytics && S.data.analytics.devices || []);
    bars($('#browserStats'), S.data && S.data.analytics && S.data.analytics.browsers || []);
  }

  // Dishes Catalog: Filtering, Sorting, Pagination, Drag/Drop & Actions
  function visible(d) {
    if (!d.is_available) return false;
    const n = Date.now();
    if (d.hidden_from) {
      const a = new Date(d.hidden_from).getTime(), b = d.hidden_until ? new Date(d.hidden_until).getTime() : Infinity;
      if (n >= a && n < b) return false;
    }
    return true;
  }

  function dishesFiltered() {
    const q = S.q.toLowerCase().trim();
    let list = (S.data && S.data.dishes || []).filter(d =>
      (!q || String(d.name || '').toLowerCase().includes(q) || String(d.description || '').toLowerCase().includes(q)) &&
      (!S.cat || d.category_id === S.cat) &&
      (!S.status || (S.status === 'visible' && visible(d)) || (S.status === 'hidden' && !visible(d)))
    );

    if (S.dishSort === 'name') {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    } else if (S.dishSort === 'price_asc') {
      list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (S.dishSort === 'price_desc') {
      list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }
    // 'manual' preserves the exact order in S.data.dishes

    return list;
  }

  function filters() {
    const el = $('#dishCategoryFilter');
    if (!el) return;
    const v = el.value;
    el.innerHTML = '<option value="">Все категории</option>' + (S.data && S.data.categories || []).map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
    el.value = v || S.cat;
  }

  function bulk() {
    const countEl = $('#bulkCount');
    if (countEl) countEl.textContent = S.selected.size;
    const bar = $('#bulkBar');
    if (bar) bar.hidden = !S.selected.size;

    const f = dishesFiltered();
    const selectAll = $('#selectAllDishes');
    if (selectAll) {
      const someSelected = f.some(d => S.selected.has(d.id));
      const allSelected = f.length > 0 && f.every(d => S.selected.has(d.id));
      selectAll.checked = allSelected;
      selectAll.indeterminate = !allSelected && someSelected;
    }
  }

  function renderPagination(host, current, totalPages, onChange) {
    if (!host) return;
    if (totalPages <= 1) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.hidden = false;

    let html = '';
    html += '<button type="button" class="pagination-btn pagination-prev" ' + (current <= 1 ? 'disabled' : '') + ' data-page="' + (current - 1) + '" aria-label="Предыдущая страница">‹</button>';

    const getPages = () => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
      const pages = [1];
      if (current > 3) pages.push('…');
      const start = Math.max(2, current - 1);
      const end = Math.min(totalPages - 1, current + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (current < totalPages - 2) pages.push('…');
      pages.push(totalPages);
      return pages;
    };

    const pages = getPages();
    pages.forEach(p => {
      if (p === '…') {
        html += '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
      } else {
        const active = p === current;
        html += '<button type="button" class="pagination-btn ' + (active ? 'active' : '') + '" data-page="' + p + '" ' + (active ? 'aria-current="page"' : '') + '>' + p + '</button>';
      }
    });

    html += '<button type="button" class="pagination-btn pagination-next" ' + (current >= totalPages ? 'disabled' : '') + ' data-page="' + (current + 1) + '" aria-label="Следующая страница">›</button>';

    host.innerHTML = html;
    $$('button[data-page]', host).forEach(btn => {
      btn.onclick = () => {
        const p = Number(btn.dataset.page);
        if (p && p >= 1 && p <= totalPages && p !== current) {
          onChange(p);
        }
      };
    });
  }

  function dishes() {
    filters();
    const rows = dishesFiltered();
    const total = rows.length;
    const pageSize = S.dishPageSize === 'all' || S.dishPageSize === Infinity ? Infinity : Number(S.dishPageSize || 25);
    const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(total / pageSize));

    if (S.dishPage > totalPages) S.dishPage = totalPages;
    if (S.dishPage < 1) S.dishPage = 1;

    const start = pageSize === Infinity ? 0 : (S.dishPage - 1) * pageSize;
    const end = pageSize === Infinity ? total : Math.min(total, start + pageSize);
    const pageRows = rows.slice(start, end);

    const countEl = $('#dishResultCount');
    if (countEl) {
      if (total === 0) {
        countEl.textContent = 'Ничего не найдено';
      } else if (pageSize === Infinity || total <= pageSize) {
        countEl.textContent = 'Показано ' + total + ' из ' + (S.data && S.data.dishes || []).length;
      } else {
        countEl.textContent = 'Показано ' + (start + 1) + '–' + end + ' из ' + total;
      }
    }

    const body = $('#dishesBody');
    if (body) {
      if (!rows.length) {
        const hasCatalog = (S.data && S.data.dishes && S.data.dishes.length > 0);
        const hasCategories = (S.data && S.data.categories && S.data.categories.length > 0);
        if (!hasCatalog) {
          if (!hasCategories) {
            body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>В меню пока нет категорий. Для добавления блюд сначала создайте категорию.</p><button type="button" class="primary-btn compact" id="emptyDishCategoryBtn">' + iconSvg('plus') + '<span>Создать категорию</span></button></div></td></tr>';
          } else {
            body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>В каталоге пока нет блюд.</p><button type="button" class="primary-btn compact" id="emptyAddDishBtn">' + iconSvg('plus') + '<span>Добавить первое блюдо</span></button></div></td></tr>';
          }
        } else {
          body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>Ничего не найдено по текущим фильтрам.</p><button type="button" class="secondary-btn compact" id="resetDishFiltersBtn">Сбросить фильтры</button></div></td></tr>';
        }
      } else {
        const isManual = S.dishSort === 'manual';
        body.innerHTML = pageRows.map((d, idx) => {
          const isSelected = S.selected.has(d.id);
          const isAvail = !!d.is_available;
          const isFirst = idx === 0 && S.dishPage === 1;
          const isLast = idx === pageRows.length - 1 && S.dishPage === totalPages;
          return `
            <tr draggable="${isManual ? 'true' : 'false'}" data-dish-id="${d.id}" class="${isSelected ? 'selected' : ''}">
              <td class="check-col">
                <input type="checkbox" data-select-dish="${d.id}" ${isSelected ? 'checked' : ''} aria-label="Выбрать ${esc(d.name)}">
              </td>
              <td>
                <div class="product-cell">
                  ${isManual ? '<span class="drag-handle" title="Перетащите для изменения порядка" aria-hidden="true">' + iconSvg('drag') + '</span>' : ''}
                  <div class="product-thumb-wrap">
                    <img class="product-thumb" src="${esc(d.photo_url || '/api/branding?type=logo')}" alt="" loading="lazy" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';">
                    <div class="product-thumb-placeholder" style="display:none;" aria-hidden="true">
                      ${iconSvg('photo-sm')}
                    </div>
                  </div>
                  <div class="product-copy">
                    <strong>${esc(d.name)}</strong>
                    <span>#${d.public_id} · ${esc(d.weight || 'без веса')}${d.scheduled_price ? ' · новая цена запланирована' : ''}</span>
                  </div>
                </div>
              </td>
              <td>${esc(d.category_name || '')}</td>
              <td>
                <strong>${money(d.price)}</strong>
                ${d.scheduled_price ? '<div class="kpi-note">→ ' + money(d.scheduled_price) + '</div>' : ''}
              </td>
              <td>
                <button class="status-switch ${isAvail ? 'on' : ''}" role="switch" aria-checked="${isAvail}" aria-label="${isAvail ? 'Скрыть блюдо' : 'Опубликовать блюдо'} ${esc(d.name)}" data-toggle-dish="${d.id}"></button>
              </td>
              <td>
                <div class="row-actions">
                  <button class="small-action" data-edit-dish="${d.id}">Изменить</button>
                  <details class="row-menu">
                    <summary class="small-action icon-only" aria-label="Дополнительные действия">${iconSvg('more')}</summary>
                    <div class="menu-dropdown" popover="auto">
                      <button type="button" class="dropdown-item" data-copy-dish="${d.id}">Создать копию</button>
                      ${isManual ? `
                        <button type="button" class="dropdown-item" data-move-up="${d.id}" ${isFirst ? 'disabled' : ''}><span>Переместить выше</span> ${iconSvg('arrow-up')}</button>
                        <button type="button" class="dropdown-item" data-move-down="${d.id}" ${isLast ? 'disabled' : ''}><span>Переместить ниже</span> ${iconSvg('arrow-down')}</button>
                      ` : ''}
                    </div>
                  </details>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    renderPagination($('#dishPagination'), S.dishPage, totalPages, p => {
      S.dishPage = p;
      dishes();
    });

    bulk();
    bindDishRows();
  }

  function findDish(id) {
    return (S.data && S.data.dishes || []).find(x => x.id === id);
  }

  function findCat(id) {
    return (S.data && S.data.categories || []).find(x => x.id === id);
  }

  function bindDishRows() {
    $$('[data-select-dish]').forEach(i => {
      i.onchange = () => {
        if (i.checked) {
          S.selected.add(i.dataset.selectDish);
        } else {
          S.selected.delete(i.dataset.selectDish);
        }
        const row = i.closest('tr');
        if (row) row.classList.toggle('selected', i.checked);
        bulk();
      };
    });

    $$('[data-toggle-dish]').forEach(b => {
      b.onclick = async () => {
        const d = findDish(b.dataset.toggleDish);
        if (!d) return;
        if (d.is_available) {
          const ok = await showConfirm({
            title: 'Скрыть блюдо?',
            description: 'Блюдо «' + d.name + '» перестанет отображаться в публичном меню и станет недоступным для заказа.',
            confirmText: 'Скрыть блюдо',
            isDanger: true
          });
          if (!ok) return;
        }
        try {
          await mutate('toggle_dish', { id: d.id, is_available: !d.is_available });
          toast(d.is_available ? 'Блюдо скрыто' : 'Блюдо опубликовано');
          await load(S.days, true);
        } catch (e) {
          toast(e.message, 'error');
        }
      };
    });

    $$('[data-edit-dish]').forEach(b => {
      b.onclick = () => dishModal(findDish(b.dataset.editDish));
    });

    $$('[data-copy-dish]').forEach(b => {
      b.onclick = async () => {
        try {
          await mutate('duplicate_dish', { id: b.dataset.copyDish });
          toast('Копия создана и скрыта');
          await load(S.days, true);
        } catch (e) {
          toast(e.message, 'error');
        }
      };
    });

    function moveFilteredDish(dishId, direction) {
      const filtered = dishesFiltered();
      const fIdx = filtered.findIndex(x => x.id === dishId);
      if (fIdx < 0) return null;
      const targetFIdx = fIdx + direction;
      if (targetFIdx < 0 || targetFIdx >= filtered.length) return null;
      const targetDish = filtered[targetFIdx];

      const all = [...(S.data && S.data.dishes || [])];
      const fromIdx = all.findIndex(x => x.id === dishId);
      const targetIdx = all.findIndex(x => x.id === targetDish.id);
      if (fromIdx < 0 || targetIdx < 0) return null;

      const [item] = all.splice(fromIdx, 1);
      const newTargetIdx = all.findIndex(x => x.id === targetDish.id);
      const insertIdx = direction < 0 ? newTargetIdx : newTargetIdx + 1;
      all.splice(insertIdx, 0, item);
      return all;
    }

    $$('[data-move-up]').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.moveUp;
        const reordered = moveFilteredDish(id, -1);
        if (!reordered) return;
        S.data.dishes = reordered;
        dishes();
        try {
          await mutate('reorder_dishes', { ids: reordered.map(x => x.id) });
          toast('Порядок сохранён');
          await load(S.days, true);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });

    $$('[data-move-down]').forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.moveDown;
        const reordered = moveFilteredDish(id, 1);
        if (!reordered) return;
        S.data.dishes = reordered;
        dishes();
        try {
          await mutate('reorder_dishes', { ids: reordered.map(x => x.id) });
          toast('Порядок сохранён');
          await load(S.days, true);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });

    if (S.dishSort === 'manual') {
      $$('#dishesBody tr[draggable=true]').forEach(r => {
        r.ondragstart = e => {
          S.dragDish = r.dataset.dishId;
          r.classList.add('dragging');
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', r.dataset.dishId);
          }
        };
        r.ondragend = () => {
          S.dragDish = null;
          r.classList.remove('dragging');
        };
        r.ondragover = e => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        };
        r.ondrop = async e => {
          e.preventDefault();
          const a = S.dragDish, b = r.dataset.dishId;
          if (!a || a === b) return;
          const all = [...(S.data && S.data.dishes || [])];
          const from = all.findIndex(x => x.id === a), to = all.findIndex(x => x.id === b);
          if (from < 0 || to < 0) return;
          const mv = all.splice(from, 1)[0];
          all.splice(to, 0, mv);
          S.data.dishes = all;
          dishes();
          try {
            await mutate('reorder_dishes', { ids: all.map(x => x.id) });
            toast('Порядок сохранён');
            await load(S.days, true);
          } catch (err) {
            toast(err.message, 'error');
          }
        };
      });
    }

    $$('.dish-table details.row-menu').forEach(details => {
      const summary = details.querySelector('summary');
      const dropdown = details.querySelector('.menu-dropdown');
      if (!summary || !dropdown) return;

      const positionDropdown = () => {
        const rect = summary.getBoundingClientRect();
        const estHeight = 110;
        const estWidth = 180;
        const spaceBelow = window.innerHeight - rect.bottom;
        const showAbove = spaceBelow < estHeight && rect.top > estHeight;

        dropdown.style.position = 'fixed';
        dropdown.style.margin = '0';
        dropdown.style.left = `${Math.max(8, Math.min(window.innerWidth - estWidth - 8, rect.right - estWidth))}px`;
        dropdown.style.top = showAbove ? `${Math.max(8, rect.top - estHeight - 4)}px` : `${rect.bottom + 4}px`;
        dropdown.style.zIndex = '1000';
      };

      if (typeof dropdown.showPopover === 'function') {
        details.addEventListener('toggle', () => {
          if (details.open) {
            positionDropdown();
            try { dropdown.showPopover(); } catch (_) {}
            $$('.dish-table details.row-menu').forEach(other => {
              if (other !== details && other.open) other.open = false;
            });
          } else {
            try { dropdown.hidePopover(); } catch (_) {}
          }
        });

        dropdown.addEventListener('toggle', e => {
          if (e.newState === 'closed' && details.open) {
            details.open = false;
          }
        });
      } else {
        details.addEventListener('toggle', () => {
          if (details.open) {
            positionDropdown();
            $$('.dish-table details.row-menu').forEach(other => {
              if (other !== details && other.open) other.open = false;
            });
          }
        });
      }

      $$('.dropdown-item', dropdown).forEach(item => {
        item.addEventListener('click', () => {
          details.open = false;
        });
      });
    });
    const resetBtn = $('#resetDishFiltersBtn');
    if (resetBtn) {
      resetBtn.onclick = () => {
        S.q = '';
        S.cat = '';
        S.status = '';
        const searchInput = $('#dishSearch');
        if (searchInput) searchInput.value = '';
        const catFilter = $('#dishCategoryFilter');
        if (catFilter) catFilter.value = '';
        const statusFilter = $('#dishStatusFilter');
        if (statusFilter) statusFilter.value = '';
        S.dishPage = 1;
        dishes();
      };
    }

    const emptyAddBtn = $('#emptyAddDishBtn');
    if (emptyAddBtn) {
      emptyAddBtn.onclick = () => dishModal();
    }
    const emptyCatFromDishesBtn = $('#emptyDishCategoryBtn');
    if (emptyCatFromDishesBtn) {
      emptyCatFromDishesBtn.onclick = () => catModal();
    }
  }

  // Categories
  function categories() {
    const cats = (S.data && S.data.categories) || [];
    const list = $('#categoriesList');
    if (!list) return;

    if (!cats.length) {
      list.innerHTML = '<div class="empty-state"><p>В меню пока нет категорий.</p><button type="button" class="primary-btn compact" id="emptyAddCatBtn">' + iconSvg('plus') + '<span>Создать категорию</span></button></div>';
      const addBtn = $('#emptyAddCatBtn');
      if (addBtn) addBtn.onclick = () => catModal();
      return;
    }

    list.innerHTML = cats.map((c, idx) => {
      const n = (S.data && S.data.dishes || []).filter(d => d.category_id === c.id).length;
      const isFirst = idx === 0;
      const isLast = idx === cats.length - 1;
      return `
        <div class="category-row" draggable="true" data-category-id="${c.id}">
          <div class="drag-handle" title="Перетащите для изменения порядка" aria-hidden="true">${iconSvg('drag')}</div>
          <div class="category-copy">
            <strong>${esc(c.name)}</strong>
            <span>${n} блюд · ${esc(c.slug || '')}</span>
          </div>
          <div class="category-actions">
            <button class="status-switch ${c.is_visible ? 'on' : ''}" role="switch" aria-checked="${c.is_visible}" aria-label="${c.is_visible ? 'Скрыть категорию' : 'Опубликовать категорию'} ${esc(c.name)}" data-toggle-cat="${c.id}"></button>
            <button class="small-action" data-edit-cat="${c.id}">Изменить</button>
            <button class="small-action icon-only" data-cat-move-up="${c.id}" ${isFirst ? 'disabled' : ''} aria-label="Переместить категорию выше">${iconSvg('arrow-up')}</button>
            <button class="small-action icon-only" data-cat-move-down="${c.id}" ${isLast ? 'disabled' : ''} aria-label="Переместить категорию ниже">${iconSvg('arrow-down')}</button>
          </div>
        </div>
      `;
    }).join('');

    $$('[data-toggle-cat]').forEach(b => {
      b.onclick = async () => {
        const c = findCat(b.dataset.toggleCat);
        if (!c) return;
        if (c.is_visible) {
          const count = (S.data && S.data.dishes || []).filter(d => d.category_id === c.id).length;
          const ok = await showConfirm({
            title: 'Скрыть категорию?',
            description: 'Категория «' + c.name + '»' + (count ? ' и все входящие в неё блюда (' + count + ' шт.)' : '') + ' будут скрыты из публичного меню.',
            confirmText: 'Скрыть категорию',
            isDanger: true
          });
          if (!ok) return;
        }
        try {
          await mutate('toggle_category', { id: c.id, is_visible: !c.is_visible });
          toast(c.is_visible ? 'Категория скрыта' : 'Категория опубликована');
          await load(S.days, true);
        } catch (e) {
          toast(e.message, 'error');
        }
      };
    });

    $$('[data-edit-cat]').forEach(b => {
      b.onclick = () => catModal(findCat(b.dataset.editCat));
    });

    const moveCat = async (catId, delta) => {
      const all = [...(S.data && S.data.categories || [])];
      const idx = all.findIndex(x => x.id === catId);
      if (idx < 0) return;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= all.length) return;
      const item = all.splice(idx, 1)[0];
      all.splice(targetIdx, 0, item);
      S.data.categories = all;
      categories();
      try {
        await mutate('reorder_categories', { ids: all.map(x => x.id) });
        toast('Порядок категорий сохранён');
        await load(S.days, true);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    $$('[data-cat-move-up]').forEach(b => {
      b.onclick = () => moveCat(b.dataset.catMoveUp, -1);
    });
    $$('[data-cat-move-down]').forEach(b => {
      b.onclick = () => moveCat(b.dataset.catMoveDown, 1);
    });

    $$('#categoriesList [draggable=true]').forEach(r => {
      r.ondragstart = e => {
        S.dragCat = r.dataset.categoryId;
        r.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', r.dataset.categoryId);
        }
      };
      r.ondragend = () => {
        S.dragCat = null;
        r.classList.remove('dragging');
      };
      r.ondragover = e => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      };
      r.ondrop = async e => {
        e.preventDefault();
        const a = S.dragCat, b = r.dataset.categoryId;
        if (!a || a === b) return;
        const all = [...(S.data && S.data.categories || [])];
        const from = all.findIndex(x => x.id === a), to = all.findIndex(x => x.id === b);
        if (from < 0 || to < 0) return;
        const mv = all.splice(from, 1)[0];
        all.splice(to, 0, mv);
        S.data.categories = all;
        categories();
        try {
          await mutate('reorder_categories', { ids: all.map(x => x.id) });
          toast('Порядок категорий сохранён');
          await load(S.days, true);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    });
  }

  // Settings
  function settings() {
    const s = S.data && S.data.settings || {};
    const f = $('#settingsForm');
    if (!f) return;
    const names = ['restaurant_name', 'subtitle', 'city', 'schedule_open', 'schedule_close', 'delivery_text', 'free_delivery_from', 'whatsapp_number', 'phone_number', 'instagram_handle', 'instagram_url', 'address_text', 'map_url', 'map_embed_url', 'logo_url', 'banner_url', 'contact_button_text', 'whatsapp_order_title'];
    names.forEach(n => {
      if (f.elements[n]) f.elements[n].value = s[n] == null ? '' : s[n];
    });
    if (f.elements.popular_fallback_names) {
      f.elements.popular_fallback_names.value = Array.isArray(s.popular_fallback_names) ? s.popular_fallback_names.join('\n') : '';
    }
  }

  function renderAll() {
    dashboard();
    analytics();
    dishes();
    categories();
    settings();
    $$('[data-period-host] button').forEach(b => {
      const active = Number(b.dataset.days) === S.days;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  // Dish Card Preview & Price History
  function preview() {
    const f = $('#dishForm');
    if (!f) return;
    const name = f.elements.name ? (f.elements.name.value || '').trim() || 'Название блюда' : 'Название блюда';
    const price = f.elements.price ? f.elements.price.value || 0 : 0;
    const rawImg = (f.elements.detail_image_url && f.elements.detail_image_url.value.trim()) ||
                   (f.elements.photo_url && f.elements.photo_url.value.trim()) ||
                   '';
    const desc = f.elements.description ? (f.elements.description.value || '').trim() || 'Описание и состав блюда будут показаны здесь.' : 'Описание и состав блюда будут показаны здесь.';
    const w = f.elements.weight ? (f.elements.weight.value || '').trim() || '' : '';

    let mediaHtml = '';
    if (!rawImg) {
      mediaHtml = `
        <div class="preview-media-placeholder">
          ${iconSvg('photo')}
          <span>Фото не добавлено</span>
        </div>
      `;
    } else {
      mediaHtml = `
        <img src="${esc(rawImg)}" alt="" class="preview-card-img" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';">
        <div class="preview-media-placeholder" style="display:none;">
          ${iconSvg('photo')}
          <span>Не удалось загрузить фото</span>
        </div>
      `;
    }

    const prevEl = $('#dishPreview');
    if (prevEl) {
      prevEl.innerHTML = `
        <div class="preview-card">
          ${mediaHtml}
          <div class="preview-card-copy">
            <h3>${esc(name)}</h3>
            ${w ? '<div class="kpi-note">' + esc(w) + '</div>' : ''}
            <p>${esc(desc)}</p>
            <div class="preview-price">${money(price)}</div>
          </div>
        </div>
      `;
    }
  }

  function history(d) {
    const box = $('#priceHistoryBox');
    if (!box) return;
    if (!d) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const r = (S.data && S.data.priceHistory || []).filter(x => x.dish_id === d.id);
    const list = $('#priceHistoryList');
    if (list) {
      list.innerHTML = r.length ? r.map(x => `
        <div class="history-item">
          <span>${new Date(x.changed_at).toLocaleString('ru-RU')}</span>
          <strong>${x.old_price == null ? '—' : money(x.old_price)} → ${money(x.new_price)}</strong>
        </div>
      `).join('') : '<div class="empty-state">Цена ещё не менялась.</div>';
    }
  }

  // Dish Modal
  function dishModal(d) {
    const f = $('#dishForm');
    if (!f) return;
    f.reset();
    clearFormValidation(f);

    const catSelect = f.elements.category_id;
    if (catSelect) {
      catSelect.innerHTML = '<option value="" disabled' + (!d ? ' selected' : '') + '>Выберите категорию</option>' +
        (S.data && S.data.categories || []).map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
    }

    const defaultCat = S.data && S.data.categories && S.data.categories[0] && S.data.categories[0].id || '';
    const x = d || {
      id: '',
      name: '',
      category_id: defaultCat,
      price: '',
      old_price: '',
      weight: '',
      description: '',
      photo_url: '',
      detail_image_url: '',
      is_available: true
    };

    ['id', 'name', 'category_id', 'price', 'old_price', 'weight', 'description', 'photo_url', 'detail_image_url'].forEach(n => {
      if (f.elements[n]) f.elements[n].value = x[n] == null ? '' : x[n];
    });
    if (f.elements.is_available) f.elements.is_available.checked = x.is_available !== false;
    if (f.elements.hidden_from) f.elements.hidden_from.value = localInput(x.hidden_from);
    if (f.elements.hidden_until) f.elements.hidden_until.value = localInput(x.hidden_until);

    const title = $('#dishModalTitle');
    if (title) title.textContent = d ? 'Изменить блюдо' : 'Новое блюдо';
    const sub = $('#dishModalSub');
    if (sub) sub.textContent = d ? '#' + x.public_id + ' · ' + (x.category_name || '') : 'Заполните карточку блюда';

    const sVal = $('#schedulePriceValue');
    if (sVal) sVal.value = x.scheduled_price || '';
    const sDate = $('#schedulePriceDate');
    if (sDate) sDate.value = localInput(x.scheduled_price_at);
    const sStatus = $('#scheduledPriceStatus');
    if (sStatus) {
      sStatus.textContent = x.scheduled_price && x.scheduled_price_at ?
        money(x.scheduled_price) + ' · ' + new Date(x.scheduled_price_at).toLocaleString('ru-RU') :
        'Не запланирована';
    }
    const cancelBtn = $('#cancelScheduledPriceBtn');
    if (cancelBtn) cancelBtn.hidden = !(x.scheduled_price && x.scheduled_price_at);
    const schedBox = $('#scheduledPriceBox');
    if (schedBox) schedBox.hidden = !d;

    history(d);
    preview();
    openModal('dishModal');
  }

  function validateDishForm(f) {
    const errors = [];
    const nameInput = f.elements.name;
    if (!nameInput.value.trim()) {
      errors.push({ input: nameInput, message: 'Укажите название блюда' });
    }

    const catSelect = f.elements.category_id;
    if (!catSelect.value) {
      errors.push({ input: catSelect, message: 'Выберите категорию блюда' });
    }

    const priceInput = f.elements.price;
    const p = Number(priceInput.value);
    if (priceInput.value === '' || !Number.isFinite(p) || p < 0) {
      errors.push({ input: priceInput, message: 'Укажите корректную цену (0 или больше)' });
    }

    const oldPriceInput = f.elements.old_price;
    if (oldPriceInput && oldPriceInput.value !== '') {
      const op = Number(oldPriceInput.value);
      if (!Number.isFinite(op) || op < 0) {
        errors.push({ input: oldPriceInput, message: 'Старая цена должна быть числом (0 или больше)' });
      }
    }

    $$('input, select, textarea', f).forEach(el => {
      if (el.validity && !el.validity.valid) {
        if (!errors.some(e => e.input === el)) {
          errors.push({ input: el, message: getFriendlyValidationMessage(el) });
        }
      }
    });

    return errors;
  }

  async function saveDish() {
    const f = $('#dishForm');
    if (!f) return;
    const errors = validateDishForm(f);
    if (errors.length) {
      showFormValidationErrors(f, errors);
      return;
    }

    const fd = new FormData(f);
    const p = {
      id: fd.get('id') || null,
      name: fd.get('name').trim(),
      category_id: fd.get('category_id'),
      price: Number(fd.get('price') || 0),
      old_price: fd.get('old_price') === '' ? null : Number(fd.get('old_price')),
      weight: fd.get('weight') ? fd.get('weight').trim() : null,
      description: fd.get('description') ? fd.get('description').trim() : null,
      photo_url: fd.get('photo_url') ? fd.get('photo_url').trim() : null,
      detail_image_url: fd.get('detail_image_url') ? fd.get('detail_image_url').trim() : null,
      hidden_from: iso(fd.get('hidden_from')),
      hidden_until: iso(fd.get('hidden_until')),
      is_available: f.elements.is_available ? f.elements.is_available.checked : true
    };

    const submitBtn = f.querySelector('button[type="submit"]');
    await withBusy(submitBtn, async () => {
      try {
        await mutate('save_dish', p);
        closeModal('dishModal');
        toast('Блюдо сохранено');
        await load(S.days, true);
      } catch (e) {
        setFormServerSummaryError(f, e.message);
        toast(e.message, 'error');
      }
    });
  }

  // Category Modal
  function catModal(c) {
    const f = $('#categoryForm');
    if (!f) return;
    f.reset();
    clearFormValidation(f);
    if (f.elements.id) f.elements.id.value = c && c.id || '';
    if (f.elements.name) f.elements.name.value = c && c.name || '';
    if (f.elements.slug) f.elements.slug.value = c && c.slug || '';
    if (f.elements.is_visible) f.elements.is_visible.checked = c ? c.is_visible !== false : true;

    const title = $('#categoryModalTitle');
    if (title) title.textContent = c ? 'Изменить категорию' : 'Новая категория';
    openModal('categoryModal');
  }

  function validateCategoryForm(f) {
    const errors = [];
    const nameInput = f.elements.name;
    if (!nameInput.value.trim()) {
      errors.push({ input: nameInput, message: 'Укажите название категории' });
    }
    $$('input, select, textarea', f).forEach(el => {
      if (el.validity && !el.validity.valid) {
        if (!errors.some(e => e.input === el)) {
          errors.push({ input: el, message: getFriendlyValidationMessage(el) });
        }
      }
    });
    return errors;
  }

  async function saveCat() {
    const f = $('#categoryForm');
    if (!f) return;
    const errors = validateCategoryForm(f);
    if (errors.length) {
      showFormValidationErrors(f, errors);
      return;
    }

    const p = {
      id: f.elements.id.value || null,
      name: f.elements.name.value.trim(),
      slug: (f.elements.slug.value || '').trim(),
      is_visible: f.elements.is_visible ? f.elements.is_visible.checked : true
    };

    const submitBtn = f.querySelector('button[type="submit"]');
    await withBusy(submitBtn, async () => {
      try {
        await mutate('save_category', p);
        closeModal('categoryModal');
        toast('Категория сохранена');
        await load(S.days, true);
      } catch (e) {
        setFormServerSummaryError(f, e.message);
        toast(e.message, 'error');
      }
    });
  }

  // Price Scheduling
  function validateSchedulePriceInputs() {
    const box = $('#scheduledPriceBox');
    clearFormValidation(box);
    const errors = [];
    const valInput = $('#schedulePriceValue');
    const dateInput = $('#schedulePriceDate');

    const p = Number(valInput.value);
    if (valInput.value === '' || !Number.isFinite(p) || p < 0) {
      errors.push({ input: valInput, message: 'Укажите корректную новую цену (0 или больше)' });
    }
    if (!dateInput.value) {
      errors.push({ input: dateInput, message: 'Выберите дату и время вступления цены в силу' });
    }
    return errors;
  }

  async function schedule() {
    const f = $('#dishForm');
    const id = f.elements.id.value;
    const errors = validateSchedulePriceInputs();
    if (errors.length) {
      errors.forEach(err => setFieldError(err.input, err.message));
      errors[0].input.focus();
      return;
    }
    if (!id) {
      toast('Сначала сохраните блюдо', 'error');
      return;
    }

    const valInput = $('#schedulePriceValue');
    const dateInput = $('#schedulePriceDate');
    const p = Number(valInput.value);
    const d = dateInput.value;

    const btn = $('#schedulePriceBtn');
    await withBusy(btn, async () => {
      try {
        await mutate('schedule_price', {
          id: id,
          new_price: p,
          apply_at: new Date(d).toISOString()
        });
        toast('Изменение цены запланировано');
        await load(S.days, true);
        dishModal(findDish(id));
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  async function cancelSchedule() {
    const id = $('#dishForm').elements.id.value;
    if (!id) return;
    const ok = await showConfirm({
      title: 'Отменить запланированную цену?',
      description: 'Запланированное изменение цены для этого блюда будет удалено. Текущая цена останется без изменений.',
      confirmText: 'Отменить запланированную',
      isDanger: true
    });
    if (!ok) return;

    const btn = $('#cancelScheduledPriceBtn');
    await withBusy(btn, async () => {
      try {
        await mutate('cancel_scheduled_price', { id: id });
        toast('Отложенная цена отменена');
        await load(S.days, true);
        dishModal(findDish(id));
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  // Bulk Price Modal
  function validateBulkPriceForm(f) {
    const errors = [];
    const valInput = f.elements.value;
    const val = Number(valInput.value);
    if (valInput.value === '' || !Number.isFinite(val)) {
      errors.push({ input: valInput, message: 'Укажите числовое значение изменения цены' });
    }
    if (f.elements.mode.value === 'set' && val < 0) {
      errors.push({ input: valInput, message: 'Фиксированная цена не может быть отрицательной' });
    }
    return errors;
  }

  async function bulkPrice() {
    const f = $('#bulkPriceForm');
    if (!f) return;
    const errors = validateBulkPriceForm(f);
    if (errors.length) {
      showFormValidationErrors(f, errors);
      return;
    }
    if (!S.selected.size) {
      toast('Не выбрано ни одного блюда', 'error');
      return;
    }

    const mode = f.elements.mode.value;
    const val = Number(f.elements.value.value);

    let desc = 'Новые цены будут установлены для ' + S.selected.size + ' выбранных позиций.';
    if (mode === 'add') {
      desc = (val >= 0 ? 'Прибавить ' + money(val) : 'Вычесть ' + money(Math.abs(val))) + ' для ' + S.selected.size + ' выбранных позиций.';
    } else if (mode === 'percent') {
      desc = 'Изменить цены на ' + val + '% для ' + S.selected.size + ' выбранных позиций.';
    } else if (mode === 'set') {
      desc = 'Установить цену ' + money(val) + ' для ' + S.selected.size + ' выбранных позиций.';
    }

    const ok = await showConfirm({
      title: 'Применить изменение цен?',
      description: desc,
      confirmText: 'Применить цены'
    });
    if (!ok) return;

    const submitBtn = f.querySelector('button[type="submit"]');
    await withBusy(submitBtn, async () => {
      try {
        await mutate('batch_price', {
          ids: Array.from(S.selected),
          mode: mode,
          value: val
        });
        closeModal('bulkPriceModal');
        S.selected.clear();
        toast('Цены обновлены');
        await load(S.days, true);
      } catch (e) {
        setFormServerSummaryError(f, e.message);
        toast(e.message, 'error');
      }
    });
  }

  // Settings Save
  async function saveSettings() {
    const f = $('#settingsForm');
    if (!f) return;
    clearFormValidation(f);

    const errors = [];
    $$('input, select, textarea', f).forEach(el => {
      if (el.validity && !el.validity.valid) {
        errors.push({ input: el, message: getFriendlyValidationMessage(el) });
      }
    });
    if (errors.length) {
      showFormValidationErrors(f, errors);
      return;
    }

    const p = {};
    const names = ['restaurant_name', 'subtitle', 'city', 'schedule_open', 'schedule_close', 'delivery_text', 'free_delivery_from', 'whatsapp_number', 'phone_number', 'instagram_handle', 'instagram_url', 'address_text', 'map_url', 'map_embed_url', 'logo_url', 'banner_url', 'contact_button_text', 'whatsapp_order_title'];
    names.forEach(n => {
      if (f.elements[n]) p[n] = f.elements[n].value;
    });
    p.popular_fallback_names = (f.elements.popular_fallback_names && f.elements.popular_fallback_names.value || '').split('\n').map(x => x.trim()).filter(Boolean);

    const submitBtn = f.querySelector('button[type="submit"]');
    await withBusy(submitBtn, async () => {
      try {
        await mutate('save_settings', p);
        toast('Контент сайта сохранён');
        await load(S.days, true);
      } catch (e) {
        setFormServerSummaryError(f, e.message);
        toast(e.message, 'error');
      }
    });
  }

  // Media Upload
  async function uploadDishImage(file, targetName, button) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast('Файл больше 10 МБ', 'error');
      return;
    }
    const oldHtml = button.innerHTML;
    const textSpan = button.querySelector('span');
    button.disabled = true;
    if (textSpan) {
      textSpan.textContent = 'Загрузка…';
    } else {
      button.textContent = 'Загрузка…';
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(SB + '/functions/v1/menu-media-upload', {
        method: 'POST',
        headers: { 'x-admin-token': S.token },
        body: fd
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Не удалось загрузить изображение');
      const form = $('#dishForm');
      if (form && form.elements[targetName]) {
        form.elements[targetName].value = data.url;
      }
      preview();
      toast('Изображение загружено');
    } catch (e) {
      if (/Unauthorized/i.test(e.message)) forceLogout('Сессия истекла. Войдите снова.');
      else toast(e.message, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = oldHtml;
    }
  }

  // Initialization & Event Wiring
  function init() {
    // 1. Theme
    initSystemThemeListener();
    $$('select[data-theme-select]').forEach(sel => {
      sel.onchange = e => applyTheme(e.target.value, true);
    });
    $$('[data-theme-toggle]').forEach(btn => {
      btn.onclick = toggleTheme;
    });
    applyTheme(getStoredThemePreference(), false);

    // 2. Login Form
    const loginForm = $('#loginForm');
    if (loginForm) {
      loginForm.onsubmit = async e => {
        e.preventDefault();
        const errBox = $('#loginError');
        if (errBox) errBox.hidden = true;
        const passInput = $('#loginPassword');
        const pass = passInput ? passInput.value : '';
        if (!pass) {
          if (errBox) {
            errBox.textContent = 'Введите пароль администратора';
            errBox.hidden = false;
          }
          return;
        }
        const btn = $('#loginBtn');
        await withBusy(btn, async () => {
          try {
            await login(pass);
          } catch (x) {
            if (errBox) {
              errBox.textContent = x.message;
              errBox.hidden = false;
            }
          }
        });
      };
    }

    // 3. Navigation & Header Actions
    const logoutBtn = $('#logoutBtn');
    if (logoutBtn) logoutBtn.onclick = logout;

    const refreshBtn = $('#refreshBtn');
    if (refreshBtn) {
      refreshBtn.onclick = () => load(S.days).then(() => toast('Данные обновлены')).catch(e => toast(e.message, 'error'));
    }

    const retryBtn = $('#retryLoadBtn');
    if (retryBtn) {
      retryBtn.onclick = () => load(S.days).then(() => toast('Данные обновлены')).catch(e => toast(e.message, 'error'));
    }

    const menuToggle = $('#menuToggle');
    if (menuToggle) menuToggle.onclick = openSidebar;

    const sidebarClose = $('#sidebarClose');
    if (sidebarClose) sidebarClose.onclick = closeSidebar;

    const sidebarBackdrop = $('#sidebarBackdrop');
    if (sidebarBackdrop) sidebarBackdrop.onclick = closeSidebar;

    $$('.nav-item').forEach(b => {
      b.onclick = () => go(b.dataset.section);
    });
    $$('[data-go]').forEach(b => {
      b.onclick = () => go(b.dataset.go);
    });
    $$('[data-period-host] button').forEach(b => {
      b.onclick = () => period(b.dataset.days);
    });

    // 4. Analytics Tabs (Accessible tablist with Arrow key navigation)
    const tabs = $$('#analyticsTabs [data-analytics-tab]');
    tabs.forEach((b, idx) => {
      b.setAttribute('role', 'tab');
      b.onclick = () => {
        tabs.forEach(x => {
          const active = x === b;
          x.classList.toggle('active', active);
          x.setAttribute('aria-selected', String(active));
          x.tabIndex = active ? 0 : -1;
        });
        $$('[data-pane]').forEach(x => {
          const active = x.dataset.pane === b.dataset.analyticsTab;
          x.classList.toggle('active', active);
          x.hidden = !active;
        });
      };
      b.onkeydown = e => {
        let target = null;
        if (e.key === 'ArrowRight') target = tabs[(idx + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') target = tabs[(idx - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') target = tabs[0];
        else if (e.key === 'End') target = tabs[tabs.length - 1];
        if (target) {
          e.preventDefault();
          target.focus();
          target.click();
        }
      };
    });

    // 5. Analytics Table Search & Sort
    const aSearch = $('#analyticsSearch');
    if (aSearch) {
      aSearch.oninput = e => {
        S.analyticsQ = e.target.value;
        S.analyticsPage = 1;
        renderDishAnalytics();
      };
    }

    const aSort = $('#analyticsSort');
    if (aSort) {
      aSort.onchange = e => {
        S.analyticsSort = e.target.value;
        S.analyticsPage = 1;
        renderDishAnalytics();
      };
    }

    // 6. Dishes Table Controls
    const dishSearch = $('#dishSearch');
    if (dishSearch) {
      dishSearch.oninput = e => {
        S.q = e.target.value;
        S.dishPage = 1;
        dishes();
      };
    }

    const dishCatFilter = $('#dishCategoryFilter');
    if (dishCatFilter) {
      dishCatFilter.onchange = e => {
        S.cat = e.target.value;
        S.dishPage = 1;
        dishes();
      };
    }

    const dishStatusFilter = $('#dishStatusFilter');
    if (dishStatusFilter) {
      dishStatusFilter.onchange = e => {
        S.status = e.target.value;
        S.dishPage = 1;
        dishes();
      };
    }

    const dishSort = $('#dishSort');
    if (dishSort) {
      dishSort.onchange = e => {
        S.dishSort = e.target.value;
        dishes();
      };
    }

    const dishPageSize = $('#dishPageSize');
    if (dishPageSize) {
      dishPageSize.onchange = e => {
        S.dishPageSize = e.target.value === 'all' ? Infinity : Number(e.target.value);
        S.dishPage = 1;
        dishes();
      };
    }

    const selectAll = $('#selectAllDishes');
    if (selectAll) {
      selectAll.onchange = e => {
        const r = dishesFiltered();
        if (e.target.checked) r.forEach(d => S.selected.add(d.id));
        else r.forEach(d => S.selected.delete(d.id));
        dishes();
      };
    }

    const bulkClear = $('#bulkClearBtn');
    if (bulkClear) {
      bulkClear.onclick = () => {
        S.selected.clear();
        dishes();
      };
    }

    const bulkPriceBtn = $('#bulkPriceBtn');
    if (bulkPriceBtn) {
      bulkPriceBtn.onclick = () => {
        const form = $('#bulkPriceForm');
        if (form) form.reset();
        clearFormValidation(form);
        openModal('bulkPriceModal');
      };
    }

    const newDishBtn = $('#newDishBtn');
    if (newDishBtn) {
      newDishBtn.onclick = () => {
        const hasCategories = (S.data && S.data.categories && S.data.categories.length > 0);
        if (!hasCategories) {
          toast('Сначала создайте категорию для блюд');
          catModal();
        } else {
          dishModal();
        }
      };
    }

    const newCatBtn = $('#newCategoryBtn');
    if (newCatBtn) newCatBtn.onclick = () => catModal();

    // 7. Forms Submit Handlers & Validation
    $$('form').forEach(f => {
      f.noValidate = true;
      f.addEventListener('input', e => {
        const input = e.target;
        if (input && input.getAttribute('aria-invalid') === 'true') {
          input.removeAttribute('aria-invalid');
          const errorId = (input.id || '') + '-error';
          const errEl = document.getElementById(errorId);
          if (errEl) errEl.remove();
          const desc = input.getAttribute('aria-describedby') || '';
          const cleaned = desc.split(/\s+/).filter(id => id !== errorId).join(' ').trim();
          if (cleaned) input.setAttribute('aria-describedby', cleaned);
          else input.removeAttribute('aria-describedby');
        }
      });
      f.addEventListener('change', e => {
        const input = e.target;
        if (input && input.getAttribute('aria-invalid') === 'true') {
          input.removeAttribute('aria-invalid');
          const errorId = (input.id || '') + '-error';
          const errEl = document.getElementById(errorId);
          if (errEl) errEl.remove();
        }
      });
    });

    const dishForm = $('#dishForm');
    if (dishForm) {
      dishForm.onsubmit = e => {
        e.preventDefault();
        saveDish();
      };
      dishForm.addEventListener('input', preview);
    }

    const catForm = $('#categoryForm');
    if (catForm) {
      catForm.onsubmit = e => {
        e.preventDefault();
        saveCat();
      };
    }

    const bulkPriceForm = $('#bulkPriceForm');
    if (bulkPriceForm) {
      bulkPriceForm.onsubmit = e => {
        e.preventDefault();
        bulkPrice();
      };
    }

    const settingsForm = $('#settingsForm');
    if (settingsForm) {
      settingsForm.onsubmit = e => {
        e.preventDefault();
        saveSettings();
      };
    }
    const schedBtn = $('#schedulePriceBtn');
    if (schedBtn) schedBtn.onclick = schedule;

    const cancelSchedBtn = $('#cancelScheduledPriceBtn');
    if (cancelSchedBtn) cancelSchedBtn.onclick = cancelSchedule;

    // 8. Media Upload Triggers
    $$('[data-upload-target]').forEach(btn => {
      const input = $('#' + btn.dataset.fileInput);
      if (!input) return;
      btn.onclick = () => input.click();
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (file) {
          uploadDishImage(file, btn.dataset.uploadTarget, btn).finally(() => {
            input.value = '';
          });
        }
      };
    });

    // 9. Modals Close Handlers (Buttons, Backdrop clicks, Native cancel)
    $$('[data-close-modal]').forEach(b => {
      b.onclick = () => closeModal(b.dataset.closeModal);
    });

    $$('dialog.modal-backdrop, dialog').forEach(dialog => {
      dialog.addEventListener('click', e => {
        if (e.target === dialog) {
          closeModal(dialog);
        }
      });
      dialog.addEventListener('cancel', e => {
        e.preventDefault();
        closeModal(dialog);
      });
    });

    // 10. Global Keyboard Handlers (Escape)
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const openDialog = $$('dialog[open]').pop();
        if (openDialog) {
          closeModal(openDialog);
        } else if (document.body.classList.contains('sidebar-open')) {
          closeSidebar();
        }
      }
    });

    // 11. Responsive Sidebar Inert Management
    if (mobileMq) {
      const onMqChange = () => syncSidebarInert();
      if (mobileMq.addEventListener) mobileMq.addEventListener('change', onMqChange);
      else if (mobileMq.addListener) mobileMq.addListener(onMqChange);
    }
    syncSidebarInert();
  }

  // Boot
  init();
  if (S.token) {
    boot().catch(e => forceLogout(e.message));
  }
})();