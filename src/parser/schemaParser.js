import { readFile } from 'fs/promises';
import { SchemaParseError } from '../utils/errors.js';
import { VALID_TYPES } from '../utils/typeConverter.js';

/**
 * Parses a single field definition line into a field metadata object.
 * Line format: fieldName:dataType:modifier1:modifier2...
 */
function parseFieldLine(line, tableName) {
  // Split carefully: default=value may contain '=' but not ':', so plain split(':') is safe
  const parts = line.split(':');
  if (parts.length < 2) {
    throw new SchemaParseError(
      `Invalid field definition "${line}" in table "${tableName}" — expected "fieldName:type[:modifiers]"`,
      line
    );
  }

  const fieldName = parts[0].trim();
  const type = parts[1].trim();

  if (!fieldName) {
    throw new SchemaParseError(`Field name is empty in table "${tableName}"`, line);
  }

  if (!VALID_TYPES.includes(type)) {
    throw new SchemaParseError(
      `Unknown type "${type}" for field "${fieldName}" in table "${tableName}". Valid types: ${VALID_TYPES.join(', ')}`,
      line
    );
  }

  const fieldDef = { type };
  const modifiers = parts.slice(2);

  for (const mod of modifiers) {
    const trimmed = mod.trim();
    if (!trimmed) continue;

    if (trimmed === 'pk') {
      fieldDef.primaryKey = true;
    } else if (trimmed === 'auto') {
      fieldDef.auto = true;
    } else if (trimmed === 'unique') {
      fieldDef.unique = true;
    } else if (trimmed === 'nullable') {
      fieldDef.nullable = true;
    } else if (trimmed === 'required') {
      fieldDef.required = true;
    } else if (trimmed.startsWith('default=')) {
      fieldDef.default = trimmed.slice('default='.length);
    } else if (trimmed.startsWith('fk=')) {
      const ref = trimmed.slice('fk='.length);
      const dotIndex = ref.indexOf('.');
      if (dotIndex === -1) {
        throw new SchemaParseError(
          `Malformed foreign key "${trimmed}" for field "${fieldName}" — expected "fk=table.column"`,
          line
        );
      }
      fieldDef.foreignKey = {
        table: ref.slice(0, dotIndex),
        column: ref.slice(dotIndex + 1),
      };
    }
    // Unrecognized modifiers are silently ignored for forward compatibility
  }

  return { fieldName, fieldDef };
}

/**
 * Parses raw schema text and returns the schema metadata object.
 * Returns: { tableName: { fieldName: { type, ...modifiers }, ... }, ... }
 */
export function parseSchemaText(text) {
  // Normalize Windows line endings
  const lines = text.replace(/\r/g, '').split('\n');
  const schema = {};
  let currentTable = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Table header: matches "tableName:" with nothing after the colon
    if (/^[a-zA-Z_][a-zA-Z0-9_]*:$/.test(line)) {
      currentTable = line.slice(0, -1);
      if (schema[currentTable]) {
        throw new SchemaParseError(`Duplicate table definition: "${currentTable}"`, line);
      }
      schema[currentTable] = {};
      continue;
    }

    // Field definition line
    if (currentTable === null) {
      throw new SchemaParseError(
        `Field definition "${line}" found before any table header`,
        line
      );
    }

    const { fieldName, fieldDef } = parseFieldLine(line, currentTable);

    // Enforce single primary key per table
    if (fieldDef.primaryKey) {
      const existingPK = Object.values(schema[currentTable]).find((f) => f.primaryKey);
      if (existingPK) {
        throw new SchemaParseError(
          `Table "${currentTable}" has multiple primary key fields — only one is allowed`,
          line
        );
      }
    }

    schema[currentTable][fieldName] = fieldDef;
  }

  return schema;
}

/**
 * Reads a schema file from disk and parses it.
 */
export async function parseSchemaFile(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new SchemaParseError(`Cannot read schema file "${filePath}": ${err.message}`, filePath);
  }
  return parseSchemaText(content);
}
