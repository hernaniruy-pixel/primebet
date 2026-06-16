#!/usr/bin/env node
// Teste rápido: confirma que a chave, os créditos, o modelo e a SDK funcionam.
const _SDK = require('@anthropic-ai/sdk');
const Anthropic = _SDK.Anthropic || _SDK.default || _SDK;
const { ANTHROPIC_API_KEY, MODELO } = require('../src/config');

(async () => {
  if (!ANTHROPIC_API_KEY) { console.error('❌ ANTHROPIC_API_KEY não configurada no .env'); process.exit(1); }
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  try {
    const r = await client.messages.create({
      model: MODELO,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Responda apenas: OK' }],
    });
    const txt = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    console.log(`✅ API OK. Modelo: ${r.model} | resposta: "${txt}" | tokens in/out: ${r.usage.input_tokens}/${r.usage.output_tokens}`);
  } catch (e) {
    console.error('❌ Falhou:', e.status || '', e.message);
    process.exit(1);
  }
})();
