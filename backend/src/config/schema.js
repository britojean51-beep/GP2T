// Nomes das abas da planilha e listas de domínio.
// Mantido num único lugar para nunca "espalhar" strings mágicas pelo código.
export const TABS = {
  EQUIPAMENTOS: 'Equipamentos',
  OPERADORES: 'Operadores',
  LANCAMENTOS: 'Lançamento Diário',
  MANUTENCOES: 'Manutenções',
  USUARIOS: 'Usuários',
  AUDITORIA: 'Auditoria',
  CONFIG: 'Config',
};

export const PERFIS = ['ADMINISTRADOR', 'OPERACIONAL', 'VISUALIZACAO'];
export const STATUS_EQUIPAMENTO = ['Operando', 'Manutenção', 'Parado', 'Inativo'];
export const STATUS_OPERADOR = ['Ativo', 'Inativo'];
