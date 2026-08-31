# GP2T — Controle Operacional de Frota

App web/PWA mobile-first com 4 telas — **Lançamento Diário**, **Operadores**,
**Equipamentos** e **Usuários** — que funciona como interface sobre uma
**Planilha Google**, que continua sendo a fonte oficial dos dados. Resumos,
indicadores, históricos detalhados e manutenções continuam sendo geridos
DENTRO da planilha.

> Regra central: tudo que é criado/editado/excluído no app é refletido na
> planilha; e uma edição manual feita direto na planilha aparece no app em
> poucos segundos (cache curto, sem precisar reiniciar nada).

---

## Como está organizado

```
GP2T/
  appsscript/  Backend em Google Apps Script, preso à própria planilha (em uso)
  frontend/    PWA mobile-first (HTML/CSS/JS puro, sem build)
  backend/     Backend antigo em Node/Express — DESCONTINUADO (ver abaixo)
```

O backend nunca deixa o app ter dois "bancos de dados" divergentes: toda
leitura/escrita passa pela planilha. O frontend só guarda uma fila local
temporária (IndexedDB) para lançamentos feitos **offline**, que sincroniza
sozinha assim que a conexão volta.

> **Sobre o `backend/`:** era a versão em Node/Express hospedada no Render.
> Foi substituída pelo `appsscript/` porque o plano gratuito do Render
> "dorme" após ~15 min sem uso e a primeira chamada do dia levava 30-50s
> para responder. O Apps Script roda dentro do Google (~1-3s no primeiro
> acesso), é gratuito e dispensa conta de serviço. A pasta segue no
> repositório só como referência histórica — **não é mais usada nem
> implantada**, e pode ser removida quando não fizer mais falta.

---

## Sua planilha oficial

A planilha operacional já está criada como Planilha Google nativa:

- **Nome:** Planilha_Controle_Op_Dinamica
- **Link:** https://docs.google.com/spreadsheets/d/1po82mv7df3rMDITPY-eOV9wSiqImO8Yj1XwShCW4Flg/edit
- **SPREADSHEET_ID** (propriedade do script, ver adiante): `1po82mv7df3rMDITPY-eOV9wSiqImO8Yj1XwShCW4Flg`

O arquivo `.xlsx` original que existia no Drive foi mantido intacto, só
renomeado para `Planilha_Controle_Op_Dinamica (ORIGINAL .xlsx — substituída
pela versão Google Sheets)` — ele estava vazio (só cabeçalhos, sem dados
reais), então nada foi perdido na troca.

A planilha já está com toda a estrutura montada: as 10 abas do layout
profissional (faixa de título, cabeçalho na linha 3, painéis automáticos) e
as 3 abas internas do app (`Usuários`, `Auditoria`, `Config`). Veja
"Estrutura da planilha" no final deste arquivo.

---

## 1. Backend em Google Apps Script

O backend roda **dentro do Google**, como um projeto Apps Script ligado à
planilha. Isso significa que **não existe conta de serviço, chave JSON nem
servidor para hospedar** — o script acessa a planilha com a permissão de
quem publicou a implantação.

O código fica em `appsscript/` (versionado aqui, como qualquer outro código)
e é publicado no projeto Apps Script via **API do Apps Script** — não por
copiar e colar no editor.

### O que está publicado hoje

- **Projeto Apps Script:** `GP2T Backend`
- **Editor:** https://script.google.com/d/11pUEmBVb-MaV1wBzA7fWdd6pL0OrTvIroRYceiX6cJz1cOQR9y_LofWy/edit
- **URL do Web App** (é o que o frontend chama):
  `https://script.google.com/macros/s/AKfycbxHsoVMio2wclMDT9Nh3aTwCMX7T1-17CuD27ED_WfqtId7mz5hvtnbjj3qSutejd0i/exec`

A implantação está como **Executar como: eu** e **Quem tem acesso:
qualquer pessoa** — necessário porque o app chama o backend sem login do
Google. Isso **não** deixa os dados abertos: toda ação (fora `health` e
`auth.login`) exige um token de sessão assinado, verificado no servidor.

### Propriedades do script (equivalente ao `.env`)

No editor do Apps Script: **Configurações do projeto → Propriedades do
script**.

