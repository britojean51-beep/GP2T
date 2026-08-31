// ============================================================================
// Utils.gs — Erro de aplicação (equivalente ao AppError.js do backend Node)
// e helpers de resposta JSON. Como o Apps Script Web App sempre responde
// HTTP 200 pro navegador (não dá pra escolher o status code de verdade),
// todo resultado carrega o status "lógico" dentro do corpo: {ok, dados} no
// sucesso, {ok:false, erro, mensagem, status} no erro — api.js do frontend
// lê esse status para decidir o que fazer (ex.: 401 -> limpar sessão).
// ============================================================================

class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

function numOrZero(v) {
  var n = Number(v);
  return v === '' || v === null || v === undefined || isNaN(n) ? 0 : n;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function respostaOk(dados) {
  return jsonOutput({ ok: true, dados: dados === undefined ? null : dados });
}

function respostaErro(err) {
  if (err instanceof AppError) {
    return jsonOutput({ ok: false, erro: err.code, mensagem: err.message, status: err.status });
  }
  Logger.log('Erro não tratado: ' + (err && err.stack ? err.stack : err));
  return jsonOutput({ ok: false, erro: 'ERRO_INTERNO', mensagem: 'Erro interno no servidor.', status: 500 });
}

function getScriptProp(name) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new AppError(500, 'CONFIG_AUSENTE', 'Propriedade "' + name + '" não configurada em Configurações do Projeto > Propriedades do Script.');
  return v;
}
