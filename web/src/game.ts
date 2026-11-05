import kaplay from "kaplay";
import type { ColorComp, GameObj } from "kaplay";

const VW = 400;
const VH = 640;

// Grid: 10 columns, cells are 34px wide
const COLS = 10;
const CELL = 34;
const GRID_X = (VW - COLS * CELL) / 2; // left edge of grid
const HUD_H = 56; // height of top HUD
const TROPHY_Y = HUD_H + 40; // y position of the trophy line
const PIECE_Y = TROPHY_Y + 60; // y where the sliding piece lives
const WALL_START_Y = VH + 20; // wall starts below screen

type Mode = "easy" | "hard" | "extreme";

// Shapes as column offsets (all 1 row tall — they slide horizontally)
// Each shape is an array of column offsets from the leftmost cell
const SHAPES: number[][] = [
  [0],             // single block
  [0, 1],          // 2-wide bar
  [0, 1, 2],       // 3-wide bar
  [0, 1, 2, 3],    // 4-wide bar (I)
  [0, 1, 3],       // gap in middle (tricky)
  [0, 2],          // 2 with gap
  [0, 1, 2, 3, 4], // 5-wide
  [0, 2, 3],       // L-like
  [0, 1, 3, 4],    // S-like
];

// Shapes for hard/extreme — include multi-row shapes
// We represent multi-row shapes as [row, col] pairs
type Cell = [number, number];

const SHAPES_MULTI: Cell[][] = [
  // flat bar
  [[0,0],[0,1],[0,2]],
  // L shape
  [[0,0],[1,0],[2,0],[2,1]],
  // J shape
  [[0,1],[1,1],[2,1],[2,0]],
  // T shape
  [[0,0],[0,1],[0,2],[1,1]],
  // S shape
  [[0,1],[0,2],[1,0],[1,1]],
  // Z shape
  [[0,0],[0,1],[1,1],[1,2]],
  // single
  [[0,0]],
  // 2-wide
  [[0,0],[0,1]],
  // 4-wide
  [[0,0],[0,1],[0,2],[0,3]],
  // square
  [[0,0],[0,1],[1,0],[1,1]],
];

const MODE_CONFIG: Record<Mode, {
  slideSpeed: number;   // px/sec the piece slides
  wallSpeed: number;    // px/sec the wall rises
  levels: number;
  stepsToTrophy: number; // successful drops needed per level
  colors: [number,number,number][];
  shapesMulti: boolean; // use multi-row shapes
}> = {
  easy:    { slideSpeed: 80,  wallSpeed: 40,  levels: 64, stepsToTrophy: 5,  colors: [[99,179,237],[72,187,120],[246,173,85],[154,117,234]], shapesMulti: false },
  hard:    { slideSpeed: 130, wallSpeed: 70,  levels: 64, stepsToTrophy: 7,  colors: [[239,68,68],[59,130,246],[251,191,36],[52,211,153],[167,139,250]], shapesMulti: true },
  extreme: { slideSpeed: 200, wallSpeed: 110, levels: 64, stepsToTrophy: 10, colors: [[255,100,100],[100,200,255],[255,220,50],[100,255,180],[220,100,255]], shapesMulti: true },
};

function getProgress(): { unlockedModes: Mode[]; completedModes: Mode[] } {
  try {
    const raw = localStorage.getItem("stackpack_progress");
    if (raw) return JSON.parse(raw) as { unlockedModes: Mode[]; completedModes: Mode[] };
  } catch { /* ignore */ }
  return { unlockedModes: ["easy"], completedModes: [] };
}
function saveProgress(p: { unlockedModes: Mode[]; completedModes: Mode[] }) {
  localStorage.setItem("stackpack_progress", JSON.stringify(p));
}

// Normalize a multi-cell shape so min row=0, min col=0
function normalizeShape(cells: Cell[]): Cell[] {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([,c]) => c));
  return cells.map(([r,c]) => [r - minR, c - minC]);
}

// Get bounding box of a shape
function shapeBounds(cells: Cell[]): { rows: number; cols: number } {
  const maxR = Math.max(...cells.map(([r]) => r));
  const maxC = Math.max(...cells.map(([,c]) => c));
  return { rows: maxR + 1, cols: maxC + 1 };
}

