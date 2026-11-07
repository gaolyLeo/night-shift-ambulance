import { PEDESTRIANS } from '../config.js';
import { pick, rand, randInt } from '../core/math.js';

const OUTFITS = [
  { body: '#5de9ff', head: '#ffd9c0', leg: '#1b2a44' },
  { body: '#ff5f9e', head: '#e8b894', leg: '#2a1730' },
  { body: '#ffd479', head: '#ffd9c0', leg: '#2c2414' },
  { body: '#7dffb2', head: '#c98d64', leg: '#13281e' },
  { body: '#a68cff', head: '#e8b894', leg: '#1e1933' },
  { body: '#ff8c6b', head: '#8a573c', leg: '#2a1b14' }
];

function pointOnRect(rect, t) {
  const perimeter = rect.w * 2 + rect.h * 2;
  let d = ((t % perimeter) + perimeter) % perimeter;

  if (d < rect.w) return { x: rect.x + d, y: rect.y, side: 0 };
  d -= rect.w;
  if (d < rect.h) return { x: rect.x + rect.w, y: rect.y + d, side: 1 };
  d -= rect.h;
  if (d < rect.w) return { x: rect.x + rect.w - d, y: rect.y + rect.h, side: 2 };
  d -= rect.w;
  return { x: rect.x, y: rect.y + rect.h - d, side: 3 };
}

export class Pedestrian {
  constructor(city, block) {
    this.city = city;
    this.block = block;
    this.rect = block.walkway;
    this.t = rand(0, this.rect.w * 2 + this.rect.h * 2);
    this.direction = Math.random() < 0.5 ? -1 : 1;
    this.speed = rand(PEDESTRIANS.speedMin, PEDESTRIANS.speedMax);
    this.pauseTimer = Math.random() < PEDESTRIANS.pauseChance ? rand(0.8, 2.8) : 0;
    this.outfit = pick(OUTFITS);
    this.state = 'walking';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spin = 0;
    this.spinV = 0;
    this.bounced = false;
    this.walkPhase = rand(0, 6.28);
    this.radius = 9;
    this.refreshPosition();
  }

  refreshPosition() {
    const point = pointOnRect(this.rect, this.t);
    this.x = point.x;
    this.y = point.y;
  }

  hit(angle, speed) {
    if (this.state !== 'walking') return false;
    this.state = 'flying';
    const power = Math.max(90, speed * PEDESTRIANS.hitLaunchSpeed);
    this.vx = Math.cos(angle) * power + rand(-35, 35);
    this.vy = Math.sin(angle) * power + rand(-35, 35);
    this.z = 6;
    this.vz = rand(155, 245);
    this.spin = 0;
    this.spinV = rand(-9, 9);
    this.bounced = false;
    return true;
  }

  update(dt) {
    this.walkPhase += dt * 7;

    if (this.state === 'walking') {
      if (this.pauseTimer > 0) {
        this.pauseTimer -= dt;
        return;
      }

      this.t += this.direction * this.speed * dt;
      this.refreshPosition();

      if (Math.random() < dt * 0.09) {
        this.direction *= -1;
      }
      if (Math.random() < dt * 0.05) {
        this.pauseTimer = rand(0.7, 2.2);
      }
      return;
    }

    if (this.state === 'flying') {
      this.vy += 18 * dt;
      this.vx *= Math.exp(-0.42 * dt);
      this.vy *= Math.exp(-0.42 * dt);

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.vz -= 520 * dt;
      this.spin += this.spinV * dt;

      this.city.collideCircle(this, 8);

      if (this.z <= 0) {
        this.z = 0;
        if (!this.bounced && this.vz < -70) {
          this.vz = -this.vz * 0.3;
          this.bounced = true;
          this.z = 2;
        } else {
          this.vz = 0;
          this.state = 'downed';
          this.spin = Math.PI / 2;
          const point = this.city.resolveFreePoint(this.x, this.y, 18);
          this.x = point.x;
          this.y = point.y;
        }
      }
    }
  }

  get sortY() {
    return this.y;
  }

  get label() {
    return '行人';
  }
}
