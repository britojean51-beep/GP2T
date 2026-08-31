// ============================================================================
// Usuarios.gs — Equivalente ao backend/src/services/usuarios.service.js.
// Só ADMINISTRADOR acessa (checado em cada função, igual ao
// router.use(authMiddleware, authorize('ADMINISTRADOR')) do Node).
// ============================================================================
function publicUser(u) {
  return { id: u.Id, nome: u.Nome, email: u.Email, perfil: u.Perfil, status: u.Status, criadoEm: u.CriadoEm };
}

function usuariosList(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  return getAllRows(TABS.USUARIOS).map(publicUser);
}

function usuariosCreate(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var nome = params.nome, email = params.email, senha = params.senha, perfil = params.perfil;
  if (!nome || !email || !senha || !perfil) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Preencha nome, e-mail, senha e perfil.');
  }
  if (senha.length < 6) throw new AppError(400, 'SENHA_FRACA', 'A senha deve ter ao menos 6 caracteres.');
  if (PERFIS.indexOf(perfil) === -1) throw new AppError(400, 'PERFIL_INVALIDO', 'Perfil inválido.');

  var existentes = getAllRows(TABS.USUARIOS);
  var emailNorm = String(email).toLowerCase();
  if (existentes.some(function (u) { return String(u.Email || '').toLowerCase() === emailNorm; })) {
    throw new AppError(409, 'EMAIL_DUPLICADO', 'Já existe um usuário com este e-mail.');
  }

  var id = Utilities.getUuid();
  var salt = Utilities.getUuid();
  var senhaHash = hashPassword(senha, salt);
  var now = new Date().toISOString();
  appendRow(TABS.USUARIOS, {
    Id: id, Nome: nome, Email: email, SenhaHash: senhaHash, Salt: salt, Perfil: perfil, Status: 'Ativo', CriadoEm: now,
  });
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'criar', entidade: 'usuarios', entidadeId: id, detalhes: 'Criou usuário ' + email + ' (' + perfil + ')' });
  return { id: id, nome: nome, email: email, perfil: perfil, status: 'Ativo', criadoEm: now };
}

function usuariosUpdate(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var id = params.id;
  var rowNumber = findRowNumberById(TABS.USUARIOS, 'Id', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');

  var patch = {};
  if (params.nome) patch.Nome = params.nome;
  if (params.perfil) {
    if (PERFIS.indexOf(params.perfil) === -1) throw new AppError(400, 'PERFIL_INVALIDO', 'Perfil inválido.');
    patch.Perfil = params.perfil;
  }
  if (params.status) {
    if (['Ativo', 'Inativo'].indexOf(params.status) === -1) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');
    patch.Status = params.status;
  }
  if (params.senha) {
    if (params.senha.length < 6) throw new AppError(400, 'SENHA_FRACA', 'A senha deve ter ao menos 6 caracteres.');
    var novoSalt = Utilities.getUuid();
    patch.Salt = novoSalt;
    patch.SenhaHash = hashPassword(params.senha, novoSalt);
  }

  updateRow(TABS.USUARIOS, rowNumber, patch);
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'editar', entidade: 'usuarios', entidadeId: id, detalhes: 'Editou usuário ' + id });
  return { id: id, nome: params.nome, perfil: params.perfil, status: params.status };
}

function usuariosInativar(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var id = params.id;
  if (ctx.user.id === id) throw new AppError(400, 'AUTO_INATIVACAO', 'Você não pode inativar seu próprio usuário.');
  var rowNumber = findRowNumberById(TABS.USUARIOS, 'Id', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  updateRow(TABS.USUARIOS, rowNumber, { Status: 'Inativo' });
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'inativar', entidade: 'usuarios', entidadeId: id, detalhes: 'Inativou usuário ' + id });
  return null;
}
