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
    pendingOrderText: '',
  });

  for (const name of ['validPhone', 'updateOrderState', 'placeOrder']) {
    vm.runInContext(`${extractFunction(indexSource, name)};this.${name}=${name};`, context);
  }

  return { context, elements, wasPrepared: () => prepared };
}

test('index.html and menu.html remain byte-identical', () => {
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'index.html')),
    fs.readFileSync(path.join(root, 'menu.html')),
  );
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
