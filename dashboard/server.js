const express = require("express");
const path = require("path");
const fs = require("fs");
const { state, events, getStatus, getConfig, setConfig, getMessages } = require("../src/bot-state");
const { getTasks, addTask, updateTask, deleteTask, runTaskNow } = require("../src/scheduler");
const { generateTaskScript } = require("../src/script-generator");
const { dataPath } = require("../src/data-dir");
const jiraClient = require("../src/jira-client");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ENV_PATH = dataPath(".env");

function maskSecret(val) {
  if (!val || val.length < 8) return val ? "****" : "";
  return "****" + val.slice(-4);
}

function readEnv() {
  try {
    const raw = fs.readFileSync(ENV_PATH, "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    }
    return env;
  } catch { return {}; }
}

function writeEnv(updates) {
  const lines = fs.readFileSync(ENV_PATH, "utf8").split("\n");
  for (const [key, val] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(key + "="));
    if (idx >= 0) lines[idx] = `${key}=${val}`;
    else lines.push(`${key}=${val}`);
    process.env[key] = val;
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n"));
}

// --- Onboarding ---
app.get("/api/onboarding-status", (req, res) => {
  const env = readEnv();
  res.json({
    needsOnboarding: !env.ZALO_BOT_TOKEN || !env.ANTHROPIC_API_KEY,
    hasZalo: !!env.ZALO_BOT_TOKEN,
    hasAnthropic: !!env.ANTHROPIC_API_KEY,
    hasJira: !!env.JIRA_API_TOKEN,
    hasPlaces: fs.existsSync(path.join(__dirname, "..", "places.json")),
  });
});

// Ensure .env exists for fresh installs
if (!fs.existsSync(ENV_PATH)) {
  fs.writeFileSync(ENV_PATH, "# Tom The Lizard config\n");
}

// Also load .env from data dir on startup (for container deployments)
require("dotenv").config({ path: ENV_PATH, override: false });

// --- API Routes ---

app.get("/api/status", (req, res) => {
  res.json(getStatus());
});

app.get("/api/messages", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  res.json(getMessages(limit, offset));
});

app.get("/api/config", (req, res) => {
  const env = readEnv();
  res.json({
    ...getConfig(),
    env: {
      ZALO_BOT_TOKEN: maskSecret(env.ZALO_BOT_TOKEN),
      MY_CHAT_ID: maskSecret(env.MY_CHAT_ID),
      ANTHROPIC_API_KEY: maskSecret(env.ANTHROPIC_API_KEY),
      TOMTOM_API_KEY: maskSecret(env.TOMTOM_API_KEY),
      JIRA_EMAIL: env.JIRA_EMAIL || "",
      JIRA_API_TOKEN: maskSecret(env.JIRA_API_TOKEN),
      JIRA_URL: "https://vnggames.atlassian.net",
      CONFLUENCE_URL: "https://vnggames.atlassian.net/wiki",
    },
  });
});

// --- Secrets API (write-only tokens) ---
const SECRET_KEYS = ["ZALO_BOT_TOKEN", "MY_CHAT_ID", "ANTHROPIC_API_KEY", "TOMTOM_API_KEY", "JIRA_API_TOKEN"];
const PLAIN_KEYS = ["JIRA_EMAIL", "JIRA_BASE_URL"];

app.get("/api/secrets", (req, res) => {
  const env = readEnv();
  const secrets = {};
  for (const k of SECRET_KEYS) {
    secrets[k] = { set: !!env[k], masked: maskSecret(env[k]) };
  }
  for (const k of PLAIN_KEYS) {
    secrets[k] = { set: !!env[k], value: env[k] || "" };
  }
  res.json(secrets);
});

app.post("/api/secrets/:key", (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (![...SECRET_KEYS, ...PLAIN_KEYS].includes(key)) {
    return res.status(400).json({ error: "Unknown key" });
  }
  const cleaned = (value || "").trim().replace(/^\*[\s*]*/, "");
  if (!cleaned) {
    return res.status(400).json({ error: "Value cannot be empty" });
  }
  if (/^\*{2,}/.test(cleaned)) {
    return res.status(400).json({ error: "Cannot save masked value" });
  }
  writeEnv({ [key]: cleaned });
  res.json({ ok: true, masked: SECRET_KEYS.includes(key) ? maskSecret(cleaned) : cleaned });
});

