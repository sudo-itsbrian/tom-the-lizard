// Generate Node.js scripts from natural language descriptions using Claude API.
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { SCRIPTS_DIR, dataPath } = require("./data-dir");

const SYSTEM_PROMPT = `You are a Node.js script generator for Bot Lobster, a Zalo chatbot assistant.

Given a task description, generate a COMPLETE, RUNNABLE Node.js script.

RULES:
- Start with: require("dotenv").config({ quiet: true });
- Use process.env for all credentials (never hardcode)
- Available env vars: ZALO_BOT_TOKEN, MY_CHAT_ID, ANTHROPIC_API_KEY, TOMTOM_API_KEY, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BASE_URL
- To send a Zalo message, use this pattern:
  const ZaloBot = require("node-zalo-bot");
  const bot = new ZaloBot(process.env.ZALO_BOT_TOKEN, {});
  bot.sendMessage(process.env.MY_CHAT_ID, "message").then(() => process.exit(0));
- For HTTP requests, use the built-in fetch() (Node 18+)
- Wrap async code in: (async () => { ... })().catch(e => { console.error(e); process.exit(1); });
- Always call process.exit(0) on success, process.exit(1) on error
- Keep scripts under 80 lines
- Use Vietnamese for user-facing messages sent via Zalo

PLACES (CRITICAL -- NEVER hardcode coordinates):
- When user mentions "home", "work", or any named place, ALWAYS read from places.json:
  const dataDir = process.env.DATA_DIR || require("path").join(__dirname, "..", "data");
  const places = JSON.parse(require("fs").readFileSync(require("path").join(dataDir, "places.json"), "utf8"));
  // places.home = { name, coords, address }
  // places.work = { name, coords, address }
  // places.custom = [{ label, name, coords, address }, ...]
- Use places.home.coords, places.work.coords, etc. NEVER hardcode lat/lng values.
- For traffic checks, use TomTom Routing API:
  GET https://api.tomtom.com/routing/1/calculateRoute/{from}:{to}/json?key={TOMTOM_API_KEY}&traffic=true&departAt=now

OUTPUT: Return ONLY the JavaScript code. No markdown, no explanation, no backticks.`;

function getPlacesContext() {
  try {
    const cfg = JSON.parse(fs.readFileSync(dataPath("places.json"), "utf8"));
    const lines = [];
    if (cfg.home) lines.push(`- "home" = ${cfg.home.name} at ${cfg.home.coords} (${cfg.home.address})`);
    if (cfg.work) lines.push(`- "work" = ${cfg.work.name} at ${cfg.work.coords} (${cfg.work.address})`);
    for (const p of cfg.custom || []) {
      lines.push(`- "${p.label}" = ${p.name} at ${p.coords} (${p.address})`);
    }
    return lines.length > 0
      ? "\n\nCONFIGURED PLACES (use these when user references home, work, or named places):\n" + lines.join("\n")
      : "";
  } catch {
    return "";
  }
}

async function generateTaskScript(taskId, description) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const placesCtx = getPlacesContext();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT + placesCtx,
    messages: [{ role: "user", content: description }],
  });

  let code = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Strip markdown fences if Claude wraps them
  code = code.replace(/^```(?:javascript|js)?\n?/i, "").replace(/\n?```$/i, "").trim();

  // Save to scripts directory
  const filename = `task-${taskId}.js`;
  const filepath = path.join(SCRIPTS_DIR, filename);
  fs.writeFileSync(filepath, code);

  // Validate syntax
  await new Promise((resolve, reject) => {
    execFile("node", ["--check", filepath], { timeout: 5000 }, (err) => {
      if (err) {
        fs.unlinkSync(filepath);
        reject(new Error("Generated script has syntax errors: " + err.message));
      } else {
        resolve();
      }
    });
  });

  return path.join("scripts", filename);
}

module.exports = { generateTaskScript };
