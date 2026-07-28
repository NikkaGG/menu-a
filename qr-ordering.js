(function exposeQrOrdering(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QrOrdering = api;
}(typeof globalThis === 'object' ? globalThis : this, function createQrOrdering() {
  'use strict';

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
  const STORAGE_POINTER_KEY = 'qrOrdering.currentToken';
  const STORAGE_CONTEXT_PREFIX = 'qrOrdering.context.';
  const memoryContexts = new Map();
  let memoryPointer = null;
  const STATUS_LABELS = Object.freeze({
    new: 'Принят',
    cooking: 'Готовится',
    ready: 'Готово',
  });

  function isUuid(value) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  function parseRoute(pathname) {
    const tableMatch = /^\/t\/([^/]+)\/?$/.exec(pathname || '');
    if (tableMatch) {
      const token = safeDecode(tableMatch[1]);
      if (token && TOKEN_PATTERN.test(token)) return { type: 'table', token };
    }
    const orderMatch = /^\/order\/([^/]+)\/?$/.exec(pathname || '');
    if (orderMatch) {
      const orderId = safeDecode(orderMatch[1]);
      if (orderId && isUuid(orderId)) return { type: 'order', orderId };
    }
    return { type: 'qr-required' };
  }

  function contextStorageKey(token) {
    return `${STORAGE_CONTEXT_PREFIX}${token}`;
  }

  function safeParse(value) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function safeGet(storage, key) {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      storage?.setItem(key, value);
      return !!storage;
    } catch {
      return false;
    }
  }

  function validCart(cart) {
    return cart !== null
      && typeof cart === 'object'
      && !Array.isArray(cart)
      && Object.entries(cart).every(([dishId, quantity]) => (
        isUuid(dishId)
        && Number.isInteger(quantity)
        && quantity >= 1
        && quantity <= 99
      ));
  }

  function validateContext(value, expectedToken = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !TOKEN_PATTERN.test(value.token || '')
      || (expectedToken !== null && value.token !== expectedToken)
      || !isUuid(value.tableId)
      || typeof value.tableNumber !== 'string'
      || !isUuid(value.sessionId)
      || typeof value.sessionStatus !== 'string'
      || (value.openedAt !== undefined && value.openedAt !== null && typeof value.openedAt !== 'string')
      || !validCart(value.cart)
      || (value.activeOrderId !== null && value.activeOrderId !== undefined
        && !isUuid(value.activeOrderId))) return null;
    return value;
  }

  function readContext(storage, token) {
    if (!TOKEN_PATTERN.test(token || '')) return null;
    const persisted = validateContext(
      safeParse(safeGet(storage, contextStorageKey(token))),
      token,
    );
    if (persisted) {
      memoryContexts.set(token, persisted);
      return persisted;
    }
    return validateContext(memoryContexts.get(token), token);
  }

  function writeContext(storage, context) {
    const validated = validateContext(context);
    if (!validated) return false;
    memoryPointer = validated.token;
    memoryContexts.set(validated.token, validated);
    const serialized = JSON.stringify(validated);
    safeSet(storage, STORAGE_POINTER_KEY, validated.token);
    safeSet(storage, contextStorageKey(validated.token), serialized);
    return true;
  }

  function readCurrentContext(storage) {
    const storedPointer = safeGet(storage, STORAGE_POINTER_KEY);
    const token = TOKEN_PATTERN.test(storedPointer || '') ? storedPointer : memoryPointer;
    return readContext(storage, token);
  }

  function updateTableContext(storage, token, response) {
    if (!TOKEN_PATTERN.test(token || '')
      || !isUuid(response?.table?.id)
      || !isUuid(response?.session?.id)) {
      throw new Error('Invalid table session response');
    }
    const previous = readContext(storage, token);
    const sessionChanged = previous?.sessionId !== response.session.id;
    const context = {
      token,
      tableId: response.table.id,
      tableNumber: String(response.table.number),
      sessionId: response.session.id,
      sessionStatus: response.session.status,
      openedAt: response.session.openedAt,
      cart: sessionChanged ? {} : (previous?.cart || {}),
      activeOrderId: sessionChanged ? null : (previous?.activeOrderId || null),
    };
    writeContext(storage, context);
    return context;
  }

  function recoverOrderContext(storage, orderId) {
    if (!isUuid(orderId)) return null;
    const context = validateContext(readCurrentContext(storage));
    if (!context || context.activeOrderId !== orderId) {
      return null;
    }
    return context;
  }

  function escapeHtmlText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function escapeHtmlAttribute(value) {
    return escapeHtmlText(value);
  }

  function normalizePhotoUrl(value) {
    if (typeof value !== 'string') return null;
    const candidate = value.trim();
    if (!candidate
      || /[\u0000-\u0020<>"'`\\]/.test(candidate)
      || candidate.startsWith('//')) return null;
    try {
      if (candidate.startsWith('/')) {
        const parsed = new URL(candidate, 'https://menu.invalid');
        if (parsed.origin !== 'https://menu.invalid') return null;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.username || parsed.password) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function normalizeMenu(payload, { allowEmpty = false } = {}) {
    const categories = [];
    const dishes = [];
    if (!Array.isArray(payload?.categories)) throw new Error('Invalid menu response');

    for (const category of payload.categories) {
      if (!isUuid(category?.id)) throw new Error('Menu category IDs must be UUIDs');
      categories.push({ id: category.id, name: String(category.name || '') });
      const nestedDishes = Array.isArray(category.dishes)
        ? category.dishes
        : (Array.isArray(payload.dishes)
          ? payload.dishes.filter((dish) => dish.categoryId === category.id)
          : []);
      for (const dish of nestedDishes) {
        if (!isUuid(dish?.id)) throw new Error('Menu dish IDs must be UUIDs');
        const price = Number(dish.price);
        if (!Number.isFinite(price)) throw new Error('Menu dish price must be numeric');
        dishes.push({
          id: dish.id,
          categoryId: category.id,
          name: String(dish.name || ''),
          description: dish.description == null ? '' : String(dish.description),
          price,
          photoUrl: normalizePhotoUrl(dish.photoUrl),
        });
      }
    }
    if (!allowEmpty && !dishes.length) throw new Error('Menu has no orderable dishes');
    return { categories, dishes };
  }

  function buildOrderBody(sessionId, cart, dishes) {
    if (!isUuid(sessionId)) throw new Error('Session ID must be a UUID');
    const allowed = new Set((dishes || []).map((dish) => dish.id).filter(isUuid));
    const items = Object.entries(cart || {})
      .filter(([dishId, quantity]) => allowed.has(dishId)
        && Number.isInteger(quantity) && quantity >= 1 && quantity <= 99)
      .map(([dishId, quantity]) => ({ dish_id: dishId, quantity }));
    if (!items.length) throw new Error('Cart has no orderable dishes');
    return { session_id: sessionId, items };
  }

  function sanitizeCart(cart, dishes) {
    const allowed = new Set((dishes || []).map((dish) => dish.id).filter(isUuid));
    return Object.fromEntries(Object.entries(cart || {}).filter(([dishId, quantity]) => (
      allowed.has(dishId)
      && Number.isInteger(quantity)
      && quantity >= 1
      && quantity <= 99
    )));
  }

  function reviewCartAvailability(cart, previousDishes, refreshedDishes) {
    const availableIds = new Set((refreshedDishes || []).map((dish) => dish.id));
    const previousNames = new Map((previousDishes || []).map((dish) => [dish.id, dish.name]));
    const unavailableDishIds = Object.keys(cart || {}).filter((dishId) => !availableIds.has(dishId));
    return {
      cart: sanitizeCart(cart, refreshedDishes),
      unavailableDishIds,
      unavailableNames: unavailableDishIds.map((dishId) => (
        previousNames.get(dishId) || 'Недоступное блюдо'
      )),
    };
  }

  async function submitOrderWithMenuPreflight({
    cart,
    dishes,
    loadMenu,
    submit,
  }) {
    const menu = normalizeMenu(await loadMenu(), { allowEmpty: true });
    const review = reviewCartAvailability(cart, dishes, menu.dishes);
    if (review.unavailableDishIds.length) {
      return {
        kind: 'review-required',
        menu,
        cart: review.cart,
        unavailableDishIds: review.unavailableDishIds,
        unavailableNames: review.unavailableNames,
        allUnavailable: Object.keys(review.cart).length === 0,
      };
    }
    return {
      kind: 'submitted',
      menu,
      result: await submit({ cart: review.cart, dishes: menu.dishes }),
    };
  }

  function getUnavailableNames(excludedDishIds, dishes) {
    const names = new Map((dishes || []).map((dish) => [dish.id, dish.name]));
    return (excludedDishIds || []).map((id) => names.get(id) || 'Недоступное блюдо');
  }

  async function responseJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  async function submitOrder({
    fetchImpl,
    token,
    context,
    cart,
    dishes,
    resolveTable,
  }) {
    let sessionId = context.sessionId;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body = buildOrderBody(sessionId, cart, dishes);
      const response = await fetchImpl('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await responseJson(response);
      if (response.ok) {
        return {
          kind: 'success',
          order: data.order,
          excludedDishIds: Array.isArray(data.excludedDishIds) ? data.excludedDishIds : [],
          sessionId,
        };
      }
      const excludedDishIds = Array.isArray(data.excludedDishIds) ? data.excludedDishIds : [];
      if (response.status === 409 && data.error === 'No requested dishes are available') {
        return { kind: 'all-unavailable', excludedDishIds };
      }
      const staleSession = response.status === 404
        || (response.status === 409 && data.error === 'Session is not open');
      if (staleSession && attempt === 0) {
        const resolved = await resolveTable(token);
        if (!isUuid(resolved?.session?.id)) throw new Error('Unable to refresh table session');
        sessionId = resolved.session.id;
        continue;
      }
      const error = new Error(data.error || 'Unable to create order');
      error.status = response.status;
      throw error;
    }
    throw new Error('Unable to create order');
  }

  function createOrderPoller({
    orderId,
    documentRef,
    fetchOrder,
    onOrder,
    onError = () => {},
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
  }) {
    let timer = null;
    let complete = false;
    let destroyed = false;
    let generation = 0;

    function stop() {
      if (timer !== null) {
        clearIntervalImpl(timer);
        timer = null;
      }
    }

    async function poll() {
      if (destroyed || complete || documentRef.hidden) return;
      const pollGeneration = generation;
      try {
        const order = await fetchOrder(orderId);
        if (destroyed || pollGeneration !== generation) return;
        onOrder(order);
        if (order?.status === 'ready') {
          complete = true;
          stop();
        }
      } catch (error) {
        if (destroyed || pollGeneration !== generation) return;
        onError(error);
      }
    }

    async function start() {
      if (destroyed || complete || documentRef.hidden || timer !== null) return;
      await poll();
      if (!destroyed && !complete && !documentRef.hidden && timer === null) {
        timer = setIntervalImpl(poll, 5000);
      }
    }

    function visibilityChanged() {
      if (documentRef.hidden) stop();
      else start();
    }

    documentRef.addEventListener('visibilitychange', visibilityChanged);
    return {
      start,
      stop,
      destroy() {
        destroyed = true;
        generation += 1;
        stop();
        documentRef.removeEventListener('visibilitychange', visibilityChanged);
      },
      isRunning() {
        return timer !== null;
      },
    };
  }

  function reorderPath(context) {
    return context && TOKEN_PATTERN.test(context.token || '') ? `/t/${context.token}` : null;
  }

  return {
    STATUS_LABELS,
    STORAGE_POINTER_KEY,
    buildOrderBody,
    contextStorageKey,
    createOrderPoller,
    escapeHtmlAttribute,
    escapeHtmlText,
    getUnavailableNames,
    isUuid,
    normalizeMenu,
    normalizePhotoUrl,
    parseRoute,
    readContext,
    readCurrentContext,
    recoverOrderContext,
    reorderPath,
    reviewCartAvailability,
    sanitizeCart,
    submitOrder,
    submitOrderWithMenuPreflight,
    updateTableContext,
    writeContext,
  };
}));
