// Lightweight Claude query helper for use in generated scripts.
// Useful for general knowledge questions. NOT suitable for real-time financial data
// (gold prices, exchange rates, oil) — use free public APIs for those instead.
//
// Usage in generated scripts:
//   const ask = require("./ask-claude");
//   const answer = await ask("Explain what this Jira status means");
const Anthropic = require("@anthropic-ai/sdk");

async function askClaude(question, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: opts.model || "claude-sonnet-4-6",
    max_tokens: opts.maxTokens || 1024,
    system: [
      "You are a data assistant. Answer factually and concisely.",
      "You do NOT have real-time data. Your knowledge has a training cutoff.",
      "For financial data (gold, oil, exchange rates, stocks): always state that your figures are approximate, based on training data, and may be outdated. Never present them as current market prices.",
      "If you are unsure, say so clearly.",
      "Respond in Vietnamese unless asked otherwise.",
      "Keep responses under 1500 characters.",
    ].join(" "),
    messages: [{ role: "user", content: question }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

module.exports = askClaude;
