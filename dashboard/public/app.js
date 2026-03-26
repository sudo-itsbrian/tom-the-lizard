// Bot Lobster Dashboard -- Client SPA
let allMessages = [];
let msgOffset = 0;

// --- Navigation ---
document.querySelectorAll(".sidebar-nav a").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(a.dataset.view);
  });
});

function navigate(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".sidebar-nav a").forEach((a) => a.classList.remove("active"));
  const el = document.getElementById("view-" + view);
  if (el) el.classList.add("active");
  const link = document.querySelector(`[data-view="${view}"]`);
  if (link) link.classList.add("active");
  window.location.hash = view;
  if (view === "messages") loadMessages();
  closeSidebar();
}

function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
  document.querySelector(".overlay").classList.toggle("open");
}

function closeSidebar() {
  document.querySelector(".sidebar").classList.remove("open");
  document.querySelector(".overlay").classList.remove("open");
}

// --- Data Fetching ---
async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    const d = await res.json();
    updateStatusUI(d);
  } catch (e) {
    console.error("Status fetch failed:", e);
  }
}

async function fetchConfig() {
  try {
    const res = await fetch("/api/config");
    const d = await res.json();
    updateConfigUI(d);
  } catch (e) {
    console.error("Config fetch failed:", e);
  }
}

async function loadMessages() {
  try {
    const filter = document.getElementById("msg-filter").value;
    const res = await fetch("/api/messages?limit=50&offset=0");
    const d = await res.json();
    allMessages = d.messages;
    msgOffset = 50;
    renderMessages("all-msgs", allMessages, filter);
  } catch (e) {
    console.error("Messages fetch failed:", e);
  }
}

async function loadMoreMessages() {
  try {
    const res = await fetch(`/api/messages?limit=50&offset=${msgOffset}`);
    const d = await res.json();
    allMessages = allMessages.concat(d.messages);
    msgOffset += 50;
    const filter = document.getElementById("msg-filter").value;
    renderMessages("all-msgs", allMessages, filter);
  } catch (e) {
    console.error("Load more failed:", e);
  }
}

function filterMessages() {
  const filter = document.getElementById("msg-filter").value;
  renderMessages("all-msgs", allMessages, filter);
}

// --- UI Updates ---
function updateStatusUI(d) {
  const running = d.bot.running;

  // Metric cards
  const mcStatus = document.getElementById("mc-status");
  const mcUptime = document.getElementById("mc-uptime");
  const mcZalo = document.getElementById("mc-zalo");
  const mcMemory = document.getElementById("mc-memory");

  mcStatus.className = "metric-card " + (running ? "ok" : "err");
  document.getElementById("mv-status").textContent = running ? "Running" : "Stopped";
  document.getElementById("ms-pid").textContent = running ? "pid " + d.bot.pid : "pid --";

  mcUptime.className = "metric-card " + (running ? "ok" : "");
  document.getElementById("mv-uptime").textContent = d.bot.uptime || "--";

  const zalo = d.zalo.connected;
  mcZalo.className = "metric-card " + (zalo ? "ok" : "warn");
  document.getElementById("mv-zalo").textContent = zalo ? "Connected" : "Disconnected";
  document.getElementById("ms-poll").textContent = d.zalo.lastPoll
    ? "poll " + timeSince(d.zalo.lastPoll) : "last poll --";

  mcMemory.className = "metric-card " + (running ? "ok" : "");
  document.getElementById("mv-memory").textContent = running ? d.bot.memory + " MB" : "--";

  // Integration pills
  const pills = document.getElementById("int-pills");
  if (pills) pills.innerHTML = [
    intPill("Jira", d.integrations.jira.connected, d.integrations.jira.tools + " tools"),
    intPill("Confluence", d.integrations.confluence.connected, d.integrations.confluence.tools + " tools"),
    intPill("TomTom", d.integrations.tomtom.keySet, d.integrations.tomtom.keySet ? "active" : "no key"),
  ].join("");

  // Integration detail view
  updateIntStatus("jira", d.integrations.jira);
  updateIntStatus("confluence", d.integrations.confluence);
  document.getElementById("int-tom-status").innerHTML =
    `<span class="dot ${d.integrations.tomtom.keySet ? "green" : "red"}"></span>${d.integrations.tomtom.keySet ? "Active" : "No Key"}`;
}

function intPill(name, ok, meta) {
  return `<div class="int-pill" onclick="navigate('integrations')">
    <span class="dot ${ok ? "green" : "red"}"></span>
    <span>${name}</span>
    <span class="pill-meta">${meta}</span>
  </div>`;
}

function updateIntStatus(type, data) {
  const prefix = type === "confluence" ? "conf" : type;
  const statusEl = document.getElementById(`int-${prefix}-status`);
  const toolsEl = document.getElementById(`int-${prefix}-tools`);
  if (statusEl) statusEl.innerHTML = `<span class="dot ${data.connected ? "green" : "red"}"></span>${data.connected ? "Connected" : "Disconnected"}`;
  if (toolsEl) toolsEl.textContent = data.tools + " available";
}

