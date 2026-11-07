import { PATIENTS } from '../config.js';

let nextId = 1;

export class Patient {
  constructor({ x, y, source, careTime, reward, timeBonus, origin = 'street' }) {
    this.id = nextId;
    nextId += 1;

    this.x = x;
    this.y = y;
    this.source = source;
    this.origin = origin;
    this.state = 'waiting';
    this.maxTimer = careTime;
    this.timer = source === 'accident' ? careTime : 0;
    this.waitTimer = source === 'call' ? PATIENTS.callWaitTime : 0;
    this.rewardBase = reward;
    this.timeBonus = timeBonus;
    this.age = Math.random() * 10;
    this.spawnAge = 0;
    this.magnetized = false;
    this.pulse = Math.random() * Math.PI * 2;
    this.radius = 14;
  }

  get isAccident() {
    return this.source === 'accident';
  }

  load(careBonus) {
    this.state = 'inCar';
    this.magnetized = false;
    if (this.source === 'call') {
      this.maxTimer = PATIENTS.callCareTime + careBonus;
      this.timer = this.maxTimer;
    }
  }

  update(dt) {
    this.age += dt;
    this.spawnAge += dt;
    this.pulse += dt * 3.2;

    if (this.state === 'waiting') {
      if (this.source === 'call') {
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) return 'expired';
      } else {
        this.timer -= dt;
        if (this.timer <= 0) return 'dead';
      }
      return null;
    }

    if (this.state === 'inCar') {
      this.timer -= dt;
      if (this.timer <= 0) return 'dead';
    }

    return null;
  }

  get remaining() {
    if (this.state === 'waiting') {
      return this.isAccident ? this.timer : this.waitTimer;
    }
    return this.timer;
  }

  get maxRemaining() {
    if (this.state === 'waiting') {
      return this.isAccident ? this.maxTimer : PATIENTS.callWaitTime;
    }
    return this.maxTimer;
  }

  get timerRatio() {
    const max = Math.max(0.001, this.maxRemaining);
    return Math.max(0, Math.min(1, this.remaining / max));
  }

  get reward() {
    return Math.round(this.rewardBase + Math.max(0, this.timer) * this.timeBonus);
  }

  get label() {
    if (!this.isAccident) return '急救病人';
    return this.origin === 'crash' ? '车祸伤员' : '事故伤员';
  }

  get sortY() {
    return this.y;
  }
}
