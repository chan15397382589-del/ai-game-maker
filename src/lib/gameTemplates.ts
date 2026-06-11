// 游戏配置模板 - 学习自 OpenGame 项目
// 用于标准化游戏生成的参数

// 游戏物理参数
export const PHYSICS = {
  gravity: 0.5,        // 重力加速度
  bounce: 0.7,         // 弹力系数（0-1）
  friction: 0.98,      // 摩擦力
  jumpForce: -12,      // 跳跃力度
  moveSpeed: 5,        // 移动速度
};

// 实体标准尺寸（像素）
export const ENTITY_SIZES = {
  player: { w: 40, h: 40 },      // 玩家角色
  enemy: { w: 32, h: 32 },       // 敌人
  boss: { w: 64, h: 64 },        // BOSS
  collectible: { w: 24, h: 24 }, // 收集物（金币、星星等）
  obstacle: { w: 40, h: 40 },    // 障碍物
  platform: { w: 100, h: 20 },   // 平台
};

// 标准颜色方案
export const COLORS = {
  // 背景色
  sky: { top: "#87CEEB", bottom: "#E0F7FA" },
  night: { top: "#0C1445", bottom: "#1A237E" },
  sunset: { top: "#FF6B35", bottom: "#FFD700" },
  forest: { top: "#2D5016", bottom: "#4CAF50" },
  underground: { top: "#2F2F2F", bottom: "#4A4A4A" },

  // 角色色
  player: "#4A90D9",
  enemy: "#E74C3C",
  boss: "#8B0000",
  npc: "#2ECC71",

  // 物品色
  coin: "#FFD700",
  star: "#FFD700",
  heart: "#FF4444",
  key: "#FFD700",
  gem: "#9B59B6",

  // 环境色
  platform: "#8B4513",
  grass: "#4CAF50",
  water: "#3498DB",
  lava: "#FF4500",
  ice: "#87CEEB",
};

// 游戏类型配置
export const GAME_TYPES = {
  "接东西": {
    description: "玩家控制角色接住从天上掉落的物品",
    mechanics: ["移动", "碰撞检测", "计分"],
    controls: "左右方向键或鼠标移动",
  },
  "躲避": {
    description: "玩家控制角色躲避障碍物",
    mechanics: ["移动", "碰撞检测", "计分"],
    controls: "方向键或触屏滑动",
  },
  "跑酷": {
    description: "角色自动向前跑，玩家控制跳跃和躲避",
    mechanics: ["跳跃", "重力", "碰撞检测", "计分"],
    controls: "空格键跳跃，方向键移动",
  },
  "迷宫": {
    description: "玩家在迷宫中寻找出口",
    mechanics: ["移动", "碰撞检测", "关卡"],
    controls: "方向键移动",
  },
  "对战": {
    description: "玩家与敌人战斗",
    mechanics: ["移动", "攻击", "生命值", "碰撞检测"],
    controls: "方向键移动，空格键攻击",
  },
};

// Canvas 游戏模板代码
export const GAME_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{GAME_NAME}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #1a1a2e; }
    canvas { border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <canvas id="gameCanvas" width="480" height="360"></canvas>
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // 游戏状态
    let gameState = 'playing'; // playing, paused, gameover
    let score = 0;

    // 物理参数
    const GRAVITY = 0.5;
    const BOUNCE = 0.7;

    // 玩家
    const player = {
      x: canvas.width / 2 - 20,
      y: canvas.height - 60,
      width: 40,
      height: 40,
      color: '#4A90D9',
      vx: 0,
      vy: 0,
      speed: 5,
      jumpForce: -12,
      onGround: false
    };

    // 游戏循环
    function gameLoop() {
      if (gameState !== 'playing') return;

      update();
      draw();
      requestAnimationFrame(gameLoop);
    }

    function update() {
      // 物理更新
      player.vy += GRAVITY;
      player.x += player.vx;
      player.y += player.vy;

      // 地面碰撞
      if (player.y + player.height > canvas.height) {
        player.y = canvas.height - player.height;
        player.vy = 0;
        player.onGround = true;
      }

      // 边界检测
      if (player.x < 0) player.x = 0;
      if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;
    }

    function draw() {
      // 清空画布
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制玩家
      ctx.fillStyle = player.color;
      ctx.fillRect(player.x, player.y, player.width, player.height);

      // 绘制分数
      ctx.fillStyle = '#fff';
      ctx.font = '20px Arial';
      ctx.fillText('分数: ' + score, 10, 30);
    }

    // 键盘控制
    document.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft') player.vx = -player.speed;
      if (e.code === 'ArrowRight') player.vx = player.speed;
      if (e.code === 'Space' && player.onGround) {
        player.vy = player.jumpForce;
        player.onGround = false;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') player.vx = 0;
    });

    // 开始游戏
    gameLoop();
  </script>
</body>
</html>`;
