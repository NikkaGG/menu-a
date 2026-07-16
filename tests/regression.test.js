const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const menuSource = fs.readFileSync(path.join(root, 'menu.html'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in HTML source`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`Could not parse ${name}`);
}

function makeElement(value = '') {
  const attributes = new Map();
  return {
    value,
    disabled: false,
    hidden: true,
    inert: false,
    isConnected: true,
    focused: false,
    setAttribute(name, valueToSet) {
      attributes.set(name, String(valueToSet));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    focus() {
      this.focused = true;
    },
  };
}

function makeClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add(...names) {
      names.forEach((name) => classes.add(name));
    },
    remove(...names) {
      names.forEach((name) => classes.delete(name));
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function makeTrackedClassList(initial = []) {
  const classes = new Set(initial);
  const operations = [];
  return {
    operations,
    add(...names) {
      operations.push(['add', ...names]);
      names.forEach((name) => classes.add(name));
    },
    remove(...names) {
      operations.push(['remove', ...names]);
      names.forEach((name) => classes.delete(name));
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function stickySearchHarness({ intersectionObserver = true, sentinelTop = 12, stickyTop = 0 } = {}) {
  const bar = { classList: makeClassList(), parentNode: null };
  const listeners = new Map();
  const viewportListeners = new Map();
  const animationFrames = [];
  let currentSentinelTop = sentinelTop;
  let currentStickyTop = stickyTop;
  let observerCallback = null;
  let observerOptions = null;
  let observedElement = null;
  const observers = [];
  const inserted = [];
  const parentNode = {
    insertBefore(element, reference) {
      inserted.push({ element, reference });
      element.parentNode = this;
    },
  };
  bar.parentNode = parentNode;
  const document = {
    documentElement: {},
    querySelector(selector) {
      return selector === '.sticky-bar' ? bar : null;
    },
    createElement(tagName) {
      assert.equal(tagName, 'div');
      return {
        className: '',
        parentNode: null,
        setAttribute() {},
        getBoundingClientRect() {
          return { top: currentSentinelTop };
        },
      };
    },
  };
  const contextValues = {
    document,
    window: {
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      getComputedStyle() {
        return { top: `${currentStickyTop}px` };
      },
      visualViewport: {
        addEventListener(type, callback) {
          viewportListeners.set(type, callback);
        },
      },
    },
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
  };
  contextValues.getComputedStyle = contextValues.window.getComputedStyle;
  if (intersectionObserver) {
    contextValues.IntersectionObserver = function IntersectionObserver(callback, options) {
      observerCallback = callback;
      observerOptions = options;
      const instance = {
        disconnected: false,
        options,
        observe(element) {
          instance.observedElement = element;
          observedElement = element;
        },
        disconnect() {
          instance.disconnected = true;
        },
      };
      observers.push(instance);
      return instance;
    };
  }
  const context = vm.createContext(contextValues);
  vm.runInContext(`${extractFunction(indexSource, 'initSmartStickySearch')};initSmartStickySearch();`, context);

  return {
    bar,
    inserted,
    listeners,
    viewportListeners,
    observers,
    observerOptions: () => observerOptions,
    observedElement: () => observedElement,
    pendingAnimationFrames: () => animationFrames.length,
    runAnimationFrame() {
      const callbacks = animationFrames.splice(0);
      callbacks.forEach((callback) => callback());
    },
    setSentinelTop(value) {
      currentSentinelTop = value;
    },
    setStickyTop(value) {
      currentStickyTop = value;
    },
    notifyIntersection() {
      observerCallback?.([]);
    },
  };
}

function checkoutHarness({ phone = '', address = '', mode = 'd', hasItems = true } = {}) {
  const elements = {
    orderBtn: makeElement(),
    phoneInp: makeElement(phone),
    addrInp: makeElement(address),
    phoneErr: makeElement(),
    addrErr: makeElement(),
  };
  let prepared = false;

  const context = vm.createContext({
    cart: hasItems ? { 1: 1 } : {},
    delMode: mode,
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    showToast() {},
    buildOrderText() {
      return 'order';
    },
    prepareServiceSheet() {
      prepared = true;
    },
    closeOv() {},
    openOv() {},
    dialogOpeners: new WeakMap(),
    pendingOrderText: '',
  });

  for (const name of ['validPhone', 'updateOrderState', 'placeOrder']) {
    vm.runInContext(`${extractFunction(indexSource, name)};this.${name}=${name};`, context);
  }

  return { context, elements, wasPrepared: () => prepared };
}

function sharingHarness({ clipboardRejects = false } = {}) {
  const elements = {
    shareOv: { classList: makeClassList() },
    shareTitle: makeElement(),
    shareSub: makeElement(),
    shareWaLabel: makeElement(),
    shareCopyBtn: makeElement(),
  };
  const copied = [];
  const toasts = [];
  const location = { href: 'https://example.test/menu?category=rolls#popular' };
  const context = vm.createContext({
    SHOP_PHONE: '+998711234567',
    SHOP_PHONE_TEXT: '+998 71 123 45 67',
    pendingOrderText: '',
    cart: { 1: 2 },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    location,
    window: { location },
    navigator: {
      clipboard: {
        writeText(text) {
          copied.push(text);
          return clipboardRejects
            ? Promise.reject(new Error('clipboard unavailable'))
            : Promise.resolve();
        },
      },
    },
    setSecondService() {},
    runAfterMotion(callback) {
      callback();
    },
    setTimeout(callback) {
      callback();
    },
    closeOv() {},
    updatePill() {},
    syncCardState() {},
    renderCart() {},
    showToast(message) {
      toasts.push(message);
    },
  });

  for (const name of ['prepareServiceSheet', 'finishOrder', 'copyOrder']) {
    vm.runInContext(`${extractFunction(indexSource, name)};this.${name}=${name};`, context);
  }

  return { context, copied, elements, toasts };
}

function runCookieScript(storedValue) {
  const cookieBar = { classList: makeClassList() };
  const storage = new Map();
  if (storedValue !== undefined) storage.set('cookieOk', storedValue);
  const context = vm.createContext({
    document: {
      getElementById(id) {
        return id === 'cookieBar' ? cookieBar : null;
      },
    },
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
  });
  const marker = '/* ── COOKIE BAR ── */';
  const start = indexSource.indexOf(marker);
  const end = indexSource.indexOf('/* ── CATEGORY SCROLL-SPY', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  vm.runInContext(indexSource.slice(start + marker.length, end), context);

  return { context, cookieBar, storage };
}

function dialogHarness({
  fallbackPrecedesOpener = false,
  openerFocusFails = false,
  firstFrameHidden = false,
  deferAnimationFrames = false,
} = {}) {
  const scheduled = [];
  const animationFrames = [];
  let animationFrame = 0;
  const bodyClassList = makeClassList();
  const opener = makeElement();
  const fallback = makeElement();
  const background = makeElement();
  const cookieBar = makeElement();
  const cartPill = makeElement();
  const phoneInp = makeElement('1234567890');
  const addrInp = makeElement('Main 1');
  const phoneErr = makeElement();
  const addrErr = makeElement();
  const overlays = {};
  const closeButtons = {};
  const shareButtons = {};

  for (const id of ['prodOv', 'shareOv', 'cartOv']) {
    const closeButton = makeElement();
    const shareButton = makeElement();
    const overlay = makeElement();
    overlay.id = id;
    overlay.classList = makeClassList();
    overlay.contains = (element) => element === closeButton || element === shareButton;
    overlay.querySelector = (selector) => (
      selector === '[data-dialog-initial-focus]' ? closeButton : null
    );
    overlay.querySelectorAll = () => [shareButton, closeButton];
    overlay.focus = function focus() {
      if(!firstFrameHidden || animationFrame >= 2) document.activeElement = this;
    };
    closeButton.closest = () => overlay;
    shareButton.closest = () => overlay;
    closeButtons[id] = closeButton;
    shareButtons[id] = shareButton;
    overlays[id] = overlay;
  }

  for (const element of [opener, fallback, ...Object.values(closeButtons), ...Object.values(shareButtons)]) {
    element.matches = () => true;
    if (!element.closest) element.closest = () => null;
    element.getClientRects = () => {
      const hiddenByModalLock = element === opener && bodyClassList.contains('modal-lock');
      return hiddenByModalLock ? [] : [{}];
    };
  }
  const document = {
    activeElement: opener,
    body: {
      classList: bodyClassList,
      style: {},
      children: [background, cookieBar, cartPill, overlays.prodOv, overlays.shareOv, overlays.cartOv],
    },
    documentElement: { scrollTop: 0 },
    getElementById(id) {
      return overlays[id] || { phoneInp, addrInp, phoneErr, addrErr }[id] || null;
    },
    querySelector(selector) {
      if (selector === '.ov.on') {
        return Object.values(overlays).find((overlay) => overlay.classList.contains('on')) || null;
      }
      if (selector === '#cpill.on,.contact-btn') return fallbackPrecedesOpener ? fallback : opener;
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== '#cpill.on,.contact-btn') return [];
      return fallbackPrecedesOpener ? [fallback, opener] : [opener, fallback];
    },
  };
  opener.focus = function focus() {
    if (!openerFocusFails && this.getClientRects().length) {
      this.focused = true;
      document.activeElement = this;
    }
  };
  fallback.focus = function focus() {
    this.focused = true;
    document.activeElement = this;
  };
  for (const element of [...Object.values(closeButtons), ...Object.values(shareButtons)]) {
    element.focus = function focus() {
      this.focused = true;
      document.activeElement = this;
    };
  }
  const context = vm.createContext({
    cart: { 1: 1 },
    delMode: 'd',
    pendingOrderText: '',
    document,
    window: {
      scrollY: 0,
      scrollTo() {},
      getComputedStyle(element) {
        return {
          display: element.getClientRects().length ? 'block' : 'none',
          visibility: firstFrameHidden && animationFrame < 2 ? 'hidden' : 'visible',
        };
      },
    },
    requestAnimationFrame(callback) {
      if(firstFrameHidden || deferAnimationFrames) animationFrames.push(callback);
      else callback();
    },
    runAfterMotion(callback) {
      scheduled.push(callback);
    },
    setTimeout(callback) {
      scheduled.push(callback);
    },
    buildOrderText() {
      return 'order';
    },
    prepareServiceSheet() {},
    showToast() {},
  });
  const declarations = [
    "let lockedScrollY=0",
    "const dialogOpeners=new WeakMap()",
    "const dialogFocusGenerations=new WeakMap()",
    "const dialogSuppressedStates=new WeakMap()",
    "const openDialogs=[]",
    "const dialogFocusableSelector='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])'",
  ].join(';');
  const accessibilityFunctions = indexSource.includes('function syncDialogAccessibility(')
    ? ['setDialogSuppressed', 'syncDialogAccessibility'].map((name) => extractFunction(indexSource, name))
    : ['function syncDialogAccessibility(){}'];
  const functions = [
    'isFocusable',
    'focusElement',
    'getDialogFocusable',
    'getTopmostOpenDialog',
    'focusDialog',
    'restoreFocus',
    'lockPageScroll',
    'unlockPageScroll',
    'openOv',
    'closeOv',
    'validPhone',
    'placeOrder',
  ].map((name) => extractFunction(indexSource, name)).concat(accessibilityFunctions).join('\n');
  vm.runInContext(`${declarations};${functions}`, context);

  return {
    context,
    background,
    cartPill,
    closeButtons,
    cookieBar,
    fallback,
    opener,
    overlay: overlays.cartOv,
    overlays,
    shareButtons,
    runNextAnimationFrame() {
      animationFrame += 1;
      animationFrames.shift()?.();
    },
    runAnimationFrame() {
      animationFrame += 1;
      const callbacks = animationFrames.splice(0);
      callbacks.forEach((callback) => callback());
    },
    runScheduled() {
      while (scheduled.length) scheduled.shift()();
    },
  };
}

function productCardHarness({ grid = true } = {}) {
  const dialog = dialogHarness();
  dialog.context.prefersReducedMotion = () => false;
  const elements = {
    menuArea: makeElement(),
    popularCard: makeElement(),
    popDots: makeElement(),
    popularTrack: { style: {} },
    prodContent: makeElement(),
  };
  const originalGetElementById = dialog.context.document.getElementById;
  dialog.context.document.getElementById = (id) => elements[id] || originalGetElementById(id);

  vm.runInContext(`
    const M=[{id:1,c:'f',n:'Тестовый ролл',w:'200 г',d:'Описание',p:500,img:'roll.webp',i:'r'}];
    const CATS=[{id:'f',l:'Роллы'}];
    const CN={f:'Роллы'};
    const POPULAR_IDS=[1];
    let isGrid=${grid},activeCat='all',search='',popIndex=0,popularDidDrag=false;
    ${[
    'getItem',
    'fmt',
    'priceText',
    'shownQty',
    'shownTotal',
    'addBtnHtml',
    'addBtnAria',
    'cartAddButton',
    'priceMarkup',
    'qtyPriceHtml',
    'renderPopular',
    'renderPopularDots',
    'updatePopular',
    'filtered',
    'render',
    'openPopularItem',
    'openProd',
  ].map((name) => extractFunction(indexSource, name)).join('\n')}
  `, dialog.context);

  dialog.context.renderPopular();
  dialog.context.render();

  return { ...dialog, elements };
}

function invokeRenderedDetailsControl(context, html) {
  const match = html.match(/<button[^>]*class="product-details-btn"[^>]*onclick="([^"]+)"/);
  assert.ok(match, 'Expected a rendered product details button');
  const control = makeElement();
  control.matches = () => true;
  control.closest = () => null;
  control.getClientRects = () => [{}];
  control.focus = function focus() {
    this.focused = true;
    context.document.activeElement = this;
  };
  context.renderedControl = control;
  vm.runInContext(`(function(){${match[1]}}).call(renderedControl)`, context);
  return control;
}

function assertNoNestedButtons(html) {
  let buttonDepth = 0;
  for (const match of html.matchAll(/<\/?button\b[^>]*>/g)) {
    if (match[0].startsWith('</')) buttonDepth -= 1;
    else buttonDepth += 1;
    assert.ok(buttonDepth <= 1, `Found nested buttons in rendered HTML: ${match[0]}`);
  }
  assert.equal(buttonDepth, 0);
}

test('index.html and menu.html remain byte-identical', () => {
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'index.html')),
    fs.readFileSync(path.join(root, 'menu.html')),
  );
});

test('horizontal overflow protection does not create a sticky-breaking root scroll container', () => {
  for (const source of [indexSource, menuSource]) {
    assert.doesNotMatch(source, /html,body\{[^}]*overflow-x:hidden/);
    assert.match(source, /html,body\{[^}]*overflow-x:clip/);
  }
});

test('restaurant header uses the exact requested schedule and delivery text', () => {
  assert.match(indexSource, />График: с 11:00 до 22:40</);
  assert.match(indexSource, />Доставка: от 4 900₸ бесплатная в радиусе 10 км\.</);
  assert.doesNotMatch(indexSource, /График:С|Доставка:От/);
});

test('fixed and sticky mobile surfaces account for every safe-area inset', () => {
  assert.match(indexSource, /viewport-fit=cover/);
  for (const inset of ['top', 'right', 'bottom', 'left']) {
    assert.match(indexSource, new RegExp(`env\\(safe-area-inset-${inset}, 0px\\)`));
  }
  assert.match(indexSource, /\.cart-pill-shell[\s\S]*safe-area-inset-bottom/);
  assert.match(indexSource, /\.cookie-bar[\s\S]*safe-area-inset-bottom/);
  assert.match(indexSource, /\.ov[\s\S]*safe-area-inset-top/);
  assert.match(indexSource, /\.sticky-bar\.is-stuck[\s\S]*safe-area-inset-top/);
  assert.match(indexSource, /#prodOv \.ps-top[\s\S]*safe-area-inset-right/);
  assert.match(indexSource, /#cartOv \.cs-head[\s\S]*safe-area-inset-left/);
});

test('search bar uses native sticky positioning without fixed-state artifacts or placeholders', () => {
  assert.match(
    indexSource,
    /\.sticky-bar\{[^}]*position:sticky!important;[^}]*top:env\(safe-area-inset-top,0px\)!important;/,
  );
  assert.doesNotMatch(indexSource, /\.sticky-bar\.is-stuck\{[^}]*position:fixed/);
  assert.doesNotMatch(indexSource, /\.sticky-bar\.is-stuck\{[^}]*(?:left:50%|translateX\(-50%\))/);
  assert.doesNotMatch(indexSource, /sticky-placeholder/);

  const implementation = extractFunction(indexSource, 'initSmartStickySearch');
  assert.match(implementation, /IntersectionObserver/);
  assert.doesNotMatch(implementation, /pageYOffset|offsetHeight/);
  assert.doesNotMatch(implementation, /\.style\./);
});

test('sticky search sentinel toggles only visual state across down and up transitions', () => {
  const harness = stickySearchHarness({ sentinelTop: -1, stickyTop: 10 });

  assert.equal(harness.inserted.length, 1);
  assert.equal(harness.inserted[0].element.className, 'sticky-sentinel');
  assert.equal(harness.inserted[0].reference, harness.bar);
  assert.equal(harness.observedElement(), harness.inserted[0].element);
  assert.equal(harness.observerOptions().rootMargin, '-10px 0px 0px 0px');
  assert.equal(harness.bar.classList.contains('is-stuck'), true);

  harness.setSentinelTop(20);
  harness.notifyIntersection();
  assert.equal(harness.bar.classList.contains('is-stuck'), false);

  harness.setSentinelTop(5);
  harness.notifyIntersection();
  assert.equal(harness.bar.classList.contains('is-stuck'), true);

  harness.setSentinelTop(25);
  harness.notifyIntersection();
  assert.equal(harness.bar.classList.contains('is-stuck'), false);

  harness.setSentinelTop(-3);
  harness.notifyIntersection();
  assert.equal(harness.bar.classList.contains('is-stuck'), true);
});

test('sticky observer recreates and resyncs only when the effective top changes', () => {
  const harness = stickySearchHarness({ sentinelTop: 15, stickyTop: 10 });

  assert.equal(harness.observers.length, 1);
  assert.equal(harness.observers[0].options.rootMargin, '-10px 0px 0px 0px');
  assert.equal(harness.bar.classList.contains('is-stuck'), false);

  harness.setSentinelTop(15);
  harness.listeners.get('resize')();
  assert.equal(harness.observers.length, 1);
  assert.equal(harness.bar.classList.contains('is-stuck'), false);

  harness.setStickyTop(20);
  harness.listeners.get('orientationchange')();
  assert.equal(harness.observers.length, 2);
  assert.equal(harness.observers[0].disconnected, true);
  assert.equal(harness.observers[1].options.rootMargin, '-20px 0px 0px 0px');
  assert.equal(harness.bar.classList.contains('is-stuck'), true);

  harness.setStickyTop(6);
  harness.viewportListeners.get('resize')();
  assert.equal(harness.observers.length, 3);
  assert.equal(harness.observers[1].disconnected, true);
  assert.equal(harness.observers[2].options.rootMargin, '-6px 0px 0px 0px');
  assert.equal(harness.bar.classList.contains('is-stuck'), false);
});

test('sticky observer resyncs geometry without recreation when top is unchanged', () => {
  const harness = stickySearchHarness({ sentinelTop: 15, stickyTop: 10 });

  harness.setSentinelTop(5);
  harness.listeners.get('resize')();

  assert.equal(harness.observers.length, 1);
  assert.equal(harness.observers[0].disconnected, false);
  assert.equal(harness.bar.classList.contains('is-stuck'), true);
});

test('sticky observer clears stale visual state when scrolling ends below the sentinel', () => {
  const harness = stickySearchHarness({ sentinelTop: -20, stickyTop: 10 });

  assert.equal(harness.bar.classList.contains('is-stuck'), true);

  harness.setSentinelTop(765);
  assert.equal(harness.bar.classList.contains('is-stuck'), true);

  harness.listeners.get('scrollend')();

  assert.equal(harness.bar.classList.contains('is-stuck'), false);
  assert.equal(harness.observers.length, 1);
  assert.equal(harness.observers[0].disconnected, false);
});

test('sticky search fallback keeps native positioning and updates visual state from sentinel geometry', () => {
  const harness = stickySearchHarness({
    intersectionObserver: false,
    sentinelTop: 20,
    stickyTop: 8,
  });

  assert.equal(harness.bar.classList.contains('is-stuck'), false);
  assert.deepEqual([...harness.listeners.keys()], ['scroll', 'resize', 'orientationchange']);
  assert.deepEqual([...harness.viewportListeners.keys()], ['resize']);

  harness.setSentinelTop(4);
  harness.listeners.get('scroll')();
  assert.equal(harness.bar.classList.contains('is-stuck'), false);
  harness.runAnimationFrame();
  assert.equal(harness.bar.classList.contains('is-stuck'), true);

  harness.setSentinelTop(12);
  harness.listeners.get('scroll')();
  harness.runAnimationFrame();
  assert.equal(harness.bar.classList.contains('is-stuck'), false);
});

test('sticky fallback throttles repeated geometry updates through one animation frame', () => {
  const harness = stickySearchHarness({
    intersectionObserver: false,
    sentinelTop: 20,
    stickyTop: 8,
  });

  harness.setSentinelTop(4);
  harness.listeners.get('scroll')();
  harness.listeners.get('scroll')();
  harness.listeners.get('scroll')();

  assert.equal(harness.pendingAnimationFrames(), 1);
  assert.equal(harness.bar.classList.contains('is-stuck'), false);

  harness.runAnimationFrame();
  assert.equal(harness.pendingAnimationFrames(), 0);
  assert.equal(harness.bar.classList.contains('is-stuck'), true);
});

test('sticky visual state CSS preserves flow geometry at every breakpoint', () => {
  const stuckRules = [...indexSource.matchAll(/\.sticky-bar\.is-stuck\s*\{([^}]*)\}/g)];
  assert.ok(stuckRules.length > 0);
  for (const [, declarations] of stuckRules) {
    assert.doesNotMatch(
      declarations,
      /(?:^|;)\s*(?:width|max-width|padding(?:-(?:top|right|bottom|left))?|margin(?:-(?:top|right|bottom|left))?)\s*:/,
    );
  }
});

test('mobile interactive controls expose at least 44px CSS hit areas', () => {
  const requiredSelectors = [
    '.add-sq', '.gc-plus', '.ps-add', '.qb', '.cs-trash', '.cs-close',
    '.ps-icon-btn', '.ss-x', '.ss-copy', '.ss-opt', '.s-action',
    '.cookie-ok', '.grid-toggle', '.cat', '.dot-item', '.cart-pill',
  ];
  for (const selector of requiredSelectors) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      indexSource,
      new RegExp(`${escaped}[^{}]*\\{[^}]*min-(?:width|inline-size):44px[^}]*min-(?:height|block-size):44px`),
      `Expected a 44x44 hit-area rule for ${selector}`,
    );
  }
  assert.match(indexSource, /\.dot-item::before\{[^}]*width:5px[^}]*height:5px/);
});

test('mobile form inputs and textareas retain at least 44px actual hit heights', () => {
  assert.match(
    indexSource,
    /\.contact-btn,\.dopt,\.order-btn,\.addr-inp,\.s-inp,\.cmnt-ta\{min-height:44px!important\}/,
  );
  assert.match(indexSource, /#cartOv \.addr-inp\{min-height:44px!important/);
  assert.match(indexSource, /#cartOv \.cmnt-ta\{[^}]*min-height:(?:[4-9]\d|\d{3,})px!important/);

  const formControls = [...indexSource.matchAll(/<(?:input|textarea)\b[^>]*class="([^"]+)"/g)];
  assert.ok(formControls.length > 0);
  for (const [, classes] of formControls) {
    assert.match(classes, /(?:^|\s)(?:addr-inp|s-inp|cmnt-ta)(?:\s|$)/);
  }
});

test('reduced motion disables CSS motion and bypasses timed JavaScript effects', () => {
  assert.match(indexSource, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*scroll-behavior:auto!important/);
  assert.match(indexSource, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*animation:none!important[\s\S]*transition:none!important/);
  assert.match(indexSource, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(extractFunction(indexSource, 'prefersReducedMotion'), /reducedMotionQuery\?\.matches/);
  assert.match(extractFunction(indexSource, 'slowScrollTo'), /if\(prefersReducedMotion\(\)\)\{window\.scrollTo\(0,endY\);return;\}/);
  assert.match(extractFunction(indexSource, 'animateCardsIn'), /if\(prefersReducedMotion\(\)\)return;/);
  assert.match(indexSource, /window\.toggleView=function\(\)\{[\s\S]*if\(prefersReducedMotion\(\)\)/);
  assert.match(extractFunction(indexSource, 'updatePopular'), /prefersReducedMotion\(\)/);
});

test('reduced motion centralizes immediate modal and share closure delays', () => {
  const runAfterMotion = extractFunction(indexSource, 'runAfterMotion');
  const closeOv = extractFunction(indexSource, 'closeOv');
  const shareVia = extractFunction(indexSource, 'shareVia');
  const copyOrder = extractFunction(indexSource, 'copyOrder');

  assert.match(runAfterMotion, /if\(prefersReducedMotion\(\)\)\{callback\(\);return;\}/);
  assert.match(closeOv, /runAfterMotion\(\(\)=>\{[\s\S]*\},20\)/);
  assert.match(shareVia, /runAfterMotion\(\(\)=>closeOv\('shareOv'\),400\)/);
  assert.match(copyOrder, /runAfterMotion\(\(\)=>closeOv\('shareOv'\),400\)/);

  const scheduled = [];
  let calls = 0;
  const context = vm.createContext({
    prefersReducedMotion: () => true,
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
    },
  });
  vm.runInContext(`${runAfterMotion};this.runAfterMotion=runAfterMotion;`, context);
  context.callback = () => {
    calls += 1;
  };
  vm.runInContext('runAfterMotion(callback, 400)', context);
  assert.equal(calls, 1);
  assert.equal(scheduled.length, 0);

  context.prefersReducedMotion = () => false;
  vm.runInContext('runAfterMotion(callback, 400)', context);
  assert.equal(calls, 1);
  assert.equal(scheduled[0].delay, 400);
  scheduled[0].callback();
  assert.equal(calls, 2);
});

test('reduced-motion toast stays readable without forced animation choreography and auto-clears', () => {
  const classList = makeTrackedClassList(['on']);
  let reflows = 0;
  const toast = { classList, textContent: '' };
  Object.defineProperty(toast, 'offsetWidth', {
    get() {
      reflows += 1;
      return 100;
    },
  });
  const scheduled = [];
  const context = vm.createContext({
    document: {
      getElementById(id) {
        return id === 'toastEl' ? toast : null;
      },
    },
    prefersReducedMotion: () => true,
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
    },
  });
  for (const name of ['restartMotionClass', 'showToast']) {
    vm.runInContext(`${extractFunction(indexSource, name)};this.${name}=${name};`, context);
  }

  context.showToast('Готово');

  assert.equal(toast.textContent, 'Готово');
  assert.equal(toast.classList.contains('on'), true);
  assert.equal(reflows, 0);
  assert.deepEqual(classList.operations, [['add', 'on']]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 2600);

  scheduled[0].callback();
  assert.equal(toast.classList.contains('on'), false);
});

test('normal-motion toast preserves forced restart choreography and timing', () => {
  const classList = makeTrackedClassList(['on']);
  let reflows = 0;
  const toast = { classList, textContent: '' };
  Object.defineProperty(toast, 'offsetWidth', {
    get() {
      reflows += 1;
      return 100;
    },
  });
  const scheduled = [];
  const context = vm.createContext({
    document: {
      getElementById() {
        return toast;
      },
    },
    prefersReducedMotion: () => false,
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
    },
  });
  for (const name of ['restartMotionClass', 'showToast']) {
    vm.runInContext(`${extractFunction(indexSource, name)};this.${name}=${name};`, context);
  }

  context.showToast('Готово');

  assert.equal(reflows, 1);
  assert.deepEqual(classList.operations, [['remove', 'on'], ['add', 'on']]);
  assert.equal(scheduled[0].delay, 2600);
});

test('all overlays expose named modal dialog semantics', () => {
  assert.match(indexSource, /id="prodOv"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="prodTitle"/);
  assert.match(indexSource, /id="shareOv"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="shareTitle"/);
  assert.match(indexSource, /id="cartOv"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="cartTitle"/);
  assert.match(indexSource, /class="ps-name" id="prodTitle">\$\{item\.n\}<\/div>/);
  assert.match(indexSource, /class="cs-title" id="cartTitle">Корзина<\/div>/);
});

test('icon-only product and cart controls have accessible names', () => {
  assert.match(indexSource, /class="ps-icon-btn"[^>]*aria-label="Поделиться"/);
  assert.match(indexSource, /class="ps-icon-btn"[^>]*aria-label="Закрыть товар"/);
  assert.match(indexSource, /class="cs-trash"[^>]*aria-label="Очистить корзину"/);
  assert.match(indexSource, /class="cs-close"[^>]*aria-label="Закрыть корзину"/);
});

test('rendered popular card opens product details from a named native button and restores focus to it', () => {
  const card = productCardHarness();
  const html = card.elements.popularCard.innerHTML;

  assert.match(html, /<div class="pop-card">/);
  assert.match(html, /<button type="button" class="product-details-btn"[^>]*aria-label="Подробнее о Тестовый ролл"/);
  assert.match(html, /<button type="button" class="add-sq pop-add-top cart-add-btn/);
  assertNoNestedButtons(html);

  const control = invokeRenderedDetailsControl(card.context, html);
  card.context.closeOv('prodOv');
  card.runScheduled();

  assert.equal(control.focused, true);
  assert.equal(card.context.document.activeElement, control);
});

test('rendered grid card opens product details from a named native button and restores focus to it', () => {
  const card = productCardHarness();
  const html = card.elements.menuArea.innerHTML;

  assert.match(html, /<div class="gc">/);
  assert.match(html, /<button type="button" class="product-details-btn"[^>]*aria-label="Подробнее о Тестовый ролл"/);
  assert.match(html, /<button type="button" class="gc-plus cart-add-btn/);
  assertNoNestedButtons(html);

  const control = invokeRenderedDetailsControl(card.context, html);
  card.context.closeOv('prodOv');
  card.runScheduled();

  assert.equal(control.focused, true);
  assert.equal(card.context.document.activeElement, control);
});

test('rendered list card opens product details from a named native button and restores focus to it', () => {
  const card = productCardHarness({ grid: false });
  const html = card.elements.menuArea.innerHTML;

  assert.match(html, /<div class="lc">/);
  assert.match(html, /<button type="button" class="product-details-btn"[^>]*aria-label="Подробнее о Тестовый ролл"/);
  assert.match(html, /<button type="button" class="add-sq cart-add-btn/);
  assertNoNestedButtons(html);

  const control = invokeRenderedDetailsControl(card.context, html);
  card.context.closeOv('prodOv');
  card.runScheduled();

  assert.equal(control.focused, true);
  assert.equal(card.context.document.activeElement, control);
});

test('dialog lifecycle stores and restores focus while preserving order transition focus', () => {
  const openOv = extractFunction(indexSource, 'openOv');
  const closeOv = extractFunction(indexSource, 'closeOv');
  const restoreFocus = extractFunction(indexSource, 'restoreFocus');
  const placeOrder = extractFunction(indexSource, 'placeOrder');

  assert.match(openOv, /document\.activeElement/);
  assert.match(openOv, /dialogOpeners\.set\(ov,/);
  assert.match(openOv, /focusDialog\(ov\)/);
  assert.match(closeOv, /restoreFocus/);
  assert.match(closeOv, /dialogOpeners\.get\(ov\)/);
  assert.match(restoreFocus, /getTopmostOpenDialog\(\)/);
  assert.match(placeOrder, /const transitionOpener=dialogOpeners\.get\(document\.getElementById\('cartOv'\)\);/);
  assert.match(placeOrder, /closeOv\('cartOv',false\);\s*openOv\('shareOv',transitionOpener\);/);
});

test('initial focus retries after first-frame transition visibility and enters each top dialog', () => {
  for (const id of ['prodOv', 'shareOv', 'cartOv']) {
    const dialog = dialogHarness({ firstFrameHidden: true });

    dialog.context.openOv(id);
    dialog.runAnimationFrame();
    assert.equal(dialog.context.document.activeElement, dialog.opener);

    dialog.runAnimationFrame();
    assert.equal(dialog.context.document.activeElement, dialog.closeButtons[id]);
  }
});

test('delayed initial focus does not enter a dialog that closed during its transition', () => {
  const dialog = dialogHarness({ firstFrameHidden: true });

  dialog.context.openOv('prodOv');
  dialog.runAnimationFrame();
  dialog.context.closeOv('prodOv', false);
  dialog.runAnimationFrame();

  assert.notEqual(dialog.context.document.activeElement, dialog.closeButtons.prodOv);
});

test('stale initial focus does not enter the same dialog after it is closed and reopened', () => {
  const dialog = dialogHarness({ deferAnimationFrames: true });

  dialog.context.openOv('prodOv');
  dialog.context.closeOv('prodOv', false);
  dialog.context.openOv('prodOv');
  dialog.runNextAnimationFrame();

  assert.equal(dialog.context.document.activeElement, dialog.opener);
  assert.equal(dialog.closeButtons.prodOv.focused, false);
});

test('closing cart restores focus after modal lock stops hiding its opener', () => {
  const dialog = dialogHarness();

  dialog.context.openOv('cartOv');
  dialog.context.closeOv('cartOv');

  assert.equal(dialog.opener.focused, false);
  assert.equal(dialog.context.document.body.classList.contains('modal-lock'), true);

  dialog.runScheduled();

  assert.equal(dialog.context.document.body.classList.contains('modal-lock'), false);
  assert.equal(dialog.opener.focused, true);
});

test('failed opener focus falls back to the next visible safe control', () => {
  const dialog = dialogHarness({ openerFocusFails: true });

  dialog.context.openOv('cartOv');
  dialog.context.closeOv('cartOv');
  dialog.runScheduled();

  assert.equal(dialog.opener.focused, false);
  assert.equal(dialog.fallback.focused, true);
});

test('cart-to-share transition restores focus to the original visible cart opener', () => {
  const dialog = dialogHarness({ fallbackPrecedesOpener: true });

  dialog.context.openOv('cartOv');
  dialog.context.placeOrder();
  dialog.context.closeOv('shareOv');
  dialog.runScheduled();

  assert.equal(dialog.fallback.focused, false);
  assert.equal(dialog.opener.focused, true);
  assert.equal(dialog.context.document.activeElement, dialog.opener);
});

test('only the topmost nested dialog remains exposed and interactive', () => {
  const dialog = dialogHarness();

  dialog.context.openOv('prodOv');

  assert.equal(dialog.overlays.prodOv.inert, false);
  assert.equal(dialog.overlays.prodOv.getAttribute('aria-hidden'), null);
  assert.equal(dialog.background.inert, true);
  assert.equal(dialog.background.getAttribute('aria-hidden'), 'true');

  dialog.context.document.activeElement = dialog.shareButtons.prodOv;
  dialog.context.openOv('shareOv');

  assert.equal(dialog.overlays.shareOv.inert, false);
  assert.equal(dialog.overlays.shareOv.getAttribute('aria-hidden'), null);
  assert.equal(dialog.overlays.prodOv.inert, true);
  assert.equal(dialog.overlays.prodOv.getAttribute('aria-hidden'), 'true');
  assert.equal(dialog.background.inert, true);
  assert.equal(dialog.background.getAttribute('aria-hidden'), 'true');
});

test('closing the top nested dialog restores the lower dialog before the page', () => {
  const dialog = dialogHarness();

  dialog.context.openOv('prodOv');
  dialog.context.document.activeElement = dialog.shareButtons.prodOv;
  dialog.context.openOv('shareOv');
  dialog.context.closeOv('shareOv');

  assert.equal(dialog.overlays.prodOv.inert, false);
  assert.equal(dialog.overlays.prodOv.getAttribute('aria-hidden'), null);
  assert.equal(dialog.background.inert, true);
  assert.equal(dialog.background.getAttribute('aria-hidden'), 'true');

  dialog.context.closeOv('prodOv');
  dialog.runScheduled();

  assert.equal(dialog.background.inert, false);
  assert.equal(dialog.background.getAttribute('aria-hidden'), null);
  assert.equal(dialog.cookieBar.inert, false);
  assert.equal(dialog.cartPill.getAttribute('aria-hidden'), null);
});

test('one global keyboard handler traps Tab and closes only the topmost dialog', () => {
  const handler = extractFunction(indexSource, 'handleDialogKeydown');
  const registrations = indexSource.match(/document\.addEventListener\('keydown',handleDialogKeydown\)/g) || [];

  assert.equal(registrations.length, 1);
  assert.match(handler, /getTopmostOpenDialog\(\)/);
  assert.match(handler, /e\.key==='Escape'/);
  assert.match(handler, /closeOv\(topmost\.id\)/);
  assert.match(handler, /e\.key!=='Tab'/);
  assert.match(handler, /e\.shiftKey/);
  assert.match(handler, /focusable\[focusable\.length-1\]/);
  assert.match(handler, /focusable\[0\]/);
});

test('background-click closure remains wired for every dialog', () => {
  for (const id of ['prodOv', 'shareOv', 'cartOv']) {
    assert.match(indexSource, new RegExp(`id="${id}"[^>]*onclick="bgClose\\(event,'${id}'\\)"`));
  }
});

test('cookie consent is visible until cookieOk is persisted', () => {
  assert.doesNotMatch(indexSource, /\.cookie-bar\{display:none!important\}/);

  const firstVisit = runCookieScript();
  assert.equal(firstVisit.cookieBar.classList.contains('on'), true);

  firstVisit.context.acceptCookies();
  assert.equal(firstVisit.storage.get('cookieOk'), '1');
  assert.equal(firstVisit.cookieBar.classList.contains('on'), false);

  const acceptedReload = runCookieScript('1');
  assert.equal(acceptedReload.cookieBar.classList.contains('on'), false);
});

test('contact and product copy actions copy the current page link without clearing the cart', async () => {
  for (const mode of ['contact', 'product']) {
    const sharing = sharingHarness();
    sharing.context.prepareServiceSheet(mode);
    sharing.context.copyOrder();
    await new Promise(setImmediate);

    assert.deepEqual(sharing.copied, ['https://example.test/menu?category=rolls#popular']);
    assert.deepEqual(sharing.context.cart, { 1: 2 });
    assert.equal(sharing.context.pendingOrderText.includes('+998 71 123 45 67'), true);
    assert.equal(sharing.toasts.includes('Ссылка скопирована'), true);
    assert.equal(sharing.toasts.includes('Текст заказа скопирован'), false);
  }
});

test('order copy action copies pending order text and preserves its cart-clearing behavior', async () => {
  const sharing = sharingHarness();
  sharing.context.pendingOrderText = 'Новый заказ № 42';
  sharing.context.prepareServiceSheet('order');
  sharing.context.copyOrder();
  await new Promise(setImmediate);

  assert.deepEqual(sharing.copied, ['Новый заказ № 42']);
  assert.equal(Object.keys(sharing.context.cart).length, 0);
  assert.equal(sharing.toasts.includes('Текст заказа скопирован'), true);
  assert.equal(sharing.toasts.includes('Ссылка скопирована'), false);
});

test('failed copy reports failure without a success toast', async () => {
  const sharing = sharingHarness({ clipboardRejects: true });
  sharing.context.prepareServiceSheet('contact');
  sharing.context.copyOrder();
  await new Promise(setImmediate);

  assert.deepEqual(sharing.toasts, ['Скопируйте текст вручную']);
  assert.deepEqual(sharing.context.cart, { 1: 2 });
});

test('phone and address fields have static error descriptions and hidden errors', () => {
  assert.match(indexSource, /id="phoneInp"[^>]*aria-describedby="phoneErr"/);
  assert.match(indexSource, /id="addrInp"[^>]*aria-describedby="addrErr"/);
  assert.match(indexSource, /id="phoneErr"[^>]*hidden/);
  assert.match(indexSource, /id="addrErr"[^>]*hidden/);
  assert.match(indexSource, /const SHOP_PHONE='\+998711234567';/);
});

test('validPhone accepts only normalized phone numbers containing 10 to 15 digits', () => {
  const { context } = checkoutHarness();

  assert.equal(context.validPhone(''), false);
  assert.equal(context.validPhone('+7 (999) 123-45-6'), true);
  assert.equal(context.validPhone('123456789'), false);
  assert.equal(context.validPhone('123456789012345'), true);
  assert.equal(context.validPhone('1234567890123456'), false);
});

test('updateOrderState requires a valid phone for delivery and pickup', () => {
  for (const mode of ['d', 'p']) {
    const empty = checkoutHarness({ phone: '', address: 'Main 1', mode });
    empty.context.updateOrderState();
    assert.equal(empty.elements.orderBtn.disabled, true);

    const invalid = checkoutHarness({ phone: '123', address: 'Main 1', mode });
    invalid.context.updateOrderState();
    assert.equal(invalid.elements.orderBtn.disabled, true);

    const valid = checkoutHarness({ phone: '+7 (999) 123-45-67', address: 'Main 1', mode });
    valid.context.updateOrderState();
    assert.equal(valid.elements.orderBtn.disabled, false);
  }
});

test('updateOrderState requires an address only for delivery', () => {
  const delivery = checkoutHarness({ phone: '1234567890', address: '', mode: 'd' });
  delivery.context.updateOrderState();
  assert.equal(delivery.elements.orderBtn.disabled, true);

  const pickup = checkoutHarness({ phone: '1234567890', address: '', mode: 'p' });
  pickup.context.updateOrderState();
  assert.equal(pickup.elements.orderBtn.disabled, false);
});

test('validation errors remain hidden until an invalid submit is attempted', () => {
  const checkout = checkoutHarness({ phone: '', address: '', mode: 'd' });
  checkout.context.updateOrderState();

  assert.equal(checkout.elements.phoneErr.hidden, true);
  assert.equal(checkout.elements.addrErr.hidden, true);
  assert.equal(checkout.elements.phoneInp.getAttribute('aria-invalid'), null);
  assert.equal(checkout.elements.addrInp.getAttribute('aria-invalid'), null);
});

test('placeOrder blocks direct invalid submission and focuses the first invalid field', () => {
  const checkout = checkoutHarness({ phone: '', address: '', mode: 'd' });
  checkout.context.placeOrder();

  assert.equal(checkout.wasPrepared(), false);
  assert.equal(checkout.elements.phoneErr.hidden, false);
  assert.equal(checkout.elements.addrErr.hidden, false);
  assert.equal(checkout.elements.phoneInp.getAttribute('aria-invalid'), 'true');
  assert.equal(checkout.elements.addrInp.getAttribute('aria-invalid'), 'true');
  assert.equal(checkout.elements.phoneInp.focused, true);
  assert.equal(checkout.elements.addrInp.focused, false);
});

test('placeOrder focuses address when it is the first invalid field', () => {
  const checkout = checkoutHarness({ phone: '1234567890', address: '', mode: 'd' });
  checkout.context.placeOrder();

  assert.equal(checkout.wasPrepared(), false);
  assert.equal(checkout.elements.phoneErr.hidden, true);
  assert.equal(checkout.elements.addrErr.hidden, false);
  assert.equal(checkout.elements.addrInp.getAttribute('aria-invalid'), 'true');
  assert.equal(checkout.elements.phoneInp.focused, false);
  assert.equal(checkout.elements.addrInp.focused, true);
});

test('placeOrder blocks pickup with an invalid phone and focuses phone', () => {
  const checkout = checkoutHarness({ phone: '123', mode: 'p' });
  checkout.context.placeOrder();

  assert.equal(checkout.wasPrepared(), false);
  assert.equal(checkout.elements.phoneErr.hidden, false);
  assert.equal(checkout.elements.phoneInp.getAttribute('aria-invalid'), 'true');
  assert.equal(checkout.elements.phoneInp.focused, true);
  assert.equal(checkout.elements.addrErr.hidden, true);
});

test('placeOrder proceeds with valid checkout contacts', () => {
  const checkout = checkoutHarness({
    phone: '+7 (999) 123-45-67',
    address: 'Main 1',
    mode: 'd',
  });
  checkout.context.placeOrder();

  assert.equal(checkout.wasPrepared(), true);
  assert.equal(checkout.elements.phoneErr.hidden, true);
  assert.equal(checkout.elements.addrErr.hidden, true);
});

test('correcting invalid inputs clears stale errors and aria-invalid', () => {
  const checkout = checkoutHarness({ phone: '', address: '', mode: 'd' });
  checkout.context.placeOrder();

  checkout.elements.phoneInp.value = '+7 999 123 45 67';
  checkout.elements.addrInp.value = 'Main 1';
  checkout.context.updateOrderState();

  assert.equal(checkout.elements.phoneErr.hidden, true);
  assert.equal(checkout.elements.addrErr.hidden, true);
  assert.equal(checkout.elements.phoneInp.getAttribute('aria-invalid'), null);
  assert.equal(checkout.elements.addrInp.getAttribute('aria-invalid'), null);
  assert.equal(checkout.elements.orderBtn.disabled, false);
});
