import { rand } from '../core/math.js';

const MAX_PARTICLES = 680;
const MAX_TEXTS = 36;
const MAX_SKIDS = 240;
const MAX_CRATERS = 24;

export class Effects {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.skids = [];
    this.craters = [];
    this.arcs = [];
    this.lastSkidLeft = null;
    this.lastSkidRight = null;
  }

  add(particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  skid(x, y, angle, glowing = false) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const backX = x - cos * 20;
    const backY = y - sin * 20;
    const sideX = -sin * 11;
    const sideY = cos * 11;

    const lx = backX + sideX;
    const ly = backY + sideY;
    const rx = backX - sideX;
    const ry = backY - sideY;

    if (this.lastSkidLeft && Math.hypot(lx - this.lastSkidLeft.x, ly - this.lastSkidLeft.y) < 42) {
      if (this.skids.length >= MAX_SKIDS) this.skids.splice(0, 2);
      const color = glowing ? 'rgba(93, 233, 255, 0.34)' : 'rgba(6, 9, 16, 0.55)';
      this.skids.push(
        {
          x1: this.lastSkidLeft.x,
          y1: this.lastSkidLeft.y,
          x2: lx,
          y2: ly,
          life: 6.5,
          maxLife: 6.5,
          color
        },
        {
          x1: this.lastSkidRight.x,
          y1: this.lastSkidRight.y,
          x2: rx,
          y2: ry,
          life: 6.5,
          maxLife: 6.5,
          color
        }
      );
    }

    this.lastSkidLeft = { x: lx, y: ly };
    this.lastSkidRight = { x: rx, y: ry };
  }

  endSkid() {
    this.lastSkidLeft = null;
    this.lastSkidRight = null;
  }

  pickupArc(fromX, fromY, target, color = '#7dffb2') {
    this.arcs.push({
      fromX,
      fromY,
      target,
      color,
      life: 0.28,
      maxLife: 0.28
    });
  }

  boostFlame(x, y, angle, isDriftBoost = false) {
    const backAngle = angle + Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tailX = x - cos * 32;
    const tailY = y - sin * 32;

    for (let i = 0; i < 3; i += 1) {
      const spread = rand(-0.26, 0.26);
      const speed = rand(120, 260);
      const life = rand(0.1, 0.22);
      this.add({
        type: 'fire',
        x: tailX + rand(-4, 4),
        y: tailY + rand(-4, 4),
        z: rand(4, 11),
        vx: Math.cos(backAngle + spread) * speed,
        vy: Math.sin(backAngle + spread) * speed,
        vz: rand(-10, 35),
        gravity: 0,
        drag: 3.2,
        life,
        maxLife: life,
        size: rand(5, 11),
        color: isDriftBoost
          ? i % 2 === 0
            ? '#ffd479'
            : '#ff5f9e'
          : i % 2 === 0
            ? '#5de9ff'
            : '#a68cff',
        additive: true
      });
    }
  }

  spark(x, y, color = '#5de9ff', count = 12, speed = 150, z = 12) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const power = rand(speed * 0.25, speed);
      const life = rand(0.24, 0.62);
      this.add({
        type: 'spark',
        x,
        y,
        z: z + rand(-4, 12),
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        vz: rand(-20, 130),
        gravity: 240,
        drag: 2.4,
        life,
        maxLife: life,
        size: rand(1.3, 3.1),
        color,
        additive: true
      });
    }
  }

  wallHit(x, y, nx = 0, ny = 1, intensity = 1) {
    const baseAngle = Math.atan2(ny, nx);
    this.pulse(x, y, 'rgba(255, 212, 121, 0.85)', 36 + intensity * 26, 0.34, 2.6);

    const sparkCount = Math.round(14 + intensity * 14);
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = baseAngle + rand(-1.15, 1.15);
      const power = rand(70, 220 * (0.6 + intensity * 0.5));
      const life = rand(0.22, 0.55);
      this.add({
        type: 'spark',
        x,
        y,
        z: rand(6, 22),
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        vz: rand(30, 175),
        gravity: 340,
        drag: 1.8,
        life,
        maxLife: life,
        size: rand(1.6, 3.4),
        color: i % 3 === 0 ? '#5de9ff' : '#ffd479',
        additive: true
      });
    }

    // Wall debris chunks
    for (let i = 0; i < 8; i += 1) {
      const angle = baseAngle + rand(-0.95, 0.95);
      const power = rand(40, 135);
      const life = rand(0.35, 0.75);
      this.add({
        type: 'dot',
        x,
        y,
        z: rand(8, 24),
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        vz: rand(45, 160),
        gravity: 420,
        drag: 1.4,
        life,
        maxLife: life,
        size: rand(2.2, 4.2),
        color: i % 2 === 0 ? '#8fa8cc' : '#33486b',
        additive: false
      });
    }

    this.smoke(x, y, 'rgba(180, 205, 235, 0.24)', 5);
  }

  blood(x, y, count = 14, angle = 0) {
    for (let i = 0; i < count; i += 1) {
      const spread = rand(-1.2, 1.2);
      const power = rand(25, 175);
      const life = rand(0.45, 1.15);
      this.add({
        type: 'dot',
        x,
        y,
        z: rand(2, 18),
        vx: Math.cos(angle + spread) * power,
        vy: Math.sin(angle + spread) * power,
        vz: rand(25, 165),
        gravity: 380,
        drag: 1.6,
        life,
        maxLife: life,
        size: rand(1.6, 3.8),
        color: Math.random() < 0.35 ? '#ffd0dc' : '#ff3e63',
        additive: false
      });
    }
  }

  smoke(x, y, color = 'rgba(180, 205, 230, 0.18)', count = 3) {
    for (let i = 0; i < count; i += 1) {
      const life = rand(0.5, 1.2);
      this.add({
        type: 'smoke',
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        z: rand(2, 10),
        vx: rand(-22, 22),
        vy: rand(-22, 22),
        vz: rand(8, 34),
        gravity: -10,
        drag: 1.4,
        life,
        maxLife: life,
        size: rand(8, 18),
        color,
        additive: false
      });
    }
  }

  explosion(x, y) {
    if (this.craters.length >= MAX_CRATERS) this.craters.shift();
    this.craters.push({
      x,
      y,
      radius: rand(34, 48),
      life: 14,
      maxLife: 14
    });

    this.pulse(x, y, 'rgba(255, 177, 84, 0.98)', 135, 0.85, 3.2);
    this.pulse(x, y, 'rgba(255, 82, 104, 0.88)', 105, 0.62, 2.5);
    this.pulse(x, y, 'rgba(255, 244, 214, 0.95)', 64, 0.38, 3.5);

    const fireColors = ['#fff6cc', '#ffd06a', '#ff8a3c', '#ff4b2f', '#ff2a6d'];
    for (let i = 0; i < 38; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const power = rand(35, 195);
      const life = rand(0.45, 1.05);
      this.add({
        type: 'fire',
        x: x + rand(-10, 10),
        y: y + rand(-10, 10),
        z: rand(2, 32),
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        vz: rand(25, 125),
        gravity: -22,
        drag: 1.45,
        life,
        maxLife: life,
        size: rand(10, 27),
        color: fireColors[Math.floor(Math.random() * fireColors.length)],
        additive: true
      });
    }

    for (let i = 0; i < 58; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const power = rand(95, 390);
      const life = rand(0.32, 0.88);
      this.add({
        type: 'spark',
        x,
        y,
        z: rand(4, 34),
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        vz: rand(70, 290),
        gravity: 420,
        drag: 1.05,
        life,
        maxLife: life,
        size: rand(1.6, 3.8),
        color: i % 3 === 0 ? '#fff4d6' : fireColors[Math.floor(Math.random() * fireColors.length)],
        additive: true
      });
    }

    this.smoke(x, y, 'rgba(18, 20, 26, 0.56)', 28);
  }

  tire(x, y, angle) {
    const life = rand(0.35, 0.65);
    this.add({
      type: 'smoke',
      x: x + Math.cos(angle + Math.PI) * 24 + rand(-6, 6),
      y: y + Math.sin(angle + Math.PI) * 24 + rand(-6, 6),
      z: rand(1, 5),
      vx: rand(-22, 22),
      vy: rand(-22, 22),
      vz: rand(6, 22),
      gravity: -5,
      drag: 2.2,
      life,
      maxLife: life,
      size: rand(7, 15),
      color: 'rgba(190, 215, 240, 0.14)',
      additive: false
    });
  }

  pulse(x, y, color = 'rgba(93, 233, 255, 0.7)', radius = 30, life = 0.6, width = 2) {
    this.rings.push({
      x,
      y,
      radius: 6,
      endRadius: radius,
      life,
      maxLife: life,
      color,
      width
    });
  }

  money(x, y, amount) {
    this.text(x, y, `+$${amount}`, '#7dffb2', 15);
  }

  text(x, y, text, color = '#eaf7ff', size = 13) {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({
      x,
      y,
      z: 34,
      text,
      color,
      size,
      life: 1.15,
      maxLife: 1.15
    });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.vx *= Math.exp(-p.drag * dt);
      p.vy *= Math.exp(-p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= p.gravity * dt;

      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.18;
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      ring.life -= dt;
      if (ring.life <= 0) this.rings.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const text = this.texts[i];
      text.life -= dt;
      text.z += dt * 28;
      if (text.life <= 0) this.texts.splice(i, 1);
    }

    for (let i = this.skids.length - 1; i >= 0; i -= 1) {
      const s = this.skids[i];
      s.life -= dt;
      if (s.life <= 0) this.skids.splice(i, 1);
    }

    for (let i = this.craters.length - 1; i >= 0; i -= 1) {
      const c = this.craters[i];
      c.life -= dt;
      if (c.life <= 0) this.craters.splice(i, 1);
    }

    for (let i = this.arcs.length - 1; i >= 0; i -= 1) {
      const arc = this.arcs[i];
      arc.life -= dt;
      if (arc.life <= 0) this.arcs.splice(i, 1);
    }
  }

  drawGroundEffects(ctx, camera) {
    const zoom = camera.zoom;
    ctx.save();

    for (const c of this.craters) {
      if (!camera.isVisible(c.x, c.y, 80)) continue;
      const pos = camera.worldToScreen(c.x, c.y);
      const alpha = Math.min(1, c.life / 3);
      ctx.globalAlpha = alpha * 0.68;
      ctx.fillStyle = '#04060b';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, c.radius * zoom, c.radius * zoom * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 110, 48, 0.35)';
      ctx.lineWidth = 1.6 * zoom;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, c.radius * zoom * 0.72, c.radius * zoom * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, 2.8 * zoom);
    for (const s of this.skids) {
      if (!camera.isVisible(s.x1, s.y1, 60)) continue;
      const p1 = camera.worldToScreen(s.x1, s.y1);
      const p2 = camera.worldToScreen(s.x2, s.y2);
      ctx.globalAlpha = Math.min(1, s.life / 2.2);
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  draw(ctx, camera) {
    const zoom = camera.zoom;

    for (const p of this.particles) {
      if (p.additive) continue;
      const pos = camera.worldToScreen(p.x, p.y, p.z);
      const alpha = p.life / p.maxLife;
      if (p.type === 'smoke') {
        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * zoom * (1.4 - alpha * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.particles) {
      if (!p.additive) continue;
      const pos = camera.worldToScreen(p.x, p.y, p.z);
      const alpha = p.life / p.maxLife;

      if (p.type === 'fire') {
        ctx.globalAlpha = alpha * 0.72;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * zoom * (0.75 + alpha * 0.45), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * zoom;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(
        pos.x - p.vx * 0.018 * zoom,
        pos.y - p.vy * 0.018 * zoom
      );
      ctx.stroke();
    }

    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.maxLife;
      const radius = ring.radius + (ring.endRadius - ring.radius) * t;
      const pos = camera.worldToScreen(ring.x, ring.y, 2);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * (1 - t * 0.5);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, radius * zoom, radius * zoom * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const arc of this.arcs) {
      const t = 1 - arc.life / arc.maxLife;
      const tx = arc.target ? arc.target.x : arc.fromX;
      const ty = arc.target ? arc.target.y : arc.fromY;
      const curX = arc.fromX + (tx - arc.fromX) * t;
      const curY = arc.fromY + (ty - arc.fromY) * t;
      const curZ = Math.sin(t * Math.PI) * 38;
      const pos = camera.worldToScreen(curX, curY, curZ);
      const startPos = camera.worldToScreen(arc.fromX, arc.fromY, 2);

      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 3 * zoom;
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5.5 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 13px "SFMono-Regular", ui-monospace, monospace`;

    for (const text of this.texts) {
      const alpha = Math.min(1, text.life / text.maxLife * 1.8);
      const pos = camera.worldToScreen(text.x, text.y, text.z);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${text.size}px "SFMono-Regular", ui-monospace, monospace`;
      ctx.fillStyle = text.color;
      ctx.shadowColor = text.color;
      ctx.shadowBlur = 12;
      ctx.fillText(text.text, pos.x, pos.y);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
