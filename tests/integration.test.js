import { Database } from '../src/core/database.js';
import { ValidationError, RecordNotFoundError } from '../src/utils/errors.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rm } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', 'schema', 'schema.txt');
const DB_DIR = join('/tmp', `bd-db-integration-${Date.now()}`);

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

console.log('\n=== Integration Tests ===\n');

// ── 1. Initialize database from real schema file ───────────────
console.log('1. Init');
const db = new Database({ schemaPath: SCHEMA_PATH, databaseDir: DB_DIR });
await db.init();

const schema = db.getSchema();
assert('schema loaded from schema.txt', 'users' in schema && 'posts' in schema);
assert('users schema has id with auto', schema.users.id.auto === true);
assert('posts schema has userId FK', schema.posts.userId?.foreignKey?.table === 'users');

// ── 2. Insert users, verify sequential IDs ─────────────────────
console.log('\n2. Insert users');
const u1 = await db.insert('users', { username: 'alice', password: 'pw1', age: 28, role: 'admin' });
const u2 = await db.insert('users', { username: 'bob', password: 'pw2', age: 22 });
const u3 = await db.insert('users', { username: 'carol', password: 'pw3', age: 35 });

assert('user 1 gets id 1', u1.id === 1);
assert('user 2 gets id 2', u2.id === 2);
assert('user 3 gets id 3', u3.id === 3);
assert('default role applied to bob', u2.role === 'user');
assert('createdAt set automatically for alice', typeof u1.createdAt === 'string' && u1.createdAt.length > 0);

// ── 3. Insert posts with FK ────────────────────────────────────
console.log('\n3. Insert posts');
const p1 = await db.insert('posts', { title: 'Hello World', body: 'First!', userId: u1.id });
const p2 = await db.insert('posts', { title: 'Node Tips', body: 'Useful.', userId: u2.id });

assert('post 1 gets id 1', p1.id === 1);
assert('post 2 gets id 2', p2.id === 2);
assert('post references alice (userId=1)', p1.userId === 1);

// ── 4. FK violation ────────────────────────────────────────────
console.log('\n4. FK violation');
await assertThrowsAsync(
  'insert post with non-existent userId throws ValidationError',
  () => db.insert('posts', { title: 'Ghost Post', userId: 9999 }),
  ValidationError
);

// ── 5. Query with operators ────────────────────────────────────
console.log('\n5. Querying');

const over25 = await db.find('users', { age: { $gte: 28 } });
assert('$gte 28 returns alice and carol', over25.length === 2);
assert('result contains alice', over25.some((u) => u.username === 'alice'));
assert('result contains carol', over25.some((u) => u.username === 'carol'));

const admins = await db.find('users', { role: { $in: ['admin'] } });
assert('$in [admin] returns alice only', admins.length === 1 && admins[0].username === 'alice');

const sortedUsers = await db.find('users', {}, { sort: { age: 'desc' }, limit: 2 });
assert('sort+limit: first is carol (age 35)', sortedUsers[0].username === 'carol');
assert('sort+limit: returns only 2', sortedUsers.length === 2);

// ── 6. Update ──────────────────────────────────────────────────
console.log('\n6. Update');
await db.update('users', { username: 'bob' }, { age: 23 });
const bobUpdated = await db.findOne('users', { username: 'bob' });
assert('update changes bob age to 23', bobUpdated.age === 23);
assert('update does not change bob password', bobUpdated.password === 'pw2');

// ── 7. Delete ──────────────────────────────────────────────────
console.log('\n7. Delete');
const beforeCount = await db.count('users');
await db.delete('users', { username: 'carol' });
const afterCount = await db.count('users');
assert('delete reduces user count by 1', afterCount === beforeCount - 1);
assert('carol is gone', (await db.find('users', { username: 'carol' })).length === 0);

// ── 8. getSchema ───────────────────────────────────────────────
console.log('\n8. getSchema');
const fullSchema = db.getSchema();
assert('getSchema returns object with both tables', Object.keys(fullSchema).length === 2);

// ── 9. findOne throws when not found ──────────────────────────
console.log('\n9. RecordNotFoundError');
await assertThrowsAsync(
  'findOne throws RecordNotFoundError for missing record',
  () => db.findOne('users', { username: 'ghost' }),
  RecordNotFoundError
);

// ── 10. Cleanup ────────────────────────────────────────────────
await rm(DB_DIR, { recursive: true, force: true });
assert('cleanup: temp directory removed', true);

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
