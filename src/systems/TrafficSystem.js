import { AMBULANCE, CRASH, TRAFFIC } from '../config.js';
import { clamp, distance, pick, rand } from '../core/math.js';
import { TrafficCar } from '../entities/TrafficCar.js';

export class TrafficSystem {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.carHitCooldown = 0;
  }

  reset() {
    this.cars.length = 0;
    this.carHitCooldown = 0;

    const routes = [...this.game.city.trafficRoutes].sort(() => Math.random() - 0.5);
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      this.cars.push(this.createCar(routes[i % routes.length]));
    }
  }

  createCar(route) {
    return new TrafficCar(
      route,
      rand(TRAFFIC.speedMin, TRAFFIC.speedMax),
      Math.random() < 0.22 ? 'taxi' : 'sedan'
    );
  }

  spawnReplacement() {
    const player = this.game.player;
    let route = pick(this.game.city.trafficRoutes);

    // Keep replacements away from the ambulance so a freshly exploded car
    // never immediately reappears on top of the player.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = pick(this.game.city.trafficRoutes);
      if (distance(candidate[0].x, candidate[0].y, player.x, player.y) > 480) {
        route = candidate;
        break;
      }
    }

    const car = this.createCar(route);
    this.cars.push(car);
    return car;
  }

  update(dt) {
    this.carHitCooldown = Math.max(0, this.carHitCooldown - dt);

    for (const car of this.cars) car.update(dt);
    this.detonateLandedCars();

    // Resolve ambulance-vs-traffic with an oriented rectangle against a circle.
    // Both vehicles are displaced, so a head-on nudge cannot lock the player in
    // place. Two passes handle being squeezed between two cars or a wall.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const car of this.cars) {
        if (car.state !== 'driving') continue;

        const contact = this.playerCarContact(car);
        if (!contact) continue;

        const player = this.game.player;
        const rawSpeed = player.totalSpeed;
        const effectiveImpact =
          rawSpeed *
          (player.boosting ? 1.28 : 1) *
          (player.driftBoostTimer > 0 ? 1.15 : 1);

        if (effectiveImpact >= CRASH.launchSpeed) {
          this.launchCar(car, contact, Math.max(rawSpeed, effectiveImpact));
          continue;
        }

        const push = Math.min(contact.penetration + 0.6, 24);
        player.x -= contact.nx * push * 0.38;
        player.y -= contact.ny * push * 0.38;
        car.addPush(contact.nx * push * 0.78, contact.ny * push * 0.78);

        // A dead-center head-on hit has no lateral component, so the ambulance
        // would keep pressing the car forever. Add a small tangential slide to
        // one side once the contact is mostly longitudinal. Steering still
        // wins; this is only the minimum push needed to avoid a lock-up.
        if (Math.abs(contact.nxLocal) > 0.6) {
          const cos = Math.cos(player.angle);
          const sin = Math.sin(player.angle);
          const tangentX = -contact.nyLocal * cos - contact.nxLocal * sin;
          const tangentY = -contact.nyLocal * sin + contact.nxLocal * cos;
          const slideSign =
            Math.abs(contact.localY) > 1.5 ? -Math.sign(contact.localY) : car.sideBias;
          const slide = Math.min(55 * dt, 1.5);
          player.x += tangentX * slideSign * slide;
          player.y += tangentY * slideSign * slide;
        }

        if (this.carHitCooldown <= 0) {
          this.carHitCooldown = 0.26;
          car.bump(Math.min(1, rawSpeed / 220));
          player.speed *= rawSpeed > 95 ? 0.76 : 0.86;

          if (rawSpeed > 48) {
            this.game.camera.addShake(clamp(rawSpeed / 480, 0.08, 0.32));
            this.game.audio.crash();
            const cx = car.x - contact.nx * car.radius;
            const cy = car.y - contact.ny * car.radius;
            this.game.effects.spark(cx, cy, '#ffd479', 9, 115, 9);
          }
        }
      }

      // A traffic push must never stuff the ambulance inside a building.
      this.game.city.collideCircle(this.game.player, this.game.player.radius);
    }
  }

  detonateLandedCars() {
    const landed = this.cars.filter((car) => car.justLanded);
    if (landed.length === 0) return;

    for (const car of landed) {
      car.justLanded = false;
      this.explodeCar(car);
    }

    const removed = new Set(landed);
    let writeIndex = 0;
    for (const car of this.cars) {
      if (removed.has(car)) continue;
      this.cars[writeIndex] = car;
      writeIndex += 1;
    }
    this.cars.length = writeIndex;

    for (let i = 0; i < landed.length; i += 1) this.spawnReplacement();
  }

  launchCar(car, contact, impact) {
    const game = this.game;
    const player = game.player;
    const travelAngle = player.speed >= 0 ? player.angle : player.angle + Math.PI;
    const launchAngle = Math.atan2(
      Math.sin(travelAngle) + contact.ny * 0.35,
      Math.cos(travelAngle) + contact.nx * 0.35
    );
    const launchSpeed = clamp(impact * 1.05, CRASH.carLaunchMin, CRASH.carLaunchMax);
    car.wreck(launchAngle, launchSpeed, impact);

    player.x -= contact.nx * 4;
    player.y -= contact.ny * 4;
    player.speed *= player.boosting ? 0.9 : 0.78;
    player.addNitro(28);
    game.city.collideCircle(player, player.radius);

    this.carHitCooldown = 0.25;
    game.crashCooldown = 0.35;
    game.hitstop = 0.042;
    game.camera.addShake(0.62);
    game.camera.addZoomPunch(0.052);
    game.audio.launch();
    game.effects.spark(car.x, car.y, '#ffd479', 26, 230, 18);
    game.effects.pulse(car.x, car.y, 'rgba(255, 212, 121, 0.85)', 54, 0.38, 2.6);
    game.effects.text(car.x, car.y, '撞飞!', '#ffd479', 16);
  }

  explodeCar(car) {
    const game = this.game;
    const victimCount = car.wreckImpact >= CRASH.twoVictimSpeed ? 2 : 1;

    game.effects.explosion(car.x, car.y);
    game.effects.text(car.x, car.y, '轰隆!', '#ffd479', 19);
    game.audio.explosion();
    game.hitstop = 0.048;
    game.camera.addShake(0.98);
    game.camera.addZoomPunch(0.065);
    game.addDangerFlash(0.48);
    game.patients.spawnCrashVictims(car.x, car.y, victimCount);

    // Chain-reaction blast: launch nearby traffic cars & pedestrians.
    let chainCount = 0;
    for (const other of this.cars) {
      if (other === car || other.state !== 'driving') continue;
      if (distance(car.x, car.y, other.x, other.y) >= CRASH.chainRadius) continue;

      const blastAngle = Math.atan2(other.y - car.y, other.x - car.x);
      other.wreck(blastAngle, rand(260, 420), CRASH.twoVictimSpeed);
      chainCount += 1;
    }

    for (const ped of game.pedestrians) {
      if (ped.state !== 'walking') continue;
      if (distance(car.x, car.y, ped.x, ped.y) >= CRASH.chainRadius * 0.85) continue;

      const blastAngle = Math.atan2(ped.y - car.y, ped.x - car.x);
      ped.hit(blastAngle, 260);
    }

    if (chainCount > 0) {
      const chainBonus = chainCount * 60;
      game.addMoney(chainBonus);
      game.effects.text(car.x, car.y - 18, `连锁引爆 +$${chainBonus}!`, '#5de9ff', 17);
      game.hud.toast(
        `连锁大爆炸 · +$${chainBonus} 破坏奖 · ${victimCount} 名伤员`,
        'danger'
      );
    } else {
      game.hud.toast(`车辆爆炸 · 现场 ${victimCount} 名车祸伤员`, 'danger');
    }
  }

  playerCarContact(car) {
    const player = this.game.player;
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const halfLength = AMBULANCE.halfLength;
    const halfWidth = AMBULANCE.halfWidth;

    if (Math.abs(lx) > halfLength + car.radius || Math.abs(ly) > halfWidth + car.radius) {
      return null;
    }

    const nearestX = clamp(lx, -halfLength, halfLength);
    const nearestY = clamp(ly, -halfWidth, halfWidth);
    let nxLocal = lx - nearestX;
    let nyLocal = ly - nearestY;
    let penetration = 0;

    const dist = Math.hypot(nxLocal, nyLocal);
    if (dist > 0.001) {
      if (dist >= car.radius) return null;
      nxLocal /= dist;
      nyLocal /= dist;
      penetration = car.radius - dist;
    } else {
      // The traffic car's center is inside the ambulance rectangle. Escape
      // through the closest face instead of producing an undefined normal.
      const toRight = halfLength - lx;
      const toLeft = lx + halfLength;
      const toBottom = halfWidth - ly;
      const toTop = ly + halfWidth;
      const nearest = Math.min(toRight, toLeft, toBottom, toTop);

      if (nearest === toRight) {
        nxLocal = 1;
        nyLocal = 0;
      } else if (nearest === toLeft) {
        nxLocal = -1;
        nyLocal = 0;
      } else if (nearest === toBottom) {
        nxLocal = 0;
        nyLocal = 1;
      } else {
        nxLocal = 0;
        nyLocal = -1;
      }
      penetration = car.radius + nearest;
    }

    return {
      nx: nxLocal * cos - nyLocal * sin,
      ny: nxLocal * sin + nyLocal * cos,
      nxLocal,
      nyLocal,
      localX: lx,
      localY: ly,
      penetration
    };
  }
}