function updateConfigUI(d) {
  document.getElementById("cfg-model").value = d.model;
  document.getElementById("cfg-tokens").value = d.maxTokens;
  document.getElementById("cfg-prompt").value = d.systemPrompt;
  document.getElementById("cfg-maxlen").value = d.maxMsgLen;
  updatePromptCounter();

  const pt = document.getElementById("progress-toggle");
  pt.classList.toggle("on", d.progressMessages);

  if (d.env) {
    const chatEl = document.getElementById("sec-chatid");
    if (chatEl) chatEl.textContent = d.env.MY_CHAT_ID || "****";
  }
}

function renderMessages(containerId, msgs, filter) {
  const el = document.getElementById(containerId);
  const filtered = filter && filter !== "all" ? msgs.filter((m) => m.direction === filter) : msgs;
  el.innerHTML = filtered.length === 0
    ? '<div class="msg-empty">No messages yet</div>'
    : filtered.map((m) => {
        const t = new Date(m.timestamp);
        const time = t.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const dir = m.direction === "in" ? "\u25B6" : "\u25C0";
        const cls = m.direction === "in" ? "in" : "out";
        return `<div class="msg-item">
          <span class="time">${time}</span>
          <span class="dir ${cls}">${dir}</span>
          <span class="text">${escapeHtml(m.text.slice(0, 200))}${m.text.length > 200 ? "\u2026" : ""}</span>
        </div>`;
      }).join("");
}

function renderRecentMessages(msgs) {
  renderMessages("recent-msgs", msgs.slice(0, 8), "all");
}

// --- Actions ---
async function saveConfig() {
  const body = {
    model: document.getElementById("cfg-model").value,
    maxTokens: parseInt(document.getElementById("cfg-tokens").value),
    systemPrompt: document.getElementById("cfg-prompt").value,
    maxMsgLen: parseInt(document.getElementById("cfg-maxlen").value),
    progressMessages: document.getElementById("progress-toggle").classList.contains("on"),
  };
  const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  toast(d.ok ? "Config saved" : "Error: " + d.error, d.ok);
}

// --- Credentials (write-only) ---
const CRED_META = {
  ZALO_BOT_TOKEN: { label: "Zalo Bot Token", group: "Zalo" },
  ANTHROPIC_API_KEY: { label: "Anthropic API Key", group: "Claude" },
};

async function loadCredentials() {
  try {
    const res = await fetch("/api/secrets");
    const data = await res.json();
    renderCredentials(data);
    updateIntCredentials(data);
  } catch (e) {
    console.error("Credentials fetch failed:", e);
  }
}

