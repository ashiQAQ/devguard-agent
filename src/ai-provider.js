/**
 * AI Provider — unified OpenAI / Anthropic / Demo
 */
const fetch = require('node-fetch');

class AIProvider {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'openai';
    this.openaiKey = process.env.OPENAI_API_KEY || '';
    this.anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
    this.anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';

    const key = this.provider === 'anthropic' ? this.anthropicKey : this.openaiKey;
    this.isDemo = !key || key.includes('your-key');
  }

  async chat(systemPrompt, userContent) {
    if (this.isDemo) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      return null; // caller handles demo
    }
    try {
      if (this.provider === 'anthropic') return await this._anthropic(systemPrompt, userContent);
      return await this._openai(systemPrompt, userContent);
    } catch (e) {
      console.error('AI error:', e.message);
      return null;
    }
  }

  async _openai(system, user) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.openaiKey}` },
      body: JSON.stringify({
        model: this.openaiModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.2, max_tokens: 4096,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || r.statusText);
    return d.choices?.[0]?.message?.content;
  }

  async _anthropic(system, user) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.anthropicModel, max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || r.statusText);
    return d.content?.[0]?.text;
  }
}

module.exports = new AIProvider();
