import kaplay from "kaplay";

// ─── Constants ────────────────────────────────────────────────────────────────
const VW = 400;
const VH = 640;
const COLS = 10;
const CELL = 34;
const GRID_X = (VW - COLS * CELL) / 2;
const HUD_H = 58;   // height of the top HUD bar
const PIECE_Y = HUD_H + CELL * 1.2; // Y pixel where the piece sits (top area)
const GRID_TOP = HUD_H; // grid starts here

// ─── Shapes: [row, col] offsets, normalized to 0,0 ───────────────────────────
const SHAPES: [number, number][][] = [
  // I-horizontal
  [[0,0],[0,1],[0,2],[0,3]],
  // I-vertical
  [[0,0],[1,0],[2,0],[3,0]],
  // L
  [[0,0],[1,0],[2,0],[2,1]],
  // J
  [[0,1],[1,1],[2,1],[2,0]],
  // T
  [[0,0],[0,1],[0,2],[1,1]],
  // S
  [[0,1],[0,2],[1,0],[1,1]],
  // Z
  [[0,0],[0,1],[1,1],[1,2]],
  // Square
  [[0,0],[0,1],[1,0],[1,1]],
  // Single
  [[0,0]],
  // Dot-pair
  [[0,0],[0,1]],
];

type Mode = "easy" | "hard" | "extreme";

interface ModeConfig {
  scrollPxPerSec: number; // how fast wall rows scroll up
  pieceSpeedCellsPerSec: number; // how fast piece slides left/right
  gapMin: number;
  gapMax: number;
  levels: number;
  colors: [number,number,number][];
}

const MODE_CONFIG: Record<Mode, ModeConfig> = {
  easy: {
    scrollPxPerSec: 22,
    pieceSpeedCellsPerSec: 1.6,
    gapMin: 4, gapMax: 6,
    levels: 64,
    colors: [[99,179,237],[72,187,120],[246,173,85],[154,117,234]],
  },
  hard: {
    scrollPxPerSec: 44,
    pieceSpeedCellsPerSec: 2.8,
    gapMin: 3, gapMax: 5,
    levels: 64,
    colors: [[239,68,68],[59,130,246],[251,191,36],[52,211,153],[167,139,250]],
  },
  extreme: {
    scrollPxPerSec: 80,
    pieceSpeedCellsPerSec: 4.5,
    gapMin: 2, gapMax: 3,
    levels: 64,
    colors: [[255,80,80],[80,200,255],[255,220,40],[80,255,160],[220,80,255],[255,140,40]],
  },
};

