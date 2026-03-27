// Manages non-secret config that persists across deploys.
// In production: secrets come from process.env (Dokploy), editable config from /data/config.json
// In local: everything comes from .env file as before
const fs = require("fs");
const crypto = require("crypto");
const { dataPath } = require("./data-dir");

const CONFIG_PATH = dataPath("config.json");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Keys that are secrets (never written to disk in production)
const SECRET_KEYS = [
  "ZALO_BOT_TOKEN",
  "ANTHROPIC_API_KEY",
  "JIRA_API_TOKEN",
  "TOMTOM_API_KEY",
];

// Keys that are editable non-secrets (persisted to config.json in production)
const EDITABLE_KEYS = [
  "MY_CHAT_ID",
  "JIRA_EMAIL",
  "JIRA_BASE_URL",
];

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(updates) {
  const current = readConfig();
  Object.assign(current, updates);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
  // Also update process.env so the running bot picks up changes
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && v !== null) process.env[k] = v;
  }
}

// Get a config value: checks process.env first, then config.json
function get(key) {
  return process.env[key] || readConfig()[key] || "";
}

// Set a config value respecting the mode
function set(key, value) {
  if (IS_PRODUCTION && SECRET_KEYS.includes(key)) {
    // In production, secrets can't be changed via dashboard
    return { ok: false, error: "Secrets must be set via Dokploy environment variables" };
  }
  if (IS_PRODUCTION && EDITABLE_KEYS.includes(key)) {
    writeConfig({ [key]: value });
    return { ok: true };
  }
  // Local mode or editable key: write to process.env (and .env file handled by caller)
  process.env[key] = value;
  return { ok: true };
}

// Delete a config value
function remove(key) {
  if (IS_PRODUCTION && SECRET_KEYS.includes(key)) {
    return { ok: false, error: "Secrets must be removed via Dokploy environment variables" };
  }
  if (IS_PRODUCTION && EDITABLE_KEYS.includes(key)) {
    const current = readConfig();
    delete current[key];
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
    delete process.env[key];
    return { ok: true };
  }
  delete process.env[key];
  return { ok: true };
}

// Load config.json into process.env on startup (non-secrets only)
// Also detect token changes and clear MY_CHAT_ID if needed
function loadConfigToEnv() {
  const config = readConfig();
  for (const key of EDITABLE_KEYS) {
    if (config[key] && !process.env[key]) {
      process.env[key] = config[key];
    }
  }
  // Detect ZALO_BOT_TOKEN change: compare hash of current token vs stored hash
  const token = process.env.ZALO_BOT_TOKEN;
  if (token) {
    const currentHash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
    const storedHash = config._zaloTokenHash || "";
    if (storedHash && storedHash !== currentHash) {
      // Token changed -- clear chat ID so auto-capture re-triggers
      console.log("[config] Zalo token changed, clearing MY_CHAT_ID for re-capture");
      delete process.env.MY_CHAT_ID;
      writeConfig({ MY_CHAT_ID: "", _zaloTokenHash: currentHash });
    } else if (!storedHash) {
      // First run or migrating -- store hash without clearing
      writeConfig({ _zaloTokenHash: currentHash });
    }
  }
}

function maskSecret(val) {
  if (!val || val.length < 8) return val ? "****" : "";
  return "****" + val.slice(-4);
}

module.exports = {
  IS_PRODUCTION,
  SECRET_KEYS,
  EDITABLE_KEYS,
  readConfig,
  writeConfig,
  get,
  set,
  remove,
  loadConfigToEnv,
  maskSecret,
};
