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
  this.ships.set(s.id, { speed: 0, showHp: false, showSpeed: false, showShield: false, silhouette, heading, hideFromViewer, ...s, shield });
    });
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
  const allowed = ['name','hp','maxHp','speed','x','y','showHp','showSpeed','showShield','shield','silhouette','heading','numberOf','hideFromViewer'];
    for (const k of Object.keys(patch)) {
      if (allowed.includes(k) && patch[k] !== undefined) {
        if (k === 'speed') {
          const before = ship.speed || 0;
          const after = Math.max(0, Math.min(5, Number(patch[k])||0));
          if (before !== after) this._pushHistory({ type: 'speed', id, from: before, to: after });
          ship[k] = after;
        }
        else if (k === 'hp' || k === 'maxHp') ship[k] = Math.max(0, Number(patch[k])||0); // direct edits to hp aren't considered "damage" per requirement
  else if (k === 'showHp' || k === 'showSpeed' || k === 'showShield') ship[k] = !!patch[k];
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
