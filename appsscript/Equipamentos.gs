// ============================================================================
// Equipamentos.gs — Equivalente ao backend/src/services/equipamentos.service.js.
// Leitura: qualquer perfil logado. Escrita: só ADMINISTRADOR.
// ============================================================================
function mapOutEquipamento(e) {
  return {
    id: e.ID,
    codigo: e['Código'],
    tipo: e.Tipo,
    marca: e.Marca,
    modelo: e.Modelo,
    status: e.Status,
    horimetroAtual: numOrZero(e['Horímetro Atual']),
    kmAtual: numOrZero(e['KM Atual']),
    criadoEm: e.CriadoEm,
    atualizadoEm: e.AtualizadoEm,
  };
}

function equipamentosList(params) {
  var rows = cacheGet('equipamentos:all');
  if (!rows) {
    rows = getAllRows(TABS.EQUIPAMENTOS);
    cacheSet('equipamentos:all', rows);
  }
  var list = rows.map(mapOutEquipamento);
  if (params.status) list = list.filter(function (e) { return e.status === params.status; });
  return list;
}

function equipamentosCreate(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var codigo = params.codigo, tipo = params.tipo, marca = params.marca, modelo = params.modelo,
    status = params.status, horimetroAtual = params.horimetroAtual, kmAtual = params.kmAtual;

  if (!codigo || !tipo || !status) throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe código, tipo e status.');
  if (STATUS_EQUIPAMENTO.indexOf(status) === -1) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');
  if (horimetroAtual != null && horimetroAtual !== '' && Number(horimetroAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'Horímetro não pode ser negativo.');
  if (kmAtual != null && kmAtual !== '' && Number(kmAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'KM não pode ser negativo.');

  var existentes = getAllRows(TABS.EQUIPAMENTOS);
  var codigoNorm = String(codigo).trim().toLowerCase();
  if (existentes.some(function (e) { return String(e['Código'] || '').trim().toLowerCase() === codigoNorm; })) {
    throw new AppError(409, 'CODIGO_DUPLICADO', 'Já existe um equipamento com este código.');
  }

  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  appendRow(TABS.EQUIPAMENTOS, {
    'Código': codigo, Tipo: tipo, Marca: marca || '', Modelo: modelo || '', Status: status,
    'Horímetro Atual': numOrZero(horimetroAtual), 'KM Atual': numOrZero(kmAtual),
    ID: id, CriadoEm: now, CriadoPor: ctx.user.nome, AtualizadoEm: now, AtualizadoPor: ctx.user.nome,
  });
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'criar', entidade: 'equipamentos', entidadeId: id, detalhes: 'Criou equipamento ' + codigo });
  cacheClear('equipamentos');
  return { id: id, codigo: codigo, tipo: tipo, marca: marca, modelo: modelo, status: status, horimetroAtual: numOrZero(horimetroAtual), kmAtual: numOrZero(kmAtual) };
}

function equipamentosUpdate(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var id = params.id;
  var rowNumber = findRowNumberById(TABS.EQUIPAMENTOS, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Equipamento não encontrado.');
  if (params.status && STATUS_EQUIPAMENTO.indexOf(params.status) === -1) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');
  if (params.horimetroAtual != null && params.horimetroAtual !== '' && Number(params.horimetroAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'Horímetro não pode ser negativo.');
  if (params.kmAtual != null && params.kmAtual !== '' && Number(params.kmAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'KM não pode ser negativo.');

  var patch = { AtualizadoEm: new Date().toISOString(), AtualizadoPor: ctx.user.nome };
  if (params.codigo) patch['Código'] = params.codigo;
  if (params.tipo) patch.Tipo = params.tipo;
  if (params.marca != null) patch.Marca = params.marca;
  if (params.modelo != null) patch.Modelo = params.modelo;
  if (params.status) patch.Status = params.status;
  if (params.horimetroAtual != null && params.horimetroAtual !== '') patch['Horímetro Atual'] = numOrZero(params.horimetroAtual);
  if (params.kmAtual != null && params.kmAtual !== '') patch['KM Atual'] = numOrZero(params.kmAtual);

  updateRow(TABS.EQUIPAMENTOS, rowNumber, patch);
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'editar', entidade: 'equipamentos', entidadeId: id, detalhes: 'Editou equipamento ' + id });
  cacheClear('equipamentos');
  return Object.assign({ id: id }, params);
}

function equipamentosInativar(params, ctx) {
  requireRole(ctx, ['ADMINISTRADOR']);
  var id = params.id;
  var rowNumber = findRowNumberById(TABS.EQUIPAMENTOS, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Equipamento não encontrado.');
  updateRow(TABS.EQUIPAMENTOS, rowNumber, { Status: 'Inativo', AtualizadoEm: new Date().toISOString(), AtualizadoPor: ctx.user.nome });
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'inativar', entidade: 'equipamentos', entidadeId: id, detalhes: 'Inativou equipamento ' + id });
  cacheClear('equipamentos');
  return null;
}