| Propriedade | Para que serve |
|---|---|
| `SPREADSHEET_ID` | ID da planilha oficial |
| `JWT_SECRET` | segredo usado para assinar os tokens de sessão |
| `SENHA_TEMP_ADMIN` | (opcional) senha temporária que o `setupInicial()` usa; se não existir, ele gera uma aleatória e mostra no log |

### Publicar uma alteração no backend

Depois de editar qualquer arquivo em `appsscript/`, envie o código para o
projeto e crie uma nova versão da implantação **usando a mesma URL** (a URL
do Web App não muda entre versões):

1. `PUT https://script.googleapis.com/v1/projects/{scriptId}/content` com
   todos os arquivos (`type: SERVER_JS`, mais o manifesto `appsscript` como
   `type: JSON`).
2. `POST .../versions` para criar a versão.
3. `PUT .../deployments/{deploymentId}` apontando para a versão nova.

Isso exige um token OAuth do dono da planilha com os escopos
`script.projects` e `script.deployments`, e a **Apps Script API** ativada
em duas pontas: no projeto do Google Cloud e na conta pessoal
([script.google.com/home/usersettings](https://script.google.com/home/usersettings)).

> ⚠️ Contas de serviço **não** conseguem usar a Apps Script API: a ativação
> em `usersettings` só existe para conta de pessoa. Por isso a publicação
> usa OAuth de usuário, e não a conta de serviço do projeto.

> ⚠️ O fluxo OAuth de "TVs e dispositivos com entrada limitada" (aquele de
> código curto) **não aceita** os escopos `script.*` — o Google recusa com
> `invalid_scope`. Use um cliente OAuth do tipo **Aplicativo da Web** com
> `http://localhost` como URI de redirecionamento e pegue o `code` da barra
> de endereço (a página em si não vai abrir, e isso é esperado).

### Primeira configuração de um projeto novo

Se um dia precisar recriar o projeto do zero, duas ações públicas fazem a
configuração inicial sem abrir o editor. Ambas **se autodesabilitam** depois
da primeira execução bem-sucedida:

- `?action=setup.bootstrap&spreadsheetId=...&jwtSecret=...` grava as
  propriedades do script (só funciona enquanto `SPREADSHEET_ID` não existir).
- `?action=setup.admin` cria/migra o usuário administrador e acrescenta a
  coluna `Salt` em `Usuários` (só funciona enquanto essa coluna não existir).

---

## 2. Estrutura da planilha (uma vez só)

As abas e colunas técnicas já estão criadas. Se precisar recriá-las num
ambiente novo, o script `backend/scripts/setup-sheet.js` (da versão antiga)
ainda serve como referência do que cada aba precisa ter — é seguro rodar
mais de uma vez, só acrescenta o que falta.

O login inicial é criado pelo `setupInicial()` do Apps Script (ver acima).

---

## 3. Rodar localmente

O backend **não roda localmente** — Apps Script só executa dentro do
Google. Para mexer no frontend apontando para o backend real:

```bash
cd frontend
python3 -m http.server 5500   # ou qualquer servidor estático
```

Abra `http://localhost:5500`. O `frontend/js/config.js` aponta sempre para
a URL do Web App publicado (não há modo local separado).

Para testar a lógica do backend sem publicar, o caminho é rodar os `.gs`
sobre stubs das APIs do Apps Script (`SpreadsheetApp`, `Utilities`,
`PropertiesService`, `CacheService`, `LockService`) num harness Node — foi
assim que a migração foi validada, com 33 casos cobrindo autenticação,
CRUD, permissões por perfil, horímetro retroativo, upsert idempotente e o
cálculo dos painéis.

---

## 4. Publicar o frontend (Firebase Hosting)

O link final é **https://gestao-de-frota-c7565.web.app**.

Qualquer push em `main` que toque `frontend/` dispara o workflow
`.github/workflows/deploy-firebase.yml`, que publica sozinho.

> ⚠️ **Ao mudar qualquer arquivo do app shell, suba a versão do cache em
> `frontend/sw.js`** (`const CACHE = 'gp2t-vN'`). O Service Worker é
> cache-first e só reinstala quando o conteúdo do `sw.js` muda — sem isso,
> o navegador continua servindo a versão antiga do app depois do deploy,
> mesmo com o Firebase já atualizado. Isso já causou confusão real aqui.

Para recriar do zero em outro projeto Firebase:

1. Crie o projeto em [console.firebase.google.com](https://console.firebase.google.com).
   **Atenção:** se o nome já estiver em uso, o Firebase acrescenta um sufixo
   ao ID (pedir `gestao-de-frota` virou `gestao-de-frota-c7565`) — o link usa
   o ID real.
2. Ajuste `.firebaserc` e o `projectId` em `.github/workflows/deploy-firebase.yml`.
3. Dê o papel **Firebase Hosting Admin** à conta de serviço padrão que o
   Firebase já cria (`firebase-adminsdk-fbsvc@SEU-PROJETO-ID...`), gere uma
   chave JSON e salve como secret `FIREBASE_SERVICE_ACCOUNT` no repositório
   (**Settings → Secrets and variables → Actions**).

Não existe mais nada de CORS para configurar: o Apps Script responde a
qualquer origem, e o app evita o preflight por desenho (GET com token na
URL, POST com `Content-Type: text/plain`).

---

## Gerenciar usuários depois do primeiro admin

Não precisa mexer em terminal de novo: logado como Administrador, use a tela
**👤 Usuários** no próprio app para criar, editar ou inativar logins da
equipe (perfis Administrador / Operacional / Visualização).

## Adicionar uma função ou tipo de equipamento novo

Abra a aba **Config** na planilha e acrescente o valor na coluna `Funcoes`
ou `TiposEquipamento` — aparece nos formulários do app sem precisar de
redeploy (o app também sempre oferece a opção "Outros" com texto livre).

## Estrutura da planilha

A planilha tem **10 abas visíveis** (layout "profissional", com faixa de
título) mais 3 abas internas do app (sem faixa de título, propositalmente
simples):

1. **Equipamentos**, **Operadores**, **Lançamento Diário** — as 3 abas que o
   app lê e escreve. Faixa de título na linha 1, subtítulo na linha 2,
   **cabeçalho de colunas na linha 3** (fundo azul), **dados a partir da
   linha 4**. As colunas originais continuam exatamente com os mesmos nomes;
   o app só acrescenta colunas técnicas ao final da linha 3 (`ID`,
   `CriadoEm`, `CriadoPor`, `AtualizadoEm`, `AtualizadoPor`, e em Lançamento
   Diário também `EquipamentoId`/`OperadorId`).
2. **Resumo Diário**, **Resumo Mensal**, **Resumo Semanal**, **Hist.
   Operadores**, **Hist. Equipamentos**, **Hist. Lançamentos** — painéis
   **100% calculados por fórmula nativa do Sheets** (não são tocados pelo
   app, nem leem nem escrevem nada por API). Atualizam sozinhos conforme
   novos lançamentos entram pelo app. **Não edite fórmulas nessas abas** —
   um erro de fórmula quebra o painel inteiro.
3. **Manutenções** — preenchimento **manual direto na planilha**. O app
   mostra essa lista (aba Manutenções dentro de **Resumos**), mas **só
   leitura**: não cadastra nem edita, por decisão de projeto.
4. **Usuários**, **Auditoria**, **Config** — abas internas do app (login,
   log de ações, listas de Função/Tipo de Equipamento). Ficam com cabeçalho
   simples na linha 1, sem faixa de título — não fazem parte do layout
   visual "profissional" de propósito, o usuário raramente as abre.
   `Usuários` tem uma coluna `Salt` por usuário, usada junto com `SenhaHash`
   no cálculo da senha — apagar essa coluna invalida todos os logins.

> **Nota técnica:** em `Lançamento Diário`, as colunas `Horas`, `L/h` e
> `L/Ton` são **valores calculados e gravados pelo backend** a cada
> lançamento (não fórmulas de planilha) — o servidor sempre recalcula tudo
> antes de gravar, então uma fórmula ali seria sobrescrita na primeira
> escrita do app. Já os painéis de Resumo/Histórico continuam sendo fórmula
> de verdade, porque o app nunca escreve neles.

O app **nunca apaga nem reorganiza** o que já existia nas 3 abas de negócio —
só acrescenta colunas técnicas ao final. As colunas visíveis que você já
usava continuam com os mesmos nomes.
