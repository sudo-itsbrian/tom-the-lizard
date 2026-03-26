// In-process task scheduler using cron. Tasks persist to tasks.json.
const { CronJob } = require("cron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const { dataPath, SCRIPTS_DIR, ROOT } = require("./data-dir");

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

      execFile("node", args, {
        timeout: 60_000,
        env: process.env,
      }, (err, stdout, stderr) => {
        task.lastResult = err ? `Error: ${err.message}` : "OK";
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

    execFile("node", args, {
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

module.exports = { initScheduler, getTasks, addTask, updateTask, deleteTask, runTaskNow };
