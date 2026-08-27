import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'SEM_TOKEN', 'Token de autenticação ausente.'));
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new AppError(401, 'TOKEN_INVALIDO', 'Sessão expirada ou inválida. Faça login novamente.'));
  }
}
