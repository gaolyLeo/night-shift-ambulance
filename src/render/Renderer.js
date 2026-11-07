import { AMBULANCE, VIEW } from '../config.js';
import { clamp, roundRectPath, TAU } from '../core/math.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.background = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background = ctx.createLinearGradient(0, 0, width * 0.35, height);
    this.background.addColorStop(0, '#070b17');
    this.background.addColorStop(0.55, '#050711');
    this.background.addColorStop(1, '#090612');
  }

  screenAngle(angle) {
    return Math.atan2(Math.sin(angle) * VIEW.yScale, Math.cos(angle));
  }

  render() {
    const { ctx } = this;
    const game = this.game;
    const camera = game.camera;
    const city = game.city;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGround(ctx, camera, city);
    this.drawBlockCurbs(ctx, camera, city);
    this.drawHospitalRing(ctx, camera, game);
    game.effects.drawGroundEffects(ctx, camera);
    this.drawBuildingShadows(ctx, camera, city);
    this.drawDrawables(ctx, camera, game);

    this.drawHospitalMarker(ctx, camera, game);
    this.drawPatientMarkers(ctx, camera, game);

    game.effects.draw(ctx, camera);

    if (game.state === 'playing') {
      this.drawOffscreenIndicators(ctx, camera, game);
    }

    if (game.dangerFlash > 0) {
      ctx.fillStyle = `rgba(255, 30, 60, ${game.dangerFlash * 0.28})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.globalAlpha = 1;
  }

  drawGround(ctx, camera, city) {
    const bounds = camera.getViewBounds(120);
    const left = clamp(bounds.left, 0, city.width - 1);
    const top = clamp(bounds.top, 0, city.height - 1);
    const right = clamp(bounds.right, 0, city.width);
    const bottom = clamp(bounds.bottom, 0, city.height);
    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0) return;

    const pos = camera.worldToScreen(left, top);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      city.groundCanvas,
      left,
      top,
      w,
      h,
      pos.x,
      pos.y,
      w * camera.zoom,
      h * camera.zoom * camera.yScale
    );

    // Dark fade outside the world.
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    const worldTopLeft = camera.worldToScreen(0, 0);
    const worldSize = {
      w: city.width * camera.zoom,
      h: city.height * camera.zoom * camera.yScale
    };
    if (worldTopLeft.x > 0) ctx.fillRect(0, 0, worldTopLeft.x, this.height);
    if (worldTopLeft.y > 0) ctx.fillRect(0, 0, this.width, worldTopLeft.y);
    if (worldTopLeft.x + worldSize.w < this.width) {
      ctx.fillRect(worldTopLeft.x + worldSize.w, 0, this.width, this.height);
    }
    if (worldTopLeft.y + worldSize.h < this.height) {
      ctx.fillRect(0, worldTopLeft.y + worldSize.h, this.width, this.height);
    }
    ctx.restore();
  }

  drawBlockCurbs(ctx, camera, city) {
    const curbH = 9;
    const zoom = camera.zoom;
    const hx = curbH * zoom * VIEW.zX;
    const hy = curbH * zoom * VIEW.zY;

    ctx.save();
    for (const block of city.blocks) {
      if (!camera.isVisible(block.x + block.w / 2, block.y + block.h / 2, block.w)) continue;
      const p0 = camera.worldToScreen(block.x, block.y);
      const p1 = camera.worldToScreen(block.x + block.w, block.y + block.h);
      const x0 = p0.x;
      const y0 = p0.y;
      const x1 = p1.x;
      const y1 = p1.y;

      // Drop shadow cast by raised block curb onto road
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fillRect(x0 + 3, y1, x1 - x0 + 2, 5 * zoom);
      ctx.fillRect(x1, y0 + 3, 5 * zoom, y1 - y0 + 2);

      // East curb wall
      ctx.beginPath();
      ctx.moveTo(x1, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - hx, y1 - hy);
      ctx.lineTo(x1 - hx, y0 - hy);
      ctx.closePath();
      ctx.fillStyle = '#182238';
      ctx.fill();

      // South curb wall
      ctx.beginPath();
      ctx.moveTo(x0, y1);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - hx, y1 - hy);
      ctx.lineTo(x0 - hx, y1 - hy);
      ctx.closePath();
      ctx.fillStyle = '#22314f';
      ctx.fill();

      // Top curb bevel edge highlight
      ctx.strokeStyle = 'rgba(130, 195, 255, 0.28)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x0 - hx, y1 - hy);
      ctx.lineTo(x1 - hx, y1 - hy);
      ctx.lineTo(x1 - hx, y0 - hy);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHospitalRing(ctx, camera, game) {
    const hospital = game.city.hospital;
    if (!hospital) return;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 2.4);
    const pos = camera.worldToScreen(hospital.center.x, hospital.center.y);
    const visible = camera.isVisible(hospital.center.x, hospital.center.y, 200);
    if (!visible) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255, 82, 104, ${0.12 + pulse * 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(
      pos.x,
      pos.y,
      (58 + pulse * 16) * camera.zoom,
      (30 + pulse * 8) * camera.zoom,
      0,
      0,
      TAU
    );
    ctx.stroke();
    ctx.restore();
  }

  drawBuildingShadows(ctx, camera, city) {
    for (const b of city.buildings) {
      if (!camera.isVisible(b.x + b.w / 2, b.y + b.h / 2, b.w + 140)) continue;
      const offsetX = 7 + b.height * 0.16;
      const offsetY = 9 + b.height * 0.22;
      const p0 = camera.worldToScreen(b.x + offsetX, b.y + offsetY);
      const p1 = camera.worldToScreen(b.x + b.w + offsetX, b.y + b.h + offsetY);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(p0.x - 5, p0.y - 4, p1.x - p0.x + 10, p1.y - p0.y + 8);
    }
  }

  drawDrawables(ctx, camera, game) {
    const drawables = [];
    const px = game.player.x;
    const py = game.player.y;

    for (const b of game.city.buildings) {
      let sortY = b.y + b.h - 4;
      if (px >= b.x + b.w - 4 && py >= b.y - 24 && py <= b.y + b.h + 24) {
        sortY = Math.min(sortY, py - 2);
      }
      drawables.push({ sortY, type: 'building', value: b });
    }
    for (const tree of game.city.trees) {
      drawables.push({ sortY: tree.y, type: 'tree', value: tree });
    }
    for (const prop of game.city.props) {
      drawables.push({ sortY: prop.y, type: 'prop', value: prop });
    }
    for (const car of game.traffic) {
      drawables.push({ sortY: car.y, type: 'traffic', value: car });
    }
    for (const pedestrian of game.pedestrians) {
      drawables.push({ sortY: pedestrian.y, type: 'pedestrian', value: pedestrian });
    }
    for (const patient of game.patients.waiting) {
      drawables.push({ sortY: patient.y, type: 'patient', value: patient });
    }
    drawables.push({ sortY: game.player.y + 2, type: 'player', value: game.player });

    drawables.sort((a, b) => a.sortY - b.sortY);

    for (const item of drawables) {
      switch (item.type) {
        case 'building':
          this.drawBuilding(ctx, camera, item.value, game);
          break;
        case 'tree':
          this.drawTree(ctx, camera, item.value, game);
          break;
        case 'prop':
          this.drawLamp(ctx, camera, item.value, game);
          break;
        case 'traffic':
          this.drawTrafficCar(ctx, camera, item.value);
          break;
        case 'pedestrian':
          this.drawPedestrian(ctx, camera, item.value);
          break;
        case 'patient':
          this.drawPatient(ctx, camera, item.value, game);
          break;
        case 'player':
          this.drawAmbulance(ctx, camera, item.value, game);
          break;
        default:
          break;
      }
    }
  }

  drawBuilding(ctx, camera, b, game) {
    const topLeft = camera.worldToScreen(b.x, b.y);
    const bottomRight = camera.worldToScreen(b.x + b.w, b.y + b.h);
    const x0 = topLeft.x;
    const x1 = bottomRight.x;
    const y0 = topLeft.y;
    const y1 = bottomRight.y;
    const zoom = camera.zoom;
    const hx = b.height * zoom * VIEW.zX;
    const hy = b.height * zoom * VIEW.zY;
    const palette = b.palette;
    const faceW = x1 - x0;
    const faceD = y1 - y0;

    // Screen-space bounds include the leaning roof and base walls.
    const left = x0 - hx;
    const right = x1;
    const top = y0 - hy;
    const bottom = y1;

    if (right < -80 || left > this.width + 80 || bottom < -80 || top > this.height + 80) {
      return;
    }

    // Map a point on the south wall: u along width, v up from pavement to roof.
    const southPoint = (u, v) => ({
      x: x0 + faceW * u - hx * v,
      y: y1 - hy * v
    });
    // Map a point on the east side wall: t along depth, v up from pavement.
    const eastPoint = (t, v) => ({
      x: x1 - hx * v,
      y: y0 + faceD * t - hy * v
    });

    const playerScreen = camera.worldToScreen(game.player.x, game.player.y);
    const occludesPlayer =
      b.y + b.h > game.player.y &&
      playerScreen.x > left - 4 &&
      playerScreen.x < right + 4 &&
      playerScreen.y > top - 4 &&
      playerScreen.y < bottom;
    const baseAlpha = occludesPlayer ? 0.32 : 1;

    const addQuad = (pathLike, points) => {
      pathLike.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        pathLike.lineTo(points[i].x, points[i].y);
      }
      pathLike.closePath();
    };

    const drawWindowGrid = ({
      rows,
      cols,
      winU,
      winV,
      pointAt,
      hash,
      litThreshold,
      litColor,
      darkColor
    }) => {
      const lit = [];
      const dark = [];

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const u = (col + 0.5) / cols;
          const v = (row + 0.52) / rows;
          const n = Math.sin(hash(row, col)) * 43758.5453;
          const quad = [
            pointAt(u - winU, v - winV),
            pointAt(u + winU, v - winV),
            pointAt(u + winU, v + winV),
            pointAt(u - winU, v + winV)
          ];
          if (n - Math.floor(n) > litThreshold) lit.push(quad);
          else dark.push(quad);
        }
      }

      for (const [quads, color] of [
        [lit, litColor],
        [dark, darkColor]
      ]) {
        if (quads.length === 0) continue;
        ctx.beginPath();
        for (const quad of quads) addQuad(ctx, quad);
        ctx.fillStyle = color;
        ctx.fill();
      }
    };

    ctx.save();
    ctx.globalAlpha = baseAlpha;

    // The camera sees the east side wall (right) because the roof leans left.
    ctx.beginPath();
    ctx.moveTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - hx, y1 - hy);
    ctx.lineTo(x1 - hx, y0 - hy);
    ctx.closePath();
    ctx.fillStyle = palette.east || palette.wall;
    ctx.fill();

    // East wall multi-story skyscraper windows.
    if (faceD > 36 && hy > 26) {
      const eastCols = clamp(Math.floor(faceD / 28), 2, 6);
      const eastRows = clamp(Math.floor(hy / 18), 4, 10);
      drawWindowGrid({
        rows: eastRows,
        cols: eastCols,
        winU: Math.min(0.26 / eastCols, 8 / faceD),
        winV: Math.min(0.26 / eastRows, 6 / hy),
        pointAt: eastPoint,
        hash: (row, col) => b.seed * 2.31 + row * 31.7 + col * 17.17,
        litThreshold: 0.62,
        litColor: palette.window,
        darkColor: 'rgba(3, 7, 14, 0.52)'
      });
    }

    // South front wall.
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - hx, y1 - hy);
    ctx.lineTo(x0 - hx, y1 - hy);
    ctx.closePath();
    ctx.fillStyle = palette.wall;
    ctx.fill();

    const wallShade = ctx.createLinearGradient(x0 - hx * 0.5, y1 - hy, x0, y1);
    wallShade.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    wallShade.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    wallShade.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = wallShade;
    ctx.fill();

    // Multi-story floor bands follow the slant of the south and east walls.
    const floors = clamp(Math.round(hy / 18), 4, 11);
    ctx.strokeStyle = 'rgba(120, 150, 190, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let row = 1; row < floors; row += 1) {
      const v = row / floors;
      const a = southPoint(0, v);
      const b = southPoint(1, v);
      const c = eastPoint(0, v);
      const d = eastPoint(1, v);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();

    // Dense multi-story front facade windows.
    if (faceW > 48 && hy > 30) {
      const cols = clamp(Math.floor(faceW / 24), 3, 12);
      const rows = clamp(Math.floor(hy / 18), 4, 10);
      drawWindowGrid({
        rows,
        cols,
        winU: Math.min(0.32 / cols, 10 / faceW),
        winV: Math.min(0.28 / rows, 6.5 / hy),
        pointAt: southPoint,
        hash: (row, col) => b.seed * 1.7 + row * 12.9898 + col * 78.233,
        litThreshold: 0.44,
        litColor: palette.window,
        darkColor: 'rgba(4, 8, 15, 0.72)'
      });
    }

    // Ground floor entrance is a parallelogram on the front facade.
    const doorU = Math.min(0.13, 28 / Math.max(1, faceW));
    const doorV = Math.min(0.3, 18 / Math.max(1, hy));
    if (hy > 18) {
      const door = [
        southPoint(0.5 - doorU, 0),
        southPoint(0.5 + doorU, 0),
        southPoint(0.5 + doorU, doorV),
        southPoint(0.5 - doorU, doorV)
      ];
      ctx.beginPath();
      addQuad(ctx, door);
      ctx.fillStyle = 'rgba(4, 8, 15, 0.78)';
      ctx.fill();

      const lintelA = southPoint(0.5 - doorU, doorV);
      const lintelB = southPoint(0.5 + doorU, doorV);
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = baseAlpha * 0.4;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(lintelA.x, lintelA.y);
      ctx.lineTo(lintelB.x, lintelB.y);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    }

    // Occasional neon sign strip on the facade.
    if (Math.sin(b.seed * 2.1) > 0.45 && faceW > 70) {
      const signA = southPoint(0.1, 0.82);
      const signB = southPoint(0.1 + Math.min(0.34, 60 / faceW), 0.82);
      const signC = southPoint(0.1 + Math.min(0.34, 60 / faceW), 0.86);
      const signD = southPoint(0.1, 0.86);
      ctx.beginPath();
      addQuad(ctx, [signA, signB, signC, signD]);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = baseAlpha * 0.42;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = baseAlpha;
    }

    // Roof plane, shifted up and left by the building height.
    const rx0 = x0 - hx;
    const ry0 = y0 - hy;
    ctx.fillStyle = palette.roof;
    ctx.fillRect(rx0, ry0, faceW, faceD);

    // 3D Recessed Roof Deck (parapet wall thickness around the perimeter).
    const parapet = Math.max(3, Math.min(7, Math.min(faceW, faceD) * 0.065));
    if (faceW > parapet * 3 && faceD > parapet * 3) {
      ctx.fillStyle = 'rgba(7, 12, 22, 0.58)';
      ctx.fillRect(rx0 + parapet, ry0 + parapet, faceW - parapet * 2, faceD - parapet * 2);

      // Inner parapet wall drop shadow on top & left edges
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fillRect(rx0 + parapet, ry0 + parapet, faceW - parapet * 2, Math.max(2, parapet * 0.55));
      ctx.fillRect(rx0 + parapet, ry0 + parapet, Math.max(2, parapet * 0.55), faceD - parapet * 2);
    }

    const roofShade = ctx.createLinearGradient(rx0, ry0, rx0 + faceW, ry0 + faceD);
    roofShade.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    roofShade.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
    ctx.fillStyle = roofShade;
    ctx.fillRect(rx0, ry0, faceW, faceD);

    // Roof seams.
    ctx.strokeStyle = 'rgba(4, 8, 16, 0.42)';
    ctx.lineWidth = 1;
    const roofMidY = (y0 + y1) / 2 - hy;
    const roofMidX = (x0 + x1) / 2 - hx;
    ctx.beginPath();
    ctx.moveTo(rx0 + parapet, roofMidY);
    ctx.lineTo(x1 - hx - parapet, roofMidY);
    ctx.moveTo(roofMidX, ry0 + parapet);
    ctx.lineTo(roofMidX, y1 - hy - parapet);
    ctx.stroke();

    // 3D Extruded Rooftop Penthouse & Secondary Mechanical Tower.
    if (faceD > 32 && faceW > 48) {
      const pentW = Math.min(faceW * 0.38, 68);
      const pentD = Math.min(faceD * 0.4, 46);
      const pentH = b.isHospital ? 34 : 22 + (Math.floor(b.seed) % 16);
      const phx = pentH * zoom * VIEW.zX;
      const phy = pentH * zoom * VIEW.zY;
      const px0 = rx0 + faceW * 0.16;
      const py0 = ry0 + faceD * 0.18;
      const px1 = px0 + pentW;
      const py1 = py0 + pentD;

      // Penthouse shadow on roof
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(px0 + 4, py0 + 4, pentW + 3, pentD + 3);

      // Penthouse east wall
      ctx.beginPath();
      ctx.moveTo(px1, py0);
      ctx.lineTo(px1, py1);
      ctx.lineTo(px1 - phx, py1 - phy);
      ctx.lineTo(px1 - phx, py0 - phy);
      ctx.closePath();
      ctx.fillStyle = palette.east || '#0c1322';
      ctx.fill();

      // Penthouse south wall
      ctx.beginPath();
      ctx.moveTo(px0, py1);
      ctx.lineTo(px1, py1);
      ctx.lineTo(px1 - phx, py1 - phy);
      ctx.lineTo(px0 - phx, py1 - phy);
      ctx.closePath();
      ctx.fillStyle = palette.wall;
      ctx.fill();

      // Penthouse roof
      ctx.fillStyle = palette.roof;
      ctx.fillRect(px0 - phx, py0 - phy, pentW, pentD);
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = baseAlpha * 0.48;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(px0 - phx, py0 - phy, pentW, pentD);
      ctx.globalAlpha = baseAlpha;
    }

    // Neon roof trim follows the newly visible 3D roof edges.
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = baseAlpha * 0.62;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0 - hx, y1 - hy);
    ctx.lineTo(x1 - hx, y1 - hy);
    ctx.moveTo(x1 - hx, y0 - hy);
    ctx.lineTo(x1 - hx, y1 - hy);
    ctx.stroke();

    // Vertical corner trims emphasize the 3D block volume.
    ctx.globalAlpha = baseAlpha * 0.34;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y1);
    ctx.lineTo(x0 - hx + 0.5, y1 - hy);
    ctx.moveTo(x1 - 0.5, y1);
    ctx.lineTo(x1 - hx - 0.5, y1 - hy);
    ctx.moveTo(x1 - 0.5, y0);
    ctx.lineTo(x1 - hx - 0.5, y0 - hy);
    ctx.stroke();
    ctx.globalAlpha = baseAlpha;

    // A few side-wall neon slots make the east elevation read as a real wall.
    if (Math.sin(b.seed * 1.3) > 0.2 && faceD > 45) {
      const slotA = eastPoint(0.22, 0.38);
      const slotB = eastPoint(0.22, 0.72);
      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = baseAlpha * 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(slotA.x, slotA.y);
      ctx.lineTo(slotB.x, slotB.y);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    }

    if (b.isHospital) {
      const crossX = (x0 + x1) / 2 - hx + faceW * 0.14;
      const crossY = (y0 + y1) / 2 - hy;
      const arm = Math.min(faceW * 0.09, 18);
      const thick = arm * 0.42;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#ff5268';
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(255, 82, 104, 0.92)';
      ctx.fillRect(crossX - arm, crossY - thick, arm * 2, thick * 2);
      ctx.fillRect(crossX - thick, crossY - arm * 0.7, thick * 2, arm * 1.4);
      ctx.restore();
    }

    if (occludesPlayer) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(x0, y0, faceW, faceD);
      ctx.restore();
    }

    ctx.restore();
  }

  createVehicleProjector(ctx, camera, x, y, angle, scale, zLift = 1) {
    const zoom = camera.zoom;
    const sx = zoom * scale;
    const sy = zoom * scale * VIEW.yScale;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Vehicle planes use the same oblique projection as the city. `project`
    // returns screen-space points so sloped panels (glass, mirrors) can span
    // multiple heights without breaking the 2.5D perspective.
    const project = (lx, ly, z) => {
      const wx = x + lx * cos - ly * sin;
      const wy = y + lx * sin + ly * cos;
      return camera.worldToScreen(wx, wy, z * zLift);
    };
    const face = (points, fill, stroke = null, lineWidth = 1) => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };
    const atZ = (z, fn) => {
      const p = camera.worldToScreen(x, y, z * zLift);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(sx, sy);
      ctx.rotate(angle);
      fn();
      ctx.restore();
    };
    const extrude = (z0, z1, step, rx, ry, rw, rh, rr, color) => {
      for (let z = z0; z <= z1 + 0.01; z += step) {
        atZ(z, () => {
          ctx.fillStyle = color;
          roundRectPath(ctx, rx, ry, rw, rh, rr);
          ctx.fill();
        });
      }
    };
    return { atZ, extrude, project, face };
  }

  drawTree(ctx, camera, tree, game) {
    if (!camera.isVisible(tree.x, tree.y, 100)) return;
    const pos = camera.worldToScreen(tree.x, tree.y);
    const sway = Math.sin(game.time * 0.8 + tree.phase) * 2.2;
    const zoom = camera.zoom;
    const canopyX = pos.x - tree.height * zoom * VIEW.zX + sway;
    const canopyY = pos.y - tree.height * zoom * VIEW.zY;

    // Shadow.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(pos.x + 6, pos.y + 3, tree.r * zoom * 0.95, tree.r * zoom * 0.42, 0, 0, TAU);
    ctx.fill();

    // Trunk.
    ctx.strokeStyle = '#383238';
    ctx.lineWidth = Math.max(2.5, 4.2 * zoom);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - 2);
    ctx.lineTo(canopyX + sway * 0.4, canopyY + 4);
    ctx.stroke();

    // Volumetric 3D layered canopy.
    const r = tree.r * zoom;
    ctx.fillStyle = '#0d261d';
    ctx.beginPath();
    ctx.arc(canopyX + 3, canopyY + 4, r * 0.88, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#153b2d';
    ctx.beginPath();
    ctx.arc(canopyX - r * 0.42, canopyY + r * 0.22, r * 0.72, 0, TAU);
    ctx.arc(canopyX + r * 0.42, canopyY + r * 0.18, r * 0.66, 0, TAU);
    ctx.arc(canopyX, canopyY - r * 0.28, r * 0.8, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(125, 255, 178, 0.16)';
    ctx.beginPath();
    ctx.arc(canopyX - r * 0.18, canopyY - r * 0.32, r * 0.52, 0, TAU);
    ctx.fill();
  }

  drawLamp(ctx, camera, lamp, game) {
    if (!camera.isVisible(lamp.x, lamp.y, 80)) return;
    const pos = camera.worldToScreen(lamp.x, lamp.y, 8);
    const zoom = camera.zoom;
    const topX = pos.x - lamp.height * zoom * VIEW.zX;
    const topY = pos.y - lamp.height * zoom * VIEW.zY;
    const flicker = 0.84 + Math.sin(game.time * 8 + lamp.phase) * 0.08;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
    ctx.beginPath();
    ctx.ellipse(pos.x + 3, pos.y + 1, 10 * zoom, 4 * zoom, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = '#364660';
    ctx.lineWidth = Math.max(1.8, 2.5 * zoom);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(topX, topY);
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lamp.color;
    ctx.globalAlpha = 0.14 * flicker;
    ctx.beginPath();
    ctx.arc(topX, topY, 22 * zoom, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = flicker;
    ctx.beginPath();
    ctx.arc(topX, topY, 3 * zoom, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawTrafficCar(ctx, camera, car) {
    if (!camera.isVisible(car.x, car.y, 140)) return;
    const zBase = car.z || 0;
    const angle = car.angle + (car.spin || 0);
    const zoom = camera.zoom;
    const s = car.visualScale || 0.94;
    const shadowScale = clamp(1 - zBase / 180, 0.35, 1);
    const { atZ, face, project } = this.createVehicleProjector(ctx, camera, car.x, car.y, angle, s, 1);
    const atCarZ = (z, fn) => atZ(zBase + z, fn);
    const at = (lx, ly, z) => project(lx, ly, zBase + z);

    const palette = car.palette;
    const body = palette.body;
    const side = palette.side || body;
    const roof = palette.roof || body;
    const light = palette.light || '#fff4c2';
    const outline = 'rgba(215, 240, 255, 0.32)';

    // The sedan is a low volume in the same oblique space as the city.
    const bodyFront = 21.8;
    const bodyRear = -21.8;
    const beltZ = 6.9;
    const cab = {
      baseZ: 7.0,
      topZ: 12.0,
      baseFront: 7.7,
      baseRear: -11.6,
      baseHalfW: 8.1,
      topFront: 3.0,
      topRear: -9.0,
      topHalfW: 7.0
    };

    // 1. Ground shadow on asphalt.
    const ground = camera.worldToScreen(car.x, car.y, 0);
    ctx.save();
    ctx.translate(ground.x + 4 * zoom, ground.y + 5 * zoom);
    ctx.scale(zoom * s * shadowScale, zoom * s * VIEW.yScale * shadowScale);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    roundRectPath(ctx, -23.5, -11.8, 47, 23.6, 6.4);
    ctx.fill();
    ctx.restore();

    // 2. Tires sit below the beltline, with just enough side face showing to
    //    keep the car planted on the road.
    atCarZ(0.45, () => {
      ctx.fillStyle = '#070b12';
      for (const [wx, wy] of [[13.6, -9.9], [13.6, 9.9], [-13.6, -9.9], [-13.6, 9.9]]) {
        roundRectPath(ctx, wx - 3.9, wy - 1.5, 7.8, 3.0, 1.4);
        ctx.fill();
      }
    });

    const visibleSide =
      -Math.sin(angle) * VIEW.zX + Math.cos(angle) * (VIEW.zY / VIEW.yScale) >= 0 ? 1 : -1;
    for (const wx of [-13.6, 13.6]) {
      face(
        [
          at(wx - 3.4, visibleSide * 10.7, 0.7),
          at(wx + 3.4, visibleSide * 10.7, 0.7),
          at(wx + 3.4, visibleSide * 10.7, 2.6),
          at(wx - 3.4, visibleSide * 10.7, 2.6)
        ],
        '#080d15'
      );
    }

    // 3. Lower body: a few shallow slices keep the side wall solid but low.
    for (let i = 0; i < 5; i += 1) {
      const p = i / 4;
      const halfW = 10.25 - p * 0.45;
      atCarZ(2.6 + p * 4.0, () => {
        ctx.fillStyle = side;
        roundRectPath(ctx, bodyRear, -halfW, bodyFront - bodyRear, halfW * 2, 4.7 - p * 0.35);
        ctx.fill();
      });
    }

    // 4. Beltline deck, hood and trunk.
    atCarZ(beltZ, () => {
      ctx.fillStyle = body;
      roundRectPath(ctx, -21.1, -9.8, 42.2, 19.6, 4.4);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.1;
      roundRectPath(ctx, -20.7, -9.4, 41.4, 18.8, 4.0);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.075)';
      roundRectPath(ctx, 8.2, -7.4, 11.9, 14.8, 2.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.13)';
      roundRectPath(ctx, -19.8, -7.5, 7.0, 15.0, 2.4);
      ctx.fill();

      // Headlights and tail lights follow the top edge of the body.
      ctx.fillStyle = light;
      roundRectPath(ctx, 19.2, -8.1, 2.1, 5.3, 1.0);
      roundRectPath(ctx, 19.2, 2.8, 2.1, 5.3, 1.0);
      ctx.fill();
      ctx.fillStyle = '#ff3b56';
      roundRectPath(ctx, -21.0, -8.0, 1.9, 5.1, 0.9);
      roundRectPath(ctx, -21.0, 2.9, 1.9, 5.1, 0.9);
      ctx.fill();
    });

    // 5. Sloped glass canopy. The roof is smaller than the beltline, so the
    //    windshield and side windows sit on real 2.5D planes.
    face(
      [
        at(cab.baseFront, -cab.baseHalfW, cab.baseZ + 0.05),
        at(cab.baseFront, cab.baseHalfW, cab.baseZ + 0.05),
        at(cab.topFront, cab.topHalfW, cab.topZ),
        at(cab.topFront, -cab.topHalfW, cab.topZ)
      ],
      '#0b1a29'
    );
    face(
      [
        at(cab.baseRear, -cab.baseHalfW, cab.baseZ + 0.05),
        at(cab.baseRear, cab.baseHalfW, cab.baseZ + 0.05),
        at(cab.topRear, cab.topHalfW, cab.topZ),
        at(cab.topRear, -cab.topHalfW, cab.topZ)
      ],
      '#081522'
    );

    // Windshield reflection streak.
    face(
      [
        at(cab.baseFront - 0.15, -cab.baseHalfW + 1.2, cab.baseZ + 0.08),
        at(cab.baseFront - 0.15, -cab.baseHalfW + 3.0, cab.baseZ + 0.08),
        at(cab.topFront - 0.1, -cab.topHalfW + 1.7, cab.topZ - 0.04),
        at(cab.topFront - 0.1, -cab.topHalfW + 0.4, cab.topZ - 0.04)
      ],
      'rgba(110, 225, 255, 0.22)'
    );
    ctx.strokeStyle = 'rgba(130, 235, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const w0 = at(cab.topFront, -cab.topHalfW, cab.topZ);
    const w1 = at(cab.topFront, cab.topHalfW, cab.topZ);
    ctx.moveTo(w0.x, w0.y);
    ctx.lineTo(w1.x, w1.y);
    ctx.stroke();

    // Near side glass and its pillars.
    const sHalfW = visibleSide * cab.baseHalfW;
    const sTopHalfW = visibleSide * cab.topHalfW;
    face(
      [
        at(cab.baseRear, sHalfW, cab.baseZ + 0.05),
        at(cab.baseFront, sHalfW, cab.baseZ + 0.05),
        at(cab.topFront, sTopHalfW, cab.topZ),
        at(cab.topRear, sTopHalfW, cab.topZ)
      ],
      '#0e2032'
    );

    const pillar = (xb0, xb1, xt0, xt1) => {
      face(
        [
          at(xb0, sHalfW + visibleSide * 0.04, cab.baseZ + 0.05),
          at(xb1, sHalfW + visibleSide * 0.04, cab.baseZ + 0.05),
          at(xt1, sTopHalfW + visibleSide * 0.04, cab.topZ),
          at(xt0, sTopHalfW + visibleSide * 0.04, cab.topZ)
        ],
        body
      );
    };
    pillar(cab.baseFront - 1.3, cab.baseFront, cab.topFront - 1.0, cab.topFront);
    pillar(-3.9, -2.7, -3.7, -2.6);
    pillar(cab.baseRear, cab.baseRear + 1.7, cab.topRear, cab.topRear + 1.3);

    // Side mirror on the visible side.
    face(
      [
        at(6.3, visibleSide * 8.6, 7.1),
        at(7.6, visibleSide * 9.4, 7.1),
        at(7.6, visibleSide * 9.4, 7.8),
        at(6.3, visibleSide * 8.6, 7.8)
      ],
      body
    );

    // 6. Roof cap and subtle sunroof.
    atCarZ(cab.topZ + 0.05, () => {
      ctx.fillStyle = roof;
      roundRectPath(ctx, cab.topRear, -cab.topHalfW, cab.topFront - cab.topRear, cab.topHalfW * 2, 3.2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 245, 255, 0.42)';
      ctx.lineWidth = 1;
      roundRectPath(ctx, cab.topRear, -cab.topHalfW, cab.topFront - cab.topRear, cab.topHalfW * 2, 3.2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(8, 18, 30, 0.5)';
      roundRectPath(ctx, -6.4, -4.8, 6.2, 9.6, 1.8);
      ctx.fill();
    });

    if (car.variant === 'taxi') {
      atCarZ(cab.topZ + 0.9, () => {
        ctx.fillStyle = '#ffe88a';
        roundRectPath(ctx, -2.8, -4.1, 5.6, 8.2, 1.4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 52, 0, 0.55)';
        ctx.lineWidth = 0.8;
        roundRectPath(ctx, -2.8, -4.1, 5.6, 8.2, 1.4);
        ctx.stroke();
      });
    }
  }

  drawPedestrian(ctx, camera, pedestrian) {
    if (!camera.isVisible(pedestrian.x, pedestrian.y, 60)) return;

    const ground = camera.worldToScreen(pedestrian.x, pedestrian.y);
    const zoom = camera.zoom;
    const isFlying = pedestrian.state === 'flying';
    const baseZ = pedestrian.z + (isFlying ? 10 : 0);
    const feet = camera.worldToScreen(pedestrian.x, pedestrian.y, baseZ);
    const head = camera.worldToScreen(pedestrian.x, pedestrian.y, baseZ + 18);

    // Shadow.
    const shadowScale = isFlying ? 0.55 : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(ground.x + 3, ground.y + 1, 7.5 * zoom * shadowScale, 3.8 * zoom * shadowScale, 0, 0, TAU);
    ctx.fill();

    if (isFlying) {
      ctx.save();
      ctx.translate(feet.x, feet.y);
      ctx.scale(zoom, zoom);
      ctx.rotate(pedestrian.spin);
      ctx.strokeStyle = pedestrian.outfit.body;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.moveTo(-9, -2);
      ctx.lineTo(-13, -8);
      ctx.moveTo(8, 1);
      ctx.lineTo(13, -6);
      ctx.stroke();
      ctx.fillStyle = pedestrian.outfit.head;
      ctx.beginPath();
      ctx.arc(8, -1, 3.8, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }

    const stride = Math.sin(pedestrian.walkPhase) * 2.8 * zoom;
    const midX = (feet.x + head.x) * 0.5;
    const midY = (feet.y + head.y) * 0.5;

    ctx.save();
    ctx.lineCap = 'round';

    // Legs in 2.5D
    ctx.strokeStyle = pedestrian.outfit.leg;
    ctx.lineWidth = 2.8 * zoom;
    ctx.beginPath();
    ctx.moveTo(midX - 2 * zoom, midY + 2 * zoom);
    ctx.lineTo(feet.x - 2 * zoom + stride, feet.y + 2 * zoom);
    ctx.moveTo(midX + 2 * zoom, midY + 2 * zoom);
    ctx.lineTo(feet.x + 2 * zoom - stride, feet.y + 2 * zoom);
    ctx.stroke();

    // 3D Torso Cylinder
    ctx.strokeStyle = pedestrian.outfit.body;
    ctx.lineWidth = 6.2 * zoom;
    ctx.beginPath();
    ctx.moveTo(midX, midY + 2 * zoom);
    ctx.lineTo(head.x, head.y + 3.5 * zoom);
    ctx.stroke();

    // 3D Head Sphere
    ctx.fillStyle = pedestrian.outfit.head;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.8 * zoom, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawPatient(ctx, camera, patient, game) {
    if (!camera.isVisible(patient.x, patient.y, 80)) return;
    const pos = camera.worldToScreen(patient.x, patient.y, 4);
    const zoom = camera.zoom;
    const breathe = 1 + Math.sin(patient.age * 2.4) * 0.035;
    const isAccident = patient.source === 'accident';
    const color = isAccident ? '#ff5268' : '#ffd479';

    // Magnetic suction beam & vortex ring when being pulled toward the ambulance
    if (patient.magnetized) {
      const playerPos = camera.worldToScreen(game.player.x, game.player.y, 12);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = isAccident ? '#ff5f9e' : '#7dffb2';
      ctx.lineWidth = 2.2 * zoom;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, 22 * zoom, 13 * zoom, 0, 0, TAU);
      ctx.stroke();

      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(playerPos.x, playerPos.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(zoom * breathe, zoom * breathe);

    if (isAccident) {
      ctx.fillStyle = 'rgba(165, 16, 48, 0.34)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 21, 9, 0, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 15, 6, 0, 0, TAU);
    ctx.fill();

    // Lying body with 2.5D thickness.
    ctx.strokeStyle = color;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(6, 1);
    ctx.stroke();

    ctx.strokeStyle = '#1e2940';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(3, 1);
    ctx.lineTo(13, 5);
    ctx.moveTo(2, 1);
    ctx.lineTo(13, -2);
    ctx.stroke();

    ctx.fillStyle = '#f1c6a8';
    ctx.beginPath();
    ctx.arc(-12, -1, 4.4, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  drawAmbulance(ctx, camera, player, game) {
    const angle = player.angle;
    const zoom = camera.zoom;
    const s = AMBULANCE.visualScale || 1.05;
    const zLift = 1;
    const t = game.time;
    const flash = Math.floor(t * 9) % 2 === 0;
    const { atZ, extrude, project, face } = this.createVehicleProjector(
      ctx,
      camera,
      player.x,
      player.y,
      angle,
      s,
      zLift
    );
    const visibleSide =
      -Math.sin(angle) * VIEW.zX + Math.cos(angle) * (VIEW.zY / VIEW.yScale) >= 0 ? 1 : -1;

    // 1. Ground Shadow & Headlight Cones on Asphalt (z = 0)
    const ground = camera.worldToScreen(player.x, player.y, 0);
    ctx.save();
    ctx.translate(ground.x + 3.8 * zoom, ground.y + 4.8 * zoom);
    ctx.scale(zoom * s, zoom * s * VIEW.yScale);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    roundRectPath(ctx, -29.5, -16, 59, 32, 9);
    ctx.fill();
    ctx.restore();

    atZ(1, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(25, 0, 145, 0);
      beam.addColorStop(0, 'rgba(185, 242, 255, 0.24)');
      beam.addColorStop(1, 'rgba(93, 233, 255, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(25, -10);
      ctx.lineTo(145, -36);
      ctx.lineTo(145, 36);
      ctx.lineTo(25, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // 2. Nitro / Drift Boost Thruster Flames at Rear Bumper
    if (player.boosting || player.driftBoostTimer > 0) {
      atZ(3.2, () => {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flameLen = (player.boosting ? 30 : 20) + Math.sin(t * 48) * 7;
        const flameColor = player.boosting ? '#5de9ff' : '#ffd479';
        const grad = ctx.createLinearGradient(-27, 0, -27 - flameLen, 0);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, flameColor);
        grad.addColorStop(1, 'rgba(93, 233, 255, 0)');
        ctx.fillStyle = grad;
        for (const wy of [-8.5, 8.5]) {
          ctx.beginPath();
          ctx.moveTo(-27, wy - 3.6);
          ctx.lineTo(-27 - flameLen, wy);
          ctx.lineTo(-27, wy + 3.6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    }

    // 3. Tires & Dark Chassis Skirt (z = 0.6..2.0)
    extrude(0.7, 1.9, 0.6, -25.5, -13.2, 51, 26.4, 6.5, '#141e2e');
    atZ(1.1, () => {
      ctx.fillStyle = '#0a0f18';
      for (const [wx, wy] of [[15.5, -14.5], [15.5, 14.5], [-15.0, -14.5], [-15.0, 14.5]]) {
        roundRectPath(ctx, wx - 5.2, wy - 2.1, 10.4, 4.2, 1.5);
        ctx.fill();
      }
    });

    // 4. Lower Ambulance Body (z = 2.2..6.8)
    for (let z = 2.2; z <= 6.85; z += 0.65) {
      atZ(z, () => {
        ctx.fillStyle = z < 4.4 ? '#9ab4ce' : '#b4cce4';
        roundRectPath(ctx, -27, -14.2, 54, 28.4, 7.0);
        ctx.fill();
      });
    }

    // Red emergency beltline stripe on the visible lower side wall
    face(
      [
        project(-25.0, visibleSide * 14.25, 3.8),
        project(18.0, visibleSide * 14.25, 3.8),
        project(18.0, visibleSide * 14.25, 5.7),
        project(-25.0, visibleSide * 14.25, 5.7)
      ],
      '#e53854'
    );

    // 5. Crisp Lower Beltline & Stepped Front Hood Deck (z = 7.1)
    const beltZ = 7.1;
    atZ(beltZ, () => {
      ctx.fillStyle = '#eef6fc';
      roundRectPath(ctx, -27, -14.2, 54, 28.4, 7.0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(55, 90, 130, 0.44)';
      ctx.lineWidth = 1.1;
      roundRectPath(ctx, -26.5, -13.7, 53, 27.4, 6.6);
      ctx.stroke();

      // Sculpted hood panel highlight
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, 18.2, -9.8, 6.8, 19.6, 2.6);
      ctx.fill();

      // Front grille, bright headlights & rear brake lights on the beltline edge
      ctx.fillStyle = '#1b2b42';
      roundRectPath(ctx, 25.0, -6.2, 2.0, 12.4, 1.0);
      ctx.fill();
      ctx.fillStyle = '#fff9d2';
      roundRectPath(ctx, 24.4, -11.8, 2.6, 4.8, 1.1);
      roundRectPath(ctx, 24.4, 7.0, 2.6, 4.8, 1.1);
      ctx.fill();
      ctx.fillStyle = '#ff3856';
      roundRectPath(ctx, -27.2, -11.6, 2.2, 4.8, 1.1);
      roundRectPath(ctx, -27.2, 6.8, 2.2, 4.8, 1.1);
      ctx.fill();
    });

    // 6. Balanced 3D High-Roof Cabin & Medical Box (z = 7.3..13.5)
    const boxBaseZ = 7.3;
    const boxTopZ = 13.5;
    const baseRear = -26.6;
    const baseFront = 18.4;
    const baseHalfW = 13.6;
    const topRear = -25.4;
    const topFront = 13.2;
    const topHalfW = 12.5;

    for (let i = 0; i <= 9; i += 1) {
      const p = i / 9;
      const z = boxBaseZ + p * (boxTopZ - boxBaseZ);
      const x0 = baseRear + p * (topRear - baseRear);
      const x1 = baseFront + p * (topFront - baseFront);
      const halfY = baseHalfW + p * (topHalfW - baseHalfW);
      atZ(z, () => {
        ctx.fillStyle = p < 0.45 ? '#bfd5eb' : p < 0.8 ? '#cfe2f5' : '#dfeefb';
        roundRectPath(ctx, x0, -halfY, x1 - x0, halfY * 2, 5.0 - p * 0.4);
        ctx.fill();
      });
    }

    // Sloped 2.5D Front Windshield plane & cyan reflection streak
    face(
      [
        project(baseFront + 0.08, -(baseHalfW - 1.5), boxBaseZ + 0.4),
        project(baseFront + 0.08, baseHalfW - 1.5, boxBaseZ + 0.4),
        project(topFront + 0.08, topHalfW - 1.4, boxTopZ - 0.35),
        project(topFront + 0.08, -(topHalfW - 1.4), boxTopZ - 0.35)
      ],
      '#0d2033'
    );
    face(
      [
        project(baseFront + 0.12, -(baseHalfW - 2.6), boxBaseZ + 0.55),
        project(baseFront + 0.12, -(baseHalfW - 5.2), boxBaseZ + 0.55),
        project(topFront + 0.12, -(topHalfW - 4.2), boxTopZ - 0.5),
        project(topFront + 0.12, -(topHalfW - 2.0), boxTopZ - 0.5)
      ],
      'rgba(115, 225, 255, 0.28)'
    );

    // Rear double-door medical windows
    face(
      [
        project(baseRear - 0.08, -(baseHalfW - 2.8), boxBaseZ + 0.7),
        project(baseRear - 0.08, baseHalfW - 2.8, boxBaseZ + 0.7),
        project(topRear - 0.08, topHalfW - 2.6, boxTopZ - 0.6),
        project(topRear - 0.08, -(topHalfW - 2.6), boxTopZ - 0.6)
      ],
      '#0b1b2b'
    );

    // Visible side cab window, medical bay window & upper red emergency stripe
    const sBaseY = visibleSide * (baseHalfW + 0.05);
    const sTopY = visibleSide * (topHalfW + 0.05);
    const sideY = (p) => sBaseY + p * (sTopY - sBaseY);
    const sideZ = (p) => boxBaseZ + p * (boxTopZ - boxBaseZ);

    // Cab door side window
    face(
      [
        project(7.2, sideY(0.12), sideZ(0.12)),
        project(16.8, sideY(0.12), sideZ(0.12)),
        project(12.6, sideY(0.86), sideZ(0.86)),
        project(7.2, sideY(0.86), sideZ(0.86))
      ],
      '#0f2236'
    );
    // Side medical bay window
    face(
      [
        project(-20.8, sideY(0.18), sideZ(0.18)),
        project(-5.2, sideY(0.18), sideZ(0.18)),
        project(-5.2, sideY(0.82), sideZ(0.82)),
        project(-20.4, sideY(0.82), sideZ(0.82))
      ],
      '#0f2236'
    );
    // High-roof side red accent stripe
    face(
      [
        project(-23.8, sideY(0.86), sideZ(0.86)),
        project(5.5, sideY(0.86), sideZ(0.86)),
        project(5.5, sideY(0.97), sideZ(0.97)),
        project(-23.5, sideY(0.97), sideZ(0.97))
      ],
      '#e53854'
    );

    // 7. Crisp Snow-White High Roof Cap (z = 13.6)
    const roofZ = boxTopZ + 0.1;
    atZ(roofZ, () => {
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, topRear, -topHalfW, topFront - topRear, topHalfW * 2, 4.6);
      ctx.fill();

      ctx.strokeStyle = 'rgba(60, 100, 145, 0.48)';
      ctx.lineWidth = 1.15;
      roundRectPath(ctx, topRear, -topHalfW, topFront - topRear, topHalfW * 2, 4.6);
      ctx.stroke();

      // Recessed roof medical bay panel
      ctx.fillStyle = '#e6f1fb';
      roundRectPath(ctx, -22.2, -9.4, 23.5, 18.8, 3.4);
      ctx.fill();
    });

    // 8. 3D Raised Red Cross & 3D Emergency Lightbar on Roof (z = 14.0..14.8)
    for (let z = roofZ + 0.35; z <= roofZ + 1.15; z += 0.4) {
      atZ(z, () => {
        // 3D Raised Red Cross
        ctx.fillStyle = z > roofZ + 0.6 ? '#ff3856' : '#c9233f';
        roundRectPath(ctx, -16.8, -2.8, 12.4, 5.6, 1.4);
        roundRectPath(ctx, -13.4, -6.2, 5.6, 12.4, 1.4);
        ctx.fill();

        // 3D Emergency Lightbar Base & Flashing Domes
        ctx.fillStyle = '#1b283c';
        roundRectPath(ctx, 4.4, -9.4, 4.8, 18.8, 1.8);
        ctx.fill();

        ctx.fillStyle = flash ? '#ff3e58' : '#295cff';
        roundRectPath(ctx, 4.8, -8.8, 4.0, 7.8, 1.4);
        ctx.fill();

        ctx.fillStyle = flash ? '#295cff' : '#ff3e58';
        roundRectPath(ctx, 4.8, 1.0, 4.0, 7.8, 1.4);
        ctx.fill();
      });
    }

    // 9. Siren or Nitro Volumetric Glow
    if (player.sirenOn || player.boosting) {
      const roofPos = camera.worldToScreen(player.x, player.y, (roofZ + 1.2) * zLift);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const color = player.boosting
        ? '93, 233, 255'
        : flash
          ? '255, 82, 104'
          : '65, 105, 255';
      const glowRadius = (player.boosting ? 82 : 68) * zoom;
      const glow = ctx.createRadialGradient(
        roofPos.x,
        roofPos.y,
        2,
        roofPos.x,
        roofPos.y,
        glowRadius
      );
      glow.addColorStop(0, `rgba(${color}, 0.25)`);
      glow.addColorStop(0.5, `rgba(${color}, 0.09)`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(roofPos.x, roofPos.y, glowRadius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawLabelPill(ctx, x, y, label, color, { background = 'rgba(5, 10, 20, 0.82)', borderAlpha = 1 } = {}) {
    ctx.save();
    ctx.font = '700 10px "SFMono-Regular", ui-monospace, monospace';
    const pillW = ctx.measureText(label).width + 12;
    ctx.fillStyle = background;
    roundRectPath(ctx, x - pillW / 2, y - 8, pillW, 16, 8);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha *= borderAlpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.restore();
  }

  drawPatientMarkers(ctx, camera, game) {
    const time = game.time;

    for (const patient of game.patients.waiting) {
      if (!camera.isVisible(patient.x, patient.y, 120)) continue;
      const pos = camera.worldToScreen(patient.x, patient.y);
      const bob = Math.sin(time * 2.4 + patient.pulse) * 2;
      const markerY = pos.y - 54 + bob;
      const isAccident = patient.source === 'accident';
      const color = isAccident ? '#ff5268' : '#ffd479';
      const urgent = isAccident && patient.remaining < 12;
      const alpha = urgent && Math.floor(time * 5) % 2 === 0 ? 0.35 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Stem.
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.28;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pos.x, markerY + 12);
      ctx.lineTo(pos.x, pos.y - 4);
      ctx.stroke();

      // Pin.
      ctx.globalAlpha = alpha;
      ctx.translate(pos.x, markerY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(7, 12, 22, 0.9)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeRect(-10, -10, 20, 20);
      ctx.shadowBlur = 0;
      ctx.rotate(-Math.PI / 4);

      // Cross icon.
      ctx.fillStyle = color;
      ctx.fillRect(-2, -5, 4, 10);
      ctx.fillRect(-5, -2, 10, 4);
      ctx.restore();

      // Timer pill.
      const seconds = Math.ceil(patient.remaining);
      const label = isAccident ? `${seconds}s` : `${Math.ceil(patient.waitTimer)}s`;
      this.drawLabelPill(ctx, pos.x, markerY - 34, label, color, { borderAlpha: 0.4 });
    }
  }

  drawHospitalMarker(ctx, camera, game) {
    const hospital = game.city.hospital;
    if (!hospital) return;
    const pos = camera.worldToScreen(hospital.center.x, hospital.center.y);
    if (!camera.isVisible(hospital.center.x, hospital.center.y, 100)) return;

    const bob = Math.sin(game.time * 2.2) * 2;
    const y = pos.y - 74 + bob;
    const near = game.city.inHospitalZone(game.player.x, game.player.y, 60);

    ctx.save();
    ctx.globalAlpha = near ? 1 : 0.72;
    const size = near ? 14 : 12;
    ctx.fillStyle = 'rgba(7, 12, 22, 0.86)';
    ctx.strokeStyle = '#ff5268';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = '#ff5268';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(pos.x, y, size, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff5268';
    ctx.fillRect(pos.x - 2, y - 7, 4, 14);
    ctx.fillRect(pos.x - 7, y - 2, 14, 4);

    ctx.strokeStyle = 'rgba(255, 82, 104, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pos.x, y + size);
    ctx.lineTo(pos.x, pos.y - 2);
    ctx.stroke();
    ctx.restore();
  }

  drawOffscreenIndicators(ctx, camera, game) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const rx = Math.max(120, this.width / 2 - 58);
    const ry = Math.max(90, this.height / 2 - 64);

    // 1. Hospital indicator when carrying patients and hospital is off-screen
    const hospital = game.city.hospital;
    if (hospital && game.patients.passengers.length > 0) {
      const hPos = camera.worldToScreen(hospital.center.x, hospital.center.y);
      const onScreen =
        hPos.x > 48 && hPos.x < this.width - 48 && hPos.y > 48 && hPos.y < this.height - 48;
      if (!onScreen) {
        const distM = Math.round(
          Math.hypot(hospital.center.x - game.player.x, hospital.center.y - game.player.y) * 0.1
        );
        this.drawDirectionArrow(ctx, cx, cy, rx, ry, hPos.x, hPos.y, {
          color: '#ff5268',
          label: `医院 ${distM}m`,
          isHospital: true,
          pulse: 0.5 + 0.5 * Math.sin(game.time * 7)
        });
      }
    }

    // 2. Waiting patient indicators when off-screen
    const full = game.patients.passengers.length >= game.upgrades.stats.capacity;
    if (full) return;

    for (const patient of game.patients.waiting) {
      const pPos = camera.worldToScreen(patient.x, patient.y);
      const onScreen =
        pPos.x > 40 && pPos.x < this.width - 40 && pPos.y > 40 && pPos.y < this.height - 40;
      if (onScreen) continue;

      const isAccident = patient.source === 'accident';
      const color = isAccident ? '#ff5f9e' : '#ffd479';
      const sec = Math.ceil(patient.remaining);
      this.drawDirectionArrow(ctx, cx, cy, rx, ry, pPos.x, pPos.y, {
        color,
        label: `${sec}s`,
        isHospital: false,
        pulse: isAccident && sec < 15 ? 0.5 + 0.5 * Math.sin(game.time * 10) : 0.2
      });
    }
  }

  drawDirectionArrow(ctx, cx, cy, rx, ry, targetX, targetY, { color, label, isHospital, pulse }) {
    const dx = targetX - cx;
    const dy = targetY - cy;
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Point on ellipse inside screen margin
    const scale = 1 / Math.hypot(cos / rx, sin / ry);
    const ax = cx + cos * scale;
    const ay = cy + sin * scale;

    ctx.save();
    ctx.translate(ax, ay);

    // Arrow chevron pointing outward toward target
    ctx.save();
    ctx.rotate(angle);
    const size = isHospital ? 14 + pulse * 2.5 : 11;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + pulse * 8;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, -size * 0.68);
    ctx.lineTo(-size * 0.32, 0);
    ctx.lineTo(-size * 0.7, size * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Label pill pulled slightly inward toward screen center
    const labelX = -cos * (isHospital ? 34 : 26);
    const labelY = -sin * (isHospital ? 24 : 20);
    this.drawLabelPill(ctx, labelX, labelY, label, color, {
      background: 'rgba(6, 11, 22, 0.88)'
    });
    ctx.restore();
  }
}
