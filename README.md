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
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`: o JSON do passo anterior, em base64
  numa linha só. No Linux/Mac: `base64 -i caminho/para/chave.json | tr -d '\n'`.

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
   `CORS_ORIGIN` = a URL do GitHub Pages (passo abaixo) e `NODE_ENV=production`.
5. Depois do deploy, teste `https://SEU-SERVICO.onrender.com/api/health`.

   ⚠️ No plano gratuito, o backend "dorme" após ~15 min sem uso — a primeira
   chamada do dia demora uns 30-50s para responder. Depois disso fica normal.
   Isso é aceitável para uso interno; se quiser eliminar essa espera, dá pra
   trocar para um plano pago (ex.: Starter, ~US$7/mês) nas configurações do
   serviço no Render, sem mudar nada no código.

### Frontend no GitHub Pages

1. Edite `frontend/js/config.js`, trocando `SEU-BACKEND-NO-RENDER` pela URL
   real do serviço criado no Render.
2. Ative o GitHub Pages no repositório: **Settings → Pages → Source: GitHub
   Actions**. O workflow em `.github/workflows/deploy-pages.yml` já publica a
   pasta `frontend/` a cada push em `main`.
3. Depois do primeiro deploy, volte no Render e confirme que `CORS_ORIGIN`
   está exatamente igual à URL do GitHub Pages (ex.:
   `https://SEU-USUARIO.github.io/GP2T`).

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
