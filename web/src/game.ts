import kaplay from "kaplay";

const VW = 400;
const VH = 680;
const CELL = 38;
const COLS = 8;
const GRID_X = (VW - COLS * CELL) / 2;
const PLAY_TOP = 60;   // below HUD
const PLAY_H = VH - PLAY_TOP;

// ── Piece shapes: [row, col] offsets, normalised to top-left = 0,0 ──
// Each shape is designed so the gap in the wall exactly matches it.
const SHAPES: number[][][] = [
  // I-2 (2 wide)
  [[0,0],[0,1]],
  // I-3
  [[0,0],[0,1],[0,2]],
  // I-4
  [[0,0],[0,1],[0,2],[0,3]],
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
  // Corner
  [[0,0],[1,0],[1,1]],
  // S-tall
  [[0,0],[1,0],[1,1],[2,1]],
  // Z-tall
  [[0,1],[1,1],[1,0],[2,0]],
];

type Mode = "easy" | "hard" | "extreme";

const LEVELS_PER_MODE = 64;

const MODE_CFG: Record<Mode, { wallSpeed: number; pieceSpeed: number; label: string; color: [number,number,number] }> = {
  easy:    { wallSpeed: 28,  pieceSpeed: 80,  label: "EASY",    color: [72, 187, 120] },
  hard:    { wallSpeed: 55,  pieceSpeed: 130, label: "HARD",    color: [246, 173, 85] },
  extreme: { wallSpeed: 95,  pieceSpeed: 190, label: "EXTREME", color: [239, 68, 68]  },
};

// Shape colours per mode
const PALETTE: Record<Mode, [number,number,number][]> = {
  easy:    [[99,179,237],[72,187,120],[246,173,85],[154,117,234],[244,114,182]],
  hard:    [[239,68,68],[59,130,246],[251,191,36],[52,211,153],[167,139,250]],
  extreme: [[255,80,80],[80,200,255],[255,220,50],[100,255,180],[220,100,255],[255,140,50]],
};

// ── Persistence ──
interface Progress { unlockedModes: Mode[]; completedModes: Mode[] }
function loadProgress(): Progress {
  try { const r = localStorage.getItem("sp2_progress"); if (r) return JSON.parse(r); } catch {}
  return { unlockedModes: ["easy"], completedModes: [] };
}
function saveProgress(p: Progress) {
  localStorage.setItem("sp2_progress", JSON.stringify(p));
}