// ─── Progress ─────────────────────────────────────────────────────────────────
interface Progress { unlockedModes: Mode[]; completedModes: Mode[] }
function getProgress(): Progress {
  try {
    const raw = localStorage.getItem("stackpack2_progress");
    if (raw) return JSON.parse(raw) as Progress;
  } catch { /* ignore */ }
  return { unlockedModes: ["easy"], completedModes: [] };
}
function saveProgress(p: Progress) {
  localStorage.setItem("stackpack2_progress", JSON.stringify(p));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeGapRow(gapStart: number, gapWidth: number): boolean[] {
  // true = filled (wall), false = gap
  const row: boolean[] = [];
  for (let c = 0; c < COLS; c++) row.push(c < gapStart || c >= gapStart + gapWidth);
  return row;
}

function normalizeShape(s: [number,number][]): [number,number][] {
  const minR = Math.min(...s.map(([r]) => r));
  const minC = Math.min(...s.map(([,c]) => c));
  return s.map(([r,c]) => [r - minR, c - minC]);
}

function shapeWidth(s: [number,number][]): number {
  return Math.max(...s.map(([,c]) => c)) + 1;
}
function shapeHeight(s: [number,number][]): number {
  return Math.max(...s.map(([r]) => r)) + 1;
}

// ─── Main export ──────────────────────────────────────────────────────────────
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MENU SCENE
  // ═══════════════════════════════════════════════════════════════════════════
  k.scene("menu", () => {
    onScore(0);
    const prog = getProgress();

    // Animated falling blocks in background
    const bgBlocks: { x: number; y: number; speed: number; col: [number,number,number] }[] = [];
    for (let i = 0; i < 14; i++) {
      bgBlocks.push({
        x: k.rand(0, VW),
        y: k.rand(0, VH),
        speed: k.rand(20, 60),
        col: k.choose([[60,60,100],[40,40,80],[50,50,90]] as [number,number,number][]),
      });
    }
    const bgObjs = bgBlocks.map(b =>
      k.add([k.rect(CELL - 4, CELL - 4, { radius: 4 }), k.color(...b.col), k.pos(b.x, b.y), k.opacity(0.25)])
    );
    k.onUpdate(() => {
      bgBlocks.forEach((b, i) => {
        b.y += b.speed * k.dt();
        if (b.y > VH + CELL) b.y = -CELL;
        const o = bgObjs[i];
        if (o) o.pos.y = b.y;
      });
    });

    k.add([k.text("STACK PACK", { size: 42 }), k.anchor("center"), k.pos(VW/2, 130), k.color(99,179,237)]);
    k.add([k.text("Slide the block — drop it in the gap!", { size: 13 }), k.anchor("center"), k.pos(VW/2, 178), k.color(160,160,200)]);

    const modes: Mode[] = ["easy","hard","extreme"];
    const btnColors: Record<Mode,[number,number,number]> = {
      easy:[72,187,120], hard:[246,173,85], extreme:[239,68,68],
    };
    const btnLabels: Record<Mode,string> = {
      easy:"EASY  — 64 levels", hard:"HARD  — 64 levels", extreme:"EXTREME  — 64 levels",
    };

    modes.forEach((mode, i) => {
      const unlocked = prog.unlockedModes.includes(mode);
      const completed = prog.completedModes.includes(mode);
      const y = 260 + i * 82;
      const bc = unlocked ? btnColors[mode] : [50,50,75] as [number,number,number];

      const btn = k.add([
        k.rect(270, 54, { radius: 12 }),
        k.color(...bc),
        k.anchor("center"),
        k.pos(VW/2, y),
        k.opacity(unlocked ? 1 : 0.5),
        k.area(),
      ]);
      k.add([
        k.text(
          completed ? `✓ ${btnLabels[mode]}` :
          unlocked  ? btnLabels[mode] :
          `🔒 ${btnLabels[mode]}`,
          { size: 14 }
        ),
        k.anchor("center"), k.pos(VW/2, y), k.color(255,255,255),
      ]);
      if (unlocked) btn.onClick(() => k.go("play", { mode, level: 1, totalScore: 0 }));
    });

    k.add([k.text("← → or drag  |  SPACE / tap = drop  |  double = instant", { size: 10 }), k.anchor("center"), k.pos(VW/2, VH - 22), k.color(80,80,110)]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME OVER SCENE
  // ═══════════════════════════════════════════════════════════════════════════
  k.scene("over", (d: { score: number; mode: Mode; level: number }) => {
    k.add([k.rect(VW,VH), k.color(12,12,22), k.pos(0,0)]);
    k.add([k.text("GAME OVER", { size: 44 }), k.anchor("center"), k.pos(VW/2, 190), k.color(239,68,68)]);
    k.add([k.text(`${d.mode.toUpperCase()} — Level ${d.level}`, { size: 17 }), k.anchor("center"), k.pos(VW/2, 248), k.color(160,160,200)]);
    k.add([k.text(`Score: ${d.score}`, { size: 24 }), k.anchor("center"), k.pos(VW/2, 292), k.color(99,179,237)]);

    const retry = k.add([k.rect(210,54,{radius:12}), k.color(239,68,68), k.anchor("center"), k.pos(VW/2,390), k.area()]);
    k.add([k.text("Try Again", { size: 19 }), k.anchor("center"), k.pos(VW/2,390), k.color(255,255,255)]);
    retry.onClick(() => k.go("play", { mode: d.mode, level: d.level, totalScore: 0 }));

    const menu = k.add([k.rect(210,54,{radius:12}), k.color(50,50,80), k.anchor("center"), k.pos(VW/2,460), k.area()]);
    k.add([k.text("Menu", { size: 19 }), k.anchor("center"), k.pos(VW/2,460), k.color(200,200,220)]);
    menu.onClick(() => k.go("menu"));
    k.onKeyPress("space", () => k.go("play", { mode: d.mode, level: d.level, totalScore: 0 }));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL COMPLETE SCENE
  // ═══════════════════════════════════════════════════════════════════════════
  k.scene("levelcomplete", (d: { mode: Mode; level: number; levelScore: number; totalScore: number }) => {
    const cfg = MODE_CONFIG[d.mode];
    k.add([k.rect(VW,VH), k.color(12,12,22), k.pos(0,0)]);
    k.add([k.text("LEVEL CLEAR!", { size: 38 }), k.anchor("center"), k.pos(VW/2, 180), k.color(251,191,36)]);
    k.add([k.text(`${d.mode.toUpperCase()} — ${d.level} / ${cfg.levels}`, { size: 17 }), k.anchor("center"), k.pos(VW/2, 238), k.color(160,160,200)]);
    k.add([k.text(`+${d.levelScore} pts`, { size: 22 }), k.anchor("center"), k.pos(VW/2, 282), k.color(99,179,237)]);
    k.add([k.text(`Total: ${d.totalScore}`, { size: 16 }), k.anchor("center"), k.pos(VW/2, 316), k.color(180,180,200)]);

    const modeOrder: Mode[] = ["easy","hard","extreme"];
    const modeIdx = modeOrder.indexOf(d.mode);
    const isLastLevel = d.level >= cfg.levels;

    if (isLastLevel) {
      const prog = getProgress();
      if (!prog.completedModes.includes(d.mode)) prog.completedModes.push(d.mode);
      const nextMode = modeOrder[modeIdx + 1];
      if (nextMode && !prog.unlockedModes.includes(nextMode)) prog.unlockedModes.push(nextMode);
      saveProgress(prog);
      const allDone = prog.completedModes.length === 3;

      k.add([
        k.text(allDone ? "🏆 ALL MODES COMPLETE!" : `🔓 ${(nextMode ?? "").toUpperCase()} UNLOCKED!`, { size: 17 }),
        k.anchor("center"), k.pos(VW/2, 368), k.color(154,117,234),
      ]);
      const btn = k.add([k.rect(230,54,{radius:12}), k.color(allDone ? [251,191,36] : [99,179,237]), k.anchor("center"), k.pos(VW/2, 450), k.area()]);
      k.add([k.text(allDone ? "🎉 Finish!" : "Back to Menu", { size: 18 }), k.anchor("center"), k.pos(VW/2,450), k.color(255,255,255)]);
      btn.onClick(() => allDone ? k.go("allclear", d.totalScore) : k.go("menu"));
      k.onKeyPress("space", () => allDone ? k.go("allclear", d.totalScore) : k.go("menu"));
    } else {
      const btn = k.add([k.rect(230,54,{radius:12}), k.color(72,187,120), k.anchor("center"), k.pos(VW/2,430), k.area()]);
      k.add([k.text("Next Level →", { size: 18 }), k.anchor("center"), k.pos(VW/2,430), k.color(255,255,255)]);
      btn.onClick(() => k.go("play", { mode: d.mode, level: d.level + 1, totalScore: d.totalScore }));
      k.onKeyPress("space", () => k.go("play", { mode: d.mode, level: d.level + 1, totalScore: d.totalScore }));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ALL CLEAR SCENE
  // ═══════════════════════════════════════════════════════════════════════════
  k.scene("allclear", (finalScore: number) => {
    k.add([k.rect(VW,VH), k.color(10,10,20), k.pos(0,0)]);
    k.add([k.text("YOU WIN!", { size: 52 }), k.anchor("center"), k.pos(VW/2, 160), k.color(251,191,36)]);
    k.add([k.text("All 3 modes complete!", { size: 17 }), k.anchor("center"), k.pos(VW/2, 222), k.color(200,200,220)]);
    k.add([k.text(`Total Score: ${finalScore}`, { size: 22 }), k.anchor("center"), k.pos(VW/2, 268), k.color(99,179,237)]);
    k.add([k.text("🎉 You unlocked STACK PACK 2!", { size: 16 }), k.anchor("center"), k.pos(VW/2, 330), k.color(154,117,234)]);
    k.add([k.text("(Coming soon — stay tuned!)", { size: 12 }), k.anchor("center"), k.pos(VW/2, 358), k.color(80,80,120)]);

    const btn = k.add([k.rect(220,54,{radius:12}), k.color(72,187,120), k.anchor("center"), k.pos(VW/2,440), k.area()]);
    k.add([k.text("Play Again", { size: 18 }), k.anchor("center"), k.pos(VW/2,440), k.color(255,255,255)]);
    btn.onClick(() => { saveProgress({ unlockedModes:["easy"], completedModes:[] }); k.go("menu"); });
    k.onKeyPress("space", () => { saveProgress({ unlockedModes:["easy"], completedModes:[] }); k.go("menu"); });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAY SCENE
  // ═══════════════════════════════════════════════════════════════════════════
  k.scene("play", (d: { mode: Mode; level: number; totalScore: number }) => {
    const cfg = MODE_CONFIG[d.mode];
    let totalScore = d.totalScore;
    let levelScore = 0;
    let gameOver = false;
    let levelDone = false;
    onScore(totalScore);

    // ── How many wall rows this level ──
    // Ramp from 3 at level 1 to ~12 at level 64
    const wallRowCount = 3 + Math.floor((d.level - 1) * 9 / 63);
    let rowsCleared = 0; // wall rows successfully passed

    // ── Wall row queue ──
    // Each wall row: pixel Y from top of screen, filled[] array, gap info
    interface WallRow {
      y: number;       // current pixel Y (top of the row)
      filled: boolean[];
      gapStart: number;
      gapWidth: number;
    }
    const wallRows: WallRow[] = [];
    // Spacing between wall rows (pixels)
    const rowSpacingPx = Math.max(90, (VH - GRID_TOP) / (wallRowCount + 1));

    // Spawn initial wall rows below the screen, spaced out
    for (let i = 0; i < wallRowCount; i++) {
      const gapWidth = Math.round(k.rand(cfg.gapMin, cfg.gapMax));
      const gapStart = Math.round(k.rand(0, COLS - gapWidth));
      wallRows.push({
        y: VH + i * rowSpacingPx,
        filled: makeGapRow(gapStart, gapWidth),
        gapStart,
        gapWidth,
      });
    }

    // ── Piece state ──
    let pieceShape: [number,number][] = normalizeShape(k.choose(SHAPES));
    let pieceCol = 0;   // leftmost column of piece on the grid
    let pieceDir = 1;   // 1 = moving right, -1 = moving left
    let pieceColorIdx = Math.floor(k.rand(0, cfg.colors.length));
    // Piece slides at the top; pieceRow is always 0 (fixed visual row for the piece)
    // When dropped, piece "falls" as a pixel animation
    let dropping = false;
    let dropPixelY = PIECE_Y; // current pixel Y of piece top during drop
    let dropTargetY = PIECE_Y;
    let lastTapTime = -9;
    let pieceSlideAccum = 0; // fractional columns accumulated for sliding

    function pickNewPiece() {
      pieceShape = normalizeShape(k.choose(SHAPES));
      pieceColorIdx = Math.floor(k.rand(0, cfg.colors.length));
      const w = shapeWidth(pieceShape);
      pieceCol = Math.floor(k.rand(0, COLS - w + 1));
      pieceDir = k.choose([1, -1]);
      dropping = false;
      dropPixelY = PIECE_Y;
    }

    // ── Find where the dropped piece will land ──
    // Returns the pixel Y where the TOP of the piece will come to rest
    // (either on top of a wall row, or off the bottom)
    function findDropTarget(): number {
      // The piece occupies columns: pieceCol + dc for each [r,dc] in pieceShape
      const pieceCols = new Set(pieceShape.map(([,dc]) => pieceCol + dc));
      const pieceH = shapeHeight(pieceShape) * CELL;

      // Check each wall row in order from top to bottom
      // Wall rows are sorted by y (ascending = closer to top)
      const sorted = [...wallRows].sort((a,b) => a.y - b.y);

      for (const wr of sorted) {
        // Does any column of the piece hit a filled cell in this wall row?
        let blocked = false;
        for (const pc of pieceCols) {
          if (wr.filled[pc]) { blocked = true; break; }
        }
        if (blocked) {
          // Piece lands on top of this wall row
          return wr.y - pieceH;
        }
        // Piece passes through this gap — continue
      }
      // Falls off the bottom
      return VH + CELL * 2;
    }

    // ── Trigger drop ──
    function triggerDrop() {
      if (dropping || gameOver || levelDone) return;
      dropping = true;
      dropPixelY = PIECE_Y;
      dropTargetY = findDropTarget();
    }

    function triggerInstantDrop() {
      if (gameOver || levelDone) return;
      dropping = true;
      dropPixelY = findDropTarget();
      dropTargetY = dropPixelY;
      settleDrop();
    }

    // ── Settle the dropped piece ──
    function settleDrop() {
      dropping = false;

      // Which wall rows does the piece overlap (by pixel)?
      const pieceTopPx = dropPixelY;
      const pieceH = shapeHeight(pieceShape) * CELL;
      const pieceBottomPx = pieceTopPx + pieceH;

      let hitWall = false;
      let pts = 0;

      for (const wr of wallRows) {
        const wrTop = wr.y;
        const wrBot = wr.y + CELL;
        // Does the piece overlap this row?
        if (pieceBottomPx <= wrTop || pieceTopPx >= wrBot) continue;

        // Which piece rows overlap this wall row?
        for (const [pr, dc] of pieceShape) {
          const cellTop = pieceTopPx + pr * CELL;
          const cellBot = cellTop + CELL;
          if (cellBot <= wrTop || cellTop >= wrBot) continue;
          const col = pieceCol + dc;
          if (col < 0 || col >= COLS) continue;
          if (wr.filled[col]) {
            hitWall = true;
          } else {
            pts++; // landed in gap
          }
        }
      }

      if (hitWall) {
        // Game over — piece hit a wall
        gameOver = true;
        k.wait(0.6, () => k.go("over", { score: totalScore + levelScore, mode: d.mode, level: d.level }));
        return;
      }

      // Count how many wall rows the piece passed through cleanly
      // (rows whose y < dropPixelY — they scrolled past while piece was falling)
      // Actually: if piece falls off bottom, no points from wall rows
      if (dropTargetY > VH) {
        // Missed all rows — no points, no penalty, just pick new piece
        pickNewPiece();
        return;
      }

      levelScore += pts;
      totalScore += pts;
      onScore(totalScore);

      // Mark rows that were passed through as cleared
      // A row is "cleared" if piece landed BELOW it (piece top > row bottom)
      // and piece didn't hit it
      for (const wr of wallRows) {
        if (dropPixelY >= wr.y + CELL) rowsCleared++;
      }
      // Remove wall rows the piece landed on or below
      const idx = wallRows.findIndex(wr => dropPixelY < wr.y + CELL && dropPixelY + pieceH > wr.y);
      if (idx >= 0) {
        wallRows.splice(0, idx + 1);
        rowsCleared = wallRowCount - wallRows.length;
      }

      // Level done when all wall rows cleared
      if (wallRows.length === 0) {
        levelDone = true;
        gameOver = false;
        k.wait(0.5, () => k.go("levelcomplete", {
          mode: d.mode, level: d.level,
          levelScore, totalScore,
        }));
        return;
      }

      pickNewPiece();
    }

    // ── Input ──
    k.onKeyDown("left", () => {
      if (dropping || gameOver || levelDone) return;
      const minC = Math.min(...pieceShape.map(([,dc]) => pieceCol + dc));
      if (minC > 0) pieceCol--;
    });
    k.onKeyDown("right", () => {
      if (dropping || gameOver || levelDone) return;
      const maxC = Math.max(...pieceShape.map(([,dc]) => pieceCol + dc));
      if (maxC < COLS - 1) pieceCol++;
    });
    k.onKeyPress("space", () => {
      if (gameOver || levelDone) return;
      const now = k.time();
      if (now - lastTapTime < 0.35) {
        triggerInstantDrop();
      } else {
        lastTapTime = now;
        triggerDrop();
      }
    });

    // Touch: tap = drop, double-tap = instant drop, drag = move piece
    let touchX0 = -1;
    k.onTouchStart((pos) => {
      touchX0 = pos.x;
      if (gameOver || levelDone) return;
      const now = k.time();
      if (now - lastTapTime < 0.35) {
        triggerInstantDrop();
      } else {
        lastTapTime = now;
        triggerDrop();
      }
    });
    k.onTouchMove((pos) => {
      if (dropping || gameOver || levelDone) return;
      const dx = pos.x - touchX0;
      if (Math.abs(dx) > CELL * 0.55) {
        const dir = dx > 0 ? 1 : -1;
        const minC = Math.min(...pieceShape.map(([,dc]) => pieceCol + dc));
        const maxC = Math.max(...pieceShape.map(([,dc]) => pieceCol + dc));
        if (dir === -1 && minC > 0) pieceCol--;
        if (dir === 1 && maxC < COLS - 1) pieceCol++;
        touchX0 = pos.x;
      }
    });

    // ── Drawing helpers ──
    // Draw a single block cell at pixel (px, py) with given color
    function drawCell(px: number, py: number, col: [number,number,number], alpha = 1) {
      k.drawRect({
        pos: k.vec2(px + 1, py + 1),
        width: CELL - 2, height: CELL - 2,
        radius: 4,
        color: k.rgb(col[0], col[1], col[2]),
        opacity: alpha,
      });
    }

    // ── Main update + draw ──
    let pieceAutoTimer = 0;

    k.onUpdate(() => {
      if (gameOver || levelDone) return;
      const dt = k.dt();

      // Scroll wall rows upward
      for (const wr of wallRows) wr.y -= cfg.scrollPxPerSec * dt;

      // If topmost wall row scrolls above the piece zone — game over
      const topRow = wallRows[0];
      if (topRow && topRow.y < PIECE_Y + shapeHeight(pieceShape) * CELL + 8) {
        gameOver = true;
        k.wait(0.4, () => k.go("over", { score: totalScore + levelScore, mode: d.mode, level: d.level }));
        return;
      }

      // Auto-slide piece left/right
      if (!dropping) {
        pieceAutoTimer += dt;
        const secsPerCell = 1 / cfg.pieceSpeedCellsPerSec;
        while (pieceAutoTimer >= secsPerCell) {
          pieceAutoTimer -= secsPerCell;
          const minC = Math.min(...pieceShape.map(([,dc]) => pieceCol + dc));
          const maxC = Math.max(...pieceShape.map(([,dc]) => pieceCol + dc));
          if (pieceDir === 1 && maxC >= COLS - 1) pieceDir = -1;
          if (pieceDir === -1 && minC <= 0) pieceDir = 1;
          pieceCol += pieceDir;
        }
      }

      // Animate piece falling
      if (dropping) {
        const fallSpeed = Math.max(cfg.scrollPxPerSec * 8, 400);
        dropPixelY += fallSpeed * dt;
        if (dropPixelY >= dropTargetY) {
          dropPixelY = dropTargetY;
          if (dropTargetY < VH + CELL) settleDrop();
          else { dropping = false; pickNewPiece(); }
        }
      }
    });

    k.onDraw(() => {
      // ── Grid background ──
      k.drawRect({ pos: k.vec2(GRID_X, GRID_TOP), width: COLS * CELL, height: VH - GRID_TOP, color: k.rgb(18,18,32) });

      // Grid lines (vertical)
      for (let c = 0; c <= COLS; c++) {
        k.drawLine({
          p1: k.vec2(GRID_X + c * CELL, GRID_TOP),
          p2: k.vec2(GRID_X + c * CELL, VH),
          width: 1,
          color: k.rgb(28,28,48),
        });
      }

      // ── Wall rows ──
      const wallColor: [number,number,number] = [70,70,110];
      const gapColor: [number,number,number] = [25,25,45];
      for (const wr of wallRows) {
        if (wr.y > VH || wr.y + CELL < GRID_TOP) continue;
        for (let c = 0; c < COLS; c++) {
          const px = GRID_X + c * CELL;
          const py = wr.y;
          if (wr.filled[c]) {
            drawCell(px, py, wallColor, 0.92);
          } else {
            // Draw gap indicator (subtle outline)
            k.drawRect({
              pos: k.vec2(px + 1, py + 1),
              width: CELL - 2, height: CELL - 2,
              radius: 3,
              color: k.rgb(gapColor[0], gapColor[1], gapColor[2]),
              outline: { color: k.rgb(60,60,100), width: 1 },
              opacity: 0.5,
            });
          }
        }
        // Bright top edge on wall
        k.drawLine({
          p1: k.vec2(GRID_X, wr.y),
          p2: k.vec2(GRID_X + COLS * CELL, wr.y),
          width: 2,
          color: k.rgb(100,100,160),
        });
      }

      // ── Piece (at top or falling) ──
      const pieceCol_ = cfg.colors[pieceColorIdx] ?? [99,179,237];
      const py0 = dropping ? dropPixelY : PIECE_Y;
      for (const [pr, dc] of pieceShape) {
        const px = GRID_X + (pieceCol + dc) * CELL;
        const py = py0 + pr * CELL;
        if (py > VH || py + CELL < GRID_TOP) continue;
        drawCell(px, py, pieceCol_, dropping ? 0.85 : 1.0);
      }

      // ── Ghost (drop preview line) ──
      if (!dropping) {
        const ghostY = findDropTarget();
        if (ghostY < VH) {
          for (const [pr, dc] of pieceShape) {
            const px = GRID_X + (pieceCol + dc) * CELL;
            const py = ghostY + pr * CELL;
            if (py > VH || py + CELL < GRID_TOP) continue;
            k.drawRect({
              pos: k.vec2(px + 2, py + 2),
              width: CELL - 4, height: CELL - 4,
              radius: 3,
              color: k.rgb(pieceCol_[0], pieceCol_[1], pieceCol_[2]),
              outline: { color: k.rgb(pieceCol_[0], pieceCol_[1], pieceCol_[2]), width: 1 },
              opacity: 0.22,
            });
          }
        }
      }

      // ── Separator line below HUD ──
      k.drawLine({
        p1: k.vec2(0, HUD_H),
        p2: k.vec2(VW, HUD_H),
        width: 2,
        color: k.rgb(40,40,70),
      });

      // ── HUD ──
      k.drawRect({ pos: k.vec2(0,0), width: VW, height: HUD_H, color: k.rgb(10,10,20) });
      k.drawText({ text: `${d.mode.toUpperCase()} Lv.${d.level}`, pos: k.vec2(10, 10), size: 13, color: k.rgb(160,160,200) });
      k.drawText({ text: `Score: ${totalScore + levelScore}`, pos: k.vec2(VW - 10, 10), size: 13, color: k.rgb(99,179,237), align: "right" });

      // Progress bar (wall rows cleared)
      const barW = VW - 20;
      const prog = wallRowCount > 0 ? rowsCleared / wallRowCount : 0;
      k.drawRect({ pos: k.vec2(10, 36), width: barW, height: 8, radius: 4, color: k.rgb(30,30,55) });
      k.drawRect({ pos: k.vec2(10, 36), width: Math.max(4, barW * prog), height: 8, radius: 4, color: k.rgb(99,179,237) });
      k.drawText({ text: `${rowsCleared}/${wallRowCount} rows`, pos: k.vec2(VW/2, 36), size: 10, color: k.rgb(100,100,150), align: "center" });

      // ── "Piece zone" indicator ──
      k.drawLine({
        p1: k.vec2(GRID_X, PIECE_Y + shapeHeight(pieceShape) * CELL + 6),
        p2: k.vec2(GRID_X + COLS * CELL, PIECE_Y + shapeHeight(pieceShape) * CELL + 6),
        width: 1,
        color: k.rgb(40,40,70),
      });
    });

    pickNewPiece();
  });

  k.go("menu");
  return () => k.quit();
}
