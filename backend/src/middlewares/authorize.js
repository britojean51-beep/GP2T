import { AppError } from '../utils/AppError.js';

// Uso: router.post('/', authorize('ADMINISTRADOR'), handler)
export function authorize(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.user || !perfisPermitidos.includes(req.user.perfil)) {
      return next(new AppError(403, 'SEM_PERMISSAO', 'Você não tem permissão para esta ação.'));
    }
    next();
  };
}
