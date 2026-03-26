#!/usr/bin/env node
// Returns traffic info to stdout. Supports "work" (home->office) and "home" (office->home).
// Usage: node traffic-check-inline.js [work|home]
// env inherited from parent process, no dotenv needed
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// Load places from config, fallback to hardcoded defaults
let homePlace, workPlace;
try {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
  const cfg = JSON.parse(fs.readFileSync(path.join(dataDir, "places.json"), "utf8"));
  homePlace = cfg.home;
  workPlace = cfg.work;
} catch {
  homePlace = { name: "Scenic Valley 1", coords: "10.7277,106.7050", address: "Scenic Valley 1, Phu My Hung" };
  workPlace = { name: "VNG Z06", coords: "10.7416,106.7220", address: "VNG Campus Z06, Tan Thuan Dong" };
}

const direction = process.argv[2] || "work";
const fromPlace = direction === "home" ? workPlace : homePlace;
const toPlace = direction === "home" ? homePlace : workPlace;
const origin = fromPlace.coords;
const destination = toPlace.coords;
const originLabel = fromPlace.name;
const destLabel = toPlace.name;

async function getTraffic() {
  const key = process.env.TOMTOM_API_KEY;
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/` +
    `${origin}:${destination}/json` +
    `?key=${key}` +
    `&traffic=true` +
    `&departAt=now` +
    `&travelMode=car` +
    `&computeTravelTimeFor=all`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`TomTom: ${data.error.description || JSON.stringify(data.error)}`);
  }

  const summary = data.routes[0].summary;
  const normalMins = Math.round(summary.noTrafficTravelTimeInSeconds / 60);
  const trafficMins = Math.round(summary.travelTimeInSeconds / 60);
  const delaySecs = summary.trafficDelayInSeconds || 0;
  const delayMins = Math.round(delaySecs / 60);
  const distKm = (summary.lengthInMeters / 1000).toFixed(1);
  const ratio = summary.travelTimeInSeconds / summary.noTrafficTravelTimeInSeconds;

  let statusEmoji = "\u2705";
  let statusText = "Giao th\u00f4ng th\u00f4ng tho\u00e1ng";
  if (ratio > 1.5) { statusEmoji = "\u26a0\ufe0f"; statusText = "C\u00f3 k\u1eb9t xe"; }
  else if (ratio > 1.2) { statusEmoji = "\ud83d\udfe1"; statusText = "\u0110\u00f4ng \u0111\u00fac nh\u1eb9"; }

  const mapsLink =
    "https://www.google.com/maps/dir/" +
    encodeURIComponent(fromPlace.address || originLabel) +
    "/" +
    encodeURIComponent(toPlace.address || destLabel);

  const lines = [
    `\ud83d\ude97 TH\u00d4NG TIN GIAO TH\u00d4NG`,
    ``,
    `\ud83d\udccd T\u1eeb: ${originLabel}`,
    `\ud83d\udccd \u0110\u1ebfn: ${destLabel}`,
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

getTraffic()
  .then((msg) => {
    process.stdout.write(msg);
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write("Failed: " + err.message);
    process.exit(1);
  });
