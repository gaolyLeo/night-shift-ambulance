export const WORLD = {
  cols: 7,
  rows: 5,
  blockW: 480,
  blockH: 360,
  roadW: 170,
  sidewalk: 30
};

export const VIEW = {
  yScale: 0.68,
  zX: 0.36,
  zY: 0.88,
  zoomMin: 0.72,
  zoomMax: 1.12
};

export const AMBULANCE = {
  radius: 24,
  halfWidth: 16,
  halfLength: 32,
  visualScale: 1.05,
  maxSpeed: 385,
  reverseSpeed: 165,
  acceleration: 285,
  reverseAcceleration: 210,
  brakePower: 480,
  turnRate: 2.55,
  handbrakeTurnBoost: 1.68,
  hitSpeed: 48,
  boostMultiplier: 1.38,
  boostAccelMultiplier: 1.9,
  boostDrain: 38,
  boostRegen: 22,
  driftGrip: 3.4,
  normalGrip: 12.5
};

export const PATIENTS = {
  callSpawnMin: 7,
  callSpawnMax: 13,
  maxCalls: 4,
  callWaitTime: 65,
  callCareTime: 72,
  callReward: 95,
  callTimeBonus: 1.15,
  accidentCareTime: 58,
  accidentReward: 150,
  accidentTimeBonus: 1.9,
  fine: 135,
  magnetRange: 185,
  pickupRange: 105,
  pickupStyleSpeed: 85,
  deliveryStyleSpeed: 100,
  styleBonus: 25
};

export const PEDESTRIANS = {
  count: 120,
  speedMin: 28,
  speedMax: 46,
  pauseChance: 0.22,
  hitLaunchSpeed: 1.42
};

export const TRAFFIC = {
  count: 22,
  speedMin: 95,
  speedMax: 145
};

export const CRASH = {
  // Ambulance speed needed to launch a traffic car instead of just bumping it.
  launchSpeed: 168,
  // Above this speed a crash leaves two victims instead of one.
  twoVictimSpeed: 265,
  carLaunchMin: 280,
  carLaunchMax: 580,
  gravity: 620,
  victimSpreadMin: 26,
  victimSpreadMax: 68,
  chainRadius: 175
};

export const UPGRADES = {
  engine: {
    name: '引擎强化',
    icon: 'ENG',
    desc: '提高极速与加速，缩短每一趟出车时间。',
    maxLevel: 4,
    costs: [300, 760, 1600],
    accent: '#5de9ff'
  },
  handling: {
    name: '底盘调校',
    icon: 'TRN',
    desc: '转向更灵敏，过弯抓地与起步加速更快。',
    maxLevel: 4,
    costs: [260, 680, 1450],
    accent: '#7dffb2'
  },
  capacity: {
    name: '担架扩容',
    icon: 'CRG',
    desc: '一次能多拉一个病人，顺路把他们都送回去。',
    maxLevel: 3,
    costs: [480, 1250],
    accent: '#ffd479'
  },
  equipment: {
    name: '急救设备',
    icon: 'MED',
    desc: '每级为病人多争取 8 秒生存时间。',
    maxLevel: 4,
    costs: [340, 820, 1700],
    accent: '#ff5f9e'
  }
};

export const GAME = {
  startMoney: 0
};

export const PVP = {
  startingHealth: 1000,
  hitDamage: 150,
  carriedPatientDeathDamage: 80,
  ammoCapacity: 2,
  pickupRange: 58,
  manualPickupRange: 112,
  projectileSpeed: 620,
  projectileRadius: 12,
  projectileLifetime: 2.4,
  aiFireRange: 680,
  aiAimTolerance: 0.2,
  aiFireCooldown: 1.35,
  aiRepathInterval: 1.6
};

export const CITY = {
  hospitalBlock: { col: 3, row: 2 }
};
