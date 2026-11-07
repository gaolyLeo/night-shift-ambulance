import { AMBULANCE, GAME, UPGRADES } from '../config.js';

export class UpgradeSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.money = GAME.startMoney;
    this.levels = {
      engine: 1,
      handling: 1,
      capacity: 1,
      equipment: 1
    };
    this.recompute();
  }

  recompute() {
    const { engine, handling, capacity, equipment } = this.levels;

    this.stats = {
      maxSpeed: AMBULANCE.maxSpeed + (engine - 1) * 44,
      acceleration: AMBULANCE.acceleration + (engine - 1) * 30 + (handling - 1) * 18,
      turnRate: AMBULANCE.turnRate + (handling - 1) * 0.25,
      capacity,
      careBonus: (equipment - 1) * 8
    };

    this.game?.player?.setStats(this.stats);
  }

  getLevel(id) {
    return this.levels[id] ?? 1;
  }

  getNextCost(id) {
    const definition = UPGRADES[id];
    if (!definition) return null;
    const level = this.getLevel(id);
    if (level >= definition.maxLevel) return null;
    return definition.costs[level - 1] ?? null;
  }

  canBuy(id) {
    const cost = this.getNextCost(id);
    if (cost == null) return { ok: false, reason: 'max' };
    if (this.money < cost) return { ok: false, reason: 'money' };
    return { ok: true, cost };
  }

  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) {
      this.game.audio.deny();
      return check;
    }

    this.money -= check.cost;
    this.levels[id] = this.getLevel(id) + 1;
    this.recompute();
    this.game.audio.upgrade();
    this.game.hud?.toast(`${UPGRADES[id].name} 升级到 Lv.${this.levels[id]}`, 'money');
    this.game.hud?.refreshUpgrades();
    return { ok: true, cost: check.cost, level: this.levels[id] };
  }

  addMoney(amount) {
    this.money += amount;
    return this.money;
  }
}
