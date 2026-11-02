import { AppError } from './errors.js';

/** Validate and replace req[source] with the parsed (trimmed, typed) value. */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new AppError(400, 'VALIDATION', 'Please check the highlighted fields', details));
    }
    // Express 5 makes req.query a read-only getter, so define the parsed value explicitly.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true, enumerable: true });
    next();
  };
