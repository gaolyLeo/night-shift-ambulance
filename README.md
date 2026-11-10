# 夜班急救 · NIGHT SHIFT

**在线试玩（GitHub Pages）：[https://gaolyleo.github.io/night-shift-ambulance/](https://gaolyleo.github.io/night-shift-ambulance/)**

一个霓虹斜俯视 2.5D 的开放城市救护车小游戏。你是一名夜班救护车司机：接走街头倒下的病人，把他们送回医院赚钱；也可以亲手把路人撞飞，再把他们拉回医院。

浏览器运行，原生 JavaScript ES Modules，无第三方依赖。

## 运行

- **在线直接玩**：访问 [https://gaolyleo.github.io/night-shift-ambulance/](https://gaolyleo.github.io/night-shift-ambulance/)
- **本地开发运行**：

```bash
npm run dev
```

然后打开 http://127.0.0.1:5173。

也可以用任意静态服务器托管根目录。因为使用了 ES Modules，不能直接双击 `index.html` 以 `file://` 方式打开。

## 操作

| 按键 | 作用 |
| --- | --- |
| `W` / `S` | 前进 / 刹车、倒车 |
| `A` / `D` | 左转 / 右转 |
| `Shift` | 氮气冲刺 |
| `E` | 医院交付 / 打开升级（病人靠近时也可手动接人） |
| `F` | 开关警报 |
| `Space` | 手刹 / 漂移 |
| `Esc` / `P` | 暂停 / 继续 |
| `M` | 静音 |
| `Q` | PvP：投掷伤员 |
| `C` / HUD 驾驶按钮 | 在鼠标跟随与 WASD 驾驶之间切换 |
| 移动鼠标 | 默认驾驶方式；持续更新车辆目标，无需点击或按住按键 |

进入游戏、打开菜单后都用鼠标点击按钮。游戏默认沿道路追随光标位置，移动光标即可改变车辆目标。

## 玩法

- **急救呼叫**：城市各处会随机刷新病人，黄金标记。接不接都没有惩罚，超时会自行消失。
- **接人**：靠近病人会自动磁吸上车，不需要停车；漂移、手刹或高速接人可获得额外奖金。
- **送医**：开到医院前方的红色急救区会自动交付，按剩余时间和连送人数结算报酬；漂移送达还有额外奖金。
- **撞人**：高速撞上路人会把人撞飞。落地后变成「事故伤员」，粉色标记，开始倒计时；在计时结束前送医可以拿到更高的报酬。
- **车祸**：高速撞击交通车辆会把它撞飞；车辆落地爆炸后会在现场产生车祸伤员，冲击范围内的其他车辆和行人还会被连锁引爆。
- **罚款**：只有病人在救护车上死亡才会扣钱，钱可以是负数。地面上的事故伤员超时死亡不会罚款。
- **升级**：医院急救区、车内没有病人时按 `E` 打开升级界面。可升级引擎、底盘、担架容量和急救设备。
- **开放模式**：没有关卡终点，也没有警察。先专注于把「撞人 → 送医 → 赚钱 → 升级」的循环跑顺。
- **单人 PvP**：标题页选择「单人 PvP · AI 对手」。玩家可用 WASD 或鼠标目标驾驶，并使用 Shift、Q、E；AI 会沿道路自动驾驶、拾取伤员并瞄准投掷。靠近街头伤员装弹，投掷击中对方车辆会杀死伤员并扣对方 $150；双方现金就是生命值，先归零的一方落败。

## 架构

```
index.html                  页面结构 / HUD / 菜单
styles/main.css             全部界面样式
favicon.svg                 图标

src/
  main.js                   启动入口
  config.js                 全局可调参数（车辆、病人、升级、世界尺寸）
  core/
    Game.js                 游戏循环与系统编排
    Input.js                键盘输入与按键边缘检测
    Camera.js               跟随镜头、斜俯视投影、震屏
    AudioManager.js         WebAudio 引擎声、警报与音效
    math.js                 数学与碰撞工具
  world/
    City.js                 城市生成、建筑、医院、道路、地面预渲染
  entities/
    Ambulance.js            救护车物理与碰撞
    Pedestrian.js           行人巡游与撞飞物理
    Patient.js              病人状态与计时
    TrafficCar.js           街区环路交通
  systems/
    PatientSystem.js        呼叫、事故伤员、自动磁吸、接送、罚款、结算
    PvpSystem.js            单人 PvP、AI 驾驶、伤员弹药、投掷命中与生命值
    TrafficSystem.js        交通生成、碰撞、撞飞、爆炸与连锁反应
    UpgradeSystem.js        金钱、升级等级与车辆属性
    Effects.js              粒子、冲击波、飘字
  render/
    Renderer.js             斜俯视场景、建筑、车辆、角色、标记
  ui/
    HUD.js                  金钱、速度、乘客计时、提示、Toast
    Minimap.js              小地图
    Screens.js              标题、暂停、升级界面
    format.js               金额格式化

tools/
  serve.mjs                 零依赖本地静态服务器
```

### 关键设计

- 世界坐标是平面 `x/y`，渲染时纵向压缩到 `VIEW.yScale`。高度沿 `VIEW.zX` / `VIEW.zY` 向左上方斜投影，所以建筑同时露出正面墙、侧面墙和屋顶，车辆与路灯光柱也共享同一套高度方向。
- 建筑、车辆、行人、病人和救护车按世界 `y` 排序绘制，形成前后遮挡。当建筑挡住玩家时，建筑会变透明。
- 病人计时状态集中在 `Patient` / `PatientSystem`；救护车本身不持有乘客，容量由升级系统提供。自动磁吸、医院交付和罚款也由 `PatientSystem` 统一处理。
- PvP 独立使用 `PvpSystem` 管理 AI 驾驶、双方弹药与投掷物；普通单人模式仍由 `PatientSystem` 负责载客、送医和结算。
- 交通车辆的生成、环路行驶、救护车碰撞、撞飞和爆炸生命周期集中在 `TrafficSystem`；`Renderer` 只负责画当前状态。
- 地面（道路、人行道、标线、医院急救区）只预渲染一次到离屏 canvas，每帧只裁剪绘制可见区域。

## 调参

大部分数值在 `src/config.js`：

- `AMBULANCE`：极速、加速度、转向、手刹、氮气
- `PATIENTS`：呼叫间隔、上车/事故倒计时、报酬、罚款、磁吸范围
- `TRAFFIC` / `CRASH`：交通数量与速度、撞飞阈值、爆炸冲击范围
- `UPGRADES`：升级价格、最大等级、描述
- `PVP`：初始生命值、命中伤害、弹药容量和投掷参数
- `WORLD`：街区尺寸、道路宽度、地图大小
- `PEDESTRIANS`：行人数量和速度

## 开发检查

项目里带了四个 Chrome DevTools Protocol 检查脚本，需要先以 `--remote-debugging-port=9222` 启动 Chrome。也可以设置 `CDP_PORT` 指向其他调试端口：

```bash
node tools/cdp-check.mjs   # 加载、启动、截图
node tools/cdp-flow.mjs    # 接人、送医、升级、撞人、地面伤员无罚款流程
node tools/cdp-drive.mjs   # 真实按键驾驶、氮气、警报、手刹、遮挡淡出、帧率
node tools/cdp-crash.mjs   # 高速撞飞、落地爆炸、车祸伤员、低速碰撞与车内罚款
```

它们不是运行时依赖，可以按需删除。共用连接逻辑在 `tools/cdp-client.mjs`。
