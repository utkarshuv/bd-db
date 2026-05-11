/**
 * Pure query functions — no I/O, no side effects.
 * All functions return new arrays; originals are never mutated.
 */

/**
 * Normalizes a query value to operator form.
 * { age: 25 } -> { age: { $eq: 25 } }
 */
function normalizeQuery(query) {
  const normalized = {};
  for (const [field, value] of Object.entries(query)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      normalized[field] = value;
    } else {
      normalized[field] = { $eq: value };
    }
  }
  return normalized;
}

function matchesOperators(recordValue, operators) {
  for (const [op, opValue] of Object.entries(operators)) {
    switch (op) {
      case '$eq':
        if (recordValue !== opValue) return false;
        break;
      case '$ne':
        if (recordValue === opValue) return false;
        break;
      case '$gt':
        if (recordValue === null || recordValue === undefined || !(recordValue > opValue)) return false;
        break;
      case '$gte':
        if (recordValue === null || recordValue === undefined || !(recordValue >= opValue)) return false;
        break;
      case '$lt':
        if (recordValue === null || recordValue === undefined || !(recordValue < opValue)) return false;
        break;
      case '$lte':
        if (recordValue === null || recordValue === undefined || !(recordValue <= opValue)) return false;
        break;
      case '$in':
        if (!Array.isArray(opValue) || !opValue.includes(recordValue)) return false;
        break;
      case '$contains':
        if (Array.isArray(recordValue)) {
          if (!recordValue.includes(opValue)) return false;
        } else if (typeof recordValue === 'string') {
          if (!recordValue.includes(opValue)) return false;
        } else {
          return false;
        }
        break;
      // Unknown operators are ignored (forward compatibility)
    }
  }
  return true;
}

/**
 * Filters records by query. Multiple fields use AND semantics.
 * Supports operator objects ($eq, $ne, $gt, $gte, $lt, $lte, $in, $contains)
 * and shorthand { field: value } (treated as $eq).
 */
export function filter(records, query = {}) {
  if (!query || Object.keys(query).length === 0) return [...records];
  const normalized = normalizeQuery(query);
  return records.filter((record) =>
    Object.entries(normalized).every(([field, operators]) =>
      matchesOperators(record[field], operators)
    )
  );
}

/**
 * Sorts records by a single field. Returns a new array.
 * @param {Array} records
 * @param {{ [field]: 'asc' | 'desc' }} sortBy
 */
export function sort(records, sortBy) {
  if (!sortBy || Object.keys(sortBy).length === 0) return [...records];
  const [field, direction] = Object.entries(sortBy)[0];
  return [...records].sort((a, b) => {
    const va = a[field];
    const vb = b[field];
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    const cmp = va < vb ? -1 : 1;
    return direction === 'desc' ? -cmp : cmp;
  });
}

/**
 * Applies sort, offset, and limit to a records array.
 * @param {Array} records
 * @param {{ sort?: object, offset?: number, limit?: number }} options
 */
export function applyOptions(records, options = {}) {
  let result = records;
  if (options.sort) result = sort(result, options.sort);
  if (options.offset) result = result.slice(options.offset);
  if (options.limit) result = result.slice(0, options.limit);
  return result;
}
