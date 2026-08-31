// ============================================================================
// Schema.gs — Nomes das abas e listas de domínio. Mesmo conteúdo de
// backend/src/config/schema.js (versão Node), só sem import/export — no
// Apps Script todo arquivo .gs compartilha o mesmo escopo global.
// ============================================================================
var TABS = {
  EQUIPAMENTOS: 'Equipamentos',
  OPERADORES: 'Operadores',
  LANCAMENTOS: 'Lançamento Diário',
  MANUTENCOES: 'Manutenções',
  USUARIOS: 'Usuários',
  AUDITORIA: 'Auditoria',
  CONFIG: 'Config',
};

var PERFIS = ['ADMINISTRADOR', 'OPERACIONAL', 'VISUALIZACAO'];
var STATUS_EQUIPAMENTO = ['Operando', 'Manutenção', 'Parado', 'Inativo'];
var STATUS_OPERADOR = ['Ativo', 'Inativo'];
