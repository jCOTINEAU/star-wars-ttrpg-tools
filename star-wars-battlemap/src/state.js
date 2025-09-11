const fs = require('fs');
const path = require('path');

// In‑memory authoritative state (single process for now)
class BattleState {
  constructor() {
    this.mapWidth = 4000; // px logical space
    this.mapHeight = 3000;
    this.ships = new Map(); // id -> ship
    this.lastAttackId = 0;
  }

  loadInitialShips(filePath) {
    const abs = path.resolve(filePath);
    const raw = fs.readFileSync(abs, 'utf-8');
    const arr = JSON.parse(raw);
    arr.forEach(s => {
      this.ships.set(s.id, { speed: 0, showHp: false, showSpeed: false, ...s });
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
    ship.x = Math.max(0, Math.min(this.mapWidth, x));
    ship.y = Math.max(0, Math.min(this.mapHeight, y));
    return { ...ship };
  }

  attack(attackerId, targetId) {
    const attacker = this.ships.get(attackerId);
    const target = this.ships.get(targetId);
    if (!attacker || !target) return { error: 'Invalid attacker or target' };
    // Simple placeholder damage logic: roll 1d10 - 3 (min 0)
    const roll = 1 + Math.floor(Math.random() * 10);
    const damage = Math.max(0, roll - 3);
    if (damage > 0) {
      target.hp = Math.max(0, target.hp - damage);
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
    if (dmgVal > 0) {
      target.hp = Math.max(0, target.hp - dmgVal);
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
  const allowed = ['name','hp','maxHp','speed','x','y','showHp','showSpeed'];
    for (const k of Object.keys(patch)) {
      if (allowed.includes(k) && patch[k] !== undefined) {
        if (k === 'speed') ship[k] = Math.max(0, Math.min(5, Number(patch[k])||0));
        else if (k === 'hp' || k === 'maxHp') ship[k] = Math.max(0, Number(patch[k])||0);
        else if (k === 'showHp' || k === 'showSpeed') ship[k] = !!patch[k];
        else ship[k] = patch[k];
      }
    }
    if (ship.hp > ship.maxHp) ship.hp = ship.maxHp;
    return { ...ship };
  }
}

module.exports = BattleState;
