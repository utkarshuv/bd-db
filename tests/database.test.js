import { Database } from '../src/core/database.js';
import { ValidationError, RecordNotFoundError, TableNotFoundError } from '../src/utils/errors.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rm, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', 'schema', 'schema.txt');
const DB_DIR = join('/tmp', `json-db-test-${Date.now()}`);

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function assertThrowsAsync(label, fn, expectedClass) {
  try {
    await fn();
    console.error(`  ✗ ${label} (expected error, got none)`);
    failed++;
  } catch (err) {
    if (expectedClass && !(err instanceof expectedClass)) {
      console.error(`  ✗ ${label} (expected ${expectedClass.name}, got ${err.constructor.name}: ${err.message})`);
      failed++;
    } else {
      console.log(`  ✓ ${label}`);
      passed++;
    }
  }
}

// ── init ───────────────────────────────────────────────────────
console.log('\nDatabase — init');

const db = new Database({ schemaPath: SCHEMA_PATH, databaseDir: DB_DIR });
await db.init();

assert('init creates database directory', existsSync(DB_DIR));
assert('init creates users.json', existsSync(join(DB_DIR, 'users.json')));
assert('init creates posts.json', existsSync(join(DB_DIR, 'posts.json')));

// Idempotent — calling init again should not throw or corrupt
await db.init();
assert('init is idempotent', existsSync(join(DB_DIR, 'users.json')));

assert('getSchema returns schema object', typeof db.getSchema() === 'object');
assert('getSchema has users', 'users' in db.getSchema());

// ── insert ─────────────────────────────────────────────────────
console.log('\nDatabase — insert');

const u1 = await db.insert('users', { username: 'alice', password: 'pw1', age: 28, role: 'admin' });
assert('insert returns record', u1.username === 'alice');
assert('auto-increment assigns id 1', u1.id === 1);
assert('role stored as string', typeof u1.role === 'string');

const u2 = await db.insert('users', { username: 'bob', password: 'pw2', age: 22 });
assert('second insert gets id 2', u2.id === 2);
assert('default role applied', u2.role === 'user');
assert('createdAt is ISO string', typeof u2.createdAt === 'string' && u2.createdAt.includes('T'));

const u3 = await db.insert('users', { username: 'carol', password: 'pw3', age: null });
assert('nullable age accepts null', u3.age === null);

// ── insert validation errors ───────────────────────────────────
console.log('\nDatabase — insert validation');

await assertThrowsAsync(
  'missing required field throws ValidationError',
  () => db.insert('users', { age: 25 }),
  ValidationError
);

await assertThrowsAsync(
  'duplicate username throws ValidationError',
  () => db.insert('users', { username: 'alice', password: 'pw' }),
  ValidationError
);

await assertThrowsAsync(
  'unknown table throws TableNotFoundError',
  () => db.insert('nosuchTable', { x: 1 }),
  TableNotFoundError
);

// ── find ───────────────────────────────────────────────────────
console.log('\nDatabase — find');

const all = await db.find('users');
assert('find all returns 3 records', all.length === 3);

const admins = await db.find('users', { role: 'admin' });
assert('find by role returns 1 admin', admins.length === 1 && admins[0].username === 'alice');

const young = await db.find('users', { age: { $lte: 22 } });
assert('find $lte returns 1 user', young.length === 1 && young[0].username === 'bob');

const sorted = await db.find('users', {}, { sort: { age: 'desc' } });
assert('find with sort desc: alice is first (age 28)', sorted[0].username === 'alice');

const limited = await db.find('users', {}, { limit: 1 });
assert('find with limit returns 1 record', limited.length === 1);

// ── findOne ────────────────────────────────────────────────────
console.log('\nDatabase — findOne');

const found = await db.findOne('users', { username: 'bob' });
assert('findOne returns correct record', found.username === 'bob');

await assertThrowsAsync(
  'findOne throws RecordNotFoundError when no match',
  () => db.findOne('users', { username: 'nobody' }),
  RecordNotFoundError
);

// ── count ──────────────────────────────────────────────────────
console.log('\nDatabase — count');

assert('count all returns 3', await db.count('users') === 3);
assert('count with filter returns 1', await db.count('users', { role: 'admin' }) === 1);

// ── update ─────────────────────────────────────────────────────
console.log('\nDatabase — update');

const upCount = await db.update('users', { username: 'bob' }, { age: 23, role: 'editor' });
assert('update returns count of affected records', upCount === 1);

const bobNow = await db.findOne('users', { username: 'bob' });
assert('update changes age', bobNow.age === 23);
assert('update changes role', bobNow.role === 'editor');
assert('update leaves other fields intact', bobNow.password === 'pw2');

// update with auto field stripped
await db.update('users', { username: 'bob' }, { id: 999, age: 24 });
const bobAfter = await db.findOne('users', { username: 'bob' });
assert('update cannot change auto-increment id', bobAfter.id === 2);
assert('non-auto field was updated', bobAfter.age === 24);

// update with 0 matches returns 0
const noUpdate = await db.update('users', { username: 'ghost' }, { age: 1 });
assert('update with no matches returns 0', noUpdate === 0);

// ── delete ─────────────────────────────────────────────────────
console.log('\nDatabase — delete');

const delCount = await db.delete('users', { username: 'carol' });
assert('delete returns count of deleted records', delCount === 1);
assert('delete reduces count by 1', await db.count('users') === 2);

const noDelete = await db.delete('users', { username: 'nobody' });
assert('delete with no matches returns 0', noDelete === 0);

// ── not initialized guard ──────────────────────────────────────
console.log('\nDatabase — not initialized guard');

const uninitialized = new Database({ schemaPath: SCHEMA_PATH, databaseDir: DB_DIR });
await assertThrowsAsync(
  'calling insert before init throws',
  () => uninitialized.insert('users', {}),
  Error
);

// ── Cleanup ────────────────────────────────────────────────────
await rm(DB_DIR, { recursive: true, force: true });

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
