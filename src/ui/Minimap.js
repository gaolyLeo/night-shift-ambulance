import { clamp, TAU } from '../core/math.js';

export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.accumulator = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
  }

  update(dt) {
    this.accumulator += dt;
    if (this.accumulator < 0.07) return;
    this.accumulator = 0;
    this.draw();
  }

  draw() {
    const { ctx } = this;
    const game = this.game;
    const city = game.city;
    const w = this.width;
    const h = this.height;
    if (w < 10 || h < 10) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4, 8, 17, 0.92)';
    ctx.fillRect(0, 0, w, h);

    const pad = 7;
    const scale = Math.min((w - pad * 2) / city.width, (h - pad * 2) / city.height);
    const ox = (w - city.width * scale) / 2;
    const oy = (h - city.height * scale) / 2;

    ctx.save();
    ctx.globalAlpha = 0.74;
    ctx.drawImage(city.groundCanvas, ox, oy, city.width * scale, city.height * scale);
    ctx.restore();

    ctx.fillStyle = 'rgba(4, 8, 17, 0.34)';
    ctx.fillRect(0, 0, w, h);

    const toMap = (x, y) => ({ x: ox + x * scale, y: oy + y * scale });

    // Viewport.
    const bounds = game.camera.getViewBounds(0);
    ctx.strokeStyle = 'rgba(93, 233, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      ox + bounds.left * scale,
      oy + bounds.top * scale,
      (bounds.right - bounds.left) * scale,
      (bounds.bottom - bounds.top) * scale
    );

    // Hospital.
    const hospital = city.hospital;
    const hp = toMap(hospital.center.x, hospital.center.y);
    ctx.strokeStyle = '#ff5268';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#ff5268';
    ctx.fillRect(hp.x - 1, hp.y - 4, 2, 8);
    ctx.fillRect(hp.x - 4, hp.y - 1, 8, 2);

    // Waiting patients.
    const blink = Math.floor(game.time * 3) % 2 === 0;
    for (const patient of game.patients.waiting) {
      const p = toMap(patient.x, patient.y);
      const urgent = patient.source === 'accident';
      ctx.globalAlpha = urgent && patient.remaining < 12 && !blink ? 0.3 : 1;
      ctx.fillStyle = urgent ? '#ff5268' : '#ffd479';
      ctx.beginPath();
      ctx.arc(p.x, p.y, urgent ? 2.8 : 2.4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Traffic.
    ctx.fillStyle = 'rgba(190, 220, 255, 0.28)';
    for (const car of game.traffic) {
      const p = toMap(car.x, car.y);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    // Player.
    const pp = toMap(game.player.x, game.player.y);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(game.player.angle);
    ctx.fillStyle = '#eaf7ff';
    ctx.shadowColor = '#5de9ff';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3.5, -3.5);
    ctx.lineTo(-1.5, 0);
    ctx.lineTo(-3.5, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (game.pvp.active) {
      const rival = game.pvp.opponent;
      const rp = toMap(rival.x, rival.y);
      ctx.save();
      ctx.translate(rp.x, rp.y);
      ctx.rotate(rival.angle);
      ctx.fillStyle = '#ff5f9e';
      ctx.shadowColor = '#ff5f9e';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3.5, -3.5);
      ctx.lineTo(-1.5, 0);
      ctx.lineTo(-3.5, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Scan sweep.
    const sweep = (game.time * 0.3) % 1;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#5de9ff';
    ctx.fillRect(ox, oy + sweep * city.height * scale, city.width * scale, 1);
    ctx.restore();
  }
}
