export class SchemaParseError extends Error {
  constructor(message, line = null) {
    super(message);
    this.name = 'SchemaParseError';
    this.line = line;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class TableNotFoundError extends Error {
  constructor(tableName) {
    super(`Table not found: "${tableName}"`);
    this.name = 'TableNotFoundError';
    this.tableName = tableName;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class RecordNotFoundError extends Error {
  constructor(tableName, query) {
    super(`No record found in "${tableName}" matching query: ${JSON.stringify(query)}`);
    this.name = 'RecordNotFoundError';
    this.tableName = tableName;
    this.query = query;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class ConstraintError extends Error {
  constructor(message, constraint, field) {
    super(message);
    this.name = 'ConstraintError';
    this.constraint = constraint;
    this.field = field;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class DBTypeError extends Error {
  constructor(message, field, expectedType, actualValue) {
    super(message);
    this.name = 'DBTypeError';
    this.field = field;
    this.expectedType = expectedType;
    this.actualValue = actualValue;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}
