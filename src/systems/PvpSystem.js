import { AMBULANCE, PVP } from '../config.js';
import { distance, shortestAngle } from '../core/math.js';
import { Ambulance } from '../entities/Ambulance.js';

const MOUSE_REPATH_INTERVAL = 0.1;
const MOUSE_REPATH_DISTANCE = 48;
const MOUSE_ARRIVAL_DISTANCE = 34;

export class PvpSystem {
  constructor(game) {
    this.game = game;
    this.opponent = new Ambulance(game.city);
    this.opponent.teamLabel = 'AI';
    this.opponent.teamColor = '#ff5f9e';
    this.reset();
  }

  reset() {
    this.active = false;
    this.ammo = [[], []];
    this.projectiles = [];
    this.opponentMoney = PVP.startingHealth;
    this.pickupToastCooldown = 0;
    this.botFireCooldown = 0;
    this.botPlanTimer = 0;
    this.botPath = [];
    this.botPathIndex = 0;
    this.botTargetKey = null;
    this.botTargetX = 0;
    this.botTargetY = 0;
    this.roadGraph = null;
    this.mouseNav = this.createNavigatorState();
    this.game.player.teamLabel = null;
    this.game.player.teamColor = null;
  }

  getPlayerInput() {
    const input = this.game.input;

    return {
      isDown(code) {
        if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
          return false;
        }
        if (code === 'ShiftRight') return false;
        return input.isDown(code);
      }
    };
  }

  getBotInput(dt) {
    const controls = this.updateBot(dt);
    return {
      isDown(code) {
        if (code === 'KeyW') return controls.throttle;
        if (code === 'KeyS') return controls.brake;
        if (code === 'KeyA') return controls.steer < 0;
        if (code === 'KeyD') return controls.steer > 0;
        if (code === 'Space') return controls.handbrake;
        if (code === 'ShiftLeft') return controls.boost;
        return false;
      }
    };
  }

  getMouseInput(target, dt) {
    if (!this.roadGraph) this.roadGraph = this.buildRoadGraph();
    const player = this.game.player;
    let controls;

    if (!target) {
      this.mouseNav.path = [];
      controls = {
        throttle: false,
        brake: player.totalSpeed > 18,
        steer: 0,
        handbrake: false,
        boost: false
      };
    } else {
      controls = this.navigateVehicle(player, target, this.mouseNav, dt);
    }

    return {
      isDown(code) {
        if (code === 'KeyW') return controls.throttle;
        if (code === 'KeyS') return controls.brake;
        if (code === 'KeyA') return controls.steer < 0;
        if (code === 'KeyD') return controls.steer > 0;
        if (code === 'Space') return controls.handbrake;
        if (code === 'ShiftLeft') return controls.boost;
        return false;
      }
    };
  }

  createNavigatorState() {
    return {
      planTimer: 0,
      path: [],
      pathIndex: 0,
      targetX: 0,
      targetY: 0
    };
  }

  start() {
    this.active = true;
    this.ammo = [[], []];
    this.projectiles = [];
    this.opponentMoney = PVP.startingHealth;
    this.pickupToastCooldown = 0;

    const spawn = this.game.city.getHospitalSpawn();
    this.game.player.x = spawn.x - 72;
    this.game.player.y = spawn.y;
    this.game.player.angle = 0;
    this.game.player.teamLabel = 'P1';
    this.game.player.teamColor = '#5de9ff';
    this.opponent.setStats(this.game.upgrades.stats);
    this.opponent.reset({ x: spawn.x + 72, y: spawn.y });
    this.opponent.angle = Math.PI;
    this.opponent.teamLabel = 'AI';
    this.opponent.teamColor = '#ff5f9e';
    this.resetBot();

    this.game.upgrades.money = PVP.startingHealth;
    this.game.camera.snapTo(this.getCameraTarget());
  }

  getCameraTarget() {
    return {
      x: (this.game.player.x + this.opponent.x) / 2,
      y: (this.game.player.y + this.opponent.y) / 2,
      velocity: { x: 0, y: 0 },
      speedRatio: Math.max(this.game.player.speedRatio, this.opponent.speedRatio),
      boosting: this.game.player.boosting || this.opponent.boosting
    };
  }

  update(dt) {
    if (!this.active) return;
    this.pickupToastCooldown = Math.max(0, this.pickupToastCooldown - dt);

    const playerPatient = this.nearestWaiting(this.game.player);
    const botPatient = this.nearestWaiting(this.opponent);
    if (botPatient.distance < playerPatient.distance) {
      this.collectFor(this.opponent, 1, PVP.pickupRange);
      this.collectFor(this.game.player, 0, PVP.pickupRange);
    } else {
      this.collectFor(this.game.player, 0, PVP.pickupRange);
      this.collectFor(this.opponent, 1, PVP.pickupRange);
    }
    this.updateCarriedPatients(dt);
    if (!this.active) return;
    this.updateProjectiles(dt);
    if (!this.active) return;
    this.resolveVehicleContact();

    if (this.game.input.wasPressed('KeyQ')) this.throwPatient(0);
  }

  resetBot() {
    this.botFireCooldown = 0.8;
    this.botPlanTimer = 0;
    this.botPath = [];
    this.botPathIndex = 0;
    this.botTargetKey = null;
    this.botTargetX = 0;
    this.botTargetY = 0;
    this.mouseNav = this.createNavigatorState();
    if (!this.roadGraph) this.roadGraph = this.buildRoadGraph();
  }

  navigateVehicle(vehicle, target, state, dt) {
    state.planTimer -= dt;
    const targetDistance = distance(vehicle.x, vehicle.y, target.x, target.y);
    if (targetDistance < MOUSE_ARRIVAL_DISTANCE) {
      return {
        throttle: false,
        brake: vehicle.totalSpeed > 18,
        steer: 0,
        handbrake: false,
        boost: false
      };
    }

    const directRoute = this.hasLineOfSight(vehicle.x, vehicle.y, target.x, target.y);
    let waypoint = target;
    if (directRoute) {
      // In open space, steer at the live cursor target instead of following a
      // stale road waypoint. Keep the road graph for targets behind buildings.
      state.path = [target];
      state.pathIndex = 0;
      state.targetX = target.x;
      state.targetY = target.y;
      state.planTimer = 0;
    } else {
      const targetMoved =
        distance(target.x, target.y, state.targetX, state.targetY) > MOUSE_REPATH_DISTANCE;
      if (state.planTimer <= 0 || targetMoved || state.path.length === 0) {
        state.path = this.findRoadPath(vehicle, target);
        state.path.push({ x: target.x, y: target.y });
        state.pathIndex = 0;
        state.targetX = target.x;
        state.targetY = target.y;
        state.planTimer = MOUSE_REPATH_INTERVAL;
      } else {
        state.path[state.path.length - 1] = { x: target.x, y: target.y };
      }

      while (
        state.pathIndex < state.path.length - 1 &&
        distance(vehicle.x, vehicle.y, state.path[state.pathIndex].x, state.path[state.pathIndex].y) < 76
      ) {
        state.pathIndex += 1;
      }

      waypoint = state.path[Math.min(state.pathIndex, state.path.length - 1)] || target;
    }

    const waypointDistance = distance(vehicle.x, vehicle.y, waypoint.x, waypoint.y);
    const desiredAngle = Math.atan2(waypoint.y - vehicle.y, waypoint.x - vehicle.x);
    const angleDifference = shortestAngle(vehicle.angle, desiredAngle);
    const needsHardTurn = Math.abs(angleDifference) > 1.15;
    const brake =
      (needsHardTurn && vehicle.totalSpeed > 175) ||
      (targetDistance < 105 && vehicle.totalSpeed > 125);

    return {
      throttle: !brake,
      brake,
      steer: Math.abs(angleDifference) < 0.08 ? 0 : Math.sign(angleDifference),
      handbrake: needsHardTurn && vehicle.totalSpeed > 120,
      boost: !brake && waypointDistance > 420 && Math.abs(angleDifference) < 0.75 && vehicle.nitro > 16
    };
  }

  nearestWaiting(vehicle) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const patient of this.game.patients.waiting) {
      if (patient.source === 'accident' && patient.spawnAge <= 0.25) continue;
      const d = distance(vehicle.x, vehicle.y, patient.x, patient.y);
      if (d < nearestDistance) {
        nearest = patient;
        nearestDistance = d;
      }
    }
    return { patient: nearest, distance: nearestDistance };
  }

  updateBot(dt) {
    this.botFireCooldown = Math.max(0, this.botFireCooldown - dt);
    this.botPlanTimer -= dt;

    const vehicle = this.opponent;
    const player = this.game.player;
    const ammoCount = this.ammo[1].length;
    const playerDistance = distance(vehicle.x, vehicle.y, player.x, player.y);
    const nearest = ammoCount < PVP.ammoCapacity ? this.nearestWaiting(vehicle) : null;
    let target;
    let targetKey;
    let appendTarget = false;

    if (ammoCount > 0 && (playerDistance <= PVP.aiFireRange || !nearest?.patient)) {
      target = player;
      targetKey = 'player';
    } else if (nearest?.patient) {
      target = nearest.patient;
      targetKey = `patient-${target.id}`;
      appendTarget = true;
    } else {
      const roamIndex = Math.floor(this.game.time / 10) % this.roadGraph.nodes.length;
      target = this.roadGraph.nodes[roamIndex];
      targetKey = `roam-${roamIndex}`;
      appendTarget = true;
    }

    const targetMoved = distance(target.x, target.y, this.botTargetX, this.botTargetY) > 190;
    if (
      this.botPlanTimer <= 0 ||
      targetKey !== this.botTargetKey ||
      targetMoved ||
      this.botPath.length === 0
    ) {
      this.botPath = this.findRoadPath(vehicle, target);
      if (appendTarget) this.botPath.push({ x: target.x, y: target.y });
      this.botPathIndex = 0;
      this.botTargetKey = targetKey;
      this.botTargetX = target.x;
      this.botTargetY = target.y;
      this.botPlanTimer = PVP.aiRepathInterval;
    }

    while (
      this.botPathIndex < this.botPath.length - 1 &&
      distance(vehicle.x, vehicle.y, this.botPath[this.botPathIndex].x, this.botPath[this.botPathIndex].y) < 76
    ) {
      this.botPathIndex += 1;
    }
    const waypoint = this.botPath[Math.min(this.botPathIndex, this.botPath.length - 1)] || target;
    const waypointDistance = distance(vehicle.x, vehicle.y, waypoint.x, waypoint.y);
    let desiredAngle = Math.atan2(waypoint.y - vehicle.y, waypoint.x - vehicle.x);

    let aimPoint = null;
    let lineOfSight = false;
    if (ammoCount > 0 && playerDistance < PVP.aiFireRange) {
      const leadTime = playerDistance / PVP.projectileSpeed;
      const velocity = player.velocity;
      aimPoint = { x: player.x + velocity.x * leadTime, y: player.y + velocity.y * leadTime };
      lineOfSight = this.hasLineOfSight(vehicle.x, vehicle.y, aimPoint.x, aimPoint.y);
      if (lineOfSight) desiredAngle = Math.atan2(aimPoint.y - vehicle.y, aimPoint.x - vehicle.x);
    }

    const angleDifference = shortestAngle(vehicle.angle, desiredAngle);
    const steer = Math.abs(angleDifference) < 0.08 ? 0 : Math.sign(angleDifference);
    const needsHardTurn = Math.abs(angleDifference) > 1.15;
    const nearPatient = Boolean(nearest?.patient) && waypointDistance < 110;
    const brake = (needsHardTurn && vehicle.totalSpeed > 175) || (nearPatient && vehicle.totalSpeed > 135);

    if (
      ammoCount > 0 &&
      this.botFireCooldown <= 0 &&
      playerDistance < PVP.aiFireRange &&
      lineOfSight &&
      Math.abs(shortestAngle(vehicle.angle, Math.atan2(aimPoint.y - vehicle.y, aimPoint.x - vehicle.x))) < PVP.aiAimTolerance
    ) {
      this.throwPatient(1);
      this.botFireCooldown = PVP.aiFireCooldown;
    }

    return {
      throttle: !brake,
      brake,
      steer,
      handbrake: needsHardTurn && vehicle.totalSpeed > 120,
      boost: !brake && waypointDistance > 420 && Math.abs(angleDifference) < 0.75 && vehicle.nitro > 16
    };
  }

  buildRoadGraph() {
    const nodes = [];
    const edges = [];
    const connect = (a, b) => {
      const cost = distance(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y);
      edges[a].push({ index: b, cost });
      edges[b].push({ index: a, cost });
    };

    for (const route of this.game.city.trafficRoutes) {
      const routeIndices = route.map((point) => {
        const index = nodes.length;
        nodes.push({ x: point.x, y: point.y });
        edges.push([]);
        return index;
      });
      for (let i = 0; i < routeIndices.length; i += 1) {
        connect(routeIndices[i], routeIndices[(i + 1) % routeIndices.length]);
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const d = distance(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
        if (d > 0 && d < 78) connect(i, j);
      }
    }
    return { nodes, edges };
  }

  findRoadPath(from, target) {
    const { nodes, edges } = this.roadGraph;
    if (nodes.length === 0) return [{ x: target.x, y: target.y }];
    const nearestIndex = (point) => {
      let nearest = 0;
      let best = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = distance(point.x, point.y, nodes[i].x, nodes[i].y);
        if (d < best) {
          nearest = i;
          best = d;
        }
      }
      return nearest;
    };

    const start = nearestIndex(from);
    const goal = nearestIndex(target);
    const costs = Array(nodes.length).fill(Infinity);
    const previous = Array(nodes.length).fill(-1);
    const visited = new Set();
    costs[start] = 0;

    while (visited.size < nodes.length) {
      let current = -1;
      let best = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        if (!visited.has(i) && costs[i] < best) {
          current = i;
          best = costs[i];
        }
      }
      if (current === -1 || current === goal) break;
      visited.add(current);

      for (const edge of edges[current]) {
        const candidate = costs[current] + edge.cost;
        if (candidate < costs[edge.index]) {
          costs[edge.index] = candidate;
          previous[edge.index] = current;
        }
      }
    }

    const path = [];
    let current = goal;
    while (current !== -1) {
      path.push(nodes[current]);
      if (current === start) break;
      current = previous[current];
    }
    path.reverse();
    return path;
  }

  hasLineOfSight(x1, y1, x2, y2) {
    const length = distance(x1, y1, x2, y2);
    const steps = Math.ceil(length / 45);
    for (let step = 1; step < steps; step += 1) {
      const body = {
        x: x1 + ((x2 - x1) * step) / steps,
        y: y1 + ((y2 - y1) * step) / steps
      };
      if (this.game.city.collideCircle(body, 8)) return false;
    }
    return true;
  }

  collectFor(vehicle, team, range) {
    const ammo = this.ammo[team];
    if (ammo.length >= PVP.ammoCapacity) return null;

    let closest = null;
    let closestDistance = range;
    for (const patient of this.game.patients.waiting) {
      if (patient.source === 'accident' && patient.spawnAge <= 0.25) continue;
      const d = distance(patient.x, patient.y, vehicle.x, vehicle.y);
      if (d < closestDistance) {
        closest = patient;
        closestDistance = d;
      }
    }
    if (!closest) return null;

    const index = this.game.patients.waiting.indexOf(closest);
    if (index === -1) return null;
    this.game.patients.waiting.splice(index, 1);
    closest.load(this.game.upgrades.stats.careBonus);
    ammo.push(closest);
    vehicle.addNitro(10);
    this.game.effects.pickupArc(closest.x, closest.y, vehicle, vehicle.teamColor);
    this.game.effects.spark(closest.x, closest.y, vehicle.teamColor, 14, 105, 7);
    this.game.effects.text(closest.x, closest.y, `${vehicle.teamLabel} 弹药 +1`, vehicle.teamColor, 13);
    return closest;
  }

  tryPickup(vehicle, team) {
    const patient = this.collectFor(vehicle, team, PVP.manualPickupRange);
    if (!patient && this.pickupToastCooldown <= 0) {
      this.pickupToastCooldown = 2;
      this.game.hud.toast(
        this.ammo[team].length >= PVP.ammoCapacity ? '弹药已满 · Q 投掷' : '附近没有可装载的伤员',
        'gold'
      );
    }
    return Boolean(patient);
  }

  updateCarriedPatients(dt) {
    for (let team = 0; team < this.ammo.length; team += 1) {
      for (let i = this.ammo[team].length - 1; i >= 0; i -= 1) {
        const patient = this.ammo[team][i];
        if (patient.update(dt) !== 'dead') continue;

        this.ammo[team].splice(i, 1);
        const vehicle = team === 0 ? this.game.player : this.opponent;
        this.game.effects.blood(vehicle.x, vehicle.y, 15, 0);
        this.damage(team, PVP.carriedPatientDeathDamage, '伤员在车上死亡');
        if (!this.active) return;
      }
    }
  }

  throwPatient(team) {
    const vehicle = team === 0 ? this.game.player : this.opponent;
    const patient = this.ammo[team].pop();
    if (!patient) {
      if (this.pickupToastCooldown <= 0) {
        this.pickupToastCooldown = 1.4;
        if (team === 0) this.game.hud.toast('没有弹药 · 靠近伤员装载', 'gold');
      }
      return false;
    }

    const cos = Math.cos(vehicle.angle);
    const sin = Math.sin(vehicle.angle);
    this.projectiles.push({
      patient,
      owner: team,
      target: 1 - team,
      x: vehicle.x + cos * 39,
      y: vehicle.y + sin * 39,
      vx: cos * PVP.projectileSpeed + vehicle.velocity.x * 0.35,
      vy: sin * PVP.projectileSpeed + vehicle.velocity.y * 0.35,
      age: 0,
      z: 8,
      vz: 165,
      bounced: false,
      spin: 0,
      spinV: (patient.id % 2 === 0 ? 1 : -1) * (4.8 + (patient.id % 4) * 0.45)
    });
    this.game.effects.spark(vehicle.x + cos * 34, vehicle.y + sin * 34, vehicle.teamColor, 10, 85, 5);
    return true;
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      projectile.age += dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;
      projectile.vz -= 520 * dt;
      projectile.spin += projectile.spinV * dt;
      if (projectile.z < 0) {
        projectile.z = 0;
        if (!projectile.bounced && projectile.vz < -55) {
          projectile.vz = -projectile.vz * 0.24;
          projectile.bounced = true;
        } else {
          projectile.vz = 0;
        }
      }

      const target = projectile.target === 0 ? this.game.player : this.opponent;
      const dx = projectile.x - target.x;
      const dy = projectile.y - target.y;
      const cos = Math.cos(target.angle);
      const sin = Math.sin(target.angle);
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      const hit =
        Math.abs(localX) <= AMBULANCE.halfLength + PVP.projectileRadius &&
        Math.abs(localY) <= AMBULANCE.halfWidth + PVP.projectileRadius;

      if (hit) {
        this.projectiles.splice(i, 1);
        this.game.effects.blood(target.x, target.y, 18, Math.atan2(projectile.vy, projectile.vx));
        this.game.effects.spark(target.x, target.y, '#ff8fa4', 20, 180, 10);
        this.game.effects.text(target.x, target.y, '伤员死亡', '#ff8fa4', 13);
        this.game.camera.addShake(0.42);
        this.damage(projectile.target, PVP.hitDamage, '被伤员击中');
        if (!this.active) return;
        continue;
      }

      if (projectile.age >= PVP.projectileLifetime) {
        this.projectiles.splice(i, 1);
        this.game.effects.blood(projectile.x, projectile.y, 12, Math.atan2(projectile.vy, projectile.vx));
        this.game.effects.text(projectile.x, projectile.y, '伤员落地', '#b3a2b7', 11);
      }
    }
  }

  damage(team, amount, reason) {
    const vehicle = team === 0 ? this.game.player : this.opponent;
    if (team === 0) {
      this.game.upgrades.money = Math.max(0, this.game.upgrades.money - amount);
    } else {
      this.opponentMoney = Math.max(0, this.opponentMoney - amount);
    }
    this.game.effects.text(vehicle.x, vehicle.y - 20, `-$${amount}`, '#ff5268', 17);
    this.game.audio.fine();
    this.game.addDangerFlash(0.35);
    this.game.hud.toast(`${team === 0 ? 'P1' : 'AI'} ${reason} · -$${amount}`, 'danger');

    const health = team === 0 ? this.game.upgrades.money : this.opponentMoney;
    if (health <= 0) this.finish(team === 0 ? 1 : 0);
  }

  resolveVehicleContact() {
    const player = this.game.player;
    const opponent = this.opponent;
    const dx = opponent.x - player.x;
    const dy = opponent.y - player.y;
    const d = Math.hypot(dx, dy);
    const minDistance = player.radius + opponent.radius;
    if (d >= minDistance) return;

    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    const push = (minDistance - d) * 0.5;
    player.x -= nx * push;
    player.y -= ny * push;
    opponent.x += nx * push;
    opponent.y += ny * push;
    player.speed *= 0.82;
    opponent.speed *= 0.82;
    this.game.city.collideCircle(player, player.radius);
    this.game.city.collideCircle(opponent, opponent.radius);
  }

  finish(winner) {
    if (!this.active) return;
    this.active = false;
    this.winner = winner;
    this.game.state = 'matchOver';
    document.body.classList.remove('is-playing');
    this.game.hud.setPrompt(null);
    this.game.audio.suspendLoops();
    this.game.screens.showMatchOver(winner);
  }
}
