// Generate Node.js scripts from natural language descriptions using Claude API.
// Scripts are validated with syntax check + dry-run execution before saving.
// If dry-run fails, the error is fed back to Claude for a retry (up to 2 retries).
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { SCRIPTS_DIR, dataPath } = require("./data-dir");

const SYSTEM_PROMPT = `You are a Node.js script generator for Tom The Lizard, a Zalo chatbot assistant.

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
- CRITICAL: Only use APIs you are CERTAIN exist and are publicly accessible. Do NOT guess API URLs.
  If unsure about an API, use web scraping with fetch() + regex/string parsing on a well-known public page instead.

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

const MAX_RETRIES = 2;

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

function cleanCode(raw) {
  return raw.replace(/^```(?:javascript|js)?\n?/i, "").replace(/\n?```$/i, "").trim();
}

function syntaxCheck(filepath) {
  return new Promise((resolve, reject) => {
    execFile("node", ["--check", filepath], { timeout: 5000 }, (err) => {
      if (err) reject(new Error("Syntax error: " + err.message));
      else resolve();
    });
  });
}

function dryRun(filepath) {
  return new Promise((resolve, reject) => {
    // Run with DRY_RUN=1 and blank Zalo creds to prevent actual message sends.
    // Real API keys are passed so HTTP calls can be validated.
    const env = {
      ...process.env,
      DRY_RUN: "1",
      ZALO_BOT_TOKEN: "",
      MY_CHAT_ID: "",
    };
    execFile("node", [filepath], { timeout: 15000, env }, (err, stdout, stderr) => {
      // Exit code 0 = success, anything else = failure
      if (err) {
        // Extract the useful error message from stderr or err
        const msg = (stderr || "").trim() || err.message || "Unknown error";
        // Truncate to keep it useful for Claude
        reject(new Error(msg.slice(0, 500)));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function generateTaskScript(taskId, description) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const placesCtx = getPlacesContext();
  const filename = `task-${taskId}.js`;
  const filepath = path.join(SCRIPTS_DIR, filename);

  const messages = [{ role: "user", content: description }];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT + placesCtx,
      messages,
    });

    const code = cleanCode(
      response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
    );

    fs.writeFileSync(filepath, code);

    // Step 1: Syntax check
    try {
      await syntaxCheck(filepath);
    } catch (e) {
      fs.unlinkSync(filepath);
      if (attempt < MAX_RETRIES) {
        messages.push({ role: "assistant", content: code });
        messages.push({ role: "user", content: `This script has a syntax error:\n${e.message}\n\nFix it and return the full corrected script.` });
        continue;
      }
      throw new Error(`Script failed syntax check after ${MAX_RETRIES + 1} attempts: ${e.message}`);
    }

    // Step 2: Dry-run execution (Zalo sends are disabled)
    try {
      await dryRun(filepath);
    } catch (e) {
      // Zalo send failures are expected (blank creds) -- ignore those
      if (/ZALO|sendMessage|bot\.send/i.test(e.message) || /Cannot read.*token/i.test(e.message)) {
        // Script logic works, just can't send -- that's fine
        console.log(`[script-gen] Dry-run passed (Zalo send skipped): ${filename}`);
        return path.join("scripts", filename);
      }

      fs.unlinkSync(filepath);
      if (attempt < MAX_RETRIES) {
        messages.push({ role: "assistant", content: code });
        messages.push({
          role: "user",
          content: `This script failed when I tried to run it. Here is the error:\n\n${e.message}\n\nFix the script so it runs without errors. If an API returned 404 or doesn't exist, use a different data source. Return the full corrected script.`,
        });
        console.log(`[script-gen] Attempt ${attempt + 1} failed, retrying: ${e.message.slice(0, 100)}`);
        continue;
      }
      throw new Error(`Script failed dry-run after ${MAX_RETRIES + 1} attempts: ${e.message}`);
    }

    console.log(`[script-gen] Script validated: ${filename}`);
    return path.join("scripts", filename);
  }

  throw new Error("Script generation failed after all retries");
}

module.exports = { generateTaskScript };
