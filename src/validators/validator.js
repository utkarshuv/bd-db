import { convertToType } from '../utils/typeConverter.js';
import { DBTypeError } from '../utils/errors.js';

/**
 * Validates a record against a table's schema.
 *
 * @param {object} record - The record being inserted or updated
 * @param {object} tableSchema - The parsed field definitions for the table
 * @param {Array} existingRecords - Current records in the table (for uniqueness checks)
 * @param {object|null} allTablesData - Map of tableName -> records array for FK validation
 * @param {object} options
 * @param {boolean} options.isUpdate - When true, skip required checks for absent fields
 * @returns {{ valid: boolean, errors: string[], coerced: object }}
 */
export function validateRecord(record, tableSchema, existingRecords, allTablesData = null, options = {}) {
  const { isUpdate = false } = options;
  const errors = [];
  const coerced = {};

  const knownFields = Object.keys(tableSchema);

  // 1. Unknown field check
  for (const key of Object.keys(record)) {
    if (!knownFields.includes(key)) {
      errors.push(`Unknown field "${key}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, coerced: record };
  }

  // 2. Required fields + type coercion
  for (const fieldName of knownFields) {
    const fieldDef = tableSchema[fieldName];
    const rawValue = record[fieldName];
    const isPresent = rawValue !== undefined;
    const isEmpty = rawValue === null || rawValue === '';

    // Required check: always fails if field is present-but-empty/null; on insert also fails if absent
    if (fieldDef.required) {
      const shouldCheck = !isUpdate ? (!isPresent || isEmpty) : (isPresent && isEmpty);
      if (shouldCheck) {
        errors.push(`Field "${fieldName}" is required`);
        coerced[fieldName] = rawValue ?? null;
        continue;
      }
    }

    // Skip coercion for absent fields during update
    if (!isPresent) {
      continue;
    }

    // null is valid for nullable fields; skip coercion
    if (rawValue === null) {
      coerced[fieldName] = null;
      continue;
    }

    // Type coercion
    try {
      coerced[fieldName] = convertToType(rawValue, fieldDef.type);
    } catch (err) {
      if (err instanceof DBTypeError) {
        errors.push(`Field "${fieldName}": ${err.message}`);
        coerced[fieldName] = rawValue;
      } else {
        throw err;
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, coerced };
  }

  // 3. Primary key uniqueness (only on insert — update should not change PKs)
  if (!isUpdate) {
    for (const fieldName of knownFields) {
      const fieldDef = tableSchema[fieldName];
      if (!fieldDef.primaryKey) continue;
      const newVal = coerced[fieldName];
      if (newVal === undefined || newVal === null) continue;
      const conflict = existingRecords.find((r) => r[fieldName] === newVal);
      if (conflict) {
        errors.push(`Primary key constraint violation: field "${fieldName}" value ${JSON.stringify(newVal)} already exists`);
      }
    }
  }

  // 4. Unique constraint
  for (const fieldName of knownFields) {
    const fieldDef = tableSchema[fieldName];
    if (!fieldDef.unique) continue;
    const newVal = coerced[fieldName] ?? record[fieldName];
    if (newVal === null || newVal === undefined) continue;
    const conflict = existingRecords.find((r) => r[fieldName] === newVal);
    if (conflict) {
      errors.push(`Unique constraint violation: field "${fieldName}" value ${JSON.stringify(newVal)} already exists`);
    }
  }

  // 5. Foreign key validation
  if (allTablesData) {
    for (const fieldName of knownFields) {
      const fieldDef = tableSchema[fieldName];
      if (!fieldDef.foreignKey) continue;
      const newVal = coerced[fieldName] ?? record[fieldName];
      if (newVal === null || newVal === undefined) continue;

      const { table: fkTable, column: fkColumn } = fieldDef.foreignKey;
      const referencedRecords = allTablesData[fkTable];

      if (!referencedRecords) {
        errors.push(`Foreign key error: referenced table "${fkTable}" not found`);
        continue;
      }

      const match = referencedRecords.find((r) => r[fkColumn] === newVal);
      if (!match) {
        errors.push(
          `Foreign key constraint violation: "${fieldName}" value ${JSON.stringify(newVal)} does not exist in "${fkTable}.${fkColumn}"`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    coerced,
  };
}
