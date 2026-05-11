import { filter, sort, applyOptions } from '../src/core/queryEngine.js';

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

const records = [
  { id: 1, name: 'Alice', age: 28, role: 'admin', score: 9.5, tags: ['dev', 'admin'] },
  { id: 2, name: 'Bob',   age: 22, role: 'user',  score: 7.0, tags: ['user'] },
  { id: 3, name: 'Carol', age: 35, role: 'user',  score: 8.2, tags: ['dev', 'user'] },
  { id: 4, name: 'Dan',   age: 22, role: 'mod',   score: 6.5, tags: ['mod'] },
];

// ── filter — empty query ───────────────────────────────────────
console.log('\nfilter — empty query');

const all = filter(records, {});
assert('empty query returns all records', all.length === 4);
assert('returns a copy, not the original array', all !== records);

const allUndef = filter(records);
assert('undefined query returns all records', allUndef.length === 4);

// ── filter — shorthand equality ───────────────────────────────
console.log('\nfilter — shorthand equality');

const aged22 = filter(records, { age: 22 });
assert('shorthand { age: 22 } matches 2 records', aged22.length === 2);
assert('matched records have age 22', aged22.every((r) => r.age === 22));

// ── filter — $eq ──────────────────────────────────────────────
console.log('\nfilter — $eq');

const eq = filter(records, { role: { $eq: 'admin' } });
assert('$eq matches alice', eq.length === 1 && eq[0].name === 'Alice');

// ── filter — $ne ──────────────────────────────────────────────
console.log('\nfilter — $ne');

const ne = filter(records, { role: { $ne: 'user' } });
assert('$ne excludes users (keeps admin + mod)', ne.length === 2);

// ── filter — $gt / $gte ───────────────────────────────────────
console.log('\nfilter — $gt / $gte');

const gt = filter(records, { age: { $gt: 22 } });
assert('$gt 22 returns 2 records (28, 35)', gt.length === 2);

const gte = filter(records, { age: { $gte: 28 } });
assert('$gte 28 returns 2 records (28, 35)', gte.length === 2);

// ── filter — $lt / $lte ───────────────────────────────────────
console.log('\nfilter — $lt / $lte');

const lt = filter(records, { age: { $lt: 28 } });
assert('$lt 28 returns 2 records (22, 22)', lt.length === 2);

const lte = filter(records, { age: { $lte: 22 } });
assert('$lte 22 returns 2 records', lte.length === 2);

// ── filter — $in ──────────────────────────────────────────────
console.log('\nfilter — $in');

const inResult = filter(records, { role: { $in: ['admin', 'mod'] } });
assert('$in [admin, mod] returns Alice and Dan', inResult.length === 2);

// ── filter — $contains (string) ───────────────────────────────
console.log('\nfilter — $contains');

const containsStr = filter(records, { name: { $contains: 'ob' } });
assert('$contains "ob" matches Bob', containsStr.length === 1 && containsStr[0].name === 'Bob');

const containsArr = filter(records, { tags: { $contains: 'dev' } });
assert('$contains "dev" in tags matches Alice and Carol', containsArr.length === 2);

// ── filter — multiple fields (AND) ────────────────────────────
console.log('\nfilter — AND conditions');

const andResult = filter(records, { age: 22, role: 'user' });
assert('AND: age=22 AND role=user returns only Bob', andResult.length === 1 && andResult[0].name === 'Bob');

// ── filter — empty records ─────────────────────────────────────
console.log('\nfilter — empty input');

assert('filter on empty array returns empty array', filter([], { age: 22 }).length === 0);

// ── sort ───────────────────────────────────────────────────────
console.log('\nsort');

const asc = sort(records, { age: 'asc' });
assert('sort asc: first is youngest', asc[0].age === 22);
assert('sort asc: last is oldest', asc[asc.length - 1].age === 35);

const desc = sort(records, { age: 'desc' });
assert('sort desc: first is oldest', desc[0].age === 35);
assert('sort desc: last is youngest', desc[desc.length - 1].age === 22);

// Verify non-mutation
const original = [...records];
sort(records, { age: 'asc' });
assert('sort does not mutate original array', records[0].name === original[0].name);

// ── applyOptions ───────────────────────────────────────────────
console.log('\napplyOptions');

const limited = applyOptions(records, { limit: 2 });
assert('limit returns first 2 records', limited.length === 2);

const offset = applyOptions(records, { offset: 2 });
assert('offset skips first 2 records', offset.length === 2 && offset[0].name === 'Carol');

const sortLimitOffset = applyOptions(records, { sort: { age: 'asc' }, offset: 1, limit: 2 });
assert('sort+offset+limit: sorted asc, skip 1, take 2', sortLimitOffset.length === 2);
// After sort asc by age: [22-Bob, 22-Dan, 28-Alice, 35-Carol]; skip 1 => [22-Dan, 28-Alice]
assert('sort+offset+limit correct values', sortLimitOffset[1].name === 'Alice');

// ── Summary ───────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
