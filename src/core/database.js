import { parseSchemaFile } from '../parser/schemaParser.js';
import { createTable, readTable, writeTable, ensureDatabaseDir } from '../storage/tableManager.js';
import { validateRecord } from '../validators/validator.js';
import { filter, applyOptions } from './queryEngine.js';
import { ValidationError, TableNotFoundError, RecordNotFoundError } from '../utils/errors.js';
import { convertToType } from '../utils/typeConverter.js';

export class Database {
  constructor({ schemaPath, databaseDir }) {
    this.schemaPath = schemaPath;
    this.databaseDir = databaseDir;
    this.schema = null;
  }

  /**
   * Parses the schema file and creates table files if they don't exist.
   * Must be called before any other operation. Safe to call multiple times.
   * @returns {this} for chaining: await new Database(...).init()
   */
  async init() {
    this.schema = await parseSchemaFile(this.schemaPath);
    await ensureDatabaseDir(this.databaseDir);
    for (const tableName of Object.keys(this.schema)) {
      await createTable(tableName, this.databaseDir);
    }
    return this;
  }

  _requireInit() {
    if (!this.schema) {
      throw new Error('Database not initialized. Call await db.init() first.');
    }
  }

  _getTableSchema(tableName) {
    const tableSchema = this.schema[tableName];
    if (!tableSchema) throw new TableNotFoundError(tableName);
    return tableSchema;
  }

  /** Returns the parsed schema object. */
  getSchema() {
    this._requireInit();
    return this.schema;
  }

  /**
   * Inserts a record into a table after validation.
   * Handles auto-increment, default values, and type coercion.
   * @returns The inserted record with all resolved fields.
   */
  async insert(tableName, record) {
    this._requireInit();
    const tableSchema = this._getTableSchema(tableName);
    const existing = await readTable(tableName, this.databaseDir);

    // Build the working copy — start with provided values
    const working = { ...record };

    // Apply defaults for fields not provided
    for (const [fieldName, fieldDef] of Object.entries(tableSchema)) {
      if (working[fieldName] !== undefined) continue;

      if (fieldDef.auto) {
        // Auto-increment: find the current max and add 1
        const max = existing.reduce((m, r) => Math.max(m, r[fieldName] ?? 0), 0);
        working[fieldName] = max + 1;
      } else if (fieldDef.default !== undefined) {
        if (fieldDef.default === 'now') {
          working[fieldName] = new Date().toISOString();
        } else {
          // Coerce the default to the field's type
          try {
            working[fieldName] = convertToType(fieldDef.default, fieldDef.type);
          } catch {
            working[fieldName] = fieldDef.default;
          }
        }
      }
    }

    // Load FK-referenced tables lazily
    const allTablesData = await this._loadFKTables(tableSchema);

    const { valid, errors, coerced } = validateRecord(
      working,
      tableSchema,
      existing,
      allTablesData
    );

    if (!valid) {
      throw new ValidationError(`Validation failed for insert into "${tableName}"`, errors);
    }

    // Fill any remaining undefined fields with null
    const finalRecord = {};
    for (const fieldName of Object.keys(tableSchema)) {
      finalRecord[fieldName] = coerced[fieldName] ?? null;
    }

    existing.push(finalRecord);
    await writeTable(tableName, existing, this.databaseDir);
    return finalRecord;
  }

  /**
   * Returns all records matching query, with optional sort/limit/offset.
   */
  async find(tableName, query = {}, options = {}) {
    this._requireInit();
    this._getTableSchema(tableName);
    const records = await readTable(tableName, this.databaseDir);
    const filtered = filter(records, query);
    return applyOptions(filtered, options);
  }

  /**
   * Returns the first record matching query.
   * Throws RecordNotFoundError if nothing matches.
   */
  async findOne(tableName, query = {}) {
    const results = await this.find(tableName, query);
    if (results.length === 0) throw new RecordNotFoundError(tableName, query);
    return results[0];
  }

  /**
   * Updates all records matching query by merging in updates.
   * Auto fields cannot be changed. Returns count of affected records.
   */
  async update(tableName, query, updates) {
    this._requireInit();
    const tableSchema = this._getTableSchema(tableName);
    const records = await readTable(tableName, this.databaseDir);
    const matching = filter(records, query);

    if (matching.length === 0) return 0;

    // Strip any attempt to update auto-increment fields
    const safeUpdates = { ...updates };
    for (const [fieldName, fieldDef] of Object.entries(tableSchema)) {
      if (fieldDef.auto) delete safeUpdates[fieldName];
    }

    const allTablesData = await this._loadFKTables(tableSchema);
    const updatedRecords = [];

    for (const record of records) {
      const isMatch = matching.includes(record);
      if (!isMatch) {
        updatedRecords.push(record);
        continue;
      }

      const merged = { ...record, ...safeUpdates };
      const otherRecords = records.filter((r) => r !== record);

      const { valid, errors, coerced } = validateRecord(
        merged,
        tableSchema,
        otherRecords,
        allTablesData,
        { isUpdate: true }
      );

      if (!valid) {
        throw new ValidationError(`Validation failed for update in "${tableName}"`, errors);
      }

      updatedRecords.push({ ...record, ...coerced });
    }

    await writeTable(tableName, updatedRecords, this.databaseDir);
    return matching.length;
  }

  /**
   * Deletes all records matching query. Returns count of deleted records.
   */
  async delete(tableName, query) {
    this._requireInit();
    this._getTableSchema(tableName);
    const records = await readTable(tableName, this.databaseDir);
    const matching = filter(records, query);
    const remaining = records.filter((r) => !matching.includes(r));
    await writeTable(tableName, remaining, this.databaseDir);
    return matching.length;
  }

  /**
   * Returns the count of records matching query.
   */
  async count(tableName, query = {}) {
    const results = await this.find(tableName, query);
    return results.length;
  }

  /**
   * Loads data for all tables referenced by FK fields in the given table schema.
   * Returns null if no FK fields exist.
   */
  async _loadFKTables(tableSchema) {
    const fkTables = {};
    let hasFKs = false;

    for (const fieldDef of Object.values(tableSchema)) {
      if (!fieldDef.foreignKey) continue;
      const { table: fkTable } = fieldDef.foreignKey;
      if (fkTables[fkTable] !== undefined) continue;
      hasFKs = true;
      try {
        fkTables[fkTable] = await readTable(fkTable, this.databaseDir);
      } catch (err) {
        if (err.name === 'TableNotFoundError') {
          fkTables[fkTable] = null;
        } else {
          throw err;
        }
      }
    }

    return hasFKs ? fkTables : null;
  }
}
