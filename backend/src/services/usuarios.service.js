import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getAllRows, appendRow, findRowNumberById, updateRow } from '../lib/sheets.js';
import { TABS, PERFIS } from '../config/schema.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './auditoria.service.js';
import { cacheClear } from '../lib/cache.js';

function publicUser(u) {
  return { id: u.Id, nome: u.Nome, email: u.Email, perfil: u.Perfil, status: u.Status, criadoEm: u.CriadoEm };
}

export async function listUsuarios() {
  const rows = await getAllRows(TABS.USUARIOS);
  return rows.map(publicUser);
}

export async function createUsuario({ nome, email, senha, perfil }, actor) {
  if (!nome || !email || !senha || !perfil) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Preencha nome, e-mail, senha e perfil.');
  }
  if (senha.length < 6) throw new AppError(400, 'SENHA_FRACA', 'A senha deve ter ao menos 6 caracteres.');
  if (!PERFIS.includes(perfil)) throw new AppError(400, 'PERFIL_INVALIDO', 'Perfil inválido.');

  const existentes = await getAllRows(TABS.USUARIOS);
  if (existentes.some((u) => (u.Email || '').toLowerCase() === email.toLowerCase())) {
    throw new AppError(409, 'EMAIL_DUPLICADO', 'Já existe um usuário com este e-mail.');
  }

  const id = randomUUID();
  const senhaHash = await bcrypt.hash(senha, 10);
  const now = new Date().toISOString();
  await appendRow(TABS.USUARIOS, {
    Id: id, Nome: nome, Email: email, SenhaHash: senhaHash, Perfil: perfil, Status: 'Ativo', CriadoEm: now,
  });
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'criar', entidade: 'usuarios', entidadeId: id, detalhes: `Criou usuário ${email} (${perfil})` });
  return { id, nome, email, perfil, status: 'Ativo', criadoEm: now };
}

export async function updateUsuario(id, { nome, perfil, senha, status }, actor) {
  const rowNumber = await findRowNumberById(TABS.USUARIOS, 'Id', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  const patch = {};
  if (nome) patch.Nome = nome;
  if (perfil) {
    if (!PERFIS.includes(perfil)) throw new AppError(400, 'PERFIL_INVALIDO', 'Perfil inválido.');
    patch.Perfil = perfil;
  }
  if (status) {
    if (!['Ativo', 'Inativo'].includes(status)) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');
    patch.Status = status;
  }
  if (senha) {
    if (senha.length < 6) throw new AppError(400, 'SENHA_FRACA', 'A senha deve ter ao menos 6 caracteres.');
    patch.SenhaHash = await bcrypt.hash(senha, 10);
  }

  await updateRow(TABS.USUARIOS, rowNumber, patch);
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'editar', entidade: 'usuarios', entidadeId: id, detalhes: `Editou usuário ${id}` });
  return { id, nome, perfil, status };
}

export async function inativarUsuario(id, actor) {
  if (actor.id === id) throw new AppError(400, 'AUTO_INATIVACAO', 'Você não pode inativar seu próprio usuário.');
  const rowNumber = await findRowNumberById(TABS.USUARIOS, 'Id', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  await updateRow(TABS.USUARIOS, rowNumber, { Status: 'Inativo' });
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'inativar', entidade: 'usuarios', entidadeId: id, detalhes: `Inativou usuário ${id}` });
}
