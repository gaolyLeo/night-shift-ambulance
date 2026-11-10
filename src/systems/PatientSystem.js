import { CRASH, PATIENTS } from '../config.js';
import { distance, rand } from '../core/math.js';
import { Patient } from '../entities/Patient.js';

export class PatientSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.waiting = [];
    this.passengers = [];
    this.spawnTimer = 4.5;
    this.delivered = 0;
    this.deaths = 0;
    this.totalEarned = 0;
    this.totalFined = 0;
    this.firstCallShown = false;
    this.firstLoadShown = false;
    this.firstAccidentShown = false;
    this.accidentToastCooldown = 0;
    this.expireToastCooldown = 0;
    this.groundDeathToastCooldown = 0;
  }

  update(dt) {
    this.accidentToastCooldown = Math.max(0, this.accidentToastCooldown - dt);
    this.expireToastCooldown = Math.max(0, this.expireToastCooldown - dt);
    this.groundDeathToastCooldown = Math.max(0, this.groundDeathToastCooldown - dt);

    this.spawnTimer -= dt;
    const activeCalls = this.waiting.filter((patient) => patient.source === 'call').length;
    if (this.spawnTimer <= 0 && activeCalls < PATIENTS.maxCalls) {
      this.spawnCall();
      this.spawnTimer = rand(PATIENTS.callSpawnMin, PATIENTS.callSpawnMax);
    } else if (this.spawnTimer <= 0) {
      this.spawnTimer = 4;
    }

    for (let i = this.waiting.length - 1; i >= 0; i -= 1) {
      const patient = this.waiting[i];
      const status = patient.update(dt);

      if (status === 'expired') {
        this.waiting.splice(i, 1);
        if (this.expireToastCooldown <= 0) {
          this.game.hud?.toast('错过一次呼叫 · 无罚金', 'muted');
          this.expireToastCooldown = 18;
        }
      } else if (status === 'dead') {
        this.waiting.splice(i, 1);
        this.handleGroundDeath(patient);
      }
    }

    for (let i = this.passengers.length - 1; i >= 0; i -= 1) {
      const patient = this.passengers[i];
      const status = patient.update(dt);
      if (status === 'dead') {
        this.passengers.splice(i, 1);
        this.handleCarDeath();
      }
    }
  }

  createWaitingPatient(point, source, origin = 'street') {
    const accident = source === 'accident';
    const careBonus = this.game.upgrades.stats.careBonus;

    return new Patient({
      x: point.x,
      y: point.y,
      source,
      origin,
      careTime: (accident ? PATIENTS.accidentCareTime : PATIENTS.callCareTime) + careBonus,
      reward: accident ? PATIENTS.accidentReward : PATIENTS.callReward,
      timeBonus: accident ? PATIENTS.accidentTimeBonus : PATIENTS.callTimeBonus
    });
  }

  spawnCall() {
    const avoid = this.game.pvp?.active ? this.game.pvp.getCameraTarget() : this.game.player;
    const point = this.game.city.randomPatientPoint(avoid, 300);
    const patient = this.createWaitingPatient(point, 'call');

    this.waiting.push(patient);
    this.game.effects.pulse(point.x, point.y, 'rgba(255, 212, 121, 0.6)', 26, 0.7);

    if (!this.firstCallShown) {
      this.firstCallShown = true;
      this.game.hud?.toast('接到急救呼叫 · 病人已标记', 'gold');
    }
  }

  spawnAccident(pedestrian) {
    const point = this.game.city.resolveFreePoint(pedestrian.x, pedestrian.y, 20);
    const patient = this.createWaitingPatient(point, 'accident');

    this.waiting.push(patient);
    this.game.effects.blood(point.x, point.y, 15, 0);
    this.game.effects.pulse(point.x, point.y, 'rgba(255, 82, 104, 0.7)', 30, 0.8);

    if (!this.firstAccidentShown) {
      this.firstAccidentShown = true;
      this.game.hud?.toast(
        `你撞伤了路人 · ${Math.ceil(patient.remaining)} 秒内送医，否则会死亡`,
        'danger'
      );
    } else if (this.accidentToastCooldown <= 0) {
      this.game.hud?.toast(`新增事故伤员 · $${patient.reward} 报酬`, 'danger');
      this.accidentToastCooldown = 7;
    }
  }

  spawnCrashVictims(x, y, count = 1) {
    const baseAngle = rand(0, Math.PI * 2);

    for (let i = 0; i < count; i += 1) {
      const angle = baseAngle + (i / Math.max(1, count)) * Math.PI * 2 + rand(-0.35, 0.35);
      const spread = rand(CRASH.victimSpreadMin, CRASH.victimSpreadMax);
      const point = this.game.city.resolveFreePoint(
        x + Math.cos(angle) * spread,
        y + Math.sin(angle) * spread,
        18
      );
      const patient = this.createWaitingPatient(point, 'accident', 'crash');

      this.waiting.push(patient);
      this.game.effects.blood(point.x, point.y, 13, angle);
      this.game.effects.pulse(point.x, point.y, 'rgba(255, 82, 104, 0.72)', 28, 0.7);
    }

    return count;
  }

  updateAutoInteract(ambulance, stats, humanDriving, dt) {
    if (this.deliverAtHospital(ambulance)) return;

    if (this.passengers.length >= stats.capacity) {
      for (const patient of this.waiting) patient.magnetized = false;
      return;
    }

    for (let i = this.waiting.length - 1; i >= 0; i -= 1) {
      if (this.passengers.length >= stats.capacity) break;
      const patient = this.waiting[i];

      // Calls can always be magnetized. Accident patients need a moment to
      // land, and only pull once the player has started driving.
      const eligible =
        patient.source === 'call' || (humanDriving && patient.spawnAge > 0.25);
      if (!eligible) {
        patient.magnetized = false;
        continue;
      }

      const d = distance(patient.x, patient.y, ambulance.x, ambulance.y);
      if (d >= PATIENTS.magnetRange) {
        patient.magnetized = false;
        continue;
      }

      patient.magnetized = true;
      const pullSpeed = 460 + (1 - d / PATIENTS.magnetRange) * 380;
      const angle = Math.atan2(ambulance.y - patient.y, ambulance.x - patient.x);
      patient.x += Math.cos(angle) * pullSpeed * dt;
      patient.y += Math.sin(angle) * pullSpeed * dt;

      if (d < PATIENTS.pickupRange) {
        this.tryLoad(ambulance, stats, { auto: true });
      }
    }
  }

  deliverAtHospital(ambulance) {
    if (this.passengers.length === 0) return false;
    if (!this.game.city.inHospitalZone(ambulance.x, ambulance.y, 44)) return false;

    const speed = Math.abs(ambulance.speed);
    this.deliverAll({
      stylish: ambulance.drifting || speed > PATIENTS.deliveryStyleSpeed
    });
    return true;
  }

  handleGroundDeath(patient) {
    this.deaths += 1;
    this.game.effects.blood(patient.x, patient.y, 16, 0);
    this.game.effects.text(patient.x, patient.y, '死亡', '#ff8fa4', 12);

    if (this.groundDeathToastCooldown <= 0) {
      this.groundDeathToastCooldown = 6;
      this.game.hud?.toast('事故伤员死亡 · 未产生罚款', 'muted');
    }
  }

  handleCarDeath() {
    this.deaths += 1;
    this.totalFined += PATIENTS.fine;
    this.game.penalize(PATIENTS.fine);
    this.game.effects.blood(this.game.player.x, this.game.player.y, 18, 0);
    this.game.effects.text(
      this.game.player.x,
      this.game.player.y,
      `-$${PATIENTS.fine}`,
      '#ff5268',
      16
    );
    this.game.camera.addShake(0.35);
    this.game.audio.fine();
    this.game.hud?.toast(`病人死在车上 · 赔偿 $${PATIENTS.fine}`, 'danger');
    this.game.addDangerFlash(0.5);
  }

  nearestWaiting(ambulance, range = PATIENTS.pickupRange) {
    let closest = null;
    let closestDistance = Infinity;

    for (const patient of this.waiting) {
      const d = distance(patient.x, patient.y, ambulance.x, ambulance.y);
      if (d < range && d < closestDistance) {
        closest = patient;
        closestDistance = d;
      }
    }

    return closest ? { patient: closest, distance: closestDistance } : null;
  }

  tryLoad(ambulance, stats, { auto = false } = {}) {
    if (this.passengers.length >= stats.capacity) {
      return { ok: false, reason: 'full' };
    }

    const speed = Math.abs(ambulance.speed);
    const range =
      ambulance.drifting || ambulance.handbrake
        ? PATIENTS.pickupRange + 14
        : PATIENTS.pickupRange;
    const nearby = this.nearestWaiting(ambulance, range);
    if (!nearby) return { ok: false, reason: 'none' };

    const index = this.waiting.indexOf(nearby.patient);
    if (index === -1) return { ok: false, reason: 'none' };

    this.waiting.splice(index, 1);
    nearby.patient.load(stats.careBonus);
    this.passengers.push(nearby.patient);

    const isStylish =
      ambulance.drifting || ambulance.handbrake || speed > PATIENTS.pickupStyleSpeed;
    const bonus = isStylish ? PATIENTS.styleBonus : 0;
    if (bonus > 0) {
      this.totalEarned += bonus;
      this.game.addMoney(bonus);
    }

    ambulance.addNitro?.(24);
    this.game.audio.load();
    this.game.effects.pickupArc(
      nearby.patient.x,
      nearby.patient.y,
      ambulance,
      nearby.patient.isAccident ? '#ff5f9e' : '#7dffb2'
    );
    this.game.effects.spark(nearby.patient.x, nearby.patient.y, '#7dffb2', 22, 135);
    this.game.effects.pulse(
      nearby.patient.x,
      nearby.patient.y,
      'rgba(125, 255, 178, 0.85)',
      42,
      0.5,
      2.5
    );
    if (bonus > 0) {
      const tag = ambulance.drifting || ambulance.handbrake ? '漂移抢救' : '飞身抢救';
      this.game.effects.text(
        nearby.patient.x,
        nearby.patient.y,
        `${tag} +$${bonus}!`,
        '#5de9ff',
        15
      );
    } else if (auto) {
      this.game.effects.text(nearby.patient.x, nearby.patient.y, '上车!', '#7dffb2', 14);
    }
    this.game.camera.addShake(0.11);
    this.game.camera.addZoomPunch?.(0.025);

    if (!this.firstLoadShown) {
      this.firstLoadShown = true;
      this.game.hud?.toast('病人已上车 · 跟着边缘红色十字冲回医院', 'money');
    }

    return { ok: true, patient: nearby.patient, bonus };
  }

  deliverAll({ stylish = false } = {}) {
    if (this.passengers.length === 0) return 0;

    let total = 0;
    const count = this.passengers.length;
    const styleBonus = stylish ? 35 * count : 0;

    for (const patient of this.passengers) {
      total += patient.reward;
      this.game.effects.money(
        this.game.city.hospital.center.x + rand(-34, 34),
        this.game.city.hospital.center.y + rand(-22, 22),
        patient.reward
      );
      this.game.effects.spark(
        this.game.city.hospital.center.x,
        this.game.city.hospital.center.y,
        '#7dffb2',
        20,
        165
      );
    }

    total += styleBonus;
    this.passengers.length = 0;
    this.delivered += count;
    this.totalEarned += total;
    this.game.addMoney(total);
    this.game.player.addNitro?.(40);
    this.game.audio.deliver();
    this.game.camera.addShake(0.18);
    this.game.camera.addZoomPunch?.(0.045);
    this.game.effects.pulse(
      this.game.city.hospital.center.x,
      this.game.city.hospital.center.y,
      'rgba(125, 255, 178, 0.9)',
      95,
      0.65,
      3
    );

    if (styleBonus > 0) {
      this.game.effects.text(
        this.game.player.x,
        this.game.player.y,
        `漂移送达 +$${styleBonus}!`,
        '#ffd479',
        16
      );
    }

    const multiBonusText = count > 1 ? ` (${count}人连送)` : '';
    this.game.hud?.toast(`送达 ${count} 名病人${multiBonusText} · +$${total}`, 'money');

    return total;
  }
}
