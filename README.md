# bd-db

A lightweight, SQL-inspired database engine for Node.js that uses JSON files as tables. No external dependencies — pure Node.js with filesystem-based persistence.

## Features

- **Schema-driven** — define tables and fields in a human-readable text file
- **Type system** — 8 data types stored as native JavaScript values (never stringified)
- **Constraints** — primary keys, unique fields, required fields, nullable, foreign keys
- **Auto-increment** — automatic sequential ID generation
- **Default values** — static defaults and `default=now` for datetime fields
- **Rich queries** — filter with operators, sort, limit, offset
- **Full CRUD** — insert, find, findOne, update, delete, count
- **Custom errors** — typed error classes for precise error handling
- **Zero dependencies** — only Node.js built-ins (`fs/promises`, `path`)

---

## Installation

```bash
npm i @utkarshuv/bd-db
```

```bash
node --version  # requires Node.js 18+
```

---

## Quick Start

```js
import { Database } from './index.js';

const db = new Database({
  schemaPath: './schema/schema.txt',
  databaseDir: './database',
});

await db.init();

const user = await db.insert('users', {
  username: 'alice',
  password: 'secret',
  age: 28,
  role: 'admin',
});

console.log(user);
// { id: 1, username: 'alice', password: 'secret', age: 28, role: 'admin', createdAt: '2026-05-11T...' }

const users = await db.find('users', { age: { $gte: 18 } });
```

---

## Schema Format

Define your tables in a plain text file (`schema/schema.txt`).

### Syntax

```
tableName:
fieldName:dataType:modifier1:modifier2
```

### Example

```
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
```

### Data Types

| Type       | Description                          | Example value       |
|------------|--------------------------------------|---------------------|
| `string`   | Text                                 | `"hello"`           |
| `int`      | Integer number                       | `42`                |
| `float`    | Floating-point number                | `3.14`              |
| `boolean`  | True or false                        | `true`              |
| `date`     | ISO date string (YYYY-MM-DD)         | `"2026-05-11"`      |
| `datetime` | ISO datetime string                  | `"2026-05-11T10:00Z"` |
| `json`     | Object or nested structure           | `{ "key": "val" }`  |
| `array`    | Array of values                      | `["a", "b"]`        |

### Modifiers

| Modifier        | Description                                           |
|-----------------|-------------------------------------------------------|
| `pk`            | Primary key                                           |
| `auto`          | Auto-increment (integers only)                        |
| `unique`        | Value must be unique across all records               |
| `required`      | Value must be present and non-null on insert          |
| `nullable`      | Explicitly marks field as accepting null              |
| `default=value` | Default value when field is omitted on insert         |
| `default=now`   | Sets field to current ISO datetime on insert          |
| `fk=table.col`  | Foreign key — value must exist in referenced table    |

---

## Initializing the Database

```js
import { Database } from './index.js';

const db = new Database({
  schemaPath: './schema/schema.txt',  // path to your schema file
  databaseDir: './database',          // directory where JSON table files are stored
});

await db.init();
```

`init()` parses the schema and creates empty JSON table files if they don't exist. It is safe to call multiple times (idempotent).

---

## CRUD Operations

### insert

Inserts a record after validation. Returns the inserted record with all fields resolved (auto-increment IDs, defaults applied, type coercion done).

```js
const user = await db.insert('users', {
  username: 'bob',
  password: 'pass123',
  age: 22,
});
// id is auto-assigned, role defaults to 'user', createdAt defaults to now
```

### find

Returns an array of matching records.

```js
// All records
const all = await db.find('users');

// With filter
const admins = await db.find('users', { role: 'admin' });

// With operators
const young = await db.find('users', { age: { $lt: 30 } });

// With sort, limit, offset
const paged = await db.find('users', {}, {
  sort: { age: 'desc' },
  limit: 10,
  offset: 20,
});
```

### findOne

Returns the first matching record. Throws `RecordNotFoundError` if nothing matches.

```js
const user = await db.findOne('users', { username: 'alice' });
```

### update

Updates all records matching the query by merging in the provided fields. Auto-increment fields are protected and cannot be changed. Returns the count of updated records.

```js
const count = await db.update('users', { username: 'bob' }, { age: 23, role: 'editor' });
```

### delete

Deletes all records matching the query. Returns the count of deleted records.

