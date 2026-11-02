import { AppError } from './errors.js';

/**
 * The auth cookie is SameSite=None in production (client and API are on different sites),
 * so state-changing requests must carry a custom header. A cross-site form cannot set it,
 * and CORS only allows our own origin to send it.
 */
export function requireCustomHeader(req, _res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safe || req.get('x-requested-with') === 'resort-web') return next();
  next(new AppError(403, 'CSRF', 'Missing required request header'));
}
