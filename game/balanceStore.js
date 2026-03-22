const fs = require('fs');
const path = require('path');

const STARTING_CHIPS = 1000;
const DATA_PATH = path.join(__dirname, '..', 'data', 'balances.json');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function loadMap() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveMap(map) {
  const dir = path.dirname(DATA_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_PATH);
}

function getBalance(name) {
  const n = normalizeName(name);
  if (!n) return null;
  const map = loadMap();
  const v = map[n];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function getInitialChipsForName(name) {
  const b = getBalance(name);
  return b != null ? b : STARTING_CHIPS;
}

function persistPlayerBalance(name, chips) {
  const n = normalizeName(name);
  if (!n) return;
  const map = loadMap();
  map[n] = Math.max(0, Math.floor(Number(chips)));
  saveMap(map);
}

function persistBalancesForRoom(room) {
  if (!room || !room.players) return;
  const map = loadMap();
  for (const p of room.players) {
    const n = normalizeName(p.name);
    if (n) {
      map[n] = Math.max(0, Math.floor(Number(p.chips)));
    }
  }
  saveMap(map);
}

module.exports = {
  STARTING_CHIPS,
  normalizeName,
  getInitialChipsForName,
  persistPlayerBalance,
  persistBalancesForRoom,
};
