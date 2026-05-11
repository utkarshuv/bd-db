import { DBTypeError } from './errors.js';

const VALID_TYPES = ['string', 'int', 'float', 'boolean', 'date', 'datetime', 'json', 'array'];

export function convertToType(value, type) {
  // null passes through without coercion — nullable handling is the validator's responsibility
  if (value === null || value === undefined) return null;

  switch (type) {
    case 'string':
      return String(value);

    case 'int': {
      if (typeof value === 'number' && Number.isInteger(value)) return value;
      const n = parseInt(value, 10);
      if (isNaN(n)) throw new DBTypeError(`Cannot convert "${value}" to int`, null, 'int', value);
      return n;
    }

    case 'float': {
      if (typeof value === 'number') return value;
      const f = parseFloat(value);
      if (isNaN(f)) throw new DBTypeError(`Cannot convert "${value}" to float`, null, 'float', value);
      return f;
    }

    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const s = String(value).toLowerCase().trim();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0') return false;
      throw new DBTypeError(`Cannot convert "${value}" to boolean`, null, 'boolean', value);
    }

    case 'date': {
      if (typeof value !== 'string' && !(value instanceof Date)) {
        throw new DBTypeError(`Expected date string, got "${value}"`, null, 'date', value);
      }
      const d = new Date(value);
      if (isNaN(d.getTime())) throw new DBTypeError(`Invalid date: "${value}"`, null, 'date', value);
      // Store as ISO date string (YYYY-MM-DD)
      return typeof value === 'string' ? value : d.toISOString().slice(0, 10);
    }

    case 'datetime': {
      if (typeof value !== 'string' && !(value instanceof Date)) {
        throw new DBTypeError(`Expected datetime string, got "${value}"`, null, 'datetime', value);
      }
      const dt = new Date(value);
      if (isNaN(dt.getTime())) throw new DBTypeError(`Invalid datetime: "${value}"`, null, 'datetime', value);
      return typeof value === 'string' ? value : dt.toISOString();
    }

    case 'json': {
      if (typeof value === 'object') return value;
      try { return JSON.parse(value); } catch {
        throw new DBTypeError(`Cannot parse "${value}" as JSON`, null, 'json', value);
      }
    }

    case 'array': {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) throw new Error();
          return parsed;
        } catch {
          throw new DBTypeError(`Cannot parse "${value}" as array`, null, 'array', value);
        }
      }
      throw new DBTypeError(`Cannot convert "${value}" to array`, null, 'array', value);
    }

    default:
      throw new DBTypeError(`Unknown type: "${type}"`, null, type, value);
  }
}

export function isValidType(value, type) {
  try {
    convertToType(value, type);
    return true;
  } catch {
    return false;
  }
}

export { VALID_TYPES };
