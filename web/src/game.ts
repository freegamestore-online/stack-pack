import kaplay, { KAPLAYCtx, GameObj } from "kaplay";

const VW = 400;
const VH = 640;

// Grid config
const COLS = 10;
const CELL = 36; // px per cell
const GRID_X = (VW - COLS * CELL) / 2; // left edge of grid
const GRID_Y = 80; // top edge of grid (below HUD)
const VISIBLE_ROWS = Math.ceil((VH - GRID_Y) / CELL) + 2;

// Piece shapes: [row][col] offsets from anchor
const SHAPES: number[][][] = [
  // I
  [[0,0],[0,1],[0,2],[0,3]],
  // O
  [[0,0],[0,1],[1,0],[1,1]],
  // T
  [[0,0],[0,1],[0,2],[1,1]],
  // L
  [[0,0],[1,0],[2,0],[2,1]],
  // J
  [[0,1],[1,1],[2,1],[2,0]],
  // S
  [[0,1],[0,2],[1,0],[1,1]],
  // Z
  [[0,0],[0,1],[1,1],[1,2]],
];

const COLORS_EASY = [
  [99, 179, 237],
  [72, 187, 120],
  [246, 173, 85],
  [154, 117, 234],
];
const COLORS_HARD = [
  [239, 68, 68],
  [59, 130, 246],
  [251, 191, 36],
  [52, 211, 153],
  [167, 139, 250],
];
const COLORS_EXTREME = [
  [255, 100, 100],
  [100, 200, 255],
  [255, 220, 50],
  [100, 255, 180],
  [220, 100, 255],
  [255, 140, 50],
];

type Mode = "easy" | "hard" | "extreme";

// Per-mode config
const MODE_CONFIG: Record<Mode, {
  scrollSpeed: number;
  pieceSpeed: number;
  levels: number;
  gapMin: number;
  gapMax: number;
  colors: number[][];
}> = {
  easy:    { scrollSpeed: 18, pieceSpeed: 90,  levels: 64, gapMin: 4, gapMax: 6, colors: COLORS_EASY },
  hard:    { scrollSpeed: 32, pieceSpeed: 140, levels: 64, gapMin: 3, gapMax: 5, colors: COLORS_HARD },
  extreme: { scrollSpeed: 55, pieceSpeed: 200, levels: 64, gapMin: 2, gapMax: 4, colors: COLORS_EXTREME },
};

