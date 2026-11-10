import { VIEW } from '../config.js';
import { clamp, damp, rand } from './math.js';

export class Camera {
  constructor(world) {
    this.worldW = world.width;
    this.worldH = world.height;
    this.x = this.worldW / 2;
    this.y = this.worldH / 2;
    this.baseZoom = 1;
    this.zoom = 1;
    this.dynamicZoom = 1;
    this.zoomPunch = 0;
    this.yScale = VIEW.yScale;
    this.viewW = 1;
    this.viewH = 1;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.offsetY = 48;
    this.lookX = 0;
    this.lookY = 0;
  }

  setViewport(width, height) {
    this.viewW = width;
    this.viewH = height;

    const fit = Math.min(width / 1440, height / 820);
    this.baseZoom = clamp(fit, VIEW.zoomMin, VIEW.zoomMax);
    this.zoom = this.baseZoom * this.dynamicZoom + this.zoomPunch;
    this.clampToWorld();
  }

  snapTo(target) {
    this.lookX = 0;
    this.lookY = 0;
    this.x = target.x;
    this.y = target.y - this.offsetY;
    this.clampToWorld();
  }

  follow(target, dt) {
    const vel = target.velocity || { x: 0, y: 0 };
    const leadScale = target.boosting ? 0.24 : 0.16;
    const targetLookX = clamp(vel.x * leadScale, -110, 110);
    const targetLookY = clamp(vel.y * leadScale, -85, 85);
    this.lookX = damp(this.lookX, targetLookX, 3.8, dt);
    this.lookY = damp(this.lookY, targetLookY, 3.8, dt);

    const desiredX = target.x + this.lookX;
    const desiredY = target.y - this.offsetY + this.lookY;

    this.x = damp(this.x, desiredX, 6.2, dt);
    this.y = damp(this.y, desiredY, 6.2, dt);

    const speedRatio = target.speedRatio || 0;
    const targetDynZoom = 1 - clamp(speedRatio - 0.35, 0, 1) * 0.085 - (target.boosting ? 0.035 : 0);
    this.dynamicZoom = damp(this.dynamicZoom, targetDynZoom, 4.2, dt);
    this.zoom = clamp(
      this.baseZoom * this.dynamicZoom + this.zoomPunch,
      VIEW.zoomMin * 0.86,
      VIEW.zoomMax * 1.15
    );

    this.clampToWorld();
  }

  followPair(first, second, dt) {
    const midpointX = (first.x + second.x) * 0.5;
    const midpointY = (first.y + second.y) * 0.5;
    const spanX = Math.abs(first.x - second.x) + 520;
    const spanY = Math.abs(first.y - second.y) + 380;
    const fitZoom = Math.min(
      this.baseZoom,
      this.viewW / spanX,
      this.viewH / (spanY * this.yScale)
    );
    const targetZoom = clamp(fitZoom, 0.36, this.baseZoom);
    const meanVelocityX = ((first.velocity?.x || 0) + (second.velocity?.x || 0)) * 0.5;
    const meanVelocityY = ((first.velocity?.y || 0) + (second.velocity?.y || 0)) * 0.5;
    const desiredX = midpointX + clamp(meanVelocityX * 0.12, -90, 90);
    const desiredY = midpointY - this.offsetY + clamp(meanVelocityY * 0.12, -70, 70);

    this.x = damp(this.x, desiredX, 5.2, dt);
    this.y = damp(this.y, desiredY, 5.2, dt);
    this.dynamicZoom = damp(this.dynamicZoom, targetZoom / this.baseZoom, 3.2, dt);
    this.zoom = clamp(
      this.baseZoom * this.dynamicZoom + this.zoomPunch,
      0.34,
      VIEW.zoomMax * 1.15
    );
    this.clampToWorld();
  }

  addShake(amount) {
    this.shake = clamp(this.shake + amount, 0, 1.35);
  }

  addZoomPunch(amount = 0.045) {
    this.zoomPunch = clamp(this.zoomPunch + amount, -0.1, 0.12);
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.8);
    this.zoomPunch = damp(this.zoomPunch, 0, 9.5, dt);
    const power = this.shake * this.shake * 16;
    this.shakeX = rand(-power, power);
    this.shakeY = rand(-power, power);
  }

  clampToWorld() {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom * this.yScale);

    if (this.worldW <= halfW * 2) this.x = this.worldW / 2;
    else this.x = clamp(this.x, halfW, this.worldW - halfW);

    if (this.worldH <= halfH * 2) this.y = this.worldH / 2;
    else this.y = clamp(this.y, halfH, this.worldH - halfH);
  }

  worldToScreen(x, y, z = 0) {
    return {
      x: (x - this.x) * this.zoom + this.viewW / 2 + this.shakeX - z * this.zoom * VIEW.zX,
      y:
        (y - this.y) * this.zoom * this.yScale +
        this.viewH / 2 +
        this.shakeY -
        z * this.zoom * VIEW.zY
    };
  }

  getViewBounds(padding = 0) {
    const halfW = this.viewW / (2 * this.zoom) + padding;
    const halfH = this.viewH / (2 * this.zoom * this.yScale) + padding;
    return {
      left: this.x - halfW,
      right: this.x + halfW,
      top: this.y - halfH,
      bottom: this.y + halfH
    };
  }

  isVisible(x, y, margin = 80) {
    const bounds = this.getViewBounds(margin);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }
}
