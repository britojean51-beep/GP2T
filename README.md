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
  backend/     API (Node/Express) que fala com a Planilha Google via service account
  frontend/    PWA mobile-first (HTML/CSS/JS puro, sem build)
```

O backend nunca deixa o app ter dois "bancos de dados" divergentes: toda
leitura/escrita passa pela planilha. O frontend só guarda uma fila local
temporária (IndexedDB) para lançamentos feitos **offline**, que sincroniza
sozinha assim que a conexão volta.

---

## Sua planilha oficial

A planilha operacional já está criada como Planilha Google nativa:

- **Nome:** Planilha_Controle_Op_Dinamica
- **Link:** https://docs.google.com/spreadsheets/d/1po82mv7df3rMDITPY-eOV9wSiqImO8Yj1XwShCW4Flg/edit
- **SPREADSHEET_ID** (para o `.env`): `1po82mv7df3rMDITPY-eOV9wSiqImO8Yj1XwShCW4Flg`

O arquivo `.xlsx` original que existia no Drive foi mantido intacto, só
renomeado para `Planilha_Controle_Op_Dinamica (ORIGINAL .xlsx — substituída
pela versão Google Sheets)` — ele estava vazio (só cabeçalhos, sem dados
reais), então nada foi perdido na troca.

A planilha nova está vazia (sem nem as abas ainda) — o passo 2 abaixo
(`npm run setup:sheet`) cria toda a estrutura automaticamente, incluindo as
abas `Equipamentos`, `Operadores` e `Lançamento Diário` com as colunas
originais do projeto.

---

## 1. Configurar o Google Cloud (uma vez só)

O backend precisa de uma **conta de serviço** do Google para poder ler/escrever
na planilha em nome do app (sem precisar de login do Google de cada operador).

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) com a
   conta que é dona da planilha.
2. Crie um novo projeto (nome sugerido: `GP2T`).
3. Menu **APIs e Serviços → Biblioteca** → habilite a **Google Sheets API**.
4. Habilite também a **Google Drive API**.
5. **APIs e Serviços → Credenciais → Criar Credenciais → Conta de Serviço**.
   Nome sugerido: `gp2t-backend`. Não precisa dar nenhum papel de IAM no
   projeto (o acesso é dado direto na planilha, no passo 8).
6. Abra a conta de serviço criada → aba **Chaves → Adicionar Chave → Criar
   nova chave → JSON** → baixe o arquivo. **Guarde fora do repositório —
   nunca commite esse arquivo.**
7. Copie o e-mail da conta de serviço (formato
   `gp2t-backend@SEU-PROJETO.iam.gserviceaccount.com`).
8. Abra a Planilha Google oficial → **Compartilhar** → adicione esse e-mail
   como **Editor**.

Guarde o arquivo JSON baixado — ele vai virar uma variável de ambiente no
próximo passo (nunca vai para o Git).

---

## 2. Preparar a planilha (uma vez só)

O app precisa de algumas colunas técnicas e 3 abas novas (`Usuários`,
`Auditoria`, `Config`) além das que você já tem (`Equipamentos`, `Operadores`,
`Lançamento Diário`). Isso é feito por um script — **é seguro rodar mais de
uma vez**, ele só acrescenta o que falta, nunca apaga nada.

```bash
cd backend
npm install
cp .env.example .env
```

Edite o `.env`:
- `SPREADSHEET_ID`: o trecho do link da planilha entre `/d/` e `/edit`.
- `JWT_SECRET`: gere com `openssl rand -hex 32`.
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`: cole o conteúdo do arquivo JSON
  baixado no passo anterior — pode colar direto, com várias linhas mesmo, o
  app detecta sozinho. (Também aceita o mesmo JSON em base64 numa linha só,
  se preferir: `base64 -i caminho/para/chave.json | tr -d '\n'`.)

Depois:

```bash
npm run setup:sheet
```

Isso cria as abas/colunas que faltam. Em seguida, crie o primeiro
administrador:

```bash
npm run create:admin
```

Guarde o e-mail/senha que você digitar — é o login inicial do app.

---

## 3. Rodar localmente

```bash
# Backend (numa aba de terminal)
cd backend
npm run dev          # sobe em http://localhost:3000

# Frontend (noutra aba)
cd frontend
python3 -m http.server 5500   # ou qualquer servidor estático
```

Abra `http://localhost:5500` — o frontend já aponta para
`http://localhost:3000/api` automaticamente quando rodando em localhost
(veja `frontend/js/config.js`).

---

## 4. Publicar (deploy)

### Backend no Render