// Persistent progress stored in localStorage
function getProgress(): { unlockedModes: Mode[]; completedModes: Mode[] } {
  try {
    const raw = localStorage.getItem("stackpack_progress");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { unlockedModes: ["easy"], completedModes: [] };
}
function saveProgress(p: { unlockedModes: Mode[]; completedModes: Mode[] }) {
  localStorage.setItem("stackpack_progress", JSON.stringify(p));
}

// Build a wall row with a gap. Returns array of COLS booleans (true=filled)
function makeWallRow(gapStart: number, gapWidth: number): boolean[] {
  const row: boolean[] = [];
  for (let c = 0; c < COLS; c++) {
    row.push(c < gapStart || c >= gapStart + gapWidth);
  }
  return row;
}

// Check if a piece (cells relative to anchor col) fits in a gap
function pieceColsSet(cells: number[][]): Set<number> {
  const s = new Set<number>();
  cells.forEach(([_r, c]) => s.add(c));
  return s;
}

export function startGame(canvas: HTMLCanvasElement, onScore: (n: number) => void): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [15, 15, 25],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  });

  // ── MENU SCENE ──────────────────────────────────────────────────────────────
  k.scene("menu", () => {
    onScore(0);
    const prog = getProgress();

    // Background grid decoration
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < 3; r++) {
        k.add([
          k.rect(CELL - 2, CELL - 2, { radius: 4 }),
          k.color(30, 30, 50),
          k.pos(GRID_X + c * CELL + 1, 10 + r * CELL + 1),
          k.opacity(0.4),
        ]);
      }
    }

    k.add([
      k.text("STACK PACK", { size: 38, font: "monospace" }),
      k.anchor("center"),
      k.pos(VW / 2, 160),
      k.color(99, 179, 237),
    ]);
    k.add([
      k.text("fit the block in the gap!", { size: 14 }),
      k.anchor("center"),
      k.pos(VW / 2, 204),
      k.color(160, 160, 180),
    ]);

    const modes: Mode[] = ["easy", "hard", "extreme"];
    const modeColors: Record<Mode, [number,number,number]> = {
      easy:    [72, 187, 120],
      hard:    [246, 173, 85],
      extreme: [239, 68, 68],
    };
    const modeLabels: Record<Mode, string> = {
      easy:    "EASY  (64 levels)",
      hard:    "HARD  (64 levels)",
      extreme: "EXTREME  (64 levels)",
    };

    modes.forEach((mode, i) => {
      const unlocked = prog.unlockedModes.includes(mode);
      const completed = prog.completedModes.includes(mode);
      const y = 280 + i * 80;
      const col = unlocked ? modeColors[mode] : [60, 60, 80];

      const btn = k.add([
        k.rect(260, 52, { radius: 10 }),
        k.color(col[0]!, col[1]!, col[2]!),
        k.anchor("center"),
        k.pos(VW / 2, y),
        k.opacity(unlocked ? 1 : 0.45),
        k.area(),
      ]);

      k.add([
        k.text(completed ? "✓ " + modeLabels[mode] : (unlocked ? modeLabels[mode] : "🔒 " + modeLabels[mode]), { size: 15 }),
        k.anchor("center"),
        k.pos(VW / 2, y),
        k.color(255, 255, 255),
      ]);

      if (unlocked) {
        btn.onClick(() => k.go("play", { mode, level: 1 }));
      }
    });

    // Instructions
    k.add([
      k.text("← → move  |  SPACE drop  |  tap to drop", { size: 11 }),
      k.anchor("center"),
      k.pos(VW / 2, VH - 30),
      k.color(100, 100, 130),
    ]);
  });

  // ── WIN SCENE ───────────────────────────────────────────────────────────────
  k.scene("allclear", (finalScore: number) => {
    k.add([
      k.rect(VW, VH),
      k.color(10, 10, 20),
      k.pos(0, 0),
    ]);
    k.add([
      k.text("YOU WIN!", { size: 48, font: "monospace" }),
      k.anchor("center"),
      k.pos(VW / 2, 180),
      k.color(251, 191, 36),
    ]);
    k.add([
      k.text("All modes complete!", { size: 18 }),
      k.anchor("center"),
      k.pos(VW / 2, 240),
      k.color(200, 200, 220),
    ]);
    k.add([
      k.text(`Total Score: ${finalScore}`, { size: 22 }),
      k.anchor("center"),
      k.pos(VW / 2, 290),
      k.color(99, 179, 237),
    ]);
    k.add([
      k.text("🎉 You unlocked STACK PACK 2!", { size: 16 }),
      k.anchor("center"),
      k.pos(VW / 2, 350),
      k.color(154, 117, 234),
    ]);
    k.add([
      k.text("(Coming soon — stay tuned!)", { size: 12 }),
      k.anchor("center"),
      k.pos(VW / 2, 378),
      k.color(100, 100, 130),
    ]);

    const playAgainBtn = k.add([
      k.rect(200, 52, { radius: 10 }),
      k.color(72, 187, 120),
      k.anchor("center"),
      k.pos(VW / 2, 460),
      k.area(),
    ]);
    k.add([
      k.text("Play Again", { size: 18 }),
      k.anchor("center"),
      k.pos(VW / 2, 460),
      k.color(255, 255, 255),
    ]);
    playAgainBtn.onClick(() => {
      saveProgress({ unlockedModes: ["easy"], completedModes: [] });
      k.go("menu");
    });
    k.onKeyPress("space", () => {
      saveProgress({ unlockedModes: ["easy"], completedModes: [] });
      k.go("menu");
    });
  });

  // ── LEVEL COMPLETE SCENE ─────────────────────────────────────────────────────
  k.scene("levelcomplete", (data: { mode: Mode; level: number; score: number; totalScore: number }) => {
    const { mode, level, score, totalScore } = data;
    const cfg = MODE_CONFIG[mode];

    k.add([
      k.rect(VW, VH),
      k.color(15, 15, 25),
      k.pos(0, 0),
    ]);
    k.add([
      k.text("LEVEL CLEAR!", { size: 36, font: "monospace" }),
      k.anchor("center"),
      k.pos(VW / 2, 200),
      k.color(251, 191, 36),
    ]);
    k.add([
      k.text(`Level ${level} / ${cfg.levels}`, { size: 20 }),
      k.anchor("center"),
      k.pos(VW / 2, 258),
      k.color(160, 160, 200),
    ]);
    k.add([
      k.text(`Score: +${score}`, { size: 18 }),
      k.anchor("center"),
      k.pos(VW / 2, 300),
      k.color(99, 179, 237),
    ]);
    k.add([
      k.text(`Total: ${totalScore}`, { size: 16 }),
      k.anchor("center"),
      k.pos(VW / 2, 332),
      k.color(180, 180, 200),
    ]);

    const nextLevel = level + 1;
    const modesDone = level >= cfg.levels;

    if (modesDone) {
      // Unlock next mode
      const prog = getProgress();
      if (!prog.completedModes.includes(mode)) prog.completedModes.push(mode);
      const modeOrder: Mode[] = ["easy", "hard", "extreme"];
      const modeIdx = modeOrder.indexOf(mode);
      const nextMode = modeOrder[modeIdx + 1];
      if (nextMode && !prog.unlockedModes.includes(nextMode)) {
        prog.unlockedModes.push(nextMode);
      }
      saveProgress(prog);

      const allDone = prog.completedModes.length === 3;

      k.add([
        k.text(allDone ? "🏆 ALL MODES COMPLETE!" : `🔓 ${(nextMode ?? "").toUpperCase()} MODE UNLOCKED!`, { size: 16 }),
        k.anchor("center"),
        k.pos(VW / 2, 380),
        k.color(154, 117, 234),
      ]);

      const continueBtn = k.add([
        k.rect(220, 52, { radius: 10 }),
        k.color(allDone ? [251, 191, 36] : [99, 179, 237]),
        k.anchor("center"),
        k.pos(VW / 2, 460),
        k.area(),
      ]);
      k.add([
        k.text(allDone ? "See Results!" : "Back to Menu", { size: 18 }),
        k.anchor("center"),
        k.pos(VW / 2, 460),
        k.color(255, 255, 255),
      ]);
      continueBtn.onClick(() => {
        if (allDone) k.go("allclear", totalScore);
        else k.go("menu");
      });
      k.onKeyPress("space", () => {
        if (allDone) k.go("allclear", totalScore);
        else k.go("menu");
      });
    } else {
      const continueBtn = k.add([
        k.rect(200, 52, { radius: 10 }),
        k.color(72, 187, 120),
        k.anchor("center"),
        k.pos(VW / 2, 460),
        k.area(),
      ]);
      k.add([
        k.text("Next Level →", { size: 18 }),
        k.anchor("center"),
        k.pos(VW / 2, 460),
        k.color(255, 255, 255),
      ]);
      continueBtn.onClick(() => k.go("play", { mode, level: nextLevel, totalScore }));
      k.onKeyPress("space", () => k.go("play", { mode, level: nextLevel, totalScore }));
    }
  });

  // ── GAME OVER SCENE ──────────────────────────────────────────────────────────
  k.scene("over", (data: { score: number; mode: Mode; level: number }) => {
    const { score, mode, level } = data;
    k.add([
      k.rect(VW, VH),
      k.color(15, 15, 25),
      k.pos(0, 0),
    ]);
    k.add([
      k.text("GAME OVER", { size: 42, font: "monospace" }),
      k.anchor("center"),
      k.pos(VW / 2, 200),
      k.color(239, 68, 68),
    ]);
    k.add([
      k.text(`${mode.toUpperCase()} — Level ${level}`, { size: 18 }),
      k.anchor("center"),
      k.pos(VW / 2, 258),
      k.color(160, 160, 180),
    ]);
    k.add([
      k.text(`Score: ${score}`, { size: 22 }),
      k.anchor("center"),
      k.pos(VW / 2, 300),
      k.color(99, 179, 237),
    ]);

    const retryBtn = k.add([
      k.rect(200, 52, { radius: 10 }),
      k.color(239, 68, 68),
      k.anchor("center"),
      k.pos(VW / 2, 400),
      k.area(),
    ]);
    k.add([
      k.text("Try Again", { size: 18 }),
      k.anchor("center"),
      k.pos(VW / 2, 400),
      k.color(255, 255, 255),
    ]);
    retryBtn.onClick(() => k.go("play", { mode, level, totalScore: 0 }));

    const menuBtn = k.add([
      k.rect(200, 52, { radius: 10 }),
      k.color(60, 60, 90),
      k.anchor("center"),
      k.pos(VW / 2, 470),
      k.area(),
    ]);
    k.add([
      k.text("Menu", { size: 18 }),
      k.anchor("center"),
      k.pos(VW / 2, 470),
      k.color(200, 200, 220),
    ]);
    menuBtn.onClick(() => k.go("menu"));
    k.onKeyPress("space", () => k.go("play", { mode, level, totalScore: 0 }));
  });

  // ── PLAY SCENE ───────────────────────────────────────────────────────────────
  k.scene("play", (data: { mode: Mode; level: number; totalScore?: number }) => {
    const { mode, level } = data;
    const totalScore = data.totalScore ?? 0;
    const cfg = MODE_CONFIG[mode];
    let score = 0;
    let levelScore = 0;
    onScore(totalScore + score);

    // How many wall rows to place per level (scales with level)
    const wallRowsTarget = 3 + Math.floor(level / 8);

    // ── State ──
    let wallRows: { filled: boolean[]; gapStart: number; gapWidth: number; y: number; obj: GameObj }[] = [];
    let scrollY = 0; // how many pixels we've scrolled up total
    let scrollOffset = 0; // fractional scroll within current frame
    let gameActive = true;
    let dropping = false; // piece is in drop animation
    let lastSpaceTime = -999;
    let wallRowsPlaced = 0;
    let levelDone = false;

    // Piece state
    let pieceShape = SHAPES[0]!.map(c => [...c]) as number[][];
    let pieceCol = 0; // leftmost col of piece bounding box
    let pieceRow = -2; // row at which piece enters from top (off-screen)
    let pieceDir = 1; // 1=right, -1=left
    let pieceColorIdx = 0;
    let pieceDropping = false;
    let pieceDropRow = 0;

    // ── Helpers ──
    function randInt(min: number, max: number) {
      return Math.floor(k.rand(min, max + 1));
    }

    function cellX(col: number) { return GRID_X + col * CELL; }
    function cellY(row: number) { return GRID_Y + row * CELL - scrollOffset; }

    function pieceCols(): number[] {
      const cols = new Set<number>();
      pieceShape.forEach(([, c]) => cols.add(c));
      return Array.from(cols);
    }
    function pieceMinCol(): number { return Math.min(...pieceCols()); }
    function pieceMaxCol(): number { return Math.max(...pieceCols()); }
    function pieceMinRow(): number { return Math.min(...pieceShape.map(([r]) => r)); }
    function pieceMaxRow(): number { return Math.max(...pieceShape.map(([r]) => r)); }

    function normalizeShape(shape: number[][]): number[][] {
      const minR = Math.min(...shape.map(([r]) => r));
      const minC = Math.min(...shape.map(([, c]) => c));
      return shape.map(([r, c]) => [r - minR, c - minC]);
    }

    function pickPiece() {
      const shapeIdx = randInt(0, SHAPES.length - 1);
      pieceShape = normalizeShape(SHAPES[shapeIdx]!.map(c => [...c]));
      pieceColorIdx = randInt(0, cfg.colors.length - 1);
      // Start off screen, centered
      const w = pieceMaxCol() - pieceMinCol() + 1;
      pieceCol = randInt(0, COLS - w);
      pieceRow = -pieceMaxRow() - 2;
      pieceDir = k.choose([1, -1]);
      pieceDropping = false;
    }

    // Place a wall row at the given grid row
    function spawnWallRow(gridRow: number) {
      const gapWidth = randInt(cfg.gapMin, cfg.gapMax);
      // Make sure gap is wide enough for at least a 1-wide piece
      const gapStart = randInt(0, COLS - gapWidth);
      const filled = makeWallRow(gapStart, gapWidth);

      const rowObj = k.add([k.pos(0, 0)]);
      filled.forEach((isFilled, c) => {
        if (isFilled) {
          k.add([
            k.rect(CELL - 2, CELL - 2, { radius: 3 }),
            k.color(80, 80, 120),
            k.pos(cellX(c) + 1, cellY(gridRow) + 1),
            k.opacity(0.9),
            "wallcell",
            { wallIdx: wallRows.length, col: c },
          ]);
        }
      });

      wallRows.push({ filled, gapStart, gapWidth, y: gridRow, obj: rowObj });
      wallRowsPlaced++;
    }

    // ── Initial wall rows ──
    // Spread wall rows across visible area
    const rowSpacing = Math.floor(VISIBLE_ROWS / (wallRowsTarget + 1));
    for (let i = 0; i < wallRowsTarget; i++) {
      spawnWallRow(4 + i * rowSpacing);
    }

    pickPiece();

    // ── Visual objects ──
    // Grid lines
    for (let c = 0; c <= COLS; c++) {
      k.add([
        k.rect(1, VH - GRID_Y),
        k.color(30, 30, 50),
        k.pos(GRID_X + c * CELL, GRID_Y),
      ]);
    }

    // HUD background
    k.add([
      k.rect(VW, GRID_Y),
      k.color(10, 10, 20),
      k.pos(0, 0),
    ]);

    // Mode / level label
    k.add([
      k.text(`${mode.toUpperCase()} — Level ${level}`, { size: 13 }),
      k.pos(10, 8),
      k.color(160, 160, 200),
    ]);

    // Score label (updated each frame)
    const scoreLbl = k.add([
      k.text(`Score: ${score}`, { size: 13 }),
      k.anchor("topright"),
      k.pos(VW - 10, 8),
      k.color(99, 179, 237),
    ]);

    // Progress bar
    const progressBg = k.add([
      k.rect(VW - 20, 8, { radius: 4 }),
      k.color(30, 30, 60),
      k.pos(10, 28),
    ]);
    progressBg; // suppress unused
    const progressFill = k.add([
      k.rect(1, 8, { radius: 4 }),
      k.color(99, 179, 237),
      k.pos(10, 28),
    ]);

    // Instruction hint
    const hintLbl = k.add([
      k.text("← → move | SPACE drop | double-SPACE instant drop", { size: 10 }),
      k.pos(10, 42),
      k.color(80, 80, 110),
    ]);
    k.wait(3, () => { if (hintLbl.exists()) k.destroy(hintLbl); });

    // Piece visual cells (rebuilt each frame)
    let pieceCellObjs: GameObj[] = [];

    function rebuildPieceCells() {
      pieceCellObjs.forEach(o => { if (o.exists()) k.destroy(o); });
      pieceCellObjs = [];
      if (!gameActive) return;
      const col = cfg.colors[pieceColorIdx] ?? [99, 179, 237];
      pieceShape.forEach(([dr, dc]) => {
        const r = pieceRow + dr;
        const c = pieceCol + dc;
        const y = cellY(r);
        if (y < GRID_Y - CELL || y > VH) return;
        const obj = k.add([
          k.rect(CELL - 2, CELL - 2, { radius: 4 }),
          k.color(col[0]!, col[1]!, col[2]!),
          k.pos(cellX(c) + 1, y + 1),
          k.opacity(0.95),
        ]);
        pieceCellObjs.push(obj);
      });
    }

    // ── Drop logic ──
    function doDropPiece() {
      if (!gameActive || pieceDropping) return;

      // Find the first wall row the piece hits
      // Piece occupies rows pieceRow..pieceRow+pieceMaxRow, cols pieceCols
      const pCols = new Set(pieceCols().map(c => c + pieceCol));

      // Find the next wall row below the piece's bottom
      const pieceBottom = pieceRow + pieceMaxRow();

      // Sort wall rows by y ascending
      const sorted = [...wallRows].sort((a, b) => a.y - b.y);
      let hitRow: typeof wallRows[0] | null = null;

      for (const wr of sorted) {
        if (wr.y <= pieceBottom) continue;
        // Does piece overlap this wall row's filled cells?
        // Check each col the piece occupies
        let blocked = false;
        let allGap = true;
        for (let c = 0; c < COLS; c++) {
          if (pCols.has(c)) {
            if (wr.filled[c]) { blocked = true; allGap = false; break; }
            else allGap = allGap && !wr.filled[c];
          }
        }
        if (blocked) {
          // Piece lands ON TOP of this wall row
          hitRow = wr;
          pieceDropRow = wr.y - pieceMaxRow() - 1;
          break;
        }
        // If piece fits through gap entirely — it passes through
        // Check: all piece cols are in the gap
        let fitsThrough = true;
        for (const pc of pCols) {
          if (wr.filled[pc]) { fitsThrough = false; break; }
        }
        if (!fitsThrough) {
          hitRow = wr;
          pieceDropRow = wr.y - pieceMaxRow() - 1;
          break;
        }
        // Piece passes through this row — check next
      }

      if (!hitRow) {
        // Falls off bottom
        pieceDropRow = VISIBLE_ROWS + 2;
      }

      pieceDropping = true;
    }

    function instantDrop() {
      if (!gameActive) return;
      doDropPiece();
      if (pieceDropping) {
        pieceRow = pieceDropRow;
        // Force settle immediately
        settlePiece();
      }
    }

    function settlePiece() {
      if (!gameActive) return;
      pieceDropping = false;

      const pCols = new Set(pieceCols().map(c => c + pieceCol));
      const pieceBottom = pieceRow + pieceMaxRow();

      // Find wall rows the piece is sitting on or passing through
      let pointsEarned = 0;
      let missedRow = false;

      for (const wr of wallRows) {
        // Piece row range: pieceRow..pieceBottom
        // Wall row at wr.y
        if (wr.y < pieceRow || wr.y > pieceBottom) continue;

        // For each col the piece occupies at this row
        // Check which cells of the piece are at this wall row
        const pieceCellsAtRow = pieceShape
          .filter(([dr]) => pieceRow + dr === wr.y)
          .map(([, dc]) => pieceCol + dc);

        for (const pc of pieceCellsAtRow) {
          if (!wr.filled[pc]) {
            // Piece cell is in the gap — score!
            pointsEarned++;
          } else {
            // Piece cell hits a wall — miss
            missedRow = true;
          }
        }
      }

      // If piece lands on a wall row and fits perfectly in gap — bonus
      // Check if piece passes through ALL wall rows cleanly
      const wallRowsInPath = wallRows.filter(wr => wr.y >= pieceRow && wr.y <= pieceBottom);
      const allClean = wallRowsInPath.every(wr => {
        const pieceCellsAtRow = pieceShape
          .filter(([dr]) => pieceRow + dr === wr.y)
          .map(([, dc]) => pieceCol + dc);
        return pieceCellsAtRow.every(pc => !wr.filled[pc]);
      });

      if (allClean && wallRowsInPath.length > 0) pointsEarned += 2; // bonus

      if (missedRow) {
        // Game over
        gameActive = false;
        k.wait(0.5, () => k.go("over", { score: totalScore + score, mode, level }));
        return;
      }

      score += pointsEarned;
      levelScore += pointsEarned;
      onScore(totalScore + score);

      // Check level completion
      if (!levelDone && levelScore >= wallRowsTarget * cfg.gapMin) {
        levelDone = true;
        gameActive = false;
        k.wait(0.6, () => {
          k.go("levelcomplete", { mode, level, score, totalScore: totalScore + score });
        });
        return;
      }

      // Next piece
      pickPiece();
    }

    // ── Input ──
    k.onKeyDown("left", () => {
      if (!gameActive || pieceDropping) return;
      const minC = pieceMinCol() + pieceCol;
      if (minC > 0) pieceCol--;
    });
    k.onKeyDown("right", () => {
      if (!gameActive || pieceDropping) return;
      const maxC = pieceMaxCol() + pieceCol;
      if (maxC < COLS - 1) pieceCol++;
    });
    k.onKeyPress("space", () => {
      if (!gameActive) return;
      const now = k.time();
      if (now - lastSpaceTime < 0.35) {
        // Double tap — instant drop
        instantDrop();
      } else {
        lastSpaceTime = now;
        doDropPiece();
      }
    });

    // Touch / click to drop
    k.onMousePress(() => {
      if (!gameActive) return;
      const now = k.time();
      if (now - lastSpaceTime < 0.35) {
        instantDrop();
      } else {
        lastSpaceTime = now;
        doDropPiece();
      }
    });

    // Touch drag to move piece
    let touchStartX = 0;
    k.onTouchStart((pos) => { touchStartX = pos.x; });
    k.onTouchMove((pos) => {
      if (!gameActive || pieceDropping) return;
      const dx = pos.x - touchStartX;
      if (Math.abs(dx) > CELL * 0.6) {
        const dir = dx > 0 ? 1 : -1;
        const minC = pieceMinCol() + pieceCol;
        const maxC = pieceMaxCol() + pieceCol;
        if (dir === -1 && minC > 0) pieceCol--;
        if (dir === 1 && maxC < COLS - 1) pieceCol++;
        touchStartX = pos.x;
      }
    });

    // ── Main update loop ──
    let pieceAutoMoveTimer = 0;
    const pieceAutoMoveInterval = 1 / (cfg.pieceSpeed / CELL); // seconds per cell

    k.onUpdate(() => {
      if (!gameActive) return;

      const dt = k.dt();

      // Scroll up
      scrollOffset += cfg.scrollSpeed * dt;
      while (scrollOffset >= CELL) {
        scrollOffset -= CELL;
        // All wall rows move up by 1 grid row
        wallRows.forEach(wr => { wr.y -= 1; });
        // Piece also moves up by 1 row (stays relative to grid)
        pieceRow -= 1;
        if (pieceDropping) pieceDropRow -= 1;

        // Remove wall rows that scrolled off top
        wallRows = wallRows.filter(wr => wr.y > -2);

        // If piece scrolls off top — game over
        if (pieceRow + pieceMaxRow() < -3) {
          gameActive = false;
          k.go("over", { score: totalScore + score, mode, level });
          return;
        }
      }

      // Auto-move piece side to side
      if (!pieceDropping) {
        pieceAutoMoveTimer += dt;
        if (pieceAutoMoveTimer >= pieceAutoMoveInterval) {
          pieceAutoMoveTimer = 0;
          const minC = pieceMinCol() + pieceCol;
          const maxC = pieceMaxCol() + pieceCol;
          if (pieceDir === 1 && maxC >= COLS - 1) pieceDir = -1;
          if (pieceDir === -1 && minC <= 0) pieceDir = 1;
          pieceCol += pieceDir;
        }
      }

      // Drop animation
      if (pieceDropping) {
        const dropSpeed = 300; // px/s
        const targetY = cellY(pieceDropRow);
        const currentY = cellY(pieceRow);
        if (currentY < targetY - 2) {
          const dy = dropSpeed * dt / CELL;
          pieceRow += dy;
        } else {
          pieceRow = pieceDropRow;
          settlePiece();
        }
      }

      // Update wall cell visuals
      k.get("wallcell").forEach(obj => {
        const wallIdx = (obj as GameObj & { wallIdx: number }).wallIdx;
        const col = (obj as GameObj & { col: number }).col;
        const wr = wallRows[wallIdx];
        if (!wr) {
          k.destroy(obj);
          return;
        }
        obj.pos.y = cellY(wr.y) + 1;
        obj.pos.x = cellX(col) + 1;
        if (wr.y < 0) k.destroy(obj);
      });

      // Rebuild piece cells
      rebuildPieceCells();

      // Update score display
      scoreLbl.text = `Score: ${totalScore + score}`;

      // Progress bar
      const progress = Math.min(levelScore / (wallRowsTarget * cfg.gapMin), 1);
      progressFill.width = Math.max(1, (VW - 20) * progress);

      // Spawn more wall rows if needed
      if (wallRowsPlaced < wallRowsTarget * 3 && wallRows.length < wallRowsTarget + 2) {
        // Find the lowest wall row y
        const maxY = wallRows.length > 0 ? Math.max(...wallRows.map(w => w.y)) : 4;
        spawnWallRow(maxY + rowSpacing);
      }
    });

    // Draw gap indicator on wall rows
    k.onDraw(() => {
      wallRows.forEach(wr => {
        const y = cellY(wr.y);
        if (y < GRID_Y - CELL || y > VH) return;
        // Draw gap highlight
        for (let c = wr.gapStart; c < wr.gapStart + wr.gapWidth; c++) {
          k.drawRect({
            pos: k.vec2(cellX(c) + 1, y + 1),
            width: CELL - 2,
            height: CELL - 2,
            radius: 3,
            color: k.rgb(40, 60, 100),
            opacity: 0.5,
          });
        }
      });
    });
  });

  k.go("menu");
  return () => k.quit();
}