function renderCredentials(data) {
  const list = document.getElementById("cred-list");
  if (!list) return;
  const header = "";
  const rows = Object.entries(CRED_META).map(([key, meta]) => {
    const info = data[key] || { set: false };
    const isSet = info.set;
    const masked = info.value || info.masked || "";
    return `<div class="cred-row">
      <div class="cred-row-dot"><span class="dot ${isSet ? "green" : "gray"}"></span></div>
      <div class="cred-row-info">
        <div class="cred-row-label">${meta.label}</div>
      </div>
      <div class="cred-row-value">${isSet ? masked : '--'}</div>
      <div class="cred-row-action">
        ${isSet
          ? `<button class="btn-icon danger" onclick="removeSecret('${key}','${meta.label}')" title="Remove">&#x2715;</button>`
          : `<button class="btn-icon success" onclick="showSetSecret('${key}','${meta.label}')" title="Set">+</button>`}
      </div>
    </div>`;
  }).join("");
  list.innerHTML = header + rows;
}

function showSetSecret(key, label) {
  document.getElementById("secret-modal").style.display = "flex";
  document.getElementById("secret-modal-title").textContent = "Set " + label;
  document.getElementById("secret-key").value = key;
  document.getElementById("secret-label").textContent = label;
  document.getElementById("secret-value").value = "";
  setTimeout(() => document.getElementById("secret-value").focus(), 100);
}

function closeSecretModal() {
  document.getElementById("secret-modal").style.display = "none";
}

async function saveSecret() {
  const key = document.getElementById("secret-key").value;
  const value = document.getElementById("secret-value").value;
  if (!value.trim()) return toast("Value cannot be empty", false);
  const res = await fetch(`/api/secrets/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  const d = await res.json();
  if (d.ok) {
    toast("Saved. Restart bot for changes to take effect.", true);
    closeSecretModal();
    loadCredentials();
  } else {
    toast(d.error || "Save failed", false);
  }
}

async function removeSecret(key, label) {
  if (!confirm(`Remove ${label}? The bot may stop working without it.`)) return;
  const res = await fetch(`/api/secrets/${key}`, { method: "DELETE" });
  const d = await res.json();
  toast(d.ok ? `${label} removed` : (d.error || "Failed"), d.ok);
  loadCredentials();
}

async function testInt(type) {
  toast("Testing " + type + "...", true);
  const res = await fetch("/api/integrations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
  const d = await res.json();
  toast(d.ok ? `${type}: connected (${d.tools || ""} tools)` : `${type}: connection failed`, d.ok);
}

function toggleProgress() {
  document.getElementById("progress-toggle").classList.toggle("on");
}

function resetPrompt() {
  const def = "Ban la Tom The Lizard, tro ly ca nhan cua Brian, PM tai VNG Games. Jira projects: NP (Level Up), PLH (Player Hub), VGA (VNGGames Account), VGR (VNGGames Club). Tra loi bang tieng Viet. Ngan gon, thuc te, dung chat style. Neu can truy van Jira, dung MCP tools co san. Gioi han tra loi duoi 1800 ky tu vi day la Zalo chat.";
  document.getElementById("cfg-prompt").value = def;
  updatePromptCounter();
}

function updatePromptCounter() {
  const len = document.getElementById("cfg-prompt").value.length;
  document.getElementById("prompt-counter").textContent = `${len} / 2000`;
}

document.getElementById("cfg-prompt")?.addEventListener("input", updatePromptCounter);

async function restartBot() {
  if (!confirm("Restart Tom? Active sessions will be lost.")) return;
  toast("Restarting...", true);
  try {
    await fetch("/api/restart", { method: "POST" });
  } catch {}
}

// --- Scheduler ---
let currentRecurrence = "weekdays";
let selectedDays = [];

// Populate time selectors
(function initTimePickers() {
  const h = document.getElementById("task-hour");
  const m = document.getElementById("task-minute");
  const md = document.getElementById("task-monthday");
  if (!h) return;
  for (let i = 0; i < 24; i++) h.options.add(new Option(String(i).padStart(2, "0"), i));
  for (let i = 0; i < 60; i += 5) m.options.add(new Option(String(i).padStart(2, "0"), i));
  for (let i = 1; i <= 28; i++) md.options.add(new Option(i, i));
  h.value = 8; m.value = 30;
})();

function setRecurrence(type) {
  currentRecurrence = type;
  document.querySelectorAll(".rec-pill").forEach((p) => p.classList.toggle("active", p.dataset.rec === type));
  document.getElementById("day-picker-group").style.display = type === "weekly" ? "block" : "none";
  document.getElementById("monthly-picker-group").style.display = type === "monthly" ? "block" : "none";
  document.getElementById("once-date-group").style.display = type === "once" ? "block" : "none";
}

function toggleDay(btn) {
  btn.classList.toggle("active");
  selectedDays = [...document.querySelectorAll(".day-btn.active")].map((b) => b.dataset.day);
}

function buildCron() {
  const hour = document.getElementById("task-hour").value;
  const minute = document.getElementById("task-minute").value;
  switch (currentRecurrence) {
    case "daily": return `${minute} ${hour} * * *`;
    case "weekdays": return `${minute} ${hour} * * 1-5`;
    case "weekly":
      const days = selectedDays.length > 0 ? selectedDays.join(",") : "1";
      return `${minute} ${hour} * * ${days}`;
    case "monthly":
      const dom = document.getElementById("task-monthday").value;
      return `${minute} ${hour} ${dom} * *`;
    case "once": return `${minute} ${hour} * * *`;
    default: return `${minute} ${hour} * * *`;
  }
}

function describeCron(cron, recurrence) {
  const [min, hr] = cron.split(" ");
  const t = `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (recurrence || guessRecurrence(cron)) {
    case "daily": return `Every day at ${t}`;
    case "weekdays": return `Weekdays at ${t}`;
    case "weekly": {
      const days = cron.split(" ")[4].split(",").map((d) => dayNames[d] || d).join(", ");
      return `${days} at ${t}`;
    }
    case "monthly": return `Day ${cron.split(" ")[2]} monthly at ${t}`;
    case "once": return `Once at ${t}`;
    default: return `${t} (${cron})`;
  }
}

function guessRecurrence(cron) {
  const parts = cron.split(" ");
  if (parts[4] === "1-5") return "weekdays";
  if (parts[4] === "*" && parts[2] === "*") return "daily";
  if (parts[2] !== "*") return "monthly";
  if (parts[4] !== "*") return "weekly";
  return "daily";
}

async function loadTasks() {
  const res = await fetch("/api/tasks");
  const tasks = await res.json();
  const list = document.getElementById("task-list");
  if (!list) return;
  if (tasks.length === 0) {
    list.innerHTML = '<div class="card"><div class="msg-empty">No scheduled tasks yet</div></div>';
    return;
  }
  list.innerHTML = tasks.map((t) => {
    const desc = describeCron(t.cron, t.recurrence);
    const descText = t.description ? escapeHtml(t.description.slice(0, 60)) + (t.description.length > 60 ? "..." : "") : "";
    return `<div class="task-card ${t.enabled ? "" : "disabled"}" onclick="editTask('${t.id}')">
      <span class="toggle task-toggle ${t.enabled ? "on" : ""}" onclick="event.stopPropagation();quickToggle('${t.id}',${!t.enabled})"></span>
      <div class="task-info">
        <div class="task-name">${escapeHtml(t.name)}</div>
        <div class="task-schedule">${desc}${descText ? " &middot; " + descText : ""}</div>
      </div>
      <div class="task-meta">
        <div class="task-last">${t.lastRun ? "ran " + timeSince(t.lastRun) : "never run"}</div>
        <button class="task-run-btn" onclick="event.stopPropagation();runTask('${t.id}')">Run Now</button>
      </div>
    </div>`;
  }).join("");
}

async function quickToggle(id, enabled) {
  await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  loadTasks();
}

function showAddTask() {
  document.getElementById("task-modal").style.display = "flex";
  document.getElementById("task-modal-title").textContent = "New Task";
  document.getElementById("task-edit-id").value = "";
  document.getElementById("task-description").value = "";
  document.getElementById("task-name").value = "";
  document.getElementById("task-hour").value = 8;
  document.getElementById("task-minute").value = 30;
  document.getElementById("task-enabled-toggle").classList.add("on");
  document.getElementById("task-delete-btn").style.display = "none";
  document.getElementById("task-save-btn").disabled = false;
  document.getElementById("task-save-btn").textContent = "Save";
  document.getElementById("task-status").style.display = "none";
  setRecurrence("weekdays");
  selectedDays = [];
  document.querySelectorAll(".day-btn").forEach((b) => b.classList.remove("active"));
}

async function editTask(id) {
  const res = await fetch("/api/tasks");
  const tasks = await res.json();
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  document.getElementById("task-modal").style.display = "flex";
  document.getElementById("task-modal-title").textContent = "Edit Task";
  document.getElementById("task-edit-id").value = t.id;
  document.getElementById("task-name").value = t.name;
  document.getElementById("task-description").value = t.description || "";
  document.getElementById("task-save-btn").disabled = false;
  document.getElementById("task-save-btn").textContent = "Save";
  document.getElementById("task-status").style.display = "none";

  // Parse cron to set time + recurrence
  const parts = t.cron.split(" ");
  document.getElementById("task-minute").value = parseInt(parts[0]);
  document.getElementById("task-hour").value = parseInt(parts[1]);

  const rec = t.recurrence || guessRecurrence(t.cron);
  setRecurrence(rec);

  if (rec === "weekly" && parts[4] !== "*") {
    selectedDays = parts[4].split(",");
    document.querySelectorAll(".day-btn").forEach((b) => {
      b.classList.toggle("active", selectedDays.includes(b.dataset.day));
    });
  }
  if (rec === "monthly" && parts[2] !== "*") {
    document.getElementById("task-monthday").value = parts[2];
  }

  document.getElementById("task-enabled-toggle").classList.toggle("on", t.enabled);
  document.getElementById("task-delete-btn").style.display = "inline-block";
}

function closeTaskModal() {
  document.getElementById("task-modal").style.display = "none";
}

async function saveTask() {
  const id = document.getElementById("task-edit-id").value;
  const description = document.getElementById("task-description").value.trim();
  const name = document.getElementById("task-name").value.trim() || description.slice(0, 40);

  if (!description) return toast("Please describe what this task should do", false);

  // Show generating state
  const btn = document.getElementById("task-save-btn");
  const status = document.getElementById("task-status");
  btn.disabled = true;
  btn.textContent = "Generating...";
  status.style.display = "block";
  status.textContent = "AI is writing the script for this task...";

  const body = {
    name,
    description,
    cron: buildCron(),
    recurrence: currentRecurrence,
    enabled: document.getElementById("task-enabled-toggle").classList.contains("on"),
  };

  try {
    const url = id ? `/api/tasks/${id}` : "/api/tasks";
    const method = id ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (d.ok) {
      toast("Task saved! Script generated.", true);
      closeTaskModal();
      loadTasks();
    } else {
      status.textContent = "Error: " + (d.error || "Failed");
      toast(d.error || "Failed to save", false);
    }
  } catch (e) {
    status.textContent = "Error: " + e.message;
    toast("Network error", false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
}

async function deleteTaskUI() {
  const id = document.getElementById("task-edit-id").value;
  if (!id || !confirm("Delete this task?")) return;
  const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  const d = await res.json();
  toast(d.ok ? "Deleted" : d.error, d.ok);
  closeTaskModal();
  loadTasks();
}

async function runTask(id) {
  toast("Running task...", true);
  const res = await fetch(`/api/tasks/${id}/run`, { method: "POST" });
  const d = await res.json();
  toast(d.ok ? "Task completed" : d.error, d.ok);
  loadTasks();
}

// --- SSE ---
function connectSSE() {
  const es = new EventSource("/api/events");
  es.onopen = () => console.log("SSE connected");
  es.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    allMessages.unshift(msg);
    const filter = document.getElementById("msg-filter")?.value || "all";
    renderMessages("all-msgs", allMessages, filter);
    renderRecentMessages(allMessages);
  });
  es.addEventListener("status", (e) => {
    updateStatusUI(JSON.parse(e.data));
  });
  es.onerror = () => setTimeout(() => connectSSE(), 5000);
}

// --- Helpers ---
function timeSince(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

function escapeHtml(t) {
  if (!t) return "";
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toast(msg, ok = true) {
  const el = document.createElement("div");
  el.className = "toast " + (ok ? "ok" : "err");
  el.innerHTML = `<span class="dot ${ok ? "green" : "red"}"></span>${escapeHtml(msg)}`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, 2500);
}

// --- Vocabulary ---
let vocabConfig = { categories: [] };

async function loadVocabConfig() {
  try {
    const res = await fetch("/api/word-config");
    vocabConfig = await res.json();
    renderVocabCategories();
  } catch (e) {
    console.error("Vocab config fetch failed:", e);
  }
}

function renderVocabCategories() {
  const el = document.getElementById("vocab-categories");
  if (!el) return;
  el.innerHTML = vocabConfig.categories.map((c, i) => `
    <span class="vocab-chip ${c.enabled ? "active" : ""}" onclick="toggleVocabCategory(${i})">
      ${escapeHtml(c.name)}
      <span class="chip-x" onclick="event.stopPropagation();removeVocabCategory(${i})">&#x2715;</span>
    </span>
  `).join("");
}

async function toggleVocabCategory(idx) {
  vocabConfig.categories[idx].enabled = !vocabConfig.categories[idx].enabled;
  renderVocabCategories();
  await saveVocabConfig();
}

async function removeVocabCategory(idx) {
  vocabConfig.categories.splice(idx, 1);
  renderVocabCategories();
  await saveVocabConfig();
}

async function addVocabCategory() {
  const input = document.getElementById("vocab-new-cat");
  const name = input.value.trim();
  if (!name) return;
  vocabConfig.categories.push({ name, enabled: true });
  input.value = "";
  renderVocabCategories();
  await saveVocabConfig();
}

async function saveVocabConfig() {
  await fetch("/api/word-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categories: vocabConfig.categories }),
  });
}

// --- Places ---
let placesData = { home: null, work: null, custom: [] };
let searchTimer = null;
let selectedResult = null;

async function loadPlaces() {
  try {
    const res = await fetch("/api/places");
    placesData = await res.json();
    renderPlaces();
  } catch (e) {
    console.error("Places fetch failed:", e);
  }
}

function renderPlaces() {
  const routeLabel = document.getElementById("int-tom-route");

  // Home slot
  const homeNameEl = document.getElementById("slot-home-name");
  const homeAddrEl = document.getElementById("slot-home-addr");
  if (homeNameEl && placesData.home) {
    homeNameEl.textContent = placesData.home.name;
    homeAddrEl.textContent = placesData.home.address || placesData.home.coords;
  }

  // Work slot
  const workNameEl = document.getElementById("slot-work-name");
  const workAddrEl = document.getElementById("slot-work-addr");
  if (workNameEl && placesData.work) {
    workNameEl.textContent = placesData.work.name;
    workAddrEl.textContent = placesData.work.address || placesData.work.coords;
  }

  // Route label
  if (routeLabel && placesData.home && placesData.work) {
    routeLabel.textContent = `${placesData.home.name} \u2194 ${placesData.work.name}`;
  }

  // Custom places
  const customList = document.getElementById("custom-places-list");
  if (customList) {
    customList.innerHTML = placesData.custom.length === 0
      ? '<div class="hint" style="margin:0">No custom places yet</div>'
      : placesData.custom.map((p, i) => `
        <div class="custom-place-item">
          <span class="cp-label">${escapeHtml(p.label)}</span>
          <span class="cp-name">${escapeHtml(p.name)}</span>
          <span class="cp-coords">${p.coords}</span>
          <button class="btn-icon danger" onclick="deleteCustomPlace(${i})" title="Remove">&#x2715;</button>
        </div>
      `).join("");
  }
}

// --- Place Search Modal ---
function showPlaceSearch(slot, editIdx) {
  selectedResult = null;
  document.getElementById("place-search-modal").style.display = "flex";
  document.getElementById("ps-slot").value = slot;
  document.getElementById("ps-edit-idx").value = editIdx !== undefined ? editIdx : "";
  document.getElementById("ps-query").value = "";
  document.getElementById("ps-results").innerHTML = '<div class="hint" style="margin:8px 0">Type to search for a location</div>';
  document.getElementById("ps-selected").style.display = "none";
  document.getElementById("ps-save-btn").disabled = true;
  document.getElementById("ps-manual").style.display = "none";
  document.getElementById("ps-manual-name").value = "";
  document.getElementById("ps-manual-coords").value = "";

  const isCustom = slot === "custom";
  document.getElementById("ps-label-group").style.display = isCustom ? "block" : "none";
  document.getElementById("ps-label").value = "";

  const titles = { home: "Set Home Location", work: "Set Work Location", custom: "Add Place" };
  document.getElementById("ps-title").textContent = titles[slot] || "Set Location";

  setTimeout(() => document.getElementById("ps-query").focus(), 100);
}

function closePlaceSearch() {
  document.getElementById("place-search-modal").style.display = "none";
}

function debouncePlaceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doPlaceSearch, 400);
}

async function doPlaceSearch() {
  const q = document.getElementById("ps-query").value.trim();
  if (q.length < 2) return;

  document.getElementById("ps-spinner").style.display = "block";
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const container = document.getElementById("ps-results");

    if (!data.results || data.results.length === 0) {
      container.innerHTML = '';
      document.getElementById("ps-manual").style.display = "block";
      document.getElementById("ps-save-btn").disabled = false;
      return;
    }

    document.getElementById("ps-manual").style.display = data.results.length === 0 ? "block" : "none";
    if (data.results.length === 0) {
      document.getElementById("ps-save-btn").disabled = false;
    }

    container.innerHTML = data.results.map((r, i) => `
      <div class="search-result-item" onclick="selectSearchResult(${i})" data-idx="${i}">
        <div class="sr-name">${escapeHtml(r.name)}</div>
        <div class="sr-addr">${escapeHtml(r.address)} &middot; ${r.coords}</div>
      </div>
    `).join("");

    // Store results for selection
    container.dataset.results = JSON.stringify(data.results);
  } catch (e) {
    document.getElementById("ps-results").innerHTML = `<div class="hint" style="color:var(--danger)">Search failed: ${escapeHtml(e.message)}</div>`;
  } finally {
    document.getElementById("ps-spinner").style.display = "none";
  }
}

function selectSearchResult(idx) {
  const container = document.getElementById("ps-results");
  const results = JSON.parse(container.dataset.results || "[]");
  selectedResult = results[idx];
  if (!selectedResult) return;

  // Highlight selection
  container.querySelectorAll(".search-result-item").forEach((el, i) => {
    el.classList.toggle("selected", i === idx);
  });

  // Show selected
  document.getElementById("ps-selected").style.display = "block";
  document.getElementById("ps-sel-name").textContent = selectedResult.name;
  document.getElementById("ps-sel-addr").textContent = selectedResult.address;
  document.getElementById("ps-sel-coords").textContent = selectedResult.coords;
  document.getElementById("ps-save-btn").disabled = false;
}

async function confirmPlaceSearch() {
  // Check manual input if no search result selected
  if (!selectedResult) {
    const manualName = document.getElementById("ps-manual-name").value.trim();
    const manualCoords = document.getElementById("ps-manual-coords").value.trim().replace(/\s/g, "");
    if (!manualName || !manualCoords) return toast("Enter name and coordinates", false);
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(manualCoords)) return toast("Coordinates format: lat,lng", false);
    selectedResult = { name: manualName, coords: manualCoords, address: manualName };
  }

  const slot = document.getElementById("ps-slot").value;
  const body = {
    name: selectedResult.name,
    coords: selectedResult.coords,
    address: selectedResult.address,
  };

  let res;
  if (slot === "home" || slot === "work") {
    res = await fetch(`/api/places/${slot}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    const label = document.getElementById("ps-label").value.trim();
    if (!label) return toast("Please enter a label for this place", false);
    body.label = label;
    res = await fetch("/api/places/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const d = await res.json();
  if (d.ok) {
    placesData = d.data;
    renderPlaces();
    closePlaceSearch();
    toast(`${slot === "custom" ? "Place" : slot.charAt(0).toUpperCase() + slot.slice(1)} set to ${selectedResult.name}`, true);
  } else {
    toast(d.error || "Failed", false);
  }
}

async function deleteCustomPlace(idx) {
  if (!confirm("Remove this place?")) return;
  const res = await fetch(`/api/places/custom/${idx}`, { method: "DELETE" });
  const d = await res.json();
  if (d.ok) {
    placesData = d.data;
    renderPlaces();
    toast("Place removed", true);
  }
}

// --- Theme ---
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  document.getElementById("theme-icon").innerHTML = next === "light" ? "&#x2600;" : "&#x263E;";
  localStorage.setItem("lobster-theme", next);
}

(function initTheme() {
  const saved = localStorage.getItem("lobster-theme");
  if (saved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    const icon = document.getElementById("theme-icon");
    if (icon) icon.innerHTML = "&#x2600;";
  }
})();

// --- Integration Panels ---
function toggleServicePanel(svc) {
  const panel = document.getElementById("panel-" + svc);
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function updateIntCredentials(data) {
  // Jira email
  const emailEl = document.getElementById("int-jira-email");
  if (emailEl && data.JIRA_EMAIL) {
    emailEl.textContent = data.JIRA_EMAIL.set ? (data.JIRA_EMAIL.value || data.JIRA_EMAIL.masked) : "not set";
  }
  // Jira token
  const tokenEl = document.getElementById("int-jira-token");
  if (tokenEl && data.JIRA_API_TOKEN) {
    tokenEl.textContent = data.JIRA_API_TOKEN.set ? data.JIRA_API_TOKEN.masked : "not set";
  }
  // Jira base URL
  const urlEl = document.getElementById("int-jira-url");
  if (urlEl && data.JIRA_BASE_URL) {
    urlEl.textContent = data.JIRA_BASE_URL.set ? data.JIRA_BASE_URL.value : "not set";
  }
  // TomTom key
  const tomEl = document.getElementById("int-tom-key");
  const tomBtn = document.getElementById("int-tom-key-btn");
  if (tomEl && data.TOMTOM_API_KEY) {
    tomEl.textContent = data.TOMTOM_API_KEY.set ? data.TOMTOM_API_KEY.masked : "";
    if (tomBtn) {
      tomBtn.textContent = data.TOMTOM_API_KEY.set ? "Remove" : "Add";
      tomBtn.className = data.TOMTOM_API_KEY.set ? "btn btn-sm danger" : "btn btn-sm";
      tomBtn.onclick = data.TOMTOM_API_KEY.set
        ? () => removeSecret("TOMTOM_API_KEY", "TomTom API Key")
        : () => showSetSecret("TOMTOM_API_KEY", "TomTom API Key");
    }
  }
}

// --- Atlassian Modal ---
function openAtlassianModal() {
  const modal = document.getElementById("atlassian-modal");
  modal.style.display = "flex";
  // Pre-fill current values
  const emailEl = document.getElementById("int-jira-email");
  const urlEl = document.getElementById("int-jira-url");
  const tokenEl = document.getElementById("int-jira-token");
  const getText = (el) => (el && el.textContent !== "not set" && el.textContent !== "--") ? el.textContent : "";
  document.getElementById("atl-email").value = getText(emailEl);
  const maskedToken = getText(tokenEl);
  const tokenInput = document.getElementById("atl-token");
  tokenInput.value = maskedToken;
  tokenInput.placeholder = "Atlassian API token";
  tokenInput.dataset.existing = maskedToken ? "1" : "";
  tokenInput.dataset.masked = maskedToken;
  document.getElementById("atl-url").value = getText(urlEl);
  // Reset test result
  const result = document.getElementById("atl-test-result");
  result.style.display = "none";
  result.textContent = "";
  updateAtlTestBtn();
  setTimeout(() => document.getElementById("atl-email").focus(), 100);
}

function closeAtlassianModal() {
  document.getElementById("atlassian-modal").style.display = "none";
}

function onAtlTokenFocus() {
  const input = document.getElementById("atl-token");
  if (input.dataset.masked && input.value === input.dataset.masked) {
    input.select();
  }
}

function onAtlTokenInput() {
  const input = document.getElementById("atl-token");
  if (input.dataset.masked && input.value !== input.dataset.masked) {
    input.type = "password";
    input.dataset.masked = "";
  }
  updateAtlTestBtn();
}

function updateAtlTestBtn() {
  const email = document.getElementById("atl-email").value.trim();
  const tokenInput = document.getElementById("atl-token");
  const hasToken = tokenInput.value.trim() || tokenInput.dataset.existing;
  const url = document.getElementById("atl-url").value.trim();
  const btn = document.getElementById("atl-test-btn");
  const allFilled = email && hasToken && url;
  btn.disabled = !allFilled;
  btn.style.opacity = allFilled ? "1" : "0.5";
}

async function testAtlassian() {
  const btn = document.getElementById("atl-test-btn");
  const result = document.getElementById("atl-test-result");
  btn.disabled = true;
  btn.textContent = "Testing...";
  result.style.display = "block";
  result.style.background = "var(--card-bg)";
  result.style.color = "var(--text-muted)";
  result.textContent = "Saving credentials and testing connection...";

  // Save credentials first
  const email = document.getElementById("atl-email").value.trim();
  const tokenInput = document.getElementById("atl-token");
  const token = tokenInput.value.trim();
  const isNewToken = token && token !== tokenInput.dataset.masked;
  const url = document.getElementById("atl-url").value.trim();
  const h = { "Content-Type": "application/json" };
  if (email) await fetch("/api/secrets/JIRA_EMAIL", { method: "POST", headers: h, body: JSON.stringify({ value: email }) });
  if (isNewToken) await fetch("/api/secrets/JIRA_API_TOKEN", { method: "POST", headers: h, body: JSON.stringify({ value: token }) });
  if (url) await fetch("/api/secrets/JIRA_BASE_URL", { method: "POST", headers: h, body: JSON.stringify({ value: url }) });

  // Reconnect Jira in-process (no restart)
  try {
    const res = await fetch("/api/integrations/reconnect", { method: "POST", headers: h });
    const d = await res.json();
    if (d.ok) {
      result.style.background = "rgba(34,197,94,0.15)";
      result.style.color = "#4ade80";
      result.textContent = "Connected — Jira: " + d.tools + " tools";
    } else {
      result.style.background = "rgba(239,68,68,0.15)";
      result.style.color = "#f87171";
      result.textContent = "Connection failed" + (d.error ? " — " + d.error : "") + ". Check your credentials.";
    }
  } catch (e) {
    result.style.background = "rgba(239,68,68,0.15)";
    result.style.color = "#f87171";
    result.textContent = "Connection failed — " + e.message;
  }

  btn.textContent = "Test Connection";
  updateAtlTestBtn();
  loadCredentials();
}

async function saveAtlassian() {
  const email = document.getElementById("atl-email").value.trim();
  const tokenInput = document.getElementById("atl-token");
  const token = tokenInput.value.trim();
  const isNewToken = token && token !== tokenInput.dataset.masked;
  const url = document.getElementById("atl-url").value.trim();
  let saved = 0;
  const h = { "Content-Type": "application/json" };
  if (email) {
    const r = await fetch("/api/secrets/JIRA_EMAIL", { method: "POST", headers: h, body: JSON.stringify({ value: email }) });
    if ((await r.json()).ok) saved++;
  }
  if (isNewToken) {
    const r = await fetch("/api/secrets/JIRA_API_TOKEN", { method: "POST", headers: h, body: JSON.stringify({ value: token }) });
    if ((await r.json()).ok) saved++;
  }
  if (url) {
    const r = await fetch("/api/secrets/JIRA_BASE_URL", { method: "POST", headers: h, body: JSON.stringify({ value: url }) });
    if ((await r.json()).ok) saved++;
  }
  if (saved > 0) {
    toast("Saved. Restart bot for changes to take effect.", true);
    closeAtlassianModal();
    loadCredentials();
  } else {
    toast("Nothing to save — fill in at least one field.", false);
  }
}

// --- Onboarding ---
let obCurrentStep = 0;

async function checkOnboarding() {
  try {
    const res = await fetch("/api/onboarding-status");
    const data = await res.json();
    if (data.needsOnboarding) {
      document.getElementById("onboarding").style.display = "flex";
      return true;
    }
  } catch {}
  return false;
}

function obShowStep(step) {
  obCurrentStep = step;
  document.querySelectorAll(".ob-step").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(step === "done" ? "ob-step-done" : `ob-step-${step}`);
  if (el) el.classList.add("active");

  // Update dots
  document.querySelectorAll(".ob-dot").forEach((d, i) => {
    d.classList.remove("active", "done");
    if (step === "done" || i < step) d.classList.add("done");
    else if (i === step) d.classList.add("active");
  });
}

async function obSaveSecret(key, value) {
  const res = await fetch(`/api/secrets/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  return (await res.json()).ok;
}

async function obNext(step) {
  if (step === 0) {
    const val = document.getElementById("ob-zalo").value.trim();
    if (!val) return obShowError("ob-zalo", "Token is required");
    if (!(await obSaveSecret("ZALO_BOT_TOKEN", val))) return;
    obShowStep(1);
  } else if (step === 1) {
    const val = document.getElementById("ob-anthropic").value.trim();
    if (!val) return obShowError("ob-anthropic", "API key is required");
    if (!(await obSaveSecret("ANTHROPIC_API_KEY", val))) return;
    obShowStep(2);
  } else if (step === 2) {
    obShowStep(3);
  }
}

function obBack(step) {
  obShowStep(step - 1);
}

function obSkip(step) {
  if (step === 2) obShowStep(3);
  else if (step === 3) obShowStep("done");
}

async function obFinish() {
  const email = document.getElementById("ob-jira-email").value.trim();
  const token = document.getElementById("ob-jira-token").value.trim();
  const url = document.getElementById("ob-jira-url").value.trim();

  if (email) await obSaveSecret("JIRA_EMAIL", email);
  if (token) await obSaveSecret("JIRA_API_TOKEN", token);
  if (url) await obSaveSecret("JIRA_BASE_URL", url);

  obShowStep("done");
}

function obClose() {
  document.getElementById("onboarding").style.display = "none";
  localStorage.setItem("tom-onboarding-done", "1");
  // Reload data
  Promise.all([fetchStatus(), fetchConfig(), loadTasks(), loadCredentials(), loadPlaces(), loadVocabConfig()]);
}

function obShowError(inputId, msg) {
  const input = document.getElementById(inputId);
  let errEl = input.parentElement.querySelector(".ob-error");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "ob-error";
    input.parentElement.appendChild(errEl);
  }
  errEl.textContent = msg;
  input.style.borderColor = "var(--danger)";
  setTimeout(() => {
    errEl.remove();
    input.style.borderColor = "";
  }, 3000);
}

function obSearchPlace(slot) {
  // Reuse existing place search modal
  showPlaceSearch(slot);
  // Update onboarding display after selection
  const observer = new MutationObserver(() => {
    if (document.getElementById("place-search-modal").style.display === "none") {
      observer.disconnect();
      // Update onboarding place names
      if (placesData.home) document.getElementById("ob-home-name").textContent = placesData.home.name;
      if (placesData.work) document.getElementById("ob-work-name").textContent = placesData.work.name;
    }
  });
  observer.observe(document.getElementById("place-search-modal"), { attributes: true, attributeFilter: ["style"] });
}

// --- Init ---
(async function init() {
  const needsSetup = await checkOnboarding();
  if (needsSetup) return; // Don't load dashboard data until onboarding is done

  const hash = window.location.hash.slice(1);
  if (hash) navigate(hash);
  await Promise.all([fetchStatus(), fetchConfig(), loadTasks(), loadCredentials(), loadPlaces(), loadVocabConfig()]);
  const res = await fetch("/api/messages?limit=8");
  const d = await res.json();
  allMessages = d.messages;
  renderRecentMessages(allMessages);
  connectSSE();
})();
