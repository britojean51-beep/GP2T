import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { getAllRows } from '../lib/sheets.js';
import { TABS } from '../config/schema.js';
import { AppError } from '../utils/AppError.js';

export async function login(email, senha) {
  if (!email || !senha) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe e-mail e senha.');
  }
  const usuarios = await getAllRows(TABS.USUARIOS);
  const usuario = usuarios.find((u) => (u.Email || '').toLowerCase() === email.toLowerCase());
  if (!usuario) throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
  if (usuario.Status !== 'Ativo') throw new AppError(403, 'USUARIO_INATIVO', 'Usuário inativo. Contate o administrador.');

  const senhaOk = await bcrypt.compare(senha, usuario.SenhaHash || '');
  if (!senhaOk) throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');

  const payload = { id: usuario.Id, nome: usuario.Nome, email: usuario.Email, perfil: usuario.Perfil };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
  return { token, usuario: payload };
}