// ── Helpers ──
function normalize(shape: number[][]): number[][] {
  const minR = Math.min(...shape.map(([r]) => r));
  const minC = Math.min(...shape.map(([,c]) => c));
  return shape.map(([r,c]) => [r - minR, c - minC]);
}
function shapeWidth(shape: number[][]): number {
  return Math.max(...shape.map(([,c]) => c)) + 1;
}
function shapeHeight(shape: number[][]): number {
  return Math.max(...shape.map(([r]) => r)) + 1;
}
// Build wall: a grid of COLS columns, shapeH rows tall.
// The gap is cut exactly to the shape at gapCol offset.
// Returns filled[row][col] = true means WALL (not gap)
function buildWall(shape: number[][], gapCol: number): boolean[][] {
  const h = shapeHeight(shape);
  const filled: boolean[][] = [];
  for (let r = 0; r < h; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < COLS; c++) {
      // Is this cell part of the shape (at gapCol offset)?
      const isGap = shape.some(([sr, sc]) => sr === r && sc + gapCol === c);
      row.push(!isGap);
    }
    filled.push(row);
  }
  return filled;
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

  // ═══════════════════════════════════════════════════════════════════════
  // MENU
  // ═══════════════════════════════════════════════════════════════════════
  k.scene("menu", () => {
    onScore(0);
    const prog = loadProgress();

    // Animated decorative blocks
    const deco: { x: number; y: number; vy: number; col: [number,number,number] }[] = [];
    for (let i = 0; i < 12; i++) {
      deco.push({
        x: k.rand(0, VW),
        y: k.rand(0, VH),
        vy: k.rand(8, 22),
        col: k.choose([[99,179,237],[72,187,120],[246,173,85],[154,117,234]] as [number,number,number][]),
      });
    }
    const decoObjs = deco.map(d =>
      k.add([k.rect(CELL-4, CELL-4, { radius: 4 }), k.color(d.col[0], d.col[1], d.col[2]),
             k.pos(d.x, d.y), k.opacity(0.18)])
    );
    k.onUpdate(() => {
      deco.forEach((d, i) => {
        d.y += d.vy * k.dt();
        if (d.y > VH + CELL) d.y = -CELL;
        const obj = decoObjs[i];
        if (obj) obj.pos.y = d.y;
      });
    });

    k.add([k.text("STACK PACK", { size: 42, font: "monospace" }),
           k.anchor("center"), k.pos(VW/2, 130), k.color(99,179,237)]);
    k.add([k.text("Drop the shape into the gap!", { size: 13 }),
           k.anchor("center"), k.pos(VW/2, 176), k.color(160,160,190)]);

    const modes: Mode[] = ["easy","hard","extreme"];
    modes.forEach((mode, i) => {
      const cfg = MODE_CFG[mode];
      const unlocked = prog.unlockedModes.includes(mode);
      const completed = prog.completedModes.includes(mode);
      const y = 270 + i * 90;
      const [r,g,b] = unlocked ? cfg.color : [50,50,70] as [number,number,number];

      const btn = k.add([
        k.rect(270, 58, { radius: 12 }), k.color(r,g,b),
        k.anchor("center"), k.pos(VW/2, y),
        k.opacity(unlocked ? 1 : 0.4), k.area(),
      ]);
      k.add([
        k.text(
          completed ? `✓ ${cfg.label}  (${LEVELS_PER_MODE} levels)` :
          unlocked  ? `${cfg.label}  (${LEVELS_PER_MODE} levels)` :
                      `🔒 ${cfg.label}`,
          { size: 16 }
        ),
        k.anchor("center"), k.pos(VW/2, y), k.color(255,255,255),
      ]);

      if (unlocked) btn.onClick(() => k.go("play", { mode, level: 1, totalScore: 0 }));
    });

    k.add([k.text("← → or drag  |  SPACE / tap = drop  |  double = instant", { size: 10 }),
           k.anchor("center"), k.pos(VW/2, VH - 24), k.color(80,80,110)]);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GAME OVER
  // ═══════════════════════════════════════════════════════════════════════
  k.scene("over", (d: { mode: Mode; level: number; totalScore: number }) => {
    k.add([k.rect(VW,VH), k.color(12,12,22), k.pos(0,0)]);
    k.add([k.text("GAME OVER", { size: 44, font: "monospace" }),
           k.anchor("center"), k.pos(VW/2, 190), k.color(239,68,68)]);
    k.add([k.text(`${MODE_CFG[d.mode].label}  —  Level ${d.level}`, { size: 18 }),
           k.anchor("center"), k.pos(VW/2, 252), k.color(160,160,190)]);
    k.add([k.text(`Score: ${d.totalScore}`, { size: 22 }),
           k.anchor("center"), k.pos(VW/2, 296), k.color(99,179,237)]);

    const retry = k.add([k.rect(210,56,{radius:12}), k.color(239,68,68),
                          k.anchor("center"), k.pos(VW/2, 390), k.area()]);
    k.add([k.text("Try Again", { size: 19 }), k.anchor("center"), k.pos(VW/2, 390), k.color(255,255,255)]);
    retry.onClick(() => k.go("play", { mode: d.mode, level: d.level, totalScore: 0 }));

    const menu = k.add([k.rect(210,56,{radius:12}), k.color(50,50,80),
                          k.anchor("center"), k.pos(VW/2, 462), k.area()]);
    k.add([k.text("Menu", { size: 19 }), k.anchor("center"), k.pos(VW/2, 462), k.color(200,200,220)]);
    menu.onClick(() => k.go("menu"));
    k.onKeyPress("space", () => k.go("play", { mode: d.mode, level: d.level, totalScore: 0 }));
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LEVEL COMPLETE
  // ═══════════════════════════════════════════════════════════════════════
  k.scene("levelcomplete", (d: { mode: Mode; level: number; totalScore: number }) => {
    k.add([k.rect(VW,VH), k.color(12,12,22), k.pos(0,0)]);

    const isLastLevel = d.level >= LEVELS_PER_MODE;
    const modeOrder: Mode[] = ["easy","hard","extreme"];
    const modeIdx = modeOrder.indexOf(d.mode);

    if (isLastLevel) {
      const prog = loadProgress();
      if (!prog.completedModes.includes(d.mode)) prog.completedModes.push(d.mode);
      const nextMode = modeOrder[modeIdx + 1];
      if (nextMode && !prog.unlockedModes.includes(nextMode)) prog.unlockedModes.push(nextMode);
      saveProgress(prog);
      const allDone = prog.completedModes.length === 3;

      if (allDone) {
        k.go("allclear", d.totalScore);
        return;
      }

      k.add([k.text("MODE COMPLETE!", { size: 36, font: "monospace" }),
             k.anchor("center"), k.pos(VW/2, 180), k.color(251,191,36)]);
      k.add([k.text(`🔓 ${MODE_CFG[nextMode!].label} UNLOCKED!`, { size: 20 }),
             k.anchor("center"), k.pos(VW/2, 240), k.color(154,117,234)]);
      k.add([k.text(`Score: ${d.totalScore}`, { size: 18 }),
             k.anchor("center"), k.pos(VW/2, 288), k.color(99,179,237)]);

      const btn = k.add([k.rect(230,58,{radius:12}), k.color(72,187,120),
                          k.anchor("center"), k.pos(VW/2, 400), k.area()]);
      k.add([k.text("Back to Menu", { size: 18 }), k.anchor("center"), k.pos(VW/2, 400), k.color(255,255,255)]);
      btn.onClick(() => k.go("menu"));
      k.onKeyPress("space", () => k.go("menu"));
    } else {
      k.add([k.text("LEVEL CLEAR!", { size: 40, font: "monospace" }),
             k.anchor("center"), k.pos(VW/2, 190), k.color(251,191,36)]);
      k.add([k.text(`${MODE_CFG[d.mode].label}  —  Level ${d.level} / ${LEVELS_PER_MODE}`, { size: 16 }),
             k.anchor("center"), k.pos(VW/2, 250), k.color(160,160,200)]);
      k.add([k.text(`Score: ${d.totalScore}`, { size: 18 }),
             k.anchor("center"), k.pos(VW/2, 292), k.color(99,179,237)]);

      // Trophy preview
      k.add([k.text("🏆", { size: 52 }), k.anchor("center"), k.pos(VW/2, 370)]);

      const btn = k.add([k.rect(230,58,{radius:12}), k.color(72,187,120),
                          k.anchor("center"), k.pos(VW/2, 460), k.area()]);
      k.add([k.text("Next Level →", { size: 19 }), k.anchor("center"), k.pos(VW/2, 460), k.color(255,255,255)]);
      btn.onClick(() => k.go("play", { mode: d.mode, level: d.level + 1, totalScore: d.totalScore }));
      k.onKeyPress("space", () => k.go("play", { mode: d.mode, level: d.level + 1, totalScore: d.totalScore }));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ALL CLEAR
  // ═══════════════════════════════════════════════════════════════════════
  k.scene("allclear", (finalScore: number) => {
    k.add([k.rect(VW,VH), k.color(10,10,20), k.pos(0,0)]);
    k.add([k.text("🏆 YOU WIN! 🏆", { size: 34, font: "monospace" }),
           k.anchor("center"), k.pos(VW/2, 160), k.color(251,191,36)]);
    k.add([k.text("All 3 modes complete!", { size: 18 }),
           k.anchor("center"), k.pos(VW/2, 216), k.color(200,200,220)]);
    k.add([k.text(`Total Score: ${finalScore}`, { size: 22 }),
           k.anchor("center"), k.pos(VW/2, 262), k.color(99,179,237)]);
    k.add([k.text("🎉 STACK PACK 2 unlocked!", { size: 17 }),
           k.anchor("center"), k.pos(VW/2, 320), k.color(154,117,234)]);
    k.add([k.text("(Coming soon — stay tuned!)", { size: 12 }),
           k.anchor("center"), k.pos(VW/2, 350), k.color(90,90,120)]);

    const btn = k.add([k.rect(220,58,{radius:12}), k.color(72,187,120),
                        k.anchor("center"), k.pos(VW/2, 450), k.area()]);
    k.add([k.text("Play Again", { size: 19 }), k.anchor("center"), k.pos(VW/2, 450), k.color(255,255,255)]);
    btn.onClick(() => { saveProgress({ unlockedModes:["easy"], completedModes:[] }); k.go("menu"); });
    k.onKeyPress("space", () => { saveProgress({ unlockedModes:["easy"], completedModes:[] }); k.go("menu"); });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PLAY SCENE — the real game
  // ═══════════════════════════════════════════════════════════════════════
  k.scene("play", (data: { mode: Mode; level: number; totalScore: number }) => {
    const { mode, level } = data;
    let totalScore = data.totalScore;
    const cfg = MODE_CFG[mode];
    const palette = PALETTE[mode];

    // ── Pick a shape for this round ──
    // Level seeds the shape so it changes each level but is consistent
    const shapeIdx = (level - 1) % SHAPES.length;
    const shape = normalize(SHAPES[shapeIdx]!);
    const sW = shapeWidth(shape);
    const sH = shapeHeight(shape);

    // ── Progress: how many successful fits to reach trophy ──
    // Easy: 5 fits, Hard: 7, Extreme: 10. Scales with level.
    const fitsNeeded = Math.min(5 + Math.floor((level - 1) / 8), 12) +
      (mode === "hard" ? 2 : mode === "extreme" ? 5 : 0);
    let fitsCount = 0;

    // ── Wall speed increases slightly each level ──
    const wallSpeed = cfg.wallSpeed * (1 + (level - 1) * 0.04);
    const pieceSpeed = cfg.pieceSpeed; // cells per second (left-right)

    // ── Colour ──
    const colIdx = (level - 1) % palette.length;
    const [pr, pg, pb] = palette[colIdx]!;

    // ── State ──
    let gameActive = true;
    let pieceCol = Math.floor((COLS - sW) / 2); // left column of piece
    let pieceDir = 1;  // 1=right, -1=left
    let pieceMoveAcc = 0; // accumulator for smooth side movement

    // Wall state: the wall slides up from the bottom
    // wallY = pixel Y of the TOP of the wall block (starts at VH, moves to PLAY_TOP)
    let wallY = VH + 10;
    let gapCol = Math.floor(k.rand(0, COLS - sW + 1)); // where the gap is
    let wallFilled = buildWall(shape, gapCol);

    let lastSpaceTime = -999;
    let dropping = false;   // piece is animating downward
    let dropY = 0;          // current pixel Y of dropping piece
    const DROP_SPEED = 700; // px/sec for drop animation

    onScore(totalScore);

    // ── Trophy position (pixel Y inside play area) ──
    // Trophy sits near the top; progress bar fills as fits increase
    const TROPHY_Y = PLAY_TOP + 48;
    const PIECE_START_Y = PLAY_TOP + 8; // where piece sits at top

    // ── HUD ──
    // Background bar
    k.add([k.rect(VW, PLAY_TOP), k.color(10,10,20), k.pos(0,0)]);

    // Mode + level
    k.add([k.text(`${cfg.label}  Lv.${level}`, { size: 13 }),
           k.pos(8, 8), k.color(160,160,200)]);

    // Score
    const scoreLbl = k.add([k.text(`${totalScore}`, { size: 16 }),
                             k.anchor("top"), k.pos(VW/2, 6), k.color(99,179,237)]);

    // Progress: "fits X / Y"
    const progressLbl = k.add([k.text(`${fitsCount}/${fitsNeeded}`, { size: 13 }),
                                k.anchor("topright"), k.pos(VW - 8, 8), k.color(251,191,36)]);

    // Trophy emoji at the top of play area
    k.add([k.text("🏆", { size: 28 }), k.anchor("center"), k.pos(VW/2, TROPHY_Y)]);

    // Progress bar (horizontal, below HUD)
    const PBAR_X = GRID_X;
    const PBAR_W = COLS * CELL;
    const PBAR_Y = PLAY_TOP + 2;
    k.add([k.rect(PBAR_W, 6, { radius: 3 }), k.color(30,30,60), k.pos(PBAR_X, PBAR_Y)]);
    const pbarFill = k.add([k.rect(1, 6, { radius: 3 }), k.color(251,191,36), k.pos(PBAR_X, PBAR_Y)]);

    // Grid lines (faint)
    for (let c = 0; c <= COLS; c++) {
      k.add([k.rect(1, PLAY_H), k.color(25,25,45), k.pos(GRID_X + c*CELL, PLAY_TOP)]);
    }

    // Separator line under HUD
    k.add([k.rect(VW, 2), k.color(40,40,70), k.pos(0, PLAY_TOP)]);

    // ── Draw piece at top (slides left/right) ──
    // We'll recreate piece cells every frame
    type GO = ReturnType<typeof k.add>;
    let pieceObjs: GO[] = [];

    function drawPiece() {
      pieceObjs.forEach(o => { if (o.exists()) k.destroy(o); });
      pieceObjs = [];
      if (!gameActive) return;

      const baseY = dropping ? dropY : PIECE_START_Y;

      shape.forEach(([sr, sc]) => {
        const px = GRID_X + (pieceCol + sc) * CELL + 2;
        const py = baseY + sr * CELL + 2;
        if (py > VH) return;
        const obj = k.add([
          k.rect(CELL - 4, CELL - 4, { radius: 5 }),
          k.color(pr, pg, pb),
          k.pos(px, py),
          k.opacity(dropping ? 0.85 : 1),
        ]);
        // Bright border highlight
        k.add([
          k.rect(CELL - 4, CELL - 4, { radius: 5 }),
          k.color(Math.min(pr+60,255), Math.min(pg+60,255), Math.min(pb+60,255)),
          k.pos(px, py),
          k.opacity(0.25),
        ]);
        pieceObjs.push(obj);
      });
    }

    // ── Draw wall ──
    let wallObjs: GO[] = [];

    function drawWall() {
      wallObjs.forEach(o => { if (o.exists()) k.destroy(o); });
      wallObjs = [];

      wallFilled.forEach((row, r) => {
        row.forEach((filled, c) => {
          if (!filled) return; // gap — don't draw
          const px = GRID_X + c * CELL + 2;
          const py = wallY + r * CELL + 2;
          if (py > VH + CELL || py < PLAY_TOP - CELL) return;
          wallObjs.push(k.add([
            k.rect(CELL - 4, CELL - 4, { radius: 4 }),
            k.color(70, 75, 115),
            k.pos(px, py),
            k.opacity(0.92),
          ]));
          // Subtle highlight on top edge
          wallObjs.push(k.add([
            k.rect(CELL - 4, 3),
            k.color(110, 115, 160),
            k.pos(px, py),
            k.opacity(0.5),
          ]));
        });
      });
    }

    // Ghost: show where piece would land in the gap
    let ghostObjs: GO[] = [];
    function drawGhost() {
      ghostObjs.forEach(o => { if (o.exists()) k.destroy(o); });
      ghostObjs = [];
      if (!gameActive || dropping) return;

      // Ghost shows piece aligned to gap
      const ghostCol = gapCol;
      const ghostY = wallY - 4;

      shape.forEach(([sr, sc]) => {
        const px = GRID_X + (ghostCol + sc) * CELL + 2;
        const py = ghostY + sr * CELL + 2;
        if (py > VH || py < PLAY_TOP) return;
        ghostObjs.push(k.add([
          k.rect(CELL - 4, CELL - 4, { radius: 5 }),
          k.color(pr, pg, pb),
          k.pos(px, py),
          k.opacity(0.12),
        ]));
      });
    }

    // ── Reset round: new gap position, wall back to bottom ──
    function resetRound() {
      dropping = false;
      wallY = VH + 10;
      gapCol = Math.floor(k.rand(0, COLS - sW + 1));
      wallFilled = buildWall(shape, gapCol);
      pieceDir = k.choose([1, -1]) as 1 | -1;
    }

    // ── Drop the piece ──
    function dropPiece() {
      if (!gameActive || dropping) return;
      dropping = true;
      dropY = PIECE_START_Y;
    }

    function instantDrop() {
      if (!gameActive || dropping) return;
      dropping = true;
      // Snap piece to just above wall
      dropY = wallY - sH * CELL - 4;
      if (dropY < PIECE_START_Y) dropY = PIECE_START_Y;
    }

    // ── Check fit when dropping piece reaches wall ──
    function checkFit(): boolean {
      // Perfect fit: pieceCol === gapCol
      return pieceCol === gapCol;
    }

    // Flash effect on hit/miss
    function flashScreen(success: boolean) {
      const overlay = k.add([
        k.rect(VW, VH), k.pos(0,0),
        k.color(success ? 72 : 239, success ? 187 : 68, success ? 120 : 68),
        k.opacity(0.35),
      ]);
      k.wait(0.15, () => { if (overlay.exists()) k.destroy(overlay); });
    }

    // ── Input ──
    k.onKeyDown("left", () => {
      if (!gameActive || dropping) return;
      if (pieceCol > 0) pieceCol--;
    });
    k.onKeyDown("right", () => {
      if (!gameActive || dropping) return;
      if (pieceCol + sW < COLS) pieceCol++;
    });

    k.onKeyPress("space", () => {
      if (!gameActive) return;
      const now = k.time();
      if (now - lastSpaceTime < 0.35) {
        instantDrop();
      } else {
        lastSpaceTime = now;
        dropPiece();
      }
    });

    // Tap / click
    let lastTapTime = -999;
    k.onMousePress(() => {
      if (!gameActive) return;
      const now = k.time();
      if (now - lastTapTime < 0.35) {
        instantDrop();
      } else {
        lastTapTime = now;
        dropPiece();
      }
    });

    // Touch drag to move piece
    let touchStartX = 0;
    k.onTouchStart((pos) => { touchStartX = pos.x; });
    k.onTouchMove((pos) => {
      if (!gameActive || dropping) return;
      const dx = pos.x - touchStartX;
      if (Math.abs(dx) > CELL * 0.55) {
        if (dx > 0 && pieceCol + sW < COLS) pieceCol++;
        if (dx < 0 && pieceCol > 0) pieceCol--;
        touchStartX = pos.x;
      }
    });

    // ── Main update ──
    k.onUpdate(() => {
      if (!gameActive) return;
      const dt = k.dt();

      // Auto-slide piece left/right
      if (!dropping) {
        pieceMoveAcc += pieceSpeed * dt;
        while (pieceMoveAcc >= CELL) {
          pieceMoveAcc -= CELL;
          pieceCol += pieceDir;
          if (pieceCol + sW >= COLS) { pieceCol = COLS - sW; pieceDir = -1; }
          if (pieceCol <= 0) { pieceCol = 0; pieceDir = 1; }
        }
      }

      // Wall scrolls up
      wallY -= wallSpeed * dt;

      // Drop animation
      if (dropping) {
        dropY += DROP_SPEED * dt;

        // Has the piece reached the wall?
        const pieceBottom = dropY + sH * CELL;
        if (pieceBottom >= wallY) {
          // Resolve
          const fit = checkFit();
          flashScreen(fit);

          if (fit) {
            fitsCount++;
            totalScore += shape.length; // 1 point per block cell
            onScore(totalScore);

            // Update HUD
            scoreLbl.text = `${totalScore}`;
            progressLbl.text = `${fitsCount}/${fitsNeeded}`;
            pbarFill.width = Math.max(1, (fitsCount / fitsNeeded) * PBAR_W);

            if (fitsCount >= fitsNeeded) {
              // Level complete!
              gameActive = false;
              k.wait(0.4, () => k.go("levelcomplete", { mode, level, totalScore }));
              return;
            }
            resetRound();
          } else {
            // Miss — game over
            gameActive = false;
            k.wait(0.4, () => k.go("over", { mode, level, totalScore }));
            return;
          }
        }
      }

      // Wall scrolled past top — game over (ran out of time)
      if (wallY + sH * CELL < PLAY_TOP && !dropping) {
        gameActive = false;
        k.wait(0.3, () => k.go("over", { mode, level, totalScore }));
        return;
      }

      // Redraw
      drawGhost();
      drawWall();
      drawPiece();
    });

    // Initial draw
    drawWall();
    drawPiece();
  });

  k.go("menu");
  return () => k.quit();
}
