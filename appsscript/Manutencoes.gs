// ============================================================================
// Manutencoes.gs — Equivalente ao backend/src/services/manutencoes.service.js.
// Só leitura: o cadastro continua manual, direto na planilha.
// ============================================================================
function mapOutManutencao(m) {
  return {
    data: m.Data,
    equipamento: m.Equipamento,
    operadorResponsavel: m['Operador/Responsável'],
    horimetro: m['Horímetro'],
    km: m.KM,
    tipo: m.Tipo,
    servicoRealizado: m['Serviço Realizado'],
    pecasTrocas: m['Peças/Trocas'],
    observacao: m['Observação'],
    proximaManutencao: m['Próxima Manutenção'],
  };
}

function manutencoesList() {
  var rows = cacheGet('resumos:manutencoes');
  if (!rows) {
    rows = getAllRows(TABS.MANUTENCOES);
    cacheSet('resumos:manutencoes', rows);
  }
  return rows.map(mapOutManutencao).sort(function (a, b) {
    return a.data < b.data ? 1 : a.data > b.data ? -1 : 0;
  });
}
