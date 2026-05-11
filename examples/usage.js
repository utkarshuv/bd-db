import { Database, ValidationError, RecordNotFoundError } from '../index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rm } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', 'database');
const SCHEMA_PATH = join(__dirname, '..', 'schema', 'schema.txt');

console.log('\n=== JSON-DB Usage Example ===\n');

const db = new Database({ schemaPath: SCHEMA_PATH, databaseDir: DB_DIR });
await db.init();
console.log('Database initialized. Tables:', Object.keys(db.getSchema()));

// --- Insert users ---
console.log('\n-- Inserting users --');
const alice = await db.insert('users', {
  username: 'alice',
  password: 'secret123',
  age: 28,
  role: 'admin',
});
console.log('Inserted:', alice);

const bob = await db.insert('users', {
  username: 'bob',
  password: 'pass456',
  age: 22,
  // role defaults to "user", createdAt defaults to now
});
console.log('Inserted:', bob);

const charlie = await db.insert('users', {
  username: 'charlie',
  password: 'pw789',
  age: 35,
  role: 'moderator',
});
console.log('Inserted:', charlie);

// --- Insert posts ---
console.log('\n-- Inserting posts --');
const post1 = await db.insert('posts', {
  title: 'Hello World',
  body: 'My first post!',
  userId: alice.id,
});
console.log('Inserted post:', post1);

const post2 = await db.insert('posts', {
  title: 'Node.js Tips',
  body: 'Some helpful tips.',
  userId: bob.id,
});
console.log('Inserted post:', post2);

// --- Find ---
console.log('\n-- Querying --');
const allUsers = await db.find('users');
console.log('All users count:', allUsers.length);

const youngUsers = await db.find('users', { age: { $lt: 30 } });
console.log('Users under 30:', youngUsers.map((u) => u.username));

const sorted = await db.find('users', {}, { sort: { age: 'desc' }, limit: 2 });
console.log('Top 2 oldest users:', sorted.map((u) => `${u.username}(${u.age})`));

const adminUser = await db.findOne('users', { role: 'admin' });
console.log('Admin user:', adminUser.username);

// --- Update ---
console.log('\n-- Updating --');
const updated = await db.update('users', { username: 'bob' }, { age: 23, role: 'editor' });
console.log(`Updated ${updated} record(s)`);
const bobNow = await db.findOne('users', { username: 'bob' });
console.log('Bob after update:', { age: bobNow.age, role: bobNow.role });

// --- Count ---
console.log('\n-- Counting --');
const total = await db.count('users');
const admins = await db.count('users', { role: 'admin' });
console.log(`Total users: ${total}, Admins: ${admins}`);

// --- Delete ---
console.log('\n-- Deleting --');
const deleted = await db.delete('users', { username: 'charlie' });
console.log(`Deleted ${deleted} record(s). Remaining users: ${await db.count('users')}`);

// --- Error handling ---
console.log('\n-- Error handling --');

try {
  await db.insert('users', { username: 'alice', password: 'dup' }); // unique violation
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Caught ValidationError:', err.errors);
  }
}

try {
  await db.insert('posts', { title: 'Ghost Post', userId: 9999 }); // FK violation
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Caught FK ValidationError:', err.errors[0]);
  }
}

try {
  await db.findOne('users', { username: 'nobody' });
} catch (err) {
  if (err instanceof RecordNotFoundError) {
    console.log('Caught RecordNotFoundError:', err.message);
  }
}

console.log('\n=== Done ===\n');
