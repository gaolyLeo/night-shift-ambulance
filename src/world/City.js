import { WORLD, CITY } from '../config.js';
import {
  clamp,
  circleRect,
  distanceSq,
  pick,
  rand,
  randInt,
  resolveCircleRect
} from '../core/math.js';

const BUILDING_PALETTES = [
  { east: '#0c1526', wall: '#182946', roof: '#263d66', accent: '#5de9ff', window: 'rgba(124, 234, 255, 0.78)' },
  { east: '#130e22', wall: '#261c42', roof: '#382a60', accent: '#ff5f9e', window: 'rgba(255, 160, 198, 0.72)' },
  { east: '#0b1720', wall: '#162d3d', roof: '#224459', accent: '#7dffb2', window: 'rgba(160, 255, 204, 0.65)' },
  { east: '#15121d', wall: '#282238', roof: '#3c3354', accent: '#ffd479', window: 'rgba(255, 226, 160, 0.68)' },
  { east: '#0c1324', wall: '#182544', roof: '#263966', accent: '#8b9dff', window: 'rgba(168, 186, 255, 0.7)' }
];

export class City {
  constructor() {
    this.blockW = WORLD.blockW;
    this.blockH = WORLD.blockH;
    this.roadW = WORLD.roadW;
    this.sidewalk = WORLD.sidewalk;
    this.width = WORLD.cols * this.blockW + (WORLD.cols + 1) * this.roadW;
    this.height = WORLD.rows * this.blockH + (WORLD.rows + 1) * this.roadW;

    this.blocks = [];
    this.buildings = [];
    this.trees = [];
    this.props = [];
    this.trafficRoutes = [];
    this.hospital = null;

    this.generate();
  }

  generate() {
    for (let row = 0; row < WORLD.rows; row += 1) {
      for (let col = 0; col < WORLD.cols; col += 1) {
        const x = this.roadW + col * (this.blockW + this.roadW);
        const y = this.roadW + row * (this.blockH + this.roadW);
        const isHospital = col === CITY.hospitalBlock.col && row === CITY.hospitalBlock.row;
        const isHospitalPlaza =
          col === CITY.hospitalBlock.col && row === CITY.hospitalBlock.row + 1;
        const type = isHospital
          ? 'hospital'
          : isHospitalPlaza || Math.random() < 0.16
            ? 'park'
            : 'buildings';

        const block = {
          col,
          row,
          x,
          y,
          w: this.blockW,
          h: this.blockH,
          type,
          walkway: {
            x: x + 14,
            y: y + 14,
            w: this.blockW - 28,
            h: this.blockH - 28
          }
        };

        this.blocks.push(block);

        if (type === 'hospital') this.buildHospital(block);
        else if (type === 'park') this.buildPark(block);
        else this.buildCityBlock(block);

        this.addLamps(block);

        const inset = 26;
        this.trafficRoutes.push([
          { x: x - this.roadW / 2 + inset, y: y - this.roadW / 2 + inset },
          { x: x + block.w + this.roadW / 2 - inset, y: y - this.roadW / 2 + inset },
          { x: x + block.w + this.roadW / 2 - inset, y: y + block.h + this.roadW / 2 - inset },
          { x: x - this.roadW / 2 + inset, y: y + block.h + this.roadW / 2 - inset }
        ]);
      }
    }

    this.normalBlocks = this.blocks.filter((block) => block.type !== 'hospital');

    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = this.width;
    this.groundCanvas.height = this.height;
    this.paintGround();
  }

  buildHospital(block) {
    const building = {
      id: 'hospital',
      x: block.x + 42,
      y: block.y + 32,
      w: block.w - 84,
      h: 166,
      height: 165,
      palette: BUILDING_PALETTES[1],
      isHospital: true,
      seed: Math.random() * 1000
    };
    this.buildings.push(building);

    const zone = {
      x: block.x + 48,
      y: block.y + 205,
      w: block.w - 96,
      h: 116
    };

    this.hospital = {
      block,
      building,
      zone,
      center: { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 },
      entrance: { x: zone.x + zone.w / 2, y: zone.y + zone.h + 8 }
    };

    this.trees.push(
      { x: block.x + 22, y: block.y + block.h - 20, r: 15, height: 34, phase: rand(0, 6.28) },
      { x: block.x + block.w - 22, y: block.y + block.h - 20, r: 14, height: 31, phase: rand(0, 6.28) }
    );
  }

  buildPark(block) {
    const count = randInt(5, 9);
    for (let i = 0; i < count; i += 1) {
      let x;
      let y;
      let tries = 0;
      do {
        x = rand(block.x + 42, block.x + block.w - 42);
        y = rand(block.y + 42, block.y + block.h - 42);
        tries += 1;
      } while (tries < 20 && this.trees.some((tree) => distanceSq(tree.x, tree.y, x, y) < 44 * 44));

      this.trees.push({
        x,
        y,
        r: rand(13, 24),
        height: rand(28, 50),
        phase: rand(0, 6.28),
        park: true
      });
    }
  }

