// ============================================================================
// config.js — Único lugar que precisa ser editado ao trocar de ambiente.
// Em desenvolvimento local aponta pro backend rodando na sua máquina; troque
// API_BASE_URL para a URL pública do Render antes de publicar no GitHub Pages.
// ============================================================================
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export const API_BASE_URL = LOCAL
  ? 'http://localhost:3000/api'
  : 'https://SEU-BACKEND-NO-RENDER.onrender.com/api'; // TROCAR após o deploy do backend
