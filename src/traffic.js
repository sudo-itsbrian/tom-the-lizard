#!/usr/bin/env node
// Traffic check via TomTom Routing API.
// As module: require("./traffic").getTraffic("work"|"home")
// As CLI:    node src/traffic.js [work|home] [--send]
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { dataPath } = require("./data-dir");

function loadPlaces() {
  try {
    return JSON.parse(fs.readFileSync(dataPath("places.json"), "utf8"));
  } catch {
    return {
      home: { name: "Home", coords: "10.7277,106.7050", address: "Home" },
      work: { name: "Work", coords: "10.7416,106.7220", address: "Work" },
    };
  }
}

async function getTraffic(direction = "work") {
  const places = loadPlaces();
  const from = direction === "home" ? places.work : places.home;
  const to = direction === "home" ? places.home : places.work;

  const key = process.env.TOMTOM_API_KEY;
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/` +
    `${from.coords}:${to.coords}/json` +
    `?key=${key}&traffic=true&departAt=now&travelMode=car&computeTravelTimeFor=all`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`TomTom: ${data.error.description || JSON.stringify(data.error)}`);
  }

  const summary = data.routes[0].summary;
  const trafficMins = Math.round(summary.travelTimeInSeconds / 60);
  const delayMins = Math.round((summary.trafficDelayInSeconds || 0) / 60);
  const distKm = (summary.lengthInMeters / 1000).toFixed(1);
  const ratio = summary.travelTimeInSeconds / summary.noTrafficTravelTimeInSeconds;

  let statusEmoji = "\u2705";
  let statusText = "Giao th\u00f4ng th\u00f4ng tho\u00e1ng";
  if (ratio > 1.5) { statusEmoji = "\u26a0\ufe0f"; statusText = "C\u00f3 k\u1eb9t xe"; }
  else if (ratio > 1.2) { statusEmoji = "\ud83d\udfe1"; statusText = "\u0110\u00f4ng \u0111\u00fac nh\u1eb9"; }

  const mapsLink =
    "https://www.google.com/maps/dir/" +
    encodeURIComponent(from.address || from.name) + "/" +
    encodeURIComponent(to.address || to.name);

  const lines = [
    `\ud83d\ude97 TH\u00d4NG TIN GIAO TH\u00d4NG`,
    ``,
    `\ud83d\udccd T\u1eeb: ${from.name}`,
    `\ud83d\udccd \u0110\u1ebfn: ${to.name}`,
    ``,
    `\u23f1\ufe0f Th\u1eddi gian di chuy\u1ec3n: ${trafficMins} ph\u00fat`,
  ];
  if (delayMins > 0) {
    lines.push(`\ud83d\udea6 Ch\u1eadm tr\u1ec5 do giao th\u00f4ng: ${delayMins} ph\u00fat`);
  }
  lines.push(
    `\ud83d\udccf Kho\u1ea3ng c\u00e1ch: ${distKm} km`,
    `${statusEmoji} T\u00ecnh tr\u1ea1ng: ${statusText}`,
    ``,
    `\ud83d\uddfa\ufe0f Xem \u0111\u01b0\u1eddng \u0111i: ${mapsLink}`,
  );
  return lines.join("\n");
}

module.exports = { getTraffic };

// CLI mode: node src/traffic.js [work|home] [--send]
if (require.main === module) {
  const args = process.argv.slice(2);
  const direction = args.find((a) => !a.startsWith("-")) || "work";
  const shouldSend = args.includes("--send");

  require("dotenv").config({ path: dataPath(".env"), override: true });

  getTraffic(direction)
    .then(async (msg) => {
      console.log(msg);
      if (shouldSend) {
        const ZaloBot = require("node-zalo-bot");
        const bot = new ZaloBot(process.env.ZALO_BOT_TOKEN, {});
        await bot.sendMessage(process.env.MY_CHAT_ID, msg);
        console.log("\nSent to Zalo OK");
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed:", err.message);
      process.exit(1);
    });
}
