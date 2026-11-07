import { AMBULANCE } from '../config.js';
import { clamp, normalizeAngle, shortestAngle } from '../core/math.js';

export class Ambulance {
  constructor(city) {
    this.city = city;
    this.radius = AMBULANCE.radius;
    this.x = 0;
    this.y = 0;
    this.angle = Math.PI / 2;
    this.speed = 0;
    this.lateralSpeed = 0;
    this.steerInput = 0;
    this.lastSteerDir = 0;
    this.turnHoldTime = 0;
    this.wasTouchingWall = false;
    this.handbrake = false;
    this.wasHandbrake = false;
    this.drifting = false;
    this.driftTime = 0;
    this.driftBoostTimer = 0;
    this.nitro = 100;
    this.maxNitro = 100;
    this.boosting = false;
    this.boostExhausted = false;
    this.sirenOn = false;
    this.stats = {
      maxSpeed: AMBULANCE.maxSpeed,
      acceleration: AMBULANCE.acceleration,
      turnRate: AMBULANCE.turnRate,
      capacity: 1,
      careBonus: 0
    };
  }

  reset(spawn) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.angle = Math.PI / 2;
    this.speed = 0;
    this.lateralSpeed = 0;
    this.steerInput = 0;
    this.lastSteerDir = 0;
    this.turnHoldTime = 0;
    this.wasTouchingWall = false;
    this.handbrake = false;
    this.wasHandbrake = false;
    this.drifting = false;
    this.driftTime = 0;
    this.driftBoostTimer = 0;
    this.nitro = 100;
    this.boosting = false;
    this.boostExhausted = false;
  }

  setStats(stats) {
    this.stats = stats;
  }

  addNitro(amount) {
    this.nitro = clamp(this.nitro + amount, 0, this.maxNitro);
    if (this.nitro > 18) this.boostExhausted = false;
  }

  get totalSpeed() {
    return Math.hypot(this.speed, this.lateralSpeed);
  }

  get speedRatio() {
    return clamp(this.totalSpeed / Math.max(1, this.stats.maxSpeed), 0, 1.35);
  }

  get speedKmh() {
    return Math.round(this.totalSpeed * 0.32);
  }

  get nitroRatio() {
    return clamp(this.nitro / this.maxNitro, 0, 1);
  }

  get velocity() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: cos * this.speed - sin * this.lateralSpeed,
      y: sin * this.speed + cos * this.lateralSpeed
    };
  }

  toggleSiren() {
    this.sirenOn = !this.sirenOn;
    return this.sirenOn;
  }

  update(dt, input) {
    const throttle =
      (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) -
      (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const steer =
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0) -
      (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0);

    this.steerInput = steer;
    this.wasHandbrake = this.handbrake;
    this.handbrake = input.isDown('Space');

    const wantBoost = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    if (wantBoost && !this.boostExhausted && this.nitro > 0 && throttle >= 0) {
      this.boosting = true;
      this.nitro = Math.max(0, this.nitro - AMBULANCE.boostDrain * dt);
      if (this.nitro <= 0) {
        this.boostExhausted = true;
        this.boosting = false;
      }
    } else {
      this.boosting = false;
      const regenRate = this.drifting ? AMBULANCE.boostRegen * 1.6 : AMBULANCE.boostRegen;
      this.nitro = Math.min(this.maxNitro, this.nitro + regenRate * dt);
      if (this.nitro >= 20) this.boostExhausted = false;
    }

    if (this.driftBoostTimer > 0) {
      this.driftBoostTimer = Math.max(0, this.driftBoostTimer - dt);
    }

    const boostMult =
      (this.boosting ? AMBULANCE.boostMultiplier : 1) *
      (this.driftBoostTimer > 0 ? 1.18 : 1);
    const accelMult =
      (this.boosting ? AMBULANCE.boostAccelMultiplier : 1) *
      (this.driftBoostTimer > 0 ? 1.45 : 1);

    const maxForward = this.stats.maxSpeed * boostMult;
    const maxReverse = AMBULANCE.reverseSpeed;

    if (throttle > 0 || this.boosting) {
      const effectiveThrottle = Math.max(throttle, this.boosting ? 0.85 : 0);
      this.speed += this.stats.acceleration * accelMult * effectiveThrottle * dt;
    } else if (throttle < 0) {
      if (this.speed > 12) {
        this.speed -= AMBULANCE.brakePower * dt;
      } else {
        this.speed -= AMBULANCE.reverseAcceleration * dt;
      }
    } else {
      const drag = this.handbrake ? 1.65 : 0.82;
      this.speed *= Math.exp(-drag * dt);
    }

    // Handbrake while throttling lets you powerslide without killing all speed.
    if (this.handbrake) {
      const hbDrag = throttle > 0 ? 0.55 : 1.45;
      this.speed *= Math.exp(-hbDrag * dt);
    }

    this.speed = clamp(this.speed, -maxReverse, maxForward);
    if (Math.abs(this.speed) < 1.4 && throttle === 0 && !this.boosting) {
      this.speed = 0;
    }

    if (steer !== 0 && Math.abs(this.speed) > 135) {
      if (steer === this.lastSteerDir) {
        this.turnHoldTime += dt;
      } else {
        this.turnHoldTime = 0;
        this.driftTime = 0;
      }
      this.lastSteerDir = steer;
    } else {
      this.turnHoldTime = 0;
      this.lastSteerDir = 0;
    }

    let dAngle = 0;
    // Only enter automatic drift after holding a turn continuously for >= 0.34s at high speed
    const autoDrift = this.turnHoldTime >= 0.34 && Math.abs(this.speed) > 145;
    if (Math.abs(this.speed) > 1 || Math.abs(this.lateralSpeed) > 5 || (this.wasTouchingWall && steer !== 0)) {
      const speedSteer = this.wasTouchingWall
        ? 1.05
        : 0.42 + 0.58 * clamp(Math.abs(this.speed) / 190, 0, 1);
      const direction = this.speed >= -1 ? 1 : -1;
      const turnBoost = this.handbrake
        ? AMBULANCE.handbrakeTurnBoost
        : autoDrift
          ? 1.24
          : 1;
      dAngle = steer * this.stats.turnRate * speedSteer * direction * turnBoost * dt;
      this.angle += dAngle;
    }

    if (this.angle > Math.PI) this.angle -= Math.PI * 2;
    else if (this.angle < -Math.PI) this.angle += Math.PI * 2;

    const slipTransfer = this.handbrake ? 0.72 : autoDrift ? 0.52 : 0.18;
    this.lateralSpeed -= this.speed * dAngle * slipTransfer;
    this.lateralSpeed = clamp(this.lateralSpeed, -220, 220);

    const grip = this.handbrake || autoDrift ? AMBULANCE.driftGrip : AMBULANCE.normalGrip;
    this.lateralSpeed *= Math.exp(-grip * dt);
    if (Math.abs(this.speed) < 8) {
      this.lateralSpeed *= Math.exp(-14 * dt);
    }

    const wasDrifting = this.drifting;
    this.drifting =
      autoDrift ||
      (this.handbrake && Math.abs(this.speed) > 85 && Math.abs(steer) > 0);

    let driftBoosted = false;
    if (this.drifting && Math.abs(steer) > 0) {
      this.driftTime += dt;
    } else {
      if (
        (Math.abs(steer) === 0 || (this.wasHandbrake && !this.handbrake)) &&
        this.driftTime >= 0.55 &&
        this.speed > 110
      ) {
        this.driftBoostTimer = 0.6;
        this.speed = Math.min(this.stats.maxSpeed * 1.28, this.speed + 85);
        this.addNitro(18);
        driftBoosted = true;
      }
      if (!wasDrifting || Math.abs(steer) === 0) {
        this.driftTime = 0;
      }
    }

    const previousSpeed = this.totalSpeed;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const vx = cos * this.speed - sin * this.lateralSpeed;
    const vy = sin * this.speed + cos * this.lateralSpeed;

    this.x += vx * dt;
    this.y += vy * dt;

    const hit = this.city.collideCircle(this, this.radius);
    let impactSpeed = 0;
    let wallImpact = false;
    let impactPoint = null;

    if (hit && this.hitNormal) {
      // Never allow wall contact to count as drifting or trigger drift boost
      this.drifting = false;
      this.driftTime = 0;
      this.turnHoldTime = 0;
      driftBoosted = false;

      const { nx, ny } = this.hitNormal;
      const travelDir = this.speed >= -1 ? 1 : -1;
      const hx = Math.cos(this.angle) * travelDir;
      const hy = Math.sin(this.angle) * travelDir;
      const intoWall = clamp(-(hx * nx + hy * ny), 0, 1);

      let tx = -ny;
      let ty = nx;
      const alongWall = hx * tx + hy * ty;
      if (alongWall < 0) {
        tx = -tx;
        ty = -ty;
      }

      impactPoint = {
        x: this.x - nx * this.radius,
        y: this.y - ny * this.radius,
        nx,
        ny
      };

      impactSpeed = previousSpeed * intoWall;

      // On the initial frame of wall contact, absorb the normal velocity component into the wall
      if (!this.wasTouchingWall) {
        wallImpact = intoWall >= 0.65 && previousSpeed > 140;
        this.speed *= 1 - intoWall * intoWall * 0.6;
      } else {
        this.speed *= Math.exp(-intoWall * intoWall * 3.0 * dt);
      }

      // Cap forward speed when pushing directly into a wall so the car doesn't rev in place
      if (intoWall > 0.35 && this.speed > 0) {
        const wallCap = this.stats.maxSpeed * Math.max(0.16, 1 - intoWall * 0.82);
        this.speed = Math.min(this.speed, wallCap);
      }

      // Smoothly guide the nose along the wall ONLY in the direction the car is already angled
      if (Math.abs(this.speed) > 15 && Math.abs(alongWall) > 0.22 && intoWall > 0.08 && intoWall < 0.9) {
        const targetAngle = travelDir > 0 ? Math.atan2(ty, tx) : Math.atan2(-ty, -tx);
        const angleDiff = shortestAngle(this.angle, targetAngle);
        const maxAngleStep = dt * 3.0 * Math.abs(alongWall);
        this.angle = normalizeAngle(
          this.angle + clamp(angleDiff * 0.3, -maxAngleStep, maxAngleStep)
        );
      }

      this.lateralSpeed *= 0.15;
      this.wasTouchingWall = true;
    } else {
      this.wasTouchingWall = false;
    }

    return {
      hit,
      wallImpact,
      impactPoint,
      impactSpeed,
      driftBoosted
    };
  }
}
