(function (root) {
  'use strict';

  function normalizePhotoUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    if (/^\/(?!\/)/.test(raw) && !raw.includes('\\')) return raw;
    try {
      const url = new URL(raw);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (_) { return null; }
  }

  function groupCatalog(categories, dishes) {
    const sorted = categories.slice().sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));
    return sorted.map((category) => ({
      category,
      dishes: dishes.filter((dish) => dish.categoryId === category.id)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name))),
    }));
  }

  function routeForPath(pathname) {
    if (pathname === '/stats') return 'stats';
    if (pathname === '/admin/tables') return 'tables';
    return 'menu';
  }

  function almatyDateParts(now) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
  }

  function dateString(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function statsPresetRange(preset, now = new Date()) {
    const current = almatyDateParts(now);
    const to = new Date(Date.UTC(current.year, current.month - 1, current.day));
    const from = new Date(to);
    if (preset === 'month') from.setUTCDate(1);
    else from.setUTCDate(from.getUTCDate() - (preset === '30' ? 29 : 6));
    return { from: dateString(from), to: dateString(to) };
  }

  const API_ERRORS_RU = {
    Unauthorized: 'Сессия истекла. Войдите снова.',
    'Unable to sign in': 'Не удалось войти. Проверьте логин и пароль.',
    'Method not allowed': 'Это действие недоступно.',
    'Invalid category': 'Проверьте данные категории.',
    'Category not found': 'Категория не найдена.',
    'Category is in use': 'Категория используется и не может быть удалена.',
    'Unable to create category': 'Не удалось создать категорию.',
    'Unable to update category': 'Не удалось обновить категорию.',
    'Unable to delete category': 'Не удалось удалить категорию.',
    'Unable to load categories': 'Не удалось загрузить категории.',
    'Invalid dish': 'Проверьте данные блюда.',
    'Dish not found': 'Блюдо не найдено.',
    'Unable to create dish': 'Не удалось создать блюдо.',
    'Unable to update dish': 'Не удалось обновить блюдо.',
    'Unable to delete dish': 'Не удалось удалить блюдо.',
    'Unable to load dishes': 'Не удалось загрузить блюда.',
    'Invalid table': 'Проверьте номер или название стола.',
    'Table not found': 'Стол не найден.',
    'Table number already exists': 'Стол с таким номером уже существует.',
    'Table already exists': 'Такой стол уже существует.',
    'Table has an open session': 'У стола есть активная сессия.',
    'Table has session history and cannot be deleted': 'Стол с историей заказов удалить нельзя.',
    'Unable to create table': 'Не удалось создать стол.',
    'Unable to delete table': 'Не удалось удалить стол.',
    'Unable to load tables': 'Не удалось загрузить столы.',
    'Unable to generate QR code': 'Не удалось создать QR-код.',
    'Invalid statistics range': 'Проверьте выбранный период.',
    'Unable to load statistics': 'Не удалось загрузить статистику.',
  };

  function translateApiError(message) {
    return API_ERRORS_RU[message] || 'Не удалось выполнить действие. Попробуйте ещё раз.';
  }

  if (typeof module !== 'undefined') module.exports = {
    normalizePhotoUrl,
    groupCatalog,
    routeForPath,
    statsPresetRange,
    translateApiError,
  };
  if (!root || !root.document) return;

  const doc = root.document;
  const state = { categories: [], dishes: [], tables: [], editingCategory: null, editingDish: null };
  let menuRequest = 0;
  let tablesRequest = 0;
  let statsRequest = 0;
  let statsChart = null;
  let dialogRevision = 0;
  let mutationRevision = 0;
  let authTransitioned = false;
  const latestMutation = { category: new Map(), dish: new Map(), table: new Map() };
  const confirmedDeletion = { category: new Map(), dish: new Map(), table: new Map() };
  const submittingForms = new WeakSet();
  const $ = (id) => doc.getElementById(id);
  const showLogin = () => {
    if (authTransitioned) return;
    authTransitioned = true;
    menuRequest += 1;
    tablesRequest += 1;
    statsRequest += 1;
    destroyStatsChart();
    const dialog = $('editor-dialog');
    if (dialog.open) dialog.close();
    setMobileNavigation(false);
    $('loading-state').hidden = true;
    $('admin-view').hidden = true;
    $('login-view').hidden = false;
    showError('login-error', '');
    $('login').focus();
  };
  const api = async (url, options = {}) => {
    const response = await root.fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(translateApiError(body && body.error));
      error.status = response.status;
      if (response.status === 401) {
        error.authHandled = true;
        showLogin();
      }
      throw error;
    }
    return body;
  };
  const text = (tag, value, className) => { const node = doc.createElement(tag); node.textContent = value == null ? '' : String(value); if (className) node.className = className; return node; };
  const button = (label, className, handler) => { const node = text('button', label, `button button-ghost ${className || ''}`); node.type = 'button'; node.addEventListener('click', handler); return node; };
  const showToast = (message, error) => { const toast = text('div', message, `toast${error ? ' error' : ''}`); toast.setAttribute('role', 'status'); $('toast-region').append(toast); root.setTimeout(() => toast.remove(), 4500); };
  const openDialog = (form, titleId) => { dialogRevision += 1; for (const child of $('editor-dialog').querySelectorAll('form')) child.hidden = child !== form; $('editor-dialog').setAttribute('aria-labelledby', titleId); $('editor-dialog').showModal(); };
  const closeDialog = () => $('editor-dialog').close();
  const showError = (id, message) => { $(id).textContent = message || ''; };
  const money = (value) => `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  const startMutation = (entity, id) => {
    const revision = ++mutationRevision;
    latestMutation[entity].set(id, revision);
    return revision;
  };
  const isLatestMutation = (entity, id, revision) => latestMutation[entity].get(id) === revision;
  const updateById = (collection, id, value) => {
    const current = collection.find((item) => item.id === id);
    if (current) { Object.assign(current, value); return current; }
    return null;
  };
  const withoutConfirmedDeletions = (entity, collection) => collection.filter((value) => !confirmedDeletion[entity].has(value.id));
  const upsertById = (entity, collection, value) => {
    if (confirmedDeletion[entity].has(value.id)) return null;
    const current = updateById(collection, value.id, value);
    if (current) return current;
    collection.push(value);
    return value;
  };
  const currentPage = () => routeForPath(root.location.pathname);
  const reportError = (error, inlineId) => {
    if (error.authHandled) return;
    const message = error.status ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.';
    if (inlineId) showError(inlineId, message);
    else showToast(message, true);
  };
  async function submitForm(form, errorId, work, isCurrent = () => true) {
    if (submittingForms.has(form)) return;
    submittingForms.add(form);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try { await work(); }
    catch (error) { if (isCurrent()) reportError(error, errorId); }
    finally { submittingForms.delete(form); submit.disabled = false; }
  }

  function setNavigation(page) {
    const titles = { menu: 'Управление меню', tables: 'Столы и QR-коды', stats: 'Статистика' };
    $('page-title').textContent = titles[page];
    for (const link of doc.querySelectorAll('[data-route]')) {
      if (link.dataset.route === page) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    $('menu-page').hidden = page !== 'menu'; $('tables-page').hidden = page !== 'tables'; $('stats-page').hidden = page !== 'stats';
    if (page !== 'stats') destroyStatsChart();
  }

  async function loadMenu() {
    const request = ++menuRequest;
    $('menu-content').replaceChildren(text('div', 'Загружаем меню…', 'empty'));
    try {
      const [categories, dishes] = await Promise.all([api('/api/admin/categories'), api('/api/admin/dishes')]);
      if (request !== menuRequest || currentPage() !== 'menu' || authTransitioned) return;
      state.categories = withoutConfirmedDeletions('category', categories.categories || []);
      state.dishes = withoutConfirmedDeletions('dish', dishes.dishes || []);
      renderMenu();
    } catch (error) {
      if (request !== menuRequest || currentPage() !== 'menu' || authTransitioned) return;
      reportError(error); $('menu-content').replaceChildren(text('div', 'Не удалось загрузить меню. Попробуйте ещё раз.', 'empty'));
    }
  }

  function renderMenu() {
    $('category-count').textContent = state.categories.length; $('dish-count').textContent = state.dishes.length;
    $('available-count').textContent = state.dishes.filter((dish) => dish.isAvailable).length;
    const target = $('menu-content'); clear(target);
    if (!state.categories.length) { target.append(text('div', 'Категорий пока нет. Добавьте первую категорию.', 'empty')); return; }
    for (const group of groupCatalog(state.categories, state.dishes)) {
      const card = doc.createElement('article'); card.className = 'category-card';
      const count = group.dishes.length;
      const ending = count % 10 === 1 && count % 100 !== 11 ? 'блюдо'
        : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'блюда' : 'блюд');
      const head = doc.createElement('div'); head.className = 'category-head'; head.append(text('h4', group.category.name), text('span', `${count} ${ending}`, 'badge'));
      head.append(button('Изменить', '', () => editCategory(group.category)), button('Удалить', 'danger', () => deleteCategory(group.category))); card.append(head);
      if (!group.dishes.length) card.append(text('div', 'В этой категории пока нет блюд.', 'empty'));
      for (const dish of group.dishes) card.append(dishRow(dish));
      target.append(card);
    }
  }

  function dishRow(dish) {
    const row = doc.createElement('div'); row.className = 'dish-row';
    if (normalizePhotoUrl(dish.photoUrl)) { const image = doc.createElement('img'); image.className = 'dish-photo'; image.src = normalizePhotoUrl(dish.photoUrl); image.alt = ''; image.addEventListener('error', () => { image.replaceWith(text('span', '◌', 'photo-placeholder')); }); row.append(image); }
    else row.append(text('span', '◌', 'photo-placeholder'));
    const info = doc.createElement('div'); info.className = 'dish-info'; info.append(text('strong', dish.name), text('span', dish.description || 'Описание не указано')); row.append(info);
    row.append(text('span', money(dish.price), 'money'));
    const availability = doc.createElement('label'); availability.className = 'switch-row'; const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(dish.isAvailable); input.setAttribute('aria-label', `${input.checked ? 'Скрыть' : 'Показать'} блюдо «${dish.name}»`); const slider = text('span', '', 'switch'); input.addEventListener('change', () => toggleAvailability(dish, input)); availability.append(input, slider, text('span', input.checked ? 'Доступно' : 'Скрыто', 'badge')); row.append(availability);
    const actions = doc.createElement('div'); actions.className = 'row-actions'; actions.append(button('Изменить', '', () => editDish(dish)), button('Удалить', 'danger', () => deleteDish(dish))); row.append(actions); return row;
  }

  async function toggleAvailability(dish, input) {
    const mutation = startMutation('dish', dish.id);
    const previous = dish.isAvailable; const next = input.checked; input.disabled = true; input.parentElement.lastElementChild.textContent = 'Сохраняем…'; dish.isAvailable = next;
    try { const result = await api(`/api/admin/dishes/${encodeURIComponent(dish.id)}`, { method: 'PATCH', body: JSON.stringify({ is_available: next }) }); menuRequest += 1; if (!isLatestMutation('dish', dish.id, mutation)) return; const current = updateById(state.dishes, dish.id, result.dish || { isAvailable: next }); renderMenu(); showToast(next ? `Блюдо «${current ? current.name : dish.name}» доступно.` : `Блюдо «${current ? current.name : dish.name}» скрыто.`); }
    catch (error) { if (!isLatestMutation('dish', dish.id, mutation)) return; const current = state.dishes.find((item) => item.id === dish.id); if (current) current.isAvailable = previous; renderMenu(); reportError(error); }
  }

  function editCategory(category) { state.editingCategory = category; showError('category-form-error', ''); $('category-name').value = category.name; $('category-sort-order').value = category.sortOrder; $('dialog-title').textContent = 'Изменить категорию'; openDialog($('category-form'), 'dialog-title'); }
  function newCategory() { state.editingCategory = null; $('category-form').reset(); showError('category-form-error', ''); $('category-sort-order').value = 0; $('dialog-title').textContent = 'Новая категория'; openDialog($('category-form'), 'dialog-title'); }
  async function saveCategory(event) {
    event.preventDefault();
    const form = $('category-form');
    if (submittingForms.has(form)) return;
    showError('category-form-error', '');
    const editingCategory = state.editingCategory;
    const revision = dialogRevision;
    const mutation = editingCategory ? startMutation('category', editingCategory.id) : null;
    const body = { name: $('category-name').value.trim(), sort_order: Number($('category-sort-order').value || 0) };
    await submitForm(form, 'category-form-error', async () => {
      const result = await api(editingCategory ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories', { method: editingCategory ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      menuRequest += 1;
      if (editingCategory && !isLatestMutation('category', editingCategory.id, mutation)) return;
      const saved = editingCategory
        ? updateById(state.categories, editingCategory.id, result.category)
        : upsertById('category', state.categories, result.category);
      if (revision === dialogRevision) closeDialog();
      renderMenu(); if (editingCategory || saved) showToast('Категория сохранена.');
    }, () => revision === dialogRevision && (!editingCategory || isLatestMutation('category', editingCategory.id, mutation)));
  }
  function fillCategories() { const select = $('dish-category'); clear(select); for (const category of state.categories) select.append(new Option(category.name, category.id)); }
  function editDish(dish) { state.editingDish = dish; showError('dish-form-error', ''); fillCategories(); $('dish-name').value = dish.name; $('dish-description').value = dish.description || ''; $('dish-price').value = dish.price; $('dish-cost-price').value = dish.costPrice == null ? '' : dish.costPrice; $('dish-photo-url').value = dish.photoUrl || ''; $('dish-category').value = dish.categoryId; $('dish-sort-order').value = dish.sortOrder; $('dish-available').checked = dish.isAvailable; $('dish-dialog-title').textContent = 'Изменить блюдо'; updatePhotoPreview(); openDialog($('dish-form'), 'dish-dialog-title'); }
  function newDish() { state.editingDish = null; $('dish-form').reset(); showError('dish-form-error', ''); fillCategories(); $('dish-dialog-title').textContent = 'Новое блюдо'; $('photo-preview').hidden = true; openDialog($('dish-form'), 'dish-dialog-title'); }
  async function saveDish(event) {
    event.preventDefault();
    const form = $('dish-form');
    if (submittingForms.has(form)) return;
    showError('dish-form-error', '');
    const photo = normalizePhotoUrl($('dish-photo-url').value);
    if ($('dish-photo-url').value.trim() && !photo) { showError('dish-form-error', 'Укажите ссылку http(s) или путь, начинающийся с /.'); return; }
    const editingDish = state.editingDish;
    const revision = dialogRevision;
    const mutation = editingDish ? startMutation('dish', editingDish.id) : null;
    const body = { category_id: $('dish-category').value, name: $('dish-name').value.trim(), description: $('dish-description').value.trim() || null, price: Number($('dish-price').value), cost_price: $('dish-cost-price').value === '' ? null : Number($('dish-cost-price').value), photo_url: photo, is_available: $('dish-available').checked, sort_order: Number($('dish-sort-order').value || 0) };
    await submitForm(form, 'dish-form-error', async () => {
      const result = await api(editingDish ? `/api/admin/dishes/${editingDish.id}` : '/api/admin/dishes', { method: editingDish ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      menuRequest += 1;
      if (editingDish && !isLatestMutation('dish', editingDish.id, mutation)) return;
      const saved = editingDish
        ? updateById(state.dishes, editingDish.id, result.dish)
        : upsertById('dish', state.dishes, result.dish);
      if (revision === dialogRevision) closeDialog();
      renderMenu(); if (editingDish || saved) showToast('Блюдо сохранено.');
    }, () => revision === dialogRevision && (!editingDish || isLatestMutation('dish', editingDish.id, mutation)));
  }
  async function deleteCategory(category) { if (!root.confirm(`Удалить категорию «${category.name}»? Категорию с блюдами удалить нельзя.`)) return; const mutation = startMutation('category', category.id); try { await api(`/api/admin/categories/${category.id}`, { method: 'DELETE' }); confirmedDeletion.category.set(category.id, mutation); menuRequest += 1; state.categories = state.categories.filter((item) => item.id !== category.id); renderMenu(); showToast('Категория удалена.'); } catch (error) { if (isLatestMutation('category', category.id, mutation)) reportError(error); } }
  async function deleteDish(dish) { if (!root.confirm(`Удалить блюдо «${dish.name}»? Это действие нельзя отменить.`)) return; const mutation = startMutation('dish', dish.id); try { await api(`/api/admin/dishes/${dish.id}`, { method: 'DELETE' }); confirmedDeletion.dish.set(dish.id, mutation); menuRequest += 1; state.dishes = state.dishes.filter((item) => item.id !== dish.id); renderMenu(); showToast('Блюдо удалено.'); } catch (error) { if (isLatestMutation('dish', dish.id, mutation)) reportError(error); } }

  async function loadTables() {
    const request = ++tablesRequest;
    $('tables-content').replaceChildren(text('div', 'Загружаем столы…', 'empty'));
    try {
      const result = await api('/api/admin/tables');
      if (request !== tablesRequest || currentPage() !== 'tables' || authTransitioned) return;
      state.tables = withoutConfirmedDeletions('table', result.tables || []); renderTables();
    } catch (error) {
      if (request !== tablesRequest || currentPage() !== 'tables' || authTransitioned) return;
      reportError(error); $('tables-content').replaceChildren(text('div', 'Не удалось загрузить столы. Попробуйте ещё раз.', 'empty'));
    }
  }
  function renderTables() { const count = state.tables.length; const ending = count % 10 === 1 && count % 100 !== 11 ? 'стол' : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'стола' : 'столов'); $('table-count').textContent = `${count} ${ending}`; const target = $('tables-content'); clear(target); if (!state.tables.length) { target.append(text('div', 'Столов пока нет. Добавьте первый стол, чтобы создать QR-код.', 'empty')); return; } const table = doc.createElement('table'); const head = doc.createElement('thead'); const tr = doc.createElement('tr'); for (const label of ['Стол', 'Создан', 'Действия']) tr.append(text('th', label)); head.append(tr); table.append(head); const body = doc.createElement('tbody'); for (const item of state.tables) { const row = doc.createElement('tr'); row.append(text('td', item.number)); row.append(text('td', item.createdAt ? new Date(item.createdAt).toLocaleDateString('ru-RU') : '—')); const actions = doc.createElement('td'); actions.className = 'row-actions'; actions.append(button('Скачать QR-код', '', () => downloadQr(item)), button('Удалить', 'danger', () => deleteTable(item))); row.append(actions); body.append(row); } table.append(body); target.append(table); }
  function newTable() { $('table-form').reset(); showError('table-form-error', ''); $('table-dialog-title').textContent = 'Добавить стол'; openDialog($('table-form'), 'table-dialog-title'); }
  async function saveTable(event) {
    event.preventDefault();
    const form = $('table-form');
    if (submittingForms.has(form)) return;
    showError('table-form-error', '');
    const revision = dialogRevision;
    await submitForm(form, 'table-form-error', async () => {
      const result = await api('/api/admin/tables', { method: 'POST', body: JSON.stringify({ number: $('table-number').value.trim() }) });
      tablesRequest += 1;
      const saved = upsertById('table', state.tables, result.table);
      if (revision === dialogRevision) closeDialog();
      renderTables(); if (saved) showToast('Стол создан.');
    }, () => revision === dialogRevision);
  }
  async function deleteTable(item) { if (!root.confirm(`Удалить стол ${item.number}? Стол с историей заказов удалить нельзя.`)) return; const mutation = startMutation('table', item.id); try { await api(`/api/admin/tables/${item.id}`, { method: 'DELETE' }); confirmedDeletion.table.set(item.id, mutation); tablesRequest += 1; state.tables = state.tables.filter((table) => table.id !== item.id); renderTables(); showToast('Стол удалён.'); } catch (error) { if (isLatestMutation('table', item.id, mutation)) reportError(error); } }
  async function downloadQr(item) {
    try {
      const response = await root.fetch(`/api/admin/tables/${encodeURIComponent(item.id)}/qr`, { credentials: 'same-origin' });
      if (!response.ok) {
        let body = {};
        try { body = await response.json(); } catch (_) {}
        const error = new Error(body.error ? translateApiError(body.error) : 'Не удалось скачать QR-код.');
        error.status = response.status;
        if (response.status === 401) { error.authHandled = true; showLogin(); }
        throw error;
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : `table-${String(item.number).replace(/[^a-z0-9_-]+/gi, '-') || 'qr'}.png`;
      const link = doc.createElement('a');
      const objectUrl = root.URL.createObjectURL(blob);
      link.href = objectUrl; link.download = filename;
      try { link.click(); } finally { root.setTimeout(() => root.URL.revokeObjectURL(objectUrl), 1000); }
      showToast('QR-код скачан.');
    } catch (error) { reportError(error); }
  }

  function destroyStatsChart() {
    if (statsChart) {
      statsChart.destroy();
      statsChart = null;
    }
  }

  function setStatsLoading(loading) {
    for (const control of doc.querySelectorAll('.stats-control')) control.disabled = loading;
    $('stats-loading').textContent = loading ? 'Загружаем статистику…' : '';
  }

  function clearStatsResults() {
    destroyStatsChart();
    $('stats-chart').hidden = true;
    $('stats-chart-message').textContent = '';
    $('stats-total-revenue').textContent = '—';
    $('stats-total-profit').textContent = '—';
    $('stats-profit-card').hidden = true;
    $('stats-profit-hint').hidden = true;
    clear($('stats-points-body'));
    clear($('stats-top-dishes'));
    $('stats-empty').hidden = true;
  }

  function setStatsError(message) {
    clearStatsResults();
    $('stats-error').textContent = message;
    $('stats-error-panel').hidden = false;
  }

  function renderStatsTable(points) {
    const body = $('stats-points-body');
    clear(body);
    for (const point of points) {
      const row = doc.createElement('tr');
      row.append(text('td', point.date), text('td', money(point.revenue)), text('td', point.profit == null ? '—' : money(point.profit)));
      body.append(row);
    }
  }

  function renderStatsChart(points, hasProfit) {
    destroyStatsChart();
    const canvas = $('stats-chart');
    if (typeof root.Chart !== 'function') {
      canvas.hidden = true;
      $('stats-chart-message').textContent = 'График недоступен. Данные можно посмотреть в таблице.';
      return;
    }
    if (!points.length) {
      canvas.hidden = true;
      $('stats-chart-message').textContent = '';
      return;
    }
    canvas.hidden = false;
    $('stats-chart-message').textContent = '';
    const datasets = [
      { label: 'Выручка', data: points.map((point) => Number(point.revenue)), borderColor: '#256b4b', backgroundColor: 'rgba(37,107,75,.12)', tension: 0.2 },
    ];
    if (hasProfit) {
      datasets.push({ label: 'Прибыль', data: points.map((point) => point.profit == null ? null : Number(point.profit)), borderColor: '#b07b26', backgroundColor: 'rgba(176,123,38,.12)', tension: 0.2, spanGaps: false });
    }
    try {
      statsChart = new root.Chart(canvas, {
        type: 'line',
        data: {
          labels: points.map((point) => point.date),
          datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          scales: { y: { beginAtZero: true } },
        },
      });
    } catch (_) {
      statsChart = null;
      canvas.hidden = true;
      $('stats-chart-message').textContent = 'График недоступен. Данные можно посмотреть в таблице.';
    }
  }

  function renderStats(result) {
    const points = Array.isArray(result.points) ? result.points : [];
    const topDishes = Array.isArray(result.topDishes) ? result.topDishes : [];
    $('stats-total-revenue').textContent = money(result.totalRevenue);
    const hasProfit = result.totalProfit != null;
    $('stats-profit-card').hidden = !hasProfit;
    $('stats-profit-hint').hidden = hasProfit;
    if (hasProfit) $('stats-total-profit').textContent = money(result.totalProfit);
    renderStatsTable(points);
    const list = $('stats-top-dishes');
    clear(list);
    for (const dish of topDishes) {
      const item = doc.createElement('li');
      item.append(text('span', dish.dish_name), text('strong', String(dish.quantity)));
      list.append(item);
    }
    if (!topDishes.length) list.append(text('li', 'За выбранный период популярных блюд нет.', 'muted'));
    $('stats-empty').hidden = points.length !== 0;
    renderStatsChart(points, hasProfit);
  }

  async function loadStats() {
    const request = ++statsRequest;
    const query = new URLSearchParams({
      from: $('stats-from').value,
      to: $('stats-to').value,
      groupBy: $('stats-group-by').value,
    });
    $('stats-error-panel').hidden = true;
    $('stats-error').textContent = '';
    clearStatsResults();
    setStatsLoading(true);
    try {
      const result = await api(`/api/admin/stats?${query}`);
      if (request !== statsRequest || currentPage() !== 'stats' || authTransitioned) return;
      renderStats(result);
    } catch (error) {
      if (request !== statsRequest || currentPage() !== 'stats' || authTransitioned) return;
      if (!error.authHandled) setStatsError(error.status ? error.message : 'Не удалось загрузить статистику. Попробуйте ещё раз.');
    } finally {
      if (request === statsRequest && currentPage() === 'stats' && !authTransitioned) setStatsLoading(false);
    }
  }

  function applyStatsPreset(preset) {
    const range = statsPresetRange(preset);
    $('stats-from').value = range.from;
    $('stats-to').value = range.to;
    loadStats();
  }

  function prepareStats() {
    if (!$('stats-from').value || !$('stats-to').value) {
      const range = statsPresetRange('7');
      $('stats-from').value = range.from;
      $('stats-to').value = range.to;
    }
    return loadStats();
  }

  function updatePhotoPreview() { const target = $('photo-preview'); clear(target); const photo = normalizePhotoUrl($('dish-photo-url').value); if (!photo) { target.hidden = true; return; } const image = doc.createElement('img'); image.alt = 'Предпросмотр фотографии блюда'; image.src = photo; image.addEventListener('error', () => { target.hidden = true; }); target.append(image); target.hidden = false; }

  async function init() {
    try {
      const response = await root.fetch('/api/admin/session', { credentials: 'same-origin' });
      if (!response.ok) { showLogin(); return; }
      $('loading-state').hidden = true; $('admin-view').hidden = false;
      const page = currentPage(); setNavigation(page);
      if (page === 'tables') await loadTables(); else if (page === 'stats') await prepareStats(); else await loadMenu();
    } catch (_) { showLogin(); }
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); showError('login-error', '');
    const submit = event.submitter || $('login-form').querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const response = await root.fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: $('login').value, password: $('password').value }) });
      if (!response.ok) {
        const error = new Error(response.status === 429
          ? 'Слишком много попыток. Попробуйте позже.'
          : response.status === 401
            ? 'Не удалось войти. Проверьте логин и пароль.'
            : 'Не удалось выполнить вход. Попробуйте позже.');
        error.status = response.status;
        throw error;
      }
      authTransitioned = false; $('login-view').hidden = true; $('admin-view').hidden = false;
      const page = currentPage(); setNavigation(page);
      if (page === 'tables') await loadTables(); else if (page === 'stats') await prepareStats(); else await loadMenu();
    } catch (error) {
      showError('login-error', error.status ? error.message : 'Не удалось выполнить вход. Проверьте подключение к интернету.');
    }
    finally { submit.disabled = false; }
  });
  $('logout-button').addEventListener('click', async () => {
    const control = $('logout-button');
    if (control.disabled) return;
    const label = control.textContent;
    control.disabled = true; control.textContent = 'Выходим…';
    try {
      const response = await root.fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) {
        const error = new Error('Не удалось выйти. Попробуйте ещё раз.');
        if (response.status === 401) { error.authHandled = true; showLogin(); }
        throw error;
      }
      root.location.href = '/admin';
    } catch (error) {
      reportError(error);
      control.disabled = false; control.textContent = label;
    }
  });
  $('new-category-button').addEventListener('click', newCategory); $('new-dish-button').addEventListener('click', newDish); $('new-table-button').addEventListener('click', newTable); $('category-form').addEventListener('submit', saveCategory); $('dish-form').addEventListener('submit', saveDish); $('table-form').addEventListener('submit', saveTable); $('dish-photo-url').addEventListener('input', updatePhotoPreview);
  $('stats-filter-form').addEventListener('submit', (event) => { event.preventDefault(); loadStats(); });
  $('stats-reload').addEventListener('click', loadStats);
  $('stats-retry').addEventListener('click', loadStats);
  for (const preset of doc.querySelectorAll('[data-stats-preset]')) preset.addEventListener('click', () => applyStatsPreset(preset.dataset.statsPreset));
  for (const close of doc.querySelectorAll('.close-dialog')) close.addEventListener('click', closeDialog);
  function setMobileNavigation(open, restoreFocus) {
    const wasOpen = $('sidebar').classList.contains('open');
    $('sidebar').classList.toggle('open', open);
    $('mobile-nav').setAttribute('aria-expanded', String(open));
    $('mobile-nav').setAttribute('aria-label', open ? 'Закрыть навигацию' : 'Открыть навигацию');
    const content = doc.querySelector('.content');
    if (open) {
      content.setAttribute('aria-hidden', 'true');
      content.inert = true;
      const firstLink = $('sidebar').querySelector('[data-route]');
      if (firstLink) firstLink.focus();
    } else {
      content.removeAttribute('aria-hidden');
      content.inert = false;
      if (restoreFocus && wasOpen) $('mobile-nav').focus();
    }
  }
  for (const link of doc.querySelectorAll('[data-route]')) link.addEventListener('click', (event) => {
    event.preventDefault();
    const page = link.dataset.route;
    root.history.pushState({}, '', page === 'stats' ? '/stats' : `/admin/${page}`);
    setNavigation(page);
    if (page === 'tables') loadTables(); else if (page === 'stats') prepareStats(); else loadMenu();
    setMobileNavigation(false, true);
  });
  $('mobile-nav').addEventListener('click', () => setMobileNavigation(!$('sidebar').classList.contains('open')));
  doc.addEventListener('keydown', (event) => {
    if (!$('sidebar').classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); setMobileNavigation(false, true);
    } else if (event.key === 'Tab') {
      const controls = Array.from($('sidebar').querySelectorAll('a[href], button:not(:disabled)'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  root.addEventListener('popstate', () => {
    const page = currentPage(); setNavigation(page);
    if (page === 'tables') loadTables(); else if (page === 'stats') prepareStats(); else loadMenu();
    setMobileNavigation(false, true);
  });
  init();
})(typeof window !== 'undefined' ? window : null);
