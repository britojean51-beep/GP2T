// ============================================================================
// Sheets.gs — Wrapper central de acesso à planilha, equivalente ao
// backend/src/lib/sheets.js do Node. Mesmas regras de ouro:
//   - Nunca assumir posição fixa de coluna: sempre lê a linha de cabeçalho e
//     resolve nome -> índice.
//   - Nunca reaproveitar número de linha "antigo" para escrever: update/delete
//     sempre recebem o rowNumber de uma leitura FRESCA (findRowNumberById).
//   - "Excluir" uma linha nunca remove a linha de verdade (nunca
//     deleteRow()/deleteRows() nativo do Sheets) — só limpa o conteúdo
//     (clearContent()). Um delete estrutural desloca linhas abaixo e o Sheets
//     ajusta sozinho toda referência de fórmula fixa em OUTRAS abas que
//     aponte pra essa faixa (ex. $A$4:$A$1003 dos painéis de Resumo/
//     Histórico) — encolhendo a faixa a cada exclusão e corrompendo os
//     painéis aos poucos. Mesmo raciocínio pro "append": nunca usar
//     insertRowBefore/insertRows (desloca linhas), sempre escrever na
//     primeira linha vazia da área de dados.
//
// Diferença principal vs. o Node: aqui rodamos DENTRO do Google (Apps
// Script), então não existe autenticação via conta de serviço — o script
// acessa a planilha com a permissão de quem o implantou, direto via
// SpreadsheetApp.
// ============================================================================

// Linha do cabeçalho por aba (mesmo layout "profissional" migrado
// anteriormente: faixa de título linha 1, subtítulo linha 2, cabeçalho de
// colunas linha 3, dados a partir da linha 4). Abas internas do app
// (Usuários/Auditoria/Config) continuam simples, cabeçalho na linha 1.
var HEADER_ROW = { 'Equipamentos': 3, 'Operadores': 3, 'Lançamento Diário': 3, 'Manutenções': 3 };
function headerRowOf(tab) {
  return HEADER_ROW[tab] || 1;
}

// Colunas de data: getValues() já devolve um objeto Date nativo pra célula
// que o Sheets reconheceu como data — convertemos pra "yyyy-MM-dd" na
// leitura, e de volta pra Date (meia-noite no fuso do script) na escrita.
// Fazer isso explicitamente (em vez de confiar no auto-parse de string do
// Sheets, como o Node faz via USER_ENTERED) evita qualquer ambiguidade de
// locale/formato — o mesmo fuso é usado nas duas pontas.
var DATE_COLUMNS = { 'Data': true, 'Próxima Manutenção': true };