1. Suba este repositório para o GitHub (branch `main`).
2. Em [render.com](https://render.com), **New → Web Service**, conecte o repo `GP2T`.
3. Root Directory: `backend`. Build: `npm install`. Start: `npm start`. Plano: Free.
4. Em **Environment**, adicione as mesmas variáveis do seu `.env` local
   (`SPREADSHEET_ID`, `JWT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`) mais
   `CORS_ORIGIN` = a URL do Firebase Hosting (passo abaixo, **sem barra e sem
   caminho no final** — só `https://SEU-PROJETO.web.app`) e `NODE_ENV=production`.
   O campo de valor no Render aceita várias linhas — pode colar o conteúdo do
   arquivo JSON da conta de serviço direto ali, sem precisar converter nada.

   ⚠️ **Atenção com o `CORS_ORIGIN`**: o navegador nunca envia caminho
   (`/algo`) no cabeçalho de origem, só o domínio. Se colocar qualquer coisa
   depois do domínio (ex.: `.../GP2T`), o backend rejeita todas as chamadas
   do frontend e o app mostra "Sem conexão com o servidor" mesmo com tudo
   funcionando — foi um erro real que já aconteceu aqui.
5. Depois do deploy, teste `https://SEU-SERVICO.onrender.com/api/health`.

   ⚠️ No plano gratuito, o backend "dorme" após ~15 min sem uso — a primeira
   chamada do dia demora uns 30-50s para responder. Depois disso fica normal.
   Isso é aceitável para uso interno; se quiser eliminar essa espera, dá pra
   trocar para um plano pago (ex.: Starter, ~US$7/mês) nas configurações do
   serviço no Render, sem mudar nada no código.

### Frontend no Firebase Hosting

O link final fica no formato `https://SEU-PROJETO.web.app` — o nome vem do
projeto que você escolhe no Firebase, não do seu usuário do GitHub.

1. Edite `frontend/js/config.js`, trocando `SEU-BACKEND-NO-RENDER` pela URL
   real do serviço criado no Render.
2. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com)
   com o nome que você quiser para o link. **Atenção:** se o nome exato já
   estiver em uso por outra pessoa, o Firebase acrescenta um sufixo aleatório
   ao ID do projeto (ex.: pedir `gestao-de-frota` pode virar
   `gestao-de-frota-c7565`) — o link final usa esse ID real, não o nome que
   você digitou. Confira o ID exato nas configurações do projeto ou no
   sufixo do e-mail da conta de serviço (próximo passo). Pode desativar o
   Google Analytics, não é usado.
3. Atualize `.firebaserc` na raiz do repositório e o campo `projectId` em
   `.github/workflows/deploy-firebase.yml` com o **ID real** do projeto
   (não o nome que você digitou, caso tenham ficado diferentes):
   ```json
   { "projects": { "default": "SEU-PROJETO-ID" } }
   ```
4. O Firebase já cria automaticamente uma conta de serviço padrão
   (`firebase-adminsdk-fbsvc@SEU-PROJETO-ID.iam.gserviceaccount.com`) —
   não precisa criar uma nova. No [Google Cloud Console](https://console.cloud.google.com),
   com o mesmo projeto selecionado (Firebase roda sobre Google Cloud, é o
   mesmo projeto): **IAM e Admin → IAM**, encontre essa conta e confira/
   adicione o papel **Firebase Hosting Admin**. Depois, em **Contas de
   Serviço**, abra essa conta → aba **Chaves** → **Adicionar Chave** →
   **Criar nova chave** → **JSON** → baixe.
5. No repositório GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**. Nome: `FIREBASE_SERVICE_ACCOUNT`. Valor: cole o
   conteúdo do JSON baixado (pode colar direto, várias linhas).
6. Dê um push em `main` (qualquer alteração em `frontend/` já dispara) — o
   workflow `.github/workflows/deploy-firebase.yml` publica automaticamente.
7. Depois do primeiro deploy, volte no Render e confirme que `CORS_ORIGIN`
   está exatamente igual à URL do Firebase (ex.: `https://SEU-PROJETO-ID.web.app`,
   sem barra no final).

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

O app **nunca apaga nem reorganiza** o que já existia. Ele só acrescenta
colunas técnicas ao final das abas (`ID`, `CriadoEm`, `CriadoPor`,
`AtualizadoEm`, `AtualizadoPor`, e nos lançamentos também `EquipamentoId`/
`OperadorId`) e cria as 3 abas novas descritas acima. As colunas visíveis que
você já usava continuam exatamente onde estavam.
