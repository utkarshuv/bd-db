import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { TableNotFoundError } from '../utils/errors.js';

/**
 * Ensures the database directory exists. Safe to call multiple times.
 */
export async function ensureDatabaseDir(databaseDir) {
  await mkdir(databaseDir, { recursive: true });
}

function tablePath(tableName, databaseDir) {
  return join(databaseDir, `${tableName}.json`);
}

/**
 * Creates an empty JSON table file. Idempotent — skips if file already exists.
 */
export async function createTable(tableName, databaseDir) {
  const filePath = tablePath(tableName, databaseDir);
  if (await tableExists(tableName, databaseDir)) return;
  await writeFile(filePath, JSON.stringify([], null, 2), 'utf-8');
}

/**
 * Reads all records from a table. Throws TableNotFoundError if the file does not exist.
 */
export async function readTable(tableName, databaseDir) {
  const filePath = tablePath(tableName, databaseDir);
  let raw;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new TableNotFoundError(tableName);
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Writes the full records array back to the table file.
 */
export async function writeTable(tableName, records, databaseDir) {
  const filePath = tablePath(tableName, databaseDir);
  await writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Returns true if the table's JSON file exists on disk.
 */
export async function tableExists(tableName, databaseDir) {
  try {
    await access(tablePath(tableName, databaseDir), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
