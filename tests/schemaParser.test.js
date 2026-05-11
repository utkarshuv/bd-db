import { parseSchemaText, parseSchemaFile } from '../src/parser/schemaParser.js';
import { SchemaParseError } from '../src/utils/errors.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function assertThrows(label, fn, expectedClass) {
  try {
    fn();
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

// ── Basic two-table schema ──────────────────────────────────────
console.log('\nparseSchemaText — basic parsing');

const basicSchema = `
users:
id:int:pk:auto
username:string:unique:required
password:string:required
age:int:nullable
role:string:default=user
createdAt:datetime:default=now

posts:
id:int:pk:auto
title:string:required
body:string
userId:int:fk=users.id
`;

const schema = parseSchemaText(basicSchema);

assert('users table exists', 'users' in schema);
assert('posts table exists', 'posts' in schema);

// users.id
assert('users.id type is int', schema.users.id.type === 'int');
assert('users.id has primaryKey', schema.users.id.primaryKey === true);
assert('users.id has auto', schema.users.id.auto === true);

// users.username
assert('users.username type is string', schema.users.username.type === 'string');
assert('users.username unique', schema.users.username.unique === true);
assert('users.username required', schema.users.username.required === true);

// users.age nullable
assert('users.age nullable', schema.users.age.nullable === true);

// users.role default
assert('users.role default=user', schema.users.role.default === 'user');

// users.createdAt default=now
assert('users.createdAt default=now', schema.users.createdAt.default === 'now');

// posts.userId fk
assert('posts.userId foreignKey exists', !!schema.posts.userId.foreignKey);
assert('posts.userId fk table is users', schema.posts.userId.foreignKey.table === 'users');
assert('posts.userId fk column is id', schema.posts.userId.foreignKey.column === 'id');

// posts.body — no modifiers except type
assert('posts.body type is string', schema.posts.body.type === 'string');
assert('posts.body has no primaryKey', !schema.posts.body.primaryKey);
assert('posts.body has no required', !schema.posts.body.required);

// ── Empty lines are ignored ───────────────────────────────────
console.log('\nparseSchemaText — whitespace handling');

const spaceySchema = '\n\n\nusers:\n\nid:int:pk\n\nname:string\n\n';
const s2 = parseSchemaText(spaceySchema);
assert('empty lines between fields ignored', 'users' in s2);
assert('fields still parsed correctly', s2.users.id.type === 'int');
assert('fields still parsed correctly 2', s2.users.name.type === 'string');

// ── Windows CRLF line endings ─────────────────────────────────
console.log('\nparseSchemaText — CRLF handling');

const crlfSchema = 'users:\r\nid:int:pk\r\nname:string\r\n';
const s3 = parseSchemaText(crlfSchema);
assert('CRLF schema parses without error', 'users' in s3);
assert('CRLF id field parsed', s3.users.id.primaryKey === true);

// ── All supported modifiers ───────────────────────────────────
console.log('\nparseSchemaText — modifier coverage');

const modSchema = `
things:
a:string:unique
b:int:nullable
c:float:required
d:boolean:default=true
e:int:fk=other.id
`;
const s4 = parseSchemaText(modSchema);
assert('unique modifier', s4.things.a.unique === true);
assert('nullable modifier', s4.things.b.nullable === true);
assert('required modifier', s4.things.c.required === true);
assert('default=true stored as string "true"', s4.things.d.default === 'true');
assert('fk parsed', s4.things.e.foreignKey?.table === 'other');

// ── Error cases ───────────────────────────────────────────────
console.log('\nparseSchemaText — error cases');

assertThrows(
  'unknown type throws SchemaParseError',
  () => parseSchemaText('things:\nfield:blob'),
  SchemaParseError
);

assertThrows(
  'malformed FK throws SchemaParseError',
  () => parseSchemaText('things:\nfield:int:fk=noDot'),
  SchemaParseError
);

assertThrows(
  'multiple PKs throws SchemaParseError',
  () => parseSchemaText('things:\na:int:pk\nb:int:pk'),
  SchemaParseError
);

assertThrows(
  'field before table header throws SchemaParseError',
  () => parseSchemaText('id:int:pk'),
  SchemaParseError
);

// ── Table with zero fields ────────────────────────────────────
console.log('\nparseSchemaText — edge cases');

const emptyTable = 'things:\n\nother:\nid:int';
const s5 = parseSchemaText(emptyTable);
assert('empty table produces empty object', Object.keys(s5.things).length === 0);
assert('other table still parsed', s5.other.id.type === 'int');

// ── parseSchemaFile (async) ───────────────────────────────────
console.log('\nparseSchemaFile — reads real schema.txt');

const realSchema = await parseSchemaFile(join(__dirname, '..', 'schema', 'schema.txt'));
assert('real schema has users table', 'users' in realSchema);
assert('real schema has posts table', 'posts' in realSchema);
assert('real schema users.id auto', realSchema.users.id.auto === true);

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