  buildCityBlock(block) {
    const lot = {
      x: block.x + this.sidewalk + 14,
      y: block.y + this.sidewalk + 14,
      w: block.w - (this.sidewalk + 14) * 2,
      h: block.h - (this.sidewalk + 14) * 2
    };

    const count = pick([1, 1, 2, 2]);
    const rects = this.splitLot(lot, count);
    const palette = pick(BUILDING_PALETTES);

    rects.forEach((rect, index) => {
      const inset = rand(2, 6);
      const w = rect.w - inset * 2;
      const h = rect.h - inset * 2;
      if (w < 44 || h < 44) return;

      this.buildings.push({
        id: `${block.col}:${block.row}:${index}`,
        x: rect.x + inset,
        y: rect.y + inset,
        w,
        h,
        height: rand(135, 240),
        palette: Math.random() < 0.72 ? palette : pick(BUILDING_PALETTES),
        seed: Math.random() * 1000
      });
    });
  }

  splitLot(lot, count) {
    // Wide passable alley gap so the ambulance never gets wedged between two buildings.
    const gap = 64;
    const inset = 4;
    const base = {
      x: lot.x + inset,
      y: lot.y + inset,
      w: lot.w - inset * 2,
      h: lot.h - inset * 2
    };

    if (count === 1) return [base];

    return Math.random() < 0.55
      ? this.splitSideBySide(base, gap)
      : this.splitStacked(base, gap);
  }

  splitSideBySide(rect, gap) {
    const ratio = rand(0.44, 0.56);
    const w = Math.max(60, (rect.w - gap) * ratio);
    return [
      { x: rect.x, y: rect.y, w, h: rect.h },
      { x: rect.x + w + gap, y: rect.y, w: rect.w - w - gap, h: rect.h }
    ];
  }

  splitStacked(rect, gap) {
    const ratio = rand(0.44, 0.56);
    const h = Math.max(58, (rect.h - gap) * ratio);
    return [
      { x: rect.x, y: rect.y, w: rect.w, h },
      { x: rect.x, y: rect.y + h + gap, w: rect.w, h: rect.h - h - gap }
    ];
  }

  addLamps(block) {
    const corners = [
      { x: block.x + 9, y: block.y + 9, dir: 1 },
      { x: block.x + block.w - 9, y: block.y + block.h - 9, dir: -1 }
    ];

    for (const corner of corners) {
      this.props.push({
        type: 'lamp',
        x: corner.x,
        y: corner.y,
        height: rand(30, 38),
        phase: rand(0, 6.28),
        color: Math.random() < 0.5 ? '#5de9ff' : '#ff8fb7'
      });
    }
  }

  collideCircle(body, radius) {
    let hit = false;
    body.hitNormal = null;

    for (const building of this.buildings) {
      if (circleRect(body.x, body.y, radius, building) && resolveCircleRect(body, radius, building)) {
        hit = true;
      }
    }

    const minX = radius;
    const maxX = this.width - radius;
    const minY = radius;
    const maxY = this.height - radius;

    if (body.x < minX) {
      body.x = minX;
      body.hitNormal = { nx: 1, ny: 0, rect: null };
      hit = true;
    } else if (body.x > maxX) {
      body.x = maxX;
      body.hitNormal = { nx: -1, ny: 0, rect: null };
      hit = true;
    }

    if (body.y < minY) {
      body.y = minY;
      body.hitNormal = { nx: 0, ny: 1, rect: null };
      hit = true;
    } else if (body.y > maxY) {
      body.y = maxY;
      body.hitNormal = { nx: 0, ny: -1, rect: null };
      hit = true;
    }

    return hit;
  }

  resolveFreePoint(x, y, margin = 22) {
    let px = clamp(x, margin, this.width - margin);
    let py = clamp(y, margin, this.height - margin);

    for (let pass = 0; pass < 3; pass += 1) {
      const building = this.buildings.find(
        (b) =>
          px > b.x - margin &&
          px < b.x + b.w + margin &&
          py > b.y - margin &&
          py < b.y + b.h + margin
      );
      if (!building) break;

      const centerX = building.x + building.w / 2;
      const centerY = building.y + building.h / 2;
      const dx = px - centerX;
      const dy = py - centerY;

      if (Math.abs(dx) > Math.abs(dy)) {
        px = dx > 0 ? building.x + building.w + margin : building.x - margin;
      } else {
        py = dy > 0 ? building.y + building.h + margin : building.y - margin;
      }
    }

    return { x: px, y: py };
  }

