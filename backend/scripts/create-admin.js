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

// Lê as 3 respostas com o iterador assíncrono do readline (for-await), não
// com múltiplas chamadas de `rl.question()` encadeadas: quando o stdin não é
// um terminal interativo (ex.: entrada via pipe/heredoc/CI), a interface pode
// detectar o fim do stream e se fechar sozinha entre uma pergunta e a
// seguinte, abandonando a próxima pergunta em silêncio. O for-await evita essa
// corrida em ambos os casos (terminal real ou entrada não-interativa).
async function lerRespostas(perguntas) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const respostas = [];
  rl.setPrompt(perguntas[0]);
  rl.prompt();
  for await (const linha of rl) {
    respostas.push(linha.trim());
    if (respostas.length >= perguntas.length) { rl.close(); break; }
    rl.setPrompt(perguntas[respostas.length]);
    rl.prompt();
  }
  return respostas;
}

async function main() {
  console.log('=== Criar usuário Administrador — GP2T ===\n');
  console.log('(a senha digitada aparece em texto normal no terminal — faça isso num ambiente privado)\n');

  const [nome, email, senha] = await lerRespostas([
    'Nome completo: ',
    'E-mail de login: ',
    'Senha (mín. 6 caracteres): ',
  ]);
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
