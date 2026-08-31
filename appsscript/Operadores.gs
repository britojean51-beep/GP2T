// ============================================================================
// Operadores.gs — Equivalente ao backend/src/services/operadores.service.js.
// Leitura: qualquer perfil logado. Escrita: só ADMINISTRADOR.
// ============================================================================
function mapOutOperador(o) {
  return {
    id: o.ID,
    nome: o.Nome,
    funcao: o['Função'],
    status: o.Status,
    criadoEm: o.CriadoEm,
    atualizadoEm: o.AtualizadoEm,
  };
}

function operadoresList(params) {
  var rows = cacheGet('operadores:all');
  if (!rows) {
    rows = getAllRows(TABS.OPERADORES);
    cacheSet('operadores:all', rows);
  }
  var list = rows.map(mapOutOperador);
  if (params.status) list = list.filter(function (o) { return o.status === params.status; });
  return list;
}

function operadoresCreate(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var nome = params.nome, funcao = params.funcao, status = params.status;
  if (!nome || !funcao || !status) throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe nome, função e status.');
  if (STATUS_OPERADOR.indexOf(status) === -1) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');

  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  appendRow(TABS.OPERADORES, {
    Nome: nome, 'Função': funcao, Status: status,
    ID: id, CriadoEm: now, CriadoPor: ctx.user.nome, AtualizadoEm: now, AtualizadoPor: ctx.user.nome,
  });
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'criar', entidade: 'operadores', entidadeId: id, detalhes: 'Criou operador ' + nome });
  cacheClear('operadores');
  return { id: id, nome: nome, funcao: funcao, status: status };
}

function operadoresUpdate(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var id = params.id;
  var rowNumber = findRowNumberById(TABS.OPERADORES, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Operador não encontrado.');
  if (params.status && STATUS_OPERADOR.indexOf(params.status) === -1) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');

  var patch = { AtualizadoEm: new Date().toISOString(), AtualizadoPor: ctx.user.nome };
  if (params.nome) patch.Nome = params.nome;
  if (params.funcao) patch['Função'] = params.funcao;
  if (params.status) patch.Status = params.status;

  updateRow(TABS.OPERADORES, rowNumber, patch);
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'editar', entidade: 'operadores', entidadeId: id, detalhes: 'Editou operador ' + id });
  cacheClear('operadores');
  return Object.assign({ id: id }, params);
}

function operadoresInativar(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var id = params.id;
  var rowNumber = findRowNumberById(TABS.OPERADORES, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Operador não encontrado.');
  updateRow(TABS.OPERADORES, rowNumber, { Status: 'Inativo', AtualizadoEm: new Date().toISOString(), AtualizadoPor: ctx.user.nome });
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'inativar', entidade: 'operadores', entidadeId: id, detalhes: 'Inativou operador ' + id });
  cacheClear('operadores');
  return null;
}
