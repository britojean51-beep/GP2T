// ============================================================================
// Config.gs — Equivalente ao backend/src/services/config.service.js.
// Duas listas independentes que o admin edita direto na planilha (aba
// Config) pra adicionar função/tipo novo sem precisar redeploy.
// ============================================================================
function getConfigRows() {
  var rows = cacheGet('config:rows');
  if (!rows) {
    rows = getAllRows(TABS.CONFIG);
    cacheSet('config:rows', rows, 30);
  }
  return rows;
}

function configGet() {
  var rows = getConfigRows();
  return {
    funcoes: rows.map(function (r) { return r.Funcoes; }).filter(Boolean),
    tiposEquipamento: rows.map(function (r) { return r.TiposEquipamento; }).filter(Boolean),
  };
}
