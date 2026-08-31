// ============================================================================
// Setup.gs — Funções para rodar UMA VEZ, direto pelo editor do Apps Script
// (menu "Executar" > escolher a função > Executar). Não são chamadas pelo
// Web App (não estão no ROUTES de Code.gs).
//
// setupInicial(): garante a coluna "Salt" em Usuários (necessária pro novo
// esquema de senha PBKDF2, que substitui o bcrypt do backend Node) e migra
// (ou cria) o usuário administrador para esse esquema novo — o hash bcrypt
// antigo não é compatível, então a senha precisa ser trocada.
// ============================================================================

function garantirColunaSalt() {
  var sh = getSheet(TABS.USUARIOS);
  var headerRow = headerRowOf(TABS.USUARIOS);
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('Salt') === -1) {
    sh.getRange(headerRow, lastCol + 1).setValue('Salt');
    Logger.log('Coluna "Salt" adicionada na aba Usuários.');
  } else {
    Logger.log('Coluna "Salt" já existe na aba Usuários.');
  }
}

function setupInicial() {
  garantirColunaSalt();

  var email = 'britojean51@gmail.com';
  var nomeAdmin = 'Jean Brito';
  // Nunca deixar senha escrita no código (o repositório é público). Vem de
  // uma Script Property opcional; se não existir, gera uma aleatória e
  // mostra no log da execução (Execuções > ver registro).
  var senhaTemporaria = PropertiesService.getScriptProperties().getProperty('SENHA_TEMP_ADMIN')
    || Utilities.getUuid().replace(/-/g, '').slice(0, 12);

  var salt = Utilities.getUuid();
  var hash = hashPassword(senhaTemporaria, salt);

  var rowNumber = findRowNumberById(TABS.USUARIOS, 'Email', email);
  if (rowNumber) {
    updateRow(TABS.USUARIOS, rowNumber, { SenhaHash: hash, Salt: salt, Status: 'Ativo' });
    Logger.log('Usuário administrador MIGRADO para o novo esquema de senha.');
  } else {
    appendRow(TABS.USUARIOS, {
      Id: Utilities.getUuid(), Nome: nomeAdmin, Email: email, SenhaHash: hash, Salt: salt,
      Perfil: 'ADMINISTRADOR', Status: 'Ativo', CriadoEm: new Date().toISOString(),
    });
    Logger.log('Usuário administrador CRIADO.');
  }
  Logger.log('E-mail: ' + email);
  Logger.log('Senha temporária: ' + senhaTemporaria);
  Logger.log('Troque essa senha assim que fizer login, pela própria tela de Usuários do app.');
}

// Só pra conferência manual: lista as abas encontradas e se SPREADSHEET_ID/
// JWT_SECRET estão configurados. Rodar depois de configurar Script
// Properties, antes de implantar o Web App.
function setupVerificar() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('SPREADSHEET_ID configurado: ' + (!!props.getProperty('SPREADSHEET_ID')));
  Logger.log('JWT_SECRET configurado: ' + (!!props.getProperty('JWT_SECRET')));

  var ss = getSpreadsheet();
  var nomesAbas = ss.getSheets().map(function (s) { return s.getName(); });
  Logger.log('Abas encontradas na planilha: ' + nomesAbas.join(', '));

  Object.keys(TABS).forEach(function (chave) {
    var tab = TABS[chave];
    if (nomesAbas.indexOf(tab) === -1) {
      Logger.log('⚠️ ATENÇÃO: aba "' + tab + '" (TABS.' + chave + ') não encontrada!');
    }
  });
}
