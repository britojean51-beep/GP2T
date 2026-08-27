import { AppError } from '../utils/AppError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ erro: err.code, mensagem: err.message });
  }
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'ERRO_INTERNO', mensagem: 'Erro interno no servidor.' });
}