export function startGame(canvas: HTMLCanvasElement, onScore: (n: number) => void): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [12, 12, 22],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  // ── MENU ─────────────────────────────────────────────────────────────────────
  k.scene("menu", () => {
    onScore(0);
    const prog = getProgress();

    k.add([k.text("STACK PACK", { size: 40 }), k.anchor("center"), k.pos(VW/2, 130), k.color(99,179,237)]);
    k.add([k.text("Drop the shape into the gap!", { size: 13 }), k.anchor("center"), k.pos(VW/2, 174), k.color(160,160,190)]);

    // Animated demo piece sliding
    let demoX = GRID_X;
    let demoDir = 1;
    const demoCells: Cell[] = [[0,0],[0,1],[0,2]];
    const demoBounds = shapeBounds(demoCells);
    const demoObjs = demoCells.map(([,dc]) => k.add([
      k.rect(CELL-2, CELL-2, { radius: 4 }),
      k.color(99,179,237),
      k.pos(demoX + dc*CELL + 1, 210),
      k.opacity(0.85),
    ]));
    k.onUpdate(() => {
      demoX += demoDir * 60 * k.dt();
      if (demoX + demoBounds.cols * CELL > GRID_X + COLS * CELL) demoDir = -1;
      if (demoX < GRID_X) demoDir = 1;
      demoObjs.forEach((o, i) => {
        const dc = demoCells[i]![1];
        o.pos.x = demoX + dc * CELL + 1;
      });
    });

    const modes: Mode[] = ["easy", "hard", "extreme"];
    const modeColors: Record<Mode, [number,number,number]> = {
      easy:    [72,187,120],
      hard:    [246,173,85],
      extreme: [239,68,68],
    };
    const modeLabels: Record<Mode, string> = {
      easy:    "EASY — 64 levels",
      hard:    "HARD — 64 levels",
      extreme: "EXTREME — 64 levels",
    };

    modes.forEach((mode, i) => {
      const unlocked = prog.unlockedModes.includes(mode);
      const completed = prog.completedModes.includes(mode);
      const y = 300 + i * 76;
      const col = unlocked ? modeColors[mode] : [50,50,70] as [number,number,number];

      const btn = k.add([
        k.rect(270, 54, { radius: 12 }),
        k.color(...col),
        k.anchor("center"),
        k.pos(VW/2, y),
        k.opacity(unlocked ? 1 : 0.4),
        k.area(),
      ]);
      k.add([
        k.text((completed ? "✓ " : unlocked ? "" : "🔒 ") + modeLabels[mode], { size: 15 }),
        k.anchor("center"),
        k.pos(VW/2, y),
        k.color(255,255,255),
      ]);
      if (unlocked) btn.onClick(() => k.go("play", { mode, level: 1, totalScore: 0 }));
    });

    k.add([
      k.text("SPACE or tap = drop", { size: 11 }),
      k.anchor("center"),
      k.pos(VW/2, VH - 22),
      k.color(80,80,110),
    ]);
  });

  // ── GAME OVER ────────────────────────────────────────────────────────────────
  k.scene("over", (d: { score: number; mode: Mode; level: number }) => {
    k.add([k.rect(VW,VH), k.color(12,12,22), k.pos(0,0)]);
    k.add([k.text("MISSED!", { size: 48 }), k.anchor("center"), k.pos(VW/2, 190), k.color(239,68,68)]);
    k.add([k.text(`${d.mode.toUpperCase()} — Level ${d.level}`, { size: 17 }), k.anchor("center"), k.pos(VW/2, 252), k.color(160,160,190)]);
    k.add([k.text(`Score: ${d.score}`, { size: 22 }), k.anchor("center"), k.pos(VW/2, 292), k.color(99,179,237)]);

    const retry = k.add([k.rect(200,52,{radius:10}), k.color(239,68,68), k.anchor("center"), k.pos(VW/2, 390), k.area()]);
    k.add([k.text("Try Again", { size: 18 }), k.anchor("center"), k.pos(VW/2, 390), k.color(255,255,255)]);
    retry.onClick(() => k.go("play", { mode: d.mode, level: d.level, totalScore: 0 }));

    const menu = k.add([k.rect(200,52,{radius:10}), k.color(50,50,80), k.anchor("center"), k.pos(VW/2, 458), k.area()]);
    k.add([k.text("Menu", { size: 18 }), k.anchor("center"), k.pos(VW/2, 458), k.color(200,200,220)]);
    menu.onClick(() => k.go("menu"));
    k.onKeyPress("space", () => k.go("play", { mode: d.mode, level: d.level, totalScore: 0 }));
  });

  // ── LEVEL COMPLETE ───────────────────────────────────────────────────────────
  k.scene("levelcomplete", (d: { mode: Mode; level: number; totalScore: number }) => {
    const cfg = MODE_CONFIG[d.mode];
    const prog = getProgress();
    const modesDone = d.level >= cfg.levels;

    if (modesDone) {
      if (!prog.completedModes.includes(d.mode)) prog.completedModes.push(d.mode);
      const order: Mode[] = ["easy","hard","extreme"];
      const nextMode = order[order.indexOf(d.mode) + 1];
      if (nextMode && !prog.unlockedModes.includes(nextMode)) prog.unlockedModes.push(nextMode);
      saveProgress(prog);
    }

    const allDone = prog.completedModes.length === 3;

    k.add([k.rect(VW,VH), k.color(12,12,22), k.pos(0,0)]);
    k.add([k.text("🏆", { size: 60 }), k.anchor("center"), k.pos(VW/2, 160)]);
    k.add([k.text(modesDone ? "MODE COMPLETE!" : "LEVEL CLEAR!", { size: 32 }), k.anchor("center"), k.pos(VW/2, 230), k.color(251,191,36)]);
    k.add([k.text(`${d.mode.toUpperCase()} — Level ${d.level}/${cfg.levels}`, { size: 16 }), k.anchor("center"), k.pos(VW/2, 272), k.color(160,160,190)]);
    k.add([k.text(`Total Score: ${d.totalScore}`, { size: 18 }), k.anchor("center"), k.pos(VW/2, 308), k.color(99,179,237)]);

    if (modesDone) {
      const order: Mode[] = ["easy","hard","extreme"];
      const nextMode = order[order.indexOf(d.mode) + 1];
      k.add([
        k.text(allDone ? "🎉 ALL MODES DONE!" : `🔓 ${(nextMode ?? "").toUpperCase()} UNLOCKED!`, { size: 16 }),
        k.anchor("center"), k.pos(VW/2, 350), k.color(154,117,234),
      ]);
    }

    const btnLabel = allDone ? "Play Again" : modesDone ? "Back to Menu" : "Next Level";
    const btn = k.add([k.rect(220,54,{radius:12}), k.color(72,187,120), k.anchor("center"), k.pos(VW/2, 440), k.area()]);
    k.add([k.text(btnLabel, { size: 18 }), k.anchor("center"), k.pos(VW/2, 440), k.color(255,255,255)]);

    btn.onClick(() => {
      if (allDone) { saveProgress({ unlockedModes: ["easy"], completedModes: [] }); k.go("menu"); }
      else if (modesDone) k.go("menu");
      else k.go("play", { mode: d.mode, level: d.level + 1, totalScore: d.totalScore });
    });
    k.onKeyPress("space", () => {
      if (allDone) { saveProgress({ unlockedModes: ["easy"], completedModes: [] }); k.go("menu"); }
      else if (modesDone) k.go("menu");
      else k.go("play", { mode: d.mode, level: d.level + 1, totalScore: d.totalScore });
    });
  });

  // ── PLAY SCENE ───────────────────────────────────────────────────────────────
  k.scene("play", (d: { mode: Mode; level: number; totalScore: number }) => {
    const cfg = MODE_CONFIG[d.mode];
    let score = d.totalScore;
    let steps = 0; // successful drops this level
    let gameActive = true;
    let dropping = false;
    onScore(score);

    // ── Pick a random shape ──────────────────────────────────────────────────
    function pickShape(): Cell[] {
      if (cfg.shapesMulti) {
        const idx = Math.floor(k.rand(0, SHAPES_MULTI.length - 0.01));
        return normalizeShape([...(SHAPES_MULTI[idx] ?? [[0,0]])]);
      } else {
        const idx = Math.floor(k.rand(0, SHAPES.length - 0.01));
        const cols = SHAPES[idx] ?? [0];
        return cols.map(c => [0, c] as Cell);
      }
    }

    // ── State ────────────────────────────────────────────────────────────────
    let shape = pickShape();
    let bounds = shapeBounds(shape);

    // anchorCol: leftmost column the shape occupies (0..COLS-bounds.cols)
    let anchorCol = Math.floor((COLS - bounds.cols) / 2);
    let slideDir = 1; // 1=right, -1=left
    let slideX = GRID_X + anchorCol * CELL; // pixel x of anchor

    // Gap col: where the wall gap is (matches shape)
    let gapCol = anchorCol; // initially same position as shape

    // Wall y position (rises from bottom)
    let wallY = WALL_START_Y;
    const wallRows = bounds.rows;

    // Progress: how far the wall has risen toward the piece (0..1)
    // Trophy is at TROPHY_Y, wall starts at WALL_START_Y
    const wallTravelTotal = WALL_START_Y - (PIECE_Y + wallRows * CELL + 20);

    // ── Drawing helpers ──────────────────────────────────────────────────────
    const pieceColor = cfg.colors[Math.floor(k.rand(0, cfg.colors.length - 0.01))] ?? [99,179,237];
    const wallColor: [number,number,number] = [70,70,110];

    // Grid background lines
    for (let c = 0; c <= COLS; c++) {
      k.add([k.rect(1, VH), k.color(22,22,38), k.pos(GRID_X + c*CELL, 0)]);
    }

    // HUD
    k.add([k.rect(VW, HUD_H), k.color(8,8,18), k.pos(0,0)]);
    k.add([k.text(`${d.mode.toUpperCase()}  Lv.${d.level}`, { size: 13 }), k.pos(10, 8), k.color(160,160,200)]);
    const scoreLbl = k.add([k.text(`${score}`, { size: 18 }), k.anchor("top"), k.pos(VW/2, 6), k.color(251,191,36)]);

    // Trophy progress bar (horizontal, below HUD)
    const barW = COLS * CELL;
    k.add([k.rect(barW, 10, { radius: 5 }), k.color(25,25,45), k.pos(GRID_X, HUD_H + 2)]);
    const progressBar = k.add([k.rect(4, 10, { radius: 5 }), k.color(251,191,36), k.pos(GRID_X, HUD_H + 2)]);

    // Trophy icon at right end of bar
    k.add([k.text("🏆", { size: 18 }), k.anchor("center"), k.pos(GRID_X + barW + 14, HUD_H + 7)]);

    // Instruction (fades after 3s)
    const hint = k.add([
      k.text("SPACE / tap to drop", { size: 11 }),
      k.anchor("center"), k.pos(VW/2, VH - 16), k.color(80,80,110),
    ]);
    k.wait(3, () => { if (hint.exists()) k.destroy(hint); });

    // ── Piece visual objects ─────────────────────────────────────────────────
    // We rebuild piece cells every frame based on slideX
    let pieceObjs: GameObj<ColorComp>[] = [];

    function rebuildPiece() {
      pieceObjs.forEach(o => { if (o.exists()) k.destroy(o); });
      pieceObjs = [];
      shape.forEach(([dr, dc]) => {
        const px = slideX + dc * CELL + 1;
        const py = PIECE_Y + dr * CELL + 1;
        if (py > HUD_H) {
          pieceObjs.push(k.add([
            k.rect(CELL-2, CELL-2, { radius: 5 }),
            k.color(...pieceColor),
            k.pos(px, py),
            k.opacity(1),
          ]));
        }
      });
    }

    // ── Wall visual objects ──────────────────────────────────────────────────
    let wallObjs: ReturnType<typeof k.add>[] = [];

    function rebuildWall() {
      wallObjs.forEach(o => { if (o.exists()) k.destroy(o); });
      wallObjs = [];
      // Build gap set: cells that are the gap (where shape fits)
      const gapSet = new Set(shape.map(([r,c]) => `${r},${c + gapCol}`));
      for (let r = 0; r < wallRows; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!gapSet.has(`${r},${c}`)) {
            wallObjs.push(k.add([
              k.rect(CELL-2, CELL-2, { radius: 3 }),
              k.color(...wallColor),
              k.pos(GRID_X + c*CELL + 1, wallY + r*CELL + 1),
              k.opacity(0.95),
            ]));
          }
        }
      }
    }

    // ── Drop animation ───────────────────────────────────────────────────────
    let dropY = PIECE_Y; // current y of piece during drop
    let dropTargetY = 0;

    function startDrop() {
      if (!gameActive || dropping) return;
      dropping = true;
      dropY = PIECE_Y;
      // Target: piece lands at the wall's top row
      dropTargetY = wallY - 4;
    }

    function settleDrop() {
      dropping = false;

      // Check if piece fits: anchorCol (from slideX) must match gapCol
      const currentAnchorCol = Math.round((slideX - GRID_X) / CELL);

      if (currentAnchorCol === gapCol) {
        // ✅ PERFECT FIT
        score += shape.length; // 1 point per block cell
        steps++;
        onScore(score);

        // Flash green
        pieceObjs.forEach(o => { if (o.exists()) { o.color = k.rgb(72,187,120); } });

        k.wait(0.35, () => {
          if (!gameActive) return;

          // Check level complete
          if (steps >= cfg.stepsToTrophy) {
            gameActive = false;
            k.go("levelcomplete", { mode: d.mode, level: d.level, totalScore: score });
            return;
          }

          // New shape + reset wall
          shape = pickShape();
          bounds = shapeBounds(shape);
          anchorCol = Math.floor((COLS - bounds.cols) / 2);
          slideX = GRID_X + anchorCol * CELL;
          slideDir = 1;
          gapCol = anchorCol;
          wallY = WALL_START_Y;
          dropY = PIECE_Y;
          rebuildPiece();
          rebuildWall();
        });
      } else {
        // ❌ MISSED — game over
        gameActive = false;
        // Flash red
        pieceObjs.forEach(o => { if (o.exists()) o.color = k.rgb(239,68,68); });
        k.wait(0.5, () => k.go("over", { score, mode: d.mode, level: d.level }));
      }
    }

    // ── Input ────────────────────────────────────────────────────────────────
    let lastTap = -999;

    function handleDrop() {
      if (!gameActive || dropping) return;
      const now = k.time();
      // Double-tap / double-space = instant drop (wall jumps to piece)
      if (now - lastTap < 0.35) {
        // Instant: snap wall to piece position
        wallY = PIECE_Y + bounds.rows * CELL + 8;
        startDrop();
      } else {
        lastTap = now;
        startDrop();
      }
    }

    k.onKeyPress("space", handleDrop);
    k.onMousePress(handleDrop);
    k.onTouchStart(handleDrop);

    // ── Main loop ────────────────────────────────────────────────────────────
    k.onUpdate(() => {
      if (!gameActive) return;
      const dt = k.dt();

      if (dropping) {
        // Piece falls toward wall
        dropY += 500 * dt;
        if (dropY >= dropTargetY) {
          dropY = dropTargetY;
          settleDrop();
        }
        // Render dropping piece
        pieceObjs.forEach(o => { if (o.exists()) k.destroy(o); });
        pieceObjs = [];
        shape.forEach(([dr, dc]) => {
          const px = slideX + dc * CELL + 1;
          const py = dropY + dr * CELL + 1;
          if (py > HUD_H && py < VH) {
            pieceObjs.push(k.add([
              k.rect(CELL-2, CELL-2, { radius: 5 }),
              k.color(...pieceColor),
              k.pos(px, py),
            ]));
          }
        });
        return;
      }

      // Slide piece left/right
      slideX += slideDir * cfg.slideSpeed * dt;
      const maxX = GRID_X + (COLS - bounds.cols) * CELL;
      if (slideX >= maxX) { slideX = maxX; slideDir = -1; }
      if (slideX <= GRID_X) { slideX = GRID_X; slideDir = 1; }

      // Update anchorCol for gap alignment hint
      anchorCol = Math.round((slideX - GRID_X) / CELL);

      // Wall rises from bottom
      wallY -= cfg.wallSpeed * dt;

      // If wall reaches the piece — auto miss (ran out of time)
      if (wallY <= PIECE_Y + bounds.rows * CELL + 4) {
        gameActive = false;
        pieceObjs.forEach(o => { if (o.exists()) o.color = k.rgb(239,68,68); });
        k.wait(0.4, () => k.go("over", { score, mode: d.mode, level: d.level }));
        return;
      }

      // Progress bar
      const progress = 1 - Math.max(0, (wallY - (PIECE_Y + bounds.rows * CELL + 4)) / wallTravelTotal);
      const stepsProgress = steps / cfg.stepsToTrophy;
      const totalProgress = Math.min(1, (stepsProgress * (cfg.stepsToTrophy - 1) / cfg.stepsToTrophy) + (progress / cfg.stepsToTrophy));
      progressBar.width = Math.max(4, totalProgress * barW);

      scoreLbl.text = `${score}`;

      rebuildPiece();
      rebuildWall();
    });

    // Initial draw
    rebuildPiece();
    rebuildWall();
  });

  k.go("menu");
  return () => k.quit();
}
