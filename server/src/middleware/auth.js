import { AppError } from './errors.js';
import { COOKIE_NAME, verifyToken } from '../services/tokens.js';

/** Requires a valid session cookie; sets req.user = { id, role }. */
export function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in'));
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again'));
  }
}

/** Use after requireAuth. Allows only the listed roles. */
export const requireRole =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : next(new AppError(403, 'FORBIDDEN', 'You do not have access to this resource'));

export const requireStaff = [requireAuth, requireRole('staff', 'gm')];
export const requireGm = [requireAuth, requireRole('gm')];