  randomWalkwayPoint(blocks = this.blocks) {
    const block = pick(blocks);
    const rect = block.walkway;
    const side = randInt(0, 3);
    const t = Math.random();

    if (side === 0) return { x: rect.x + rect.w * t, y: rect.y };
    if (side === 1) return { x: rect.x + rect.w, y: rect.y + rect.h * t };
    if (side === 2) return { x: rect.x + rect.w * (1 - t), y: rect.y + rect.h };
    return { x: rect.x, y: rect.y + rect.h * (1 - t) };
  }

  randomPatientPoint(avoid, minDistance = 380) {
    for (let i = 0; i < 30; i += 1) {
      const point = this.randomWalkwayPoint(this.normalBlocks);
      if (!avoid || distanceSq(point.x, point.y, avoid.x, avoid.y) > minDistance * minDistance) {
        return point;
      }
    }
    return this.randomWalkwayPoint(this.normalBlocks);
  }

  inHospitalZone(x, y, pad = 0) {
    if (!this.hospital) return false;
    const zone = this.hospital.zone;
    return (
      x > zone.x - pad &&
      x < zone.x + zone.w + pad &&
      y > zone.y - pad &&
      y < zone.y + zone.h + pad
    );
  }

  getHospitalSpawn() {
    const zone = this.hospital.zone;
    return {
      x: zone.x + zone.w / 2,
      y: zone.y + zone.h - 26
    };
  }

