const fs = require('fs');
const path = require('path');

function normalizeShield(shield) {
  if (!shield || typeof shield !== 'object') return null;
  if (shield.type === 'full') {
  // Legacy 'full' -> treat as bilateral with same value front/back
  const val = Math.max(0, Math.min(4, Number(shield.value)||0));
  return { type: 'bilateral', front: val, back: val };
  }
  if (shield.type === 'bilateral') {
  const front = Math.max(0, Math.min(4, Number(shield.front)||0));
  const back = Math.max(0, Math.min(4, Number(shield.back)||0));
  return { type: 'bilateral', front, back };
  }
  if (shield.type === 'directional') {
  // Accept new front/back plus legacy up/down for backward compatibility
  const frontRaw = shield.front != null ? shield.front : shield.up;
  const backRaw = shield.back != null ? shield.back : shield.down;
  const front = Math.max(0, Math.min(4, Number(frontRaw)||0));
  const back = Math.max(0, Math.min(4, Number(backRaw)||0));
  const left = Math.max(0, Math.min(4, Number(shield.left)||0));
  const right = Math.max(0, Math.min(4, Number(shield.right)||0));
  return { type: 'directional', front, back, left, right };
  }
  return null;
}

// In‑memory authoritative state (single process for now)
class BattleState {
  constructor() {
  // Map dimensions halved (was 16000x12000) to reduce overall size
  this.mapWidth = 8000; // px logical space
  this.mapHeight = 6000;
    this.ships = new Map(); // id -> ship
    this.lastAttackId = 0;
  this._idCounter = 1; // will be bumped after loading existing ships
  // Unified history stack (LIFO) containing last 10 reversible events:
  //  - move:   { type:'move', id, from:{x,y}, to:{x,y} }
  //  - speed:  { type:'speed', id, from:number, to:number }
  //  - damage: { type:'damage', id, from:number, to:number }
  this.history = [];
  this.maxHistory = 10;
  }

