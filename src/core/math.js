export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, smoothing, dt) {
  return lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

export function shortestAngle(from, to) {
  return normalizeAngle(to - from);
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function approach(value, target, delta) {
  if (value < target) return Math.min(value + delta, target);
  return Math.max(value - delta, target);
}

export function circleRect(cx, cy, radius, rect, cornerRadius = 18) {
  const cr = Math.min(cornerRadius, rect.w * 0.25, rect.h * 0.25);
  const nx = clamp(cx, rect.x + cr, rect.x + rect.w - cr);
  const ny = clamp(cy, rect.y + cr, rect.y + rect.h - cr);
  const r = radius + cr;
  return distanceSq(cx, cy, nx, ny) <= r * r;
}

/**
 * Push a circle out of an axis-aligned rectangle with rounded corners.
 * Mutates and returns true if a collision occurred, recording hitNormal on body.
 */
export function resolveCircleRect(body, radius, rect, cornerRadius = 18) {
  const cr = Math.min(cornerRadius, rect.w * 0.25, rect.h * 0.25);
  const nx = clamp(body.x, rect.x + cr, rect.x + rect.w - cr);
  const ny = clamp(body.y, rect.y + cr, rect.y + rect.h - cr);
  const dx = body.x - nx;
  const dy = body.y - ny;
  const d2 = dx * dx + dy * dy;
  const effectiveRadius = radius + cr;

  if (d2 > effectiveRadius * effectiveRadius) return false;

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = effectiveRadius - d;
    const normX = dx / d;
    const normY = dy / d;
    body.x += normX * push;
    body.y += normY * push;
    body.hitNormal = { nx: normX, ny: normY, rect };
  } else {
    // Center is inside the core rectangle: push toward the nearest edge.
    const left = body.x - rect.x;
    const right = rect.x + rect.w - body.x;
    const top = body.y - rect.y;
    const bottom = rect.y + rect.h - body.y;
    const min = Math.min(left, right, top, bottom);

    if (min === left) {
      body.x = rect.x - radius;
      body.hitNormal = { nx: -1, ny: 0, rect };
    } else if (min === right) {
      body.x = rect.x + rect.w + radius;
      body.hitNormal = { nx: 1, ny: 0, rect };
    } else if (min === top) {
      body.y = rect.y - radius;
      body.hitNormal = { nx: 0, ny: -1, rect };
    } else {
      body.y = rect.y + rect.h + radius;
      body.hitNormal = { nx: 0, ny: 1, rect };
    }
  }

  return true;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