app.delete("/api/secrets/:key", (req, res) => {
  const { key } = req.params;
  if (![...SECRET_KEYS, ...PLAIN_KEYS].includes(key)) {
    return res.status(400).json({ error: "Unknown key" });
  }
  const lines = fs.readFileSync(ENV_PATH, "utf8").split("\n");
  const filtered = lines.filter((l) => !l.startsWith(key + "="));
  fs.writeFileSync(ENV_PATH, filtered.join("\n"));
  delete process.env[key];
  res.json({ ok: true });
});

app.post("/api/config", (req, res) => {
  try {
    const { model, maxTokens, systemPrompt, maxMsgLen, progressMessages } = req.body;
    const updates = {};
    if (model !== undefined) updates.model = model;
    if (maxTokens !== undefined) updates.maxTokens = maxTokens;
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (maxMsgLen !== undefined) updates.maxMsgLen = maxMsgLen;
    if (progressMessages !== undefined) updates.progressMessages = progressMessages;
    setConfig(updates);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/env", (req, res) => {
  try {
    writeEnv(req.body);
    res.json({ ok: true, note: "Restart bot for some changes to take effect" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/integrations/test", (req, res) => {
  const { type } = req.body;
  const status = getStatus();
  if (type === "jira") {
    res.json({ ok: status.integrations.jira.connected, tools: status.integrations.jira.tools });
  } else if (type === "confluence") {
    res.json({ ok: status.integrations.confluence.connected, tools: status.integrations.confluence.tools });
  } else if (type === "tomtom") {
    res.json({ ok: !!process.env.TOMTOM_API_KEY });
  } else {
    res.status(400).json({ error: "Unknown integration type" });
  }
});

// Reconnect Jira with current env vars and test
app.post("/api/integrations/reconnect", async (req, res) => {
  try {
    await jiraClient.reconnect();
    const status = getStatus();
    res.json({ ok: status.integrations.jira.connected, tools: status.integrations.jira.tools });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// --- Scheduler API ---
app.get("/api/tasks", (req, res) => {
  res.json(getTasks());
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { name, description, cron, recurrence, enabled } = req.body;
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
    let script = req.body.script;

    // Generate script from description if no script provided
    if (!script && description) {
      script = await generateTaskScript(id, description);
    }

    const task = addTask({ name, cron, script, enabled, description, recurrence });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const existing = getTasks().find((t) => t.id === req.params.id);
    const descChanged = req.body.description && existing && req.body.description !== existing.description;

    // Regenerate script if description changed
    if (descChanged) {
      req.body.script = await generateTaskScript(req.params.id, req.body.description);
    }

    const task = updateTask(req.params.id, req.body);
    res.json({ ok: true, task });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/tasks/:id", (req, res) => {
  try {
    deleteTask(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/tasks/:id/run", (req, res) => {
  runTaskNow(req.params.id)
    .then((output) => res.json({ ok: true, output }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

// --- Places API ---
const PLACES_FILE = dataPath("places.json");

function readPlaces() {
  try {
    return JSON.parse(fs.readFileSync(PLACES_FILE, "utf8"));
  } catch {
    const defaults = {
      home: { name: "Scenic Valley 1", coords: "10.7277,106.7050", address: "Scenic Valley 1, Phu My Hung, District 7" },
      work: { name: "VNG Z06", coords: "10.7416,106.7220", address: "VNG Campus Z06, Tan Thuan Dong, District 7" },
      custom: [],
    };
    fs.writeFileSync(PLACES_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
}

function savePlaces(data) {
  fs.writeFileSync(PLACES_FILE, JSON.stringify(data, null, 2));
}

app.get("/api/places", (req, res) => {
  res.json(readPlaces());
});

// Set home or work
app.put("/api/places/:slot", (req, res) => {
  const data = readPlaces();
  const { slot } = req.params;
  if (slot === "home" || slot === "work") {
    data[slot] = { name: req.body.name, coords: req.body.coords, address: req.body.address || req.body.name };
    savePlaces(data);
    return res.json({ ok: true, data });
  }
  // Custom place by index
  const idx = parseInt(slot);
  if (!isNaN(idx) && idx >= 0 && idx < data.custom.length) {
    Object.assign(data.custom[idx], req.body);
    savePlaces(data);
    return res.json({ ok: true, data });
  }
  res.status(400).json({ error: "Invalid slot" });
});

// Add custom place
app.post("/api/places/custom", (req, res) => {
  const data = readPlaces();
  const { label, name, coords, address } = req.body;
  if (!label || !coords) return res.status(400).json({ error: "Label and location required" });
  data.custom.push({ label, name, coords, address: address || name });
  savePlaces(data);
  res.json({ ok: true, data });
});

// Delete custom place
app.delete("/api/places/custom/:idx", (req, res) => {
  const data = readPlaces();
  const idx = parseInt(req.params.idx);
  if (idx < 0 || idx >= data.custom.length) return res.status(400).json({ error: "Invalid index" });
  data.custom.splice(idx, 1);
  savePlaces(data);
  res.json({ ok: true, data });
});

// --- Word Config ---
const WORD_CONFIG_FILE = dataPath("word-config.json");

function readWordConfig() {
  try {
    return JSON.parse(fs.readFileSync(WORD_CONFIG_FILE, "utf8"));
  } catch {
    const defaults = {
      categories: [
        { name: "Business", enabled: true },
        { name: "Technology", enabled: true },
        { name: "Daily Life", enabled: true },
        { name: "Academic", enabled: false },
        { name: "Travel", enabled: false },
      ],
    };
    fs.writeFileSync(WORD_CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
}

app.get("/api/word-config", (req, res) => {
  res.json(readWordConfig());
});

app.post("/api/word-config", (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: "Invalid categories" });
  const data = { categories };
  fs.writeFileSync(WORD_CONFIG_FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true, data });
});

// --- Geocode Search (TomTom + Nominatim fallback) ---
async function searchTomTom(q) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${key}&limit=3&countrySet=VN&lat=10.7&lon=106.7&radius=50000`;
  const r = await fetch(url);
  const data = await r.json();
  return (data.results || []).map((r) => ({
    name: r.poi?.name || r.address?.freeformAddress || q,
    address: r.address?.freeformAddress || "",
    coords: `${r.position.lat},${r.position.lon}`,
    source: "tomtom",
  }));
}

async function searchNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=vn&addressdetails=1&accept-language=vi`;
  const r = await fetch(url, { headers: { "User-Agent": "BotLobster/1.0" } });
  const data = await r.json();
  return (data || []).map((r) => ({
    name: r.namedetails?.name || r.display_name.split(",")[0],
    address: r.display_name,
    coords: `${r.lat},${r.lon}`,
    source: "osm",
  }));
}

app.get("/api/geocode", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Query required" });
  try {
    // Search both in parallel, merge and deduplicate
    const [tomtom, osm] = await Promise.all([
      searchTomTom(q).catch(() => []),
      searchNominatim(q).catch(() => []),
    ]);

    // Merge: TomTom first, then OSM results not already covered
    const seen = new Set();
    const results = [];
    for (const r of [...tomtom, ...osm]) {
      // Dedupe by rounding coords to ~100m
      const key = r.coords.split(",").map((c) => parseFloat(c).toFixed(3)).join(",");
      if (!seen.has(key)) {
        seen.add(key);
        results.push(r);
      }
      if (results.length >= 6) break;
    }

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SSE for live updates
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");

  const onMessage = (msg) => res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
  const onConfig = (cfg) => res.write(`event: config\ndata: ${JSON.stringify(cfg)}\n\n`);
  const onStatus = () => res.write(`event: status\ndata: ${JSON.stringify(getStatus())}\n\n`);

  events.on("message", onMessage);
  events.on("config", onConfig);

  const statusInterval = setInterval(() => onStatus(), 5000);

  req.on("close", () => {
    events.off("message", onMessage);
    events.off("config", onConfig);
    clearInterval(statusInterval);
  });
});

// Restart the entire process
app.post("/api/restart", (req, res) => {
  res.json({ ok: true });
  console.log("[dashboard] Restart requested, exiting...");
  setTimeout(() => process.exit(0), 500);
});

function startDashboard(port = 3100) {
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`[dashboard] http://localhost:${port}`);
      resolve(port);
    });
  });
}

module.exports = { startDashboard };