  loadInitialShips(filePath) {
    const abs = path.resolve(filePath);
    const raw = fs.readFileSync(abs, 'utf-8');
    const arr = JSON.parse(raw);
    arr.forEach(s => {
      const shield = normalizeShield(s.shield);
      const silhouette = clampSilhouette(s.silhouette);
      const heading = clampHeading(s.heading);
      const hideFromViewer = s.hideFromViewer !== undefined ? !!s.hideFromViewer : true; // default true
      const strain = Number.isFinite(Number(s.strain)) ? Number(s.strain) : 0;
      const maxStrain = Number.isFinite(Number(s.maxStrain)) ? Number(s.maxStrain) : 0;
      const showStrain = !!s.showStrain;
      this.ships.set(s.id, { speed: 0, showHp: false, showSpeed: false, showShield: false, showStrain: false, strain, maxStrain, showStrain, silhouette, heading, hideFromViewer, ...s, shield });
    });
    // Initialize id counter above any existing S-prefixed numeric ids
    let maxNum = 0;
    for (const id of this.ships.keys()) {
      const m = /^S(\d+)$/.exec(id);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    this._idCounter = maxNum + 1;
  }

  getState() {
    return {
      map: { width: this.mapWidth, height: this.mapHeight },
      ships: Array.from(this.ships.values())
    };
  }

  moveShip(id, x, y) {
    const ship = this.ships.get(id);
    if (!ship) return null;
    const clampedX = Math.max(0, Math.min(this.mapWidth, x));
    const clampedY = Math.max(0, Math.min(this.mapHeight, y));
    const from = { x: ship.x, y: ship.y };
    ship.x = clampedX;
    ship.y = clampedY;
    const to = { x: ship.x, y: ship.y };
    if (from.x !== to.x || from.y !== to.y) {
      this._pushHistory({ type: 'move', id, from, to });
    }
    return { ...ship };
  }

  undoMove() { // reuses button/event name; now undoes last history entry of any supported type
    const entry = this.history.pop();
    if (!entry) return null;
    const ship = this.ships.get(entry.id);
    if (!ship) return null;
    if (entry.type === 'move') {
      ship.x = entry.from.x;
      ship.y = entry.from.y;
    } else if (entry.type === 'speed') {
      ship.speed = entry.from;
    } else if (entry.type === 'damage') {
      ship.hp = entry.from;
      if (ship.hp > ship.maxHp) ship.hp = ship.maxHp;
    }
    return { ...ship };
  }

  attack(attackerId, targetId) {
    const attacker = this.ships.get(attackerId);
    const target = this.ships.get(targetId);
    if (!attacker || !target) return { error: 'Invalid attacker or target' };
    // Simple placeholder damage logic: roll 1d10 - 3 (min 0)
    const roll = 1 + Math.floor(Math.random() * 10);
    const damage = Math.max(0, roll - 3);
    const beforeHp = target.hp;
    if (damage > 0) {
      target.hp = Math.max(0, target.hp - damage);
      this._pushHistory({ type: 'damage', id: target.id, from: beforeHp, to: target.hp });
    }
    const attackId = ++this.lastAttackId;
    return {
      attackId,
      attackerId,
      targetId,
      roll,
      damage,
      remainingHp: target.hp
    };
  }
  
  manualAttack(attackerId, targetId, damage) {
    const attacker = this.ships.get(attackerId);
    const target = this.ships.get(targetId);
    if (!attacker || !target) return { error: 'Invalid attacker or target' };
    const dmgVal = Math.max(0, Number(damage)||0);
    const beforeHp = target.hp;
    if (dmgVal > 0) {
      target.hp = Math.max(0, target.hp - dmgVal);
      this._pushHistory({ type: 'damage', id: target.id, from: beforeHp, to: target.hp });
    }
    const attackId = ++this.lastAttackId;
    return {
      attackId,
      attackerId,
      targetId,
      damage: dmgVal,
      remainingHp: target.hp
    };
  }

  updateShip(id, patch) {
    const ship = this.ships.get(id);
    if (!ship) return { error: 'Not found' };
  const allowed = ['name','icon','hp','maxHp','speed','x','y','showHp','showSpeed','showShield','showStrain','shield','silhouette','heading','numberOf','hideFromViewer','strain','maxStrain'];
    for (const k of Object.keys(patch)) {
      if (allowed.includes(k) && patch[k] !== undefined) {
        if (k === 'speed') {
          const before = ship.speed || 0;
          const after = Math.max(0, Math.min(5, Number(patch[k])||0));
          if (before !== after) this._pushHistory({ type: 'speed', id, from: before, to: after });
          ship[k] = after;
        }
  else if (k === 'hp' || k === 'maxHp') ship[k] = Math.max(0, Number(patch[k])||0); // direct edits to hp aren't considered "damage" per requirement
  else if (k === 'strain' || k === 'maxStrain') ship[k] = Math.max(0, Number(patch[k])||0);
  else if (k === 'icon') {
    const val = String(patch[k]||'').trim();
    const allowedIcons = new Set(['fighter','wing','shuttle','corvette','frigate']);
    ship[k] = allowedIcons.has(val) ? val : ship[k];
  }
  else if (k === 'showHp' || k === 'showSpeed' || k === 'showShield' || k === 'showStrain') ship[k] = !!patch[k];
  else if (k === 'shield') ship[k] = normalizeShield(patch[k]);
  else if (k === 'silhouette') ship[k] = clampSilhouette(patch[k]);
  else if (k === 'heading') ship[k] = clampHeading(patch[k]);
  else if (k === 'hideFromViewer') ship[k] = !!patch[k];
  else if (k === 'numberOf') {
    const n = Math.max(1, Math.min(16, Math.round(Number(patch[k])||1)));
    ship[k] = n;
  }
        else ship[k] = patch[k];
      }
    }
    if (ship.hp > ship.maxHp) ship.hp = ship.maxHp;
    return { ...ship };
  }

  createShip(data) {
  // Always allocate a fresh unique id (ignore provided id to avoid collisions)
  const id = this._allocateId();
    const name = data.name ? String(data.name) : 'New Ship';
    const icon = data.icon ? String(data.icon) : 'fighter';
    const x = Number.isFinite(Number(data.x)) ? Math.max(0, Math.min(this.mapWidth, Number(data.x))) : Math.round(this.mapWidth/2);
    const y = Number.isFinite(Number(data.y)) ? Math.max(0, Math.min(this.mapHeight, Number(data.y))) : Math.round(this.mapHeight/2);
    const maxHp = Math.max(1, Number(data.maxHp)||1);
    const hp = Math.max(0, Math.min(maxHp, Number(data.hp)||maxHp));
    const speed = Math.max(0, Math.min(5, Number(data.speed)||0));
    const silhouette = clampSilhouette(data.silhouette);
    const heading = clampHeading(data.heading);
    const numberOf = Math.max(1, Math.min(16, Math.round(Number(data.numberOf)||1)));
    const hideFromViewer = data.hideFromViewer !== undefined ? !!data.hideFromViewer : true;
    const showHp = !!data.showHp;
    const showSpeed = !!data.showSpeed;
    const showShield = !!data.showShield;
    const shield = normalizeShield(data.shield);
  const strain = Math.max(0, Math.min(9999, Number(data.strain)||0));
  const maxStrain = Math.max(0, Math.min(9999, Number(data.maxStrain)||0));
  const showStrain = !!data.showStrain;
  const ship = { id, name, icon, x, y, hp, maxHp, speed, silhouette, heading, numberOf, hideFromViewer, showHp, showSpeed, showShield, showStrain, strain, maxStrain, shield };
    this.ships.set(id, ship);
    return { ...ship };
  }

  deleteShip(id) {
    if (!this.ships.has(id)) return { error: 'Not found' };
    const ship = this.ships.get(id);
    this.ships.delete(id);
    // Optionally prune history entries referencing this id (keep simple for now)
    this.history = this.history.filter(h => h.id !== id);
    return { ok: true, id };
  }

  _allocateId() {
    // Simple incremental scheme with collision safeguard
    while (true) {
      const id = 'S' + this._idCounter++;
      if (!this.ships.has(id)) return id;
    }
  }

  _pushHistory(entry) {
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();
  }
}

module.exports = BattleState;

function clampSilhouette(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 3;
  return Math.min(10, Math.max(3, n));
}

function clampHeading(v) {
  let n = Number(v);
  if (!Number.isFinite(n)) return 0;
  n = n % 360;
  if (n < 0) n += 360;
  return Math.round(n * 1000)/1000; // keep fractional if ever needed
}
