// Resolve runtime data directory. Uses DATA_DIR env var if set, else ./data.
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SCRIPTS_DIR = path.join(DATA_DIR, "scripts");
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

function dataPath(filename) {
  return path.join(DATA_DIR, filename);
}

module.exports = { DATA_DIR, SCRIPTS_DIR, dataPath };
