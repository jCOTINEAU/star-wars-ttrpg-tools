const fs = require('fs');
const path = require('path');

function normalizeShield(shield) {
  if (!shield || typeof shield !== 'object') return null;
  if (shield.type === 'full') {
  const val = Math.max(0, Math.min(3, Number(shield.value)||0));
    return { type: 'full', value: val };
  }
  if (shield.type === 'directional') {
  const up = Math.max(0, Math.min(3, Number(shield.up)||0));
  const down = Math.max(0, Math.min(3, Number(shield.down)||0));
  const left = Math.max(0, Math.min(3, Number(shield.left)||0));
  const right = Math.max(0, Math.min(3, Number(shield.right)||0));
    return { type: 'directional', up, down, left, right };
  }
  return null;
}

// In‑memory authoritative state (single process for now)
class BattleState {
  constructor() {
  this.mapWidth = 16000; // px logical space (4x previous)
  this.mapHeight = 12000;
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
  this.ships.set(s.id, { speed: 0, showHp: false, showSpeed: false, showShield: false, ...s, shield });
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
  const allowed = ['name','hp','maxHp','speed','x','y','showHp','showSpeed','showShield','shield'];
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
