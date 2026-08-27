// ============================================================================
// create-admin.js — Cria o primeiro usuário Administrador do app.
// Não existe tela pública de "primeiro cadastro" por segurança — este script
// é o único caminho para o bootstrap inicial. Depois do 1º admin criado, os
// demais usuários (de qualquer perfil) são geridos pela tela "Usuários" do
// próprio app, logado como Administrador.
//
// Uso: npm run create:admin   (precisa do .env configurado)
// ============================================================================
import 'dotenv/config';
import readline from 'readline';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getAllRows, appendRow } from '../src/lib/sheets.js';
import { TABS } from '../src/config/schema.js';

function ask(pergunta, { esconder = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (esconder) {
      // Esconde a digitação da senha no terminal.
      rl._writeToOutput = (str) => {
        if (str.trim().length && str !== '\r\n' && !str.startsWith(pergunta)) rl.output.write('*');
        else rl.output.write(str);
      };
    }
    rl.question(pergunta, (resposta) => {
      rl.close();
      resolve(resposta.trim());
    });
  });
}

async function main() {
  console.log('=== Criar usuário Administrador — GP2T ===\n');

  const nome = await ask('Nome completo: ');
  const email = await ask('E-mail de login: ');
  const senha = await ask('Senha (mín. 6 caracteres): ', { esconder: true });
  console.log('');

  if (!nome || !email || !senha || senha.length < 6) {
    console.error('❌ Dados inválidos. Nome, e-mail e senha (mín. 6 caracteres) são obrigatórios.');
    process.exit(1);
  }

  const existentes = await getAllRows(TABS.USUARIOS);
  if (existentes.some((u) => (u.Email || '').toLowerCase() === email.toLowerCase())) {
    console.error('❌ Já existe um usuário com este e-mail.');
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  await appendRow(TABS.USUARIOS, {
    Id: randomUUID(),
    Nome: nome,
    Email: email,
    SenhaHash: senhaHash,
    Perfil: 'ADMINISTRADOR',
    Status: 'Ativo',
    CriadoEm: new Date().toISOString(),
  });

  console.log(`✅ Administrador "${nome}" (${email}) criado com sucesso. Já pode fazer login no app.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