  paintGround() {
    const ctx = this.groundCanvas.getContext('2d');
    const { width, height } = this;

    ctx.fillStyle = '#0a0e19';
    ctx.fillRect(0, 0, width, height);

    // Asphalt variation bands.
    for (let i = 0; i < 90; i += 1) {
      const w = rand(80, 460);
      const h = rand(24, 80);
      const x = rand(0, width);
      const y = rand(0, height);
      ctx.fillStyle = `rgba(255, 255, 255, ${rand(0.004, 0.012)})`;
      ctx.fillRect(x, y, w, h);
    }

    // Blocks and their sidewalks/lots.
    for (const block of this.blocks) {
      ctx.fillStyle = '#101727';
      ctx.fillRect(block.x, block.y, block.w, block.h);

      ctx.strokeStyle = 'rgba(150, 193, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);

      const inner = {
        x: block.x + this.sidewalk,
        y: block.y + this.sidewalk,
        w: block.w - this.sidewalk * 2,
        h: block.h - this.sidewalk * 2
      };

      if (block.type === 'park') {
        ctx.fillStyle = '#0b1f1b';
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

        ctx.fillStyle = 'rgba(91, 170, 140, 0.08)';
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

        // Paths through the park.
        ctx.fillStyle = 'rgba(160, 190, 195, 0.09)';
        ctx.fillRect(inner.x + inner.w / 2 - 16, inner.y, 32, inner.h);
        ctx.fillRect(inner.x, inner.y + inner.h / 2 - 14, inner.w, 28);

        const pondX = inner.x + inner.w * rand(0.24, 0.76);
        const pondY = inner.y + inner.h * rand(0.28, 0.72);
        ctx.beginPath();
        ctx.ellipse(pondX, pondY, rand(28, 46), rand(16, 28), rand(0, 3.14), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(47, 135, 167, 0.22)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(93, 233, 255, 0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (block.type === 'hospital') {
        ctx.fillStyle = '#121422';
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

        const zone = this.hospital.zone;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 82, 104, 0.055)';
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        ctx.strokeStyle = 'rgba(255, 82, 104, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
        ctx.setLineDash([]);

        const cx = zone.x + zone.w / 2;
        const cy = zone.y + 28;
        ctx.fillStyle = 'rgba(255, 82, 104, 0.28)';
        ctx.fillRect(cx - 7, cy - 20, 14, 40);
        ctx.fillRect(cx - 20, cy - 7, 40, 14);

        ctx.fillStyle = 'rgba(255, 196, 210, 0.34)';
        ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('急救入口 · EMERGENCY', cx, zone.y + zone.h - 28);

        // Entry chevrons.
        ctx.strokeStyle = 'rgba(255, 82, 104, 0.3)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i += 1) {
          const yy = zone.y + zone.h - 50 + i * 8;
          ctx.beginPath();
          ctx.moveTo(cx - 20, yy);
          ctx.lineTo(cx, yy + 9);
          ctx.lineTo(cx + 20, yy);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = '#0b1220';
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
        ctx.strokeStyle = 'rgba(143, 190, 255, 0.055)';
        ctx.lineWidth = 1;
        ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);

        // Plaza glow.
        const gradient = ctx.createRadialGradient(
          inner.x + inner.w / 2,
          inner.y + inner.h / 2,
          10,
          inner.x + inner.w / 2,
          inner.y + inner.h / 2,
          inner.w * 0.55
        );
        gradient.addColorStop(0, 'rgba(93, 233, 255, 0.035)');
        gradient.addColorStop(1, 'rgba(93, 233, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      }

      // Sidewalk seams.
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.055)';
      ctx.lineWidth = 1;
      for (let x = block.x + 46; x < block.x + block.w; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, block.y);
        ctx.lineTo(x, block.y + this.sidewalk);
        ctx.moveTo(x, block.y + block.h - this.sidewalk);
        ctx.lineTo(x, block.y + block.h);
        ctx.stroke();
      }
      for (let y = block.y + 46; y < block.y + block.h; y += 46) {
        ctx.beginPath();
        ctx.moveTo(block.x, y);
        ctx.lineTo(block.x + this.sidewalk, y);
        ctx.moveTo(block.x + block.w - this.sidewalk, y);
        ctx.lineTo(block.x + block.w, y);
        ctx.stroke();
      }
    }

    this.paintRoads(ctx);
    this.paintIntersectionLights(ctx);
  }

  paintRoads(ctx) {
    const cw = this.blockW + this.roadW;
    const ch = this.blockH + this.roadW;

    ctx.save();
    ctx.strokeStyle = 'rgba(190, 216, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 22]);

    // Dash lines along vertical roads, in the stretches next to blocks.
    for (let i = 0; i <= WORLD.cols; i += 1) {
      const x = i * cw + this.roadW / 2;
      for (let row = 0; row < WORLD.rows; row += 1) {
        const y1 = row * ch + this.roadW;
        const y2 = y1 + this.blockH;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
      }
    }

    // Dash lines along horizontal roads.
    for (let i = 0; i <= WORLD.rows; i += 1) {
      const y = i * ch + this.roadW / 2;
      for (let col = 0; col < WORLD.cols; col += 1) {
        const x1 = col * cw + this.roadW;
        const x2 = x1 + this.blockW;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);

    // Stop lines near intersections.
    ctx.strokeStyle = 'rgba(210, 228, 255, 0.16)';
    ctx.lineWidth = 3;
    for (const block of this.blocks) {
      const left = block.x - this.roadW;
      const top = block.y - this.roadW;
      const right = block.x + block.w;
      const bottom = block.y + block.h;

      // Left road top approach.
      ctx.beginPath();
      ctx.moveTo(left + 28, top + this.roadW - 10);
      ctx.lineTo(left + this.roadW - 28, top + this.roadW - 10);
      ctx.stroke();

      // Top road left approach.
      ctx.beginPath();
      ctx.moveTo(left + this.roadW - 10, top + 28);
      ctx.lineTo(left + this.roadW - 10, top + this.roadW - 28);
      ctx.stroke();

      // Right road bottom approach.
      ctx.beginPath();
      ctx.moveTo(right + 28, bottom + 10);
      ctx.lineTo(right + this.roadW - 28, bottom + 10);
      ctx.stroke();

      // Bottom road right approach.
      ctx.beginPath();
      ctx.moveTo(right + 10, bottom + 28);
      ctx.lineTo(right + 10, bottom + this.roadW - 28);
      ctx.stroke();
    }

    // Crosswalks around the hospital and a few intersections.
    const crosswalkAt = (cx, cy, horizontal) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(228, 240, 255, 0.24)';
      ctx.lineWidth = 5;
      for (let i = -3; i <= 3; i += 1) {
        ctx.beginPath();
        if (horizontal) {
          const x = cx + i * 15;
          ctx.moveTo(x, cy - 36);
          ctx.lineTo(x, cy + 36);
        } else {
          const y = cy + i * 15;
          ctx.moveTo(cx - 36, y);
          ctx.lineTo(cx + 36, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    if (this.hospital) {
      const block = this.hospital.block;
      crosswalkAt(block.x + block.w / 2, block.y + block.h + this.roadW / 2, false);
      crosswalkAt(block.x + block.w + this.roadW / 2, block.y + block.h / 2, true);
    }

    for (let i = 0; i < 4; i += 1) {
      const block = pick(this.blocks);
      const horizontal = Math.random() < 0.5;
      if (horizontal) {
        crosswalkAt(block.x + block.w / 2, block.y + block.h + this.roadW / 2, false);
      } else {
        crosswalkAt(block.x + block.w + this.roadW / 2, block.y + block.h / 2, true);
      }
    }
  }

  paintIntersectionLights(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let row = 0; row <= WORLD.rows; row += 1) {
      for (let col = 0; col <= WORLD.cols; col += 1) {
        const x = col * (this.blockW + this.roadW) + this.roadW / 2;
        const y = row * (this.blockH + this.roadW) + this.roadW / 2;
        const color = (row + col) % 3 === 0 ? '255, 95, 158' : '93, 233, 255';
        const radius = 150;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(${color}, 0.055)`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }

    ctx.restore();
  }
}
