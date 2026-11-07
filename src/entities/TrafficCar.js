import { CRASH } from '../config.js';
import { clamp, distance, normalizeAngle, pick, rand, shortestAngle } from '../core/math.js';

const CAR_PALETTES = [
  { side: '#1f4575', body: '#2f65a8', roof: '#4682cc', light: '#9beeff' },
  { side: '#6e2348', body: '#9e3568', roof: '#bd4a82', light: '#ffc2de' },
  { side: '#235942', body: '#327d5d', roof: '#469e78', light: '#b8ffdf' },
  { side: '#7d561c', body: '#b57e2b', roof: '#d49a3d', light: '#ffe299' },
  { side: '#3d3969', body: '#585396', roof: '#736db8', light: '#d6d4ff' },
  { side: '#4f5d73', body: '#7385a1', roof: '#94a8c4', light: '#e3f2ff' }
];

export class TrafficCar {
  constructor(route, speed, variant = 'sedan') {
    this.route = route;
    this.speed = speed;
    this.variant = variant;
    this.palette = pick(CAR_PALETTES);
    this.segment = Math.floor(Math.random() * route.length);
    this.t = Math.random();
    this.x = route[this.segment].x;
    this.y = route[this.segment].y;
    this.angle = 0;
    this.radius = 18;
    this.stun = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.sideBias = Math.random() < 0.5 ? -1 : 1;
    this.honkTimer = rand(0, 10);
    this.state = 'driving';
    this.z = 0;
    this.spin = 0;
    this.spinRate = 0;
    this.wreckVX = 0;
    this.wreckVY = 0;
    this.wreckVZ = 0;
    this.wreckImpact = 0;
    this.justLanded = false;
    this.refresh();
    this.angle = this.segmentAngle();
  }

  refresh() {
    const from = this.route[this.segment];
    const to = this.route[(this.segment + 1) % this.route.length];
    this.x = from.x + (to.x - from.x) * this.t + this.offsetX;
    this.y = from.y + (to.y - from.y) * this.t + this.offsetY;
  }

  segmentAngle() {
    const from = this.route[this.segment];
    const to = this.route[(this.segment + 1) % this.route.length];
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  update(dt) {
    if (this.state === 'wrecking') {
      this.x += this.wreckVX * dt;
      this.y += this.wreckVY * dt;
      this.z += this.wreckVZ * dt;
      this.wreckVZ -= CRASH.gravity * dt;
      this.wreckVX *= Math.exp(-0.22 * dt);
      this.wreckVY *= Math.exp(-0.22 * dt);
      this.spin += this.spinRate * dt;

      if (this.z <= 0) {
        this.z = 0;
        this.state = 'destroyed';
        this.justLanded = true;
      }
      return;
    }

    if (this.state !== 'driving') return;

    // Being shoved by the ambulance is allowed and slowly settles back onto
    // the traffic route. This is what keeps contact from becoming a deadlock.
    this.offsetX *= Math.exp(-1.25 * dt);
    this.offsetY *= Math.exp(-1.25 * dt);

    if (this.stun > 0) {
      this.stun -= dt;
      this.refresh();
      return;
    }

    const from = this.route[this.segment];
    const to = this.route[(this.segment + 1) % this.route.length];
    const segmentLength = Math.max(1, distance(from.x, from.y, to.x, to.y));
    this.t += (this.speed * dt) / segmentLength;

    while (this.t >= 1) {
      this.t -= 1;
      this.segment = (this.segment + 1) % this.route.length;
    }

    this.refresh();
    this.angle += shortestAngle(this.angle, this.segmentAngle()) * Math.min(1, dt * 10);
    this.angle = normalizeAngle(this.angle);
  }

  bump(force = 1) {
    if (this.state !== 'driving') return;
    this.stun = Math.max(this.stun, 0.5 + force * 0.5);
  }

  addPush(dx, dy) {
    if (this.state !== 'driving') return;
    this.offsetX = clamp(this.offsetX + dx, -60, 60);
    this.offsetY = clamp(this.offsetY + dy, -60, 60);
    this.refresh();
  }

  wreck(angle, speed, impact) {
    this.state = 'wrecking';
    this.stun = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.speed = 0;
    this.angle = angle;
    this.z = 1;
    this.spin = 0;
    this.spinRate = rand(-7, 7);
    this.wreckVX = Math.cos(angle) * speed;
    this.wreckVY = Math.sin(angle) * speed;
    this.wreckVZ = rand(225, 285);
    this.wreckImpact = impact;
    this.justLanded = false;
  }

  get sortY() {
    return this.y;
  }
}
