// ============================================================================
// Code.gs — Ponto de entrada do Web App (doGet/doPost) e roteador por
// "action". Equivalente ao backend/src/server.js do Node, mas sem rotas
// REST de verdade — Apps Script só atende GET/POST nativamente, então tudo
// é despachado por um nome de ação (ex.: "equipamentos.list").
//
// Regra de CORS: o navegador nunca dispara preflight (OPTIONS) pra essas
// chamadas porque elas contam como "requisição simples" (GET sem headers
// customizados; POST com Content-Type: text/plain) — Apps Script não sabe
// responder OPTIONS, então isso é evitado por desenho, não contornado.
//
// Todo resultado volta HTTP 200 (Apps Script não deixa escolher o status) —
// o "status real" vai dentro do corpo: {ok:true, dados} ou {ok:false, erro,
// mensagem, status}. Ver Utils.gs (respostaOk/respostaErro).
// ============================================================================

// action -> function(params, ctx). GET só lê params da querystring; POST lê
// de {action, token, data:{...}} no corpo (data vira "params" aqui).
var ROUTES = {
  'health': function () { return { ok: true, hora: new Date().toISOString() }; },

  // Configura SPREADSHEET_ID/JWT_SECRET em Script Properties sem precisar
  // abrir o editor manualmente. Só funciona ANTES da primeira configuração
  // (autoprotegida: uma vez setado SPREADSHEET_ID, chamar de novo dá erro) —
  // depois disso é preciso trocar direto em Configurações do Projeto.
  'setup.bootstrap': function (params) {
    if (PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')) {
      throw new AppError(403, 'JA_CONFIGURADO', 'Bootstrap já foi executado anteriormente.');
    }
    if (!params.spreadsheetId || !params.jwtSecret) {
      throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe spreadsheetId e jwtSecret.');
    }
    PropertiesService.getScriptProperties().setProperties({ SPREADSHEET_ID: params.spreadsheetId, JWT_SECRET: params.jwtSecret });
    return { ok: true };
  },

  // Roda o mesmo setupInicial() (migra/cria o admin, garante a coluna Salt)
  // sem precisar abrir o editor. Autoprotegido: só funciona antes da coluna
  // "Salt" existir em Usuários — depois da primeira migração bem-sucedida,
  // chamar de novo (ex. um link velho reaberto) dá erro em vez de resetar a
  // senha do admin de novo.
  'setup.admin': function () {
    var sh = getSheet(TABS.USUARIOS);
    var headerRow = headerRowOf(TABS.USUARIOS);
    var headers = sh.getRange(headerRow, 1, 1, sh.getLastColumn()).getValues()[0];
    if (headers.indexOf('Salt') !== -1) {
      throw new AppError(403, 'JA_CONFIGURADO', 'Setup do administrador já foi executado anteriormente.');
    }
    setupInicial();
    return { ok: true };
  },

  'auth.login': function (params) { return authLogin(params); },
  'auth.me': function (params, ctx) { return { usuario: ctx.user }; },

  'usuarios.list': usuariosList,
  'usuarios.create': usuariosCreate,
  'usuarios.update': usuariosUpdate,
  'usuarios.inativar': usuariosInativar,

  'equipamentos.list': equipamentosList,
  'equipamentos.create': equipamentosCreate,
  'equipamentos.update': equipamentosUpdate,
  'equipamentos.inativar': equipamentosInativar,

  'operadores.list': operadoresList,
  'operadores.create': operadoresCreate,
  'operadores.update': operadoresUpdate,
  'operadores.inativar': operadoresInativar,

  'lancamentos.list': lancamentosList,
  'lancamentos.create': function (params, ctx) {
    requireRole(ctx, ['ADMINISTRADOR', 'OPERACIONAL']);
    return lancamentosCreate(params, ctx);
  },
  'lancamentos.update': function (params, ctx) {
    requireRole(ctx, ['ADMINISTRADOR', 'OPERACIONAL']);
    return lancamentosUpdate(params.id, params, ctx);
  },
  'lancamentos.delete': function (params, ctx) {
    requireRole(ctx, ['ADMINISTRADOR', 'OPERACIONAL']);
    return lancamentosDelete(params.id, ctx);
  },

  'config.get': function () { return configGet(); },

  'resumos.diario': function (params) { return getResumoDiario(params.data); },
  'resumos.semanal': function (params) { return getResumoSemanal(params.data); },
  'resumos.mensal': function (params) { return getResumoMensal(params.mes); },
  'resumos.operadores': function () { return getHistOperadores(); },
  'resumos.equipamentos': function () { return getHistEquipamentos(); },

  'manutencoes.list': function () { return manutencoesList(); },
};

// Ações que nunca exigem token válido (só o login).
var ROTAS_PUBLICAS = { 'auth.login': true, 'health': true, 'setup.bootstrap': true, 'setup.admin': true };

function despachar(action, params, token) {
  var handler = ROUTES[action];
  if (!handler) throw new AppError(404, 'ROTA_NAO_ENCONTRADA', 'Rota não encontrada.');

  var ctx = { user: null };
  if (!ROTAS_PUBLICAS[action]) {
    ctx.user = verifyToken(token);
  }
  return handler(params || {}, ctx);
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    var resultado = despachar(params.action, params, params.token);
    return respostaOk(resultado);
  } catch (err) {
    return respostaErro(err);
  }
}

// POST concentra toda escrita — por isso roda dentro de um lock: duas
// escritas quase simultâneas (ex. dois lançamentos do mesmo equipamento)
// não podem ler o mesmo "último horímetro" e passar as duas pela validação
// ao mesmo tempo. No Node isso já era coberto pela leitura sempre fresca +
// serialização natural das chamadas; aqui, com pedidos de verdade em
// paralelo, o lock é quem garante isso.
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return respostaErro(new AppError(503, 'SISTEMA_OCUPADO', 'Sistema ocupado, tente novamente em instantes.'));
  }
  try {
    var body = {};
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return respostaErro(new AppError(400, 'CORPO_INVALIDO', 'Corpo da requisição inválido.'));
    }
    var params = Object.assign({}, body.data || {});
    if (body.id !== undefined) params.id = body.id;
    var resultado = despachar(body.action, params, body.token);
    return respostaOk(resultado);
  } catch (err) {
    return respostaErro(err);
  } finally {
    lock.releaseLock();
  }
}
