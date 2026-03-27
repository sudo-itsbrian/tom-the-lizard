// In-process task scheduler using cron. Tasks persist to tasks.json.
const { CronJob } = require("cron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { dataPath, SCRIPTS_DIR, ROOT } = require("./data-dir");

const MAX_CONSECUTIVE_FAILURES = 3;

const TASKS_FILE = dataPath("tasks.json");
const jobs = new Map();
let tasks = [];

function loadTasks() {
  try {
    tasks = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
  } catch {
    tasks = [
      {
        id: "morning-traffic",
        name: "Morning Traffic",
        cron: "28 8 * * 1-5",
        script: "src/traffic.js --send",
        enabled: true,
        lastRun: null,
        lastResult: null,
      },
    ];
    saveTasks();
  }
}

function saveTasks() {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function resolveScript(script) {
  if (script.startsWith("scripts/")) {
    return path.join(SCRIPTS_DIR, path.basename(script));
  }
  return path.join(ROOT, script);
}

function startJob(task) {
  if (jobs.has(task.id)) {
    jobs.get(task.id).stop();
    jobs.delete(task.id);
  }

  if (!task.enabled) return;

  try {
    const job = new CronJob(task.cron, () => {
      console.log(`[scheduler] Running: ${task.name}`);
      task.lastRun = new Date().toISOString();

      const parts = task.script.split(/\s+/);
      const scriptPath = resolveScript(parts[0]);
      const args = [scriptPath, ...parts.slice(1)];

      execFile(process.execPath, args, {
        timeout: 60_000,
        env: process.env,
      }, (err, stdout, stderr) => {
        if (err) {
          task.lastResult = `Error: ${err.message}`;
          task.failCount = (task.failCount || 0) + 1;
          console.error(`[scheduler] ${task.name} failed (${task.failCount}/${MAX_CONSECUTIVE_FAILURES}): ${err.message}`);

          if (task.failCount >= MAX_CONSECUTIVE_FAILURES) {
            task.enabled = false;
            console.error(`[scheduler] ${task.name} disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
            if (jobs.has(task.id)) {
              jobs.get(task.id).stop();
              jobs.delete(task.id);
            }
            // Notify via Zalo if possible
            notifyTaskDisabled(task);
          }
        } else {
          task.lastResult = "OK";
          task.failCount = 0; // reset on success
        }
        saveTasks();
        console.log(`[scheduler] ${task.name}: ${task.lastResult}`);
      });
    }, null, true, "Asia/Ho_Chi_Minh");

    jobs.set(task.id, job);
    console.log(`[scheduler] Scheduled: ${task.name} (${task.cron})`);
  } catch (e) {
    console.error(`[scheduler] Invalid cron for ${task.name}:`, e.message);
  }
}

function initScheduler() {
  loadTasks();
  for (const task of tasks) {
    startJob(task);
  }
  console.log(`[scheduler] ${tasks.length} task(s) loaded`);
}

function getTasks() {
  return tasks.map((t) => ({
    ...t,
    nextRun: jobs.has(t.id) ? jobs.get(t.id).nextDate()?.toISO() : null,
  }));
}

function addTask({ name, cron, script, enabled = true, description, recurrence }) {
  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (tasks.find((t) => t.id === id)) throw new Error("Task ID already exists");
  const task = { id, name, cron, script, enabled, description: description || "", recurrence: recurrence || "", lastRun: null, lastResult: null };
  tasks.push(task);
  saveTasks();
  startJob(task);
  return task;
}

function updateTask(id, updates) {
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error("Task not found");
  Object.assign(task, updates);
  saveTasks();
  startJob(task);
  return task;
}

function deleteTask(id) {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error("Task not found");
  if (jobs.has(id)) {
    jobs.get(id).stop();
    jobs.delete(id);
  }
  tasks.splice(idx, 1);
  saveTasks();
}

function runTaskNow(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error("Task not found");
  task.lastRun = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const parts = task.script.split(/\s+/);
    const scriptPath = resolveScript(parts[0]);
    const args = [scriptPath, ...parts.slice(1)];

    execFile(process.execPath, args, {
      timeout: 60_000,
      env: process.env,
    }, (err, stdout) => {
      task.lastResult = err ? `Error: ${err.message}` : "OK";
      saveTasks();
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

function notifyTaskDisabled(task) {
  try {
    const ZaloBot = require("node-zalo-bot");
    const chatId = process.env.MY_CHAT_ID;
    const token = process.env.ZALO_BOT_TOKEN;
    if (!chatId || !token) return;
    const bot = new ZaloBot(token, {});
    const msg = [
      `\u26a0\ufe0f Task "${task.name}" \u0111\u00e3 b\u1ecb t\u1eaft t\u1ef1 \u0111\u1ed9ng`,
      `L\u00fd do: th\u1ea5t b\u1ea1i ${MAX_CONSECUTIVE_FAILURES} l\u1ea7n li\u00ean ti\u1ebfp`,
      `L\u1ed7i cu\u1ed1i: ${(task.lastResult || "").slice(0, 200)}`,
      "",
      "V\u00e0o dashboard \u0111\u1ec3 ki\u1ec3m tra v\u00e0 b\u1eadt l\u1ea1i.",
    ].join("\n");
    bot.sendMessage(chatId, msg).catch(() => {});
  } catch {}
}

module.exports = { initScheduler, getTasks, addTask, updateTask, deleteTask, runTaskNow };