```js
const count = await db.delete('users', { role: 'banned' });
```

### count

Returns the number of records matching the query.

```js
const total = await db.count('users');
const admins = await db.count('users', { role: 'admin' });
```

### getSchema

Returns the parsed schema object (synchronous, no I/O).

```js
const schema = db.getSchema();
console.log(schema.users.id); // { type: 'int', primaryKey: true, auto: true }
```

---

## Query Operators

Use operator objects for advanced filtering. Multiple fields use AND semantics.

| Operator      | Description                          | Example                          |
|---------------|--------------------------------------|----------------------------------|
| `$eq`         | Equal (default for shorthand)        | `{ age: { $eq: 25 } }`          |
| `$ne`         | Not equal                            | `{ role: { $ne: 'banned' } }`   |
| `$gt`         | Greater than                         | `{ age: { $gt: 18 } }`          |
| `$gte`        | Greater than or equal                | `{ score: { $gte: 7.0 } }`      |
| `$lt`         | Less than                            | `{ age: { $lt: 65 } }`          |
| `$lte`        | Less than or equal                   | `{ price: { $lte: 99.99 } }`    |
| `$in`         | Value is in array                    | `{ role: { $in: ['admin', 'mod'] } }` |
| `$contains`   | String or array contains value       | `{ tags: { $contains: 'dev' } }` |

### Shorthand vs operator form

```js
// These are equivalent:
db.find('users', { age: 25 });
db.find('users', { age: { $eq: 25 } });
```

### Compound conditions (AND)

```js
// age > 18 AND role is 'user'
db.find('users', { age: { $gt: 18 }, role: 'user' });
```

---

## Type Coercion

When inserting or updating, values are automatically coerced to the field's declared type:

```js
// Schema: age:int
await db.insert('users', { ..., age: '25' });
// Stored as: { age: 25 }  ← number, not string

// Schema: active:boolean
await db.insert('users', { ..., active: 'true' });
// Stored as: { active: true }
```

---

## Error Handling

All errors are typed and can be imported from the library:

```js
import {
  Database,
  ValidationError,
  RecordNotFoundError,
  TableNotFoundError,
  SchemaParseError,
  ConstraintError,
  DBTypeError,
} from './index.js';
```

| Error Class          | When thrown                                              |
|----------------------|----------------------------------------------------------|
| `ValidationError`    | Required field missing, unique/PK/FK violation, bad type |
| `RecordNotFoundError`| `findOne` finds no matching record                       |
| `TableNotFoundError` | Table name does not exist in the schema                  |
| `SchemaParseError`   | Schema file has invalid syntax                           |
| `DBTypeError`        | Value cannot be coerced to the declared type             |
| `ConstraintError`    | Constraint violation (exposed on error object)           |

### Example

```js
try {
  await db.insert('users', { username: 'alice', password: 'pw' }); // duplicate
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.errors);
    // ['Unique constraint violation: field "username" value "alice" already exists']
  }
}

try {
  await db.findOne('users', { username: 'ghost' });
} catch (err) {
  if (err instanceof RecordNotFoundError) {
    console.log(err.message); // No record found in "users" matching query: ...
  }
}
```

---

## Project Structure

```
/src
  /parser/schemaParser.js     — schema file parser
  /core/database.js           — main Database class
  /core/queryEngine.js        — filter, sort, applyOptions
  /storage/tableManager.js    — JSON file read/write
  /validators/validator.js    — record validation and type coercion
  /utils/errors.js            — custom error classes
  /utils/typeConverter.js     — type conversion utilities

/schema
  schema.txt                  — your table definitions

/database
  users.json                  — generated at runtime by db.init()
  posts.json

/tests
  schemaParser.test.js
  validator.test.js
  queryEngine.test.js
  database.test.js
  integration.test.js

/examples
  usage.js                    — full working example

index.js                      — public API entry point
package.json
```

---

## Running Tests

```bash
npm test
```

Runs 5 test files (121 assertions) with no external test framework.

---

## Running the Example

```bash
node examples/usage.js
```

---

## Limitations

- **Single process only** — no file locking; concurrent writes from multiple processes will corrupt data
- **No transactions** — writes are not atomic across multiple operations
- **No indexes** — all queries do a full table scan
- **No joins** — cross-table queries must be done in application code
- **Single-field sort** — only one sort field per query
