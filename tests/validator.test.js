import { validateRecord } from '../src/validators/validator.js';
import { ValidationError } from '../src/utils/errors.js';

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

// Reusable schema for most tests
const userSchema = {
  id: { type: 'int', primaryKey: true, auto: true },
  username: { type: 'string', unique: true, required: true },
  age: { type: 'int', nullable: true },
  score: { type: 'float' },
  active: { type: 'boolean' },
  role: { type: 'string', default: 'user' },
};

const existingUsers = [
  { id: 1, username: 'alice', age: 28, score: 9.5, active: true, role: 'admin' },
  { id: 2, username: 'bob', age: 22, score: 7.0, active: false, role: 'user' },
];

// ── Valid record ──────────────────────────────────────────────
console.log('\nvalidator — valid record');

const r1 = validateRecord(
  { id: 3, username: 'charlie', age: 30, score: 8.0, active: true, role: 'user' },
  userSchema,
  existingUsers
);
assert('valid record passes', r1.valid === true);
assert('no errors on valid record', r1.errors.length === 0);
assert('coerced record returned', r1.coerced.username === 'charlie');

// ── Type coercion ─────────────────────────────────────────────
console.log('\nvalidator — type coercion');

const r2 = validateRecord(
  { id: 3, username: 'dave', age: '25', score: '8.5', active: 'true', role: 'user' },
  userSchema,
  existingUsers
);
assert('string "25" coerced to int 25', r2.coerced.age === 25);
assert('string "8.5" coerced to float 8.5', r2.coerced.score === 8.5);
assert('string "true" coerced to boolean true', r2.coerced.active === true);

// ── Required field ────────────────────────────────────────────
console.log('\nvalidator — required fields');

const r3 = validateRecord(
  { id: 3, age: 25 }, // missing username
  userSchema,
  existingUsers
);
assert('missing required field fails', r3.valid === false);
assert('error mentions field name', r3.errors.some((e) => e.includes('username')));

const r4 = validateRecord(
  { id: 3, username: null }, // null for required
  userSchema,
  existingUsers
);
assert('null required field fails', r4.valid === false);

// ── Unknown field ─────────────────────────────────────────────
console.log('\nvalidator — unknown fields');

const r5 = validateRecord(
  { id: 3, username: 'dave', ghost: 'oops' },
  userSchema,
  existingUsers
);
assert('unknown field fails', r5.valid === false);
assert('error mentions unknown field name', r5.errors.some((e) => e.includes('ghost')));

// ── Invalid type ──────────────────────────────────────────────
console.log('\nvalidator — type errors');

const r6 = validateRecord(
  { id: 3, username: 'dave', age: 'notanumber' },
  userSchema,
  existingUsers
);
assert('bad int value fails', r6.valid === false);
assert('error mentions field name', r6.errors.some((e) => e.includes('age')));

// ── Unique constraint ─────────────────────────────────────────
console.log('\nvalidator — unique constraint');

const r7 = validateRecord(
  { id: 3, username: 'alice' }, // alice already exists
  userSchema,
  existingUsers
);
assert('duplicate unique value fails', r7.valid === false);
assert('error mentions unique constraint', r7.errors.some((e) => e.toLowerCase().includes('unique')));

// ── PK uniqueness ─────────────────────────────────────────────
console.log('\nvalidator — primary key uniqueness');

const r8 = validateRecord(
  { id: 1, username: 'newguy' }, // id 1 already exists
  userSchema,
  existingUsers
);
assert('duplicate PK fails', r8.valid === false);
assert('error mentions primary key', r8.errors.some((e) => e.toLowerCase().includes('primary key')));

// ── Nullable field ────────────────────────────────────────────
console.log('\nvalidator — nullable');

const r9 = validateRecord(
  { id: 3, username: 'dave', age: null }, // age is nullable
  userSchema,
  existingUsers
);
assert('nullable field accepts null', r9.valid === true);
assert('null preserved in coerced', r9.coerced.age === null);

// ── FK validation ─────────────────────────────────────────────
console.log('\nvalidator — foreign keys');

const postSchema = {
  id: { type: 'int', primaryKey: true },
  title: { type: 'string', required: true },
  userId: { type: 'int', foreignKey: { table: 'users', column: 'id' } },
};

const r10 = validateRecord(
  { id: 1, title: 'Hello', userId: 1 },
  postSchema,
  [],
  { users: existingUsers }
);
assert('valid FK reference passes', r10.valid === true);

const r11 = validateRecord(
  { id: 2, title: 'Ghost', userId: 999 },
  postSchema,
  [],
  { users: existingUsers }
);
assert('invalid FK reference fails', r11.valid === false);
assert('error mentions FK constraint', r11.errors.some((e) => e.toLowerCase().includes('foreign key')));

const r12 = validateRecord(
  { id: 3, title: 'No FK Table', userId: 1 },
  postSchema,
  [],
  null // FK checking disabled
);
assert('null allTablesData skips FK validation', r12.valid === true);

// ── isUpdate mode ─────────────────────────────────────────────
console.log('\nvalidator — isUpdate mode');

const r13 = validateRecord(
  { age: 30 }, // only updating age, not providing username
  userSchema,
  existingUsers,
  null,
  { isUpdate: true }
);
assert('isUpdate skips required check for absent fields', r13.valid === true);

const r14 = validateRecord(
  { username: null }, // explicitly nulling a required field during update
  userSchema,
  existingUsers,
  null,
  { isUpdate: true }
);
assert('isUpdate fails when required field explicitly set to null', r14.valid === false);

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