function dataParaISO(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function isoParaData(iso) {
  var partes = String(iso).split('-').map(Number);
  return new Date(partes[0], partes[1] - 1, partes[2]);
}

function coercePraEscrita(nome, v) {
  if (v === undefined || v === null) return '';
  if (DATE_COLUMNS[nome] && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return isoParaData(v);
  }
  return v;
}

// Índice 0-based -> letra de coluna do Sheets (0 -> A, 25 -> Z, 26 -> AA...).
function colLetter(idx) {
  var s = '';
  idx += 1;
  while (idx > 0) {
    var rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

var _planilhaCache = null;
function getSpreadsheet() {
  if (_planilhaCache) return _planilhaCache;
  _planilhaCache = SpreadsheetApp.openById(getScriptProp('SPREADSHEET_ID'));
  return _planilhaCache;
}

function getSheet(tab) {
  var sh = getSpreadsheet().getSheetByName(tab);
  if (!sh) throw new AppError(500, 'ABA_NAO_ENCONTRADA', 'Aba "' + tab + '" não encontrada na planilha.');
  return sh;
}

function getHeaderMap(tab) {
  var sh = getSheet(tab);
  var headerRow = headerRowOf(tab);
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return { map: {}, count: 0 };
  var row = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var map = {};
  row.forEach(function (h, i) {
    if (h && String(h).trim()) map[String(h).trim()] = i;
  });
  return { map: map, count: row.length };
}

// Lê todas as linhas de dados de uma aba, mapeadas por nome de cabeçalho.
// _rowNumber é só informativo — nunca usar para escrever (buscar de novo
// com findRowNumberById imediatamente antes).
function getAllRows(tab) {
  var sh = getSheet(tab);
  var headerInfo = getHeaderMap(tab);
  var map = headerInfo.map, count = headerInfo.count;
  var dataStart = headerRowOf(tab) + 1;
  var lastRow = sh.getLastRow();
  if (lastRow < dataStart || count === 0) return [];

  var values = sh.getRange(dataStart, 1, lastRow - dataStart + 1, count).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var obj = { _rowNumber: i + dataStart };
    var temDado = false;
    for (var nome in map) {
      var idx = map[nome];
      var v = r[idx];
      if (v === undefined || v === null) v = '';
      if (DATE_COLUMNS[nome] && v instanceof Date) v = dataParaISO(v);
      obj[nome] = v;
      if (v !== '' && v !== null) temDado = true;
    }
    if (temDado) out.push(obj);
  }
  return out;
}

// Acrescenta uma linha nova na primeira posição vazia da área de dados.
// rowObject: { NomeColuna: valor }. Nunca usa insertRows (desloca linhas).
function appendRow(tab, rowObject) {
  var sh = getSheet(tab);
  var headerInfo = getHeaderMap(tab);
  var map = headerInfo.map, count = headerInfo.count;
  var dataStart = headerRowOf(tab) + 1;

  var arr = new Array(count).fill('');
  for (var nome in map) {
    if (Object.prototype.hasOwnProperty.call(rowObject, nome)) {
      arr[map[nome]] = coercePraEscrita(nome, rowObject[nome]);
    }
  }

  var targetRow = primeiraLinhaVazia(sh, dataStart, count);
  sh.getRange(targetRow, 1, 1, count).setValues([arr]);
}

function primeiraLinhaVazia(sh, dataStart, count) {
  var lastRow = sh.getLastRow();
  if (lastRow < dataStart) return dataStart;
  var values = sh.getRange(dataStart, 1, lastRow - dataStart + 1, count).getValues();
  for (var i = 0; i < values.length; i++) {
    var vazia = values[i].every(function (v) { return v === '' || v === null || v === undefined; });
    if (vazia) return dataStart + i;
  }
  return lastRow + 1;
}

// Localiza o número da linha (1-based) cujo valor na coluna idColumnName é
// idValue. Leitura fresca e barata (só uma coluna) — sempre chamar isso
// imediatamente antes de update/delete, nunca cachear o resultado.
function findRowNumberById(tab, idColumnName, idValue) {
  var sh = getSheet(tab);
  var headerInfo = getHeaderMap(tab);
  var map = headerInfo.map;
  if (!(idColumnName in map)) {
    throw new AppError(500, 'ERRO_INTERNO', 'Coluna "' + idColumnName + '" não encontrada na aba "' + tab + '".');
  }
  var dataStart = headerRowOf(tab) + 1;
  var lastRow = sh.getLastRow();
  if (lastRow < dataStart) return null;

  var colIdx = map[idColumnName];
  var col = sh.getRange(dataStart, colIdx + 1, lastRow - dataStart + 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (col[i][0] === idValue) return dataStart + i;
  }
  return null;
}

// Atualiza campos específicos de uma linha já localizada (rowNumber vindo de
// uma chamada FRESCA a findRowNumberById). Lê a linha inteira, mescla os
// campos alterados e regrava a linha inteira (evita gaps em colunas não citadas).
function updateRow(tab, rowNumber, rowObjectPartial) {
  var sh = getSheet(tab);
  var headerInfo = getHeaderMap(tab);
  var map = headerInfo.map, count = headerInfo.count;
  if (count === 0) return;

  var existing = sh.getRange(rowNumber, 1, 1, count).getValues()[0];
  var merged = existing.slice();
  for (var nome in map) {
    if (Object.prototype.hasOwnProperty.call(rowObjectPartial, nome)) {
      merged[map[nome]] = coercePraEscrita(nome, rowObjectPartial[nome]);
    }
  }
  sh.getRange(rowNumber, 1, 1, count).setValues([merged]);
}

// Remove os DADOS da linha rowNumber (1-based) — limpa o conteúdo das
// células, nunca remove a linha de verdade. getAllRows já ignora linha
// totalmente vazia, então o resultado pro resto do app é idêntico.
function deleteRow(tab, rowNumber) {
  var headerInfo = getHeaderMap(tab);
  var count = headerInfo.count;
  if (count === 0) return;
  getSheet(tab).getRange(rowNumber, 1, 1, count).clearContent();
}
