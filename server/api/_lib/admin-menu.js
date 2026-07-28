const { exactObject, isUuid, money } = require('./public-api');

const CATEGORY_FIELDS = ['name', 'sort_order'];
const DISH_FIELDS = [
  'category_id',
  'name',
  'description',
  'price',
  'cost_price',
  'photo_url',
  'is_available',
  'sort_order',
];

function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
}

function validSortOrder(value) {
  return Number.isInteger(value) && value >= 0 && value <= 2147483647;
}

function validMoney(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 99999999.99
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}

function validNullableText(value, maximum) {
  return value === null || (typeof value === 'string' && value.length <= maximum);
}

function validCategoryBody(body, partial = false) {
  if (!exactObject(body, CATEGORY_FIELDS)) return false;
  const keys = Object.keys(body);
  if (partial ? keys.length === 0 : !keys.includes('name')) return false;
  return (!keys.includes('name') || validName(body.name))
    && (!keys.includes('sort_order') || validSortOrder(body.sort_order));
}

function validDishField(field, value) {
  switch (field) {
    case 'category_id': return isUuid(value);
    case 'name': return validName(value);
    case 'description': return validNullableText(value, 5000);
    case 'price': return validMoney(value);
    case 'cost_price': return validMoney(value, true);
    case 'photo_url': return validNullableText(value, 2048);
    case 'is_available': return typeof value === 'boolean';
    case 'sort_order': return validSortOrder(value);
    default: return false;
  }
}

function validDishBody(body, partial = false) {
  if (!exactObject(body, DISH_FIELDS)) return false;
  const keys = Object.keys(body);
  if (partial) {
    if (keys.length === 0) return false;
  } else if (!['category_id', 'name', 'price'].every((field) => keys.includes(field))) {
    return false;
  }
  return keys.every((field) => validDishField(field, body[field]));
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
  };
}

function mapDish(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: money(row.price),
    costPrice: row.cost_price === null ? null : money(row.cost_price),
    photoUrl: row.photo_url,
    isAvailable: row.is_available,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizedValue(field, value) {
  return field === 'name' ? value.trim() : value;
}

module.exports = {
  CATEGORY_FIELDS,
  DISH_FIELDS,
  mapCategory,
  mapDish,
  normalizedValue,
  validCategoryBody,
  validDishBody,
};
