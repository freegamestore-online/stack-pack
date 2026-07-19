import { GameShell, GameTopbar } from "@freegamestore/games";
import { useEffect, useRef, useState } from "react";
import { startGame } from "./game";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stop = startGame(canvas, setScore);
    return stop;
  }, []);

  return (
    <GameShell topbar={<GameTopbar title="Stack Pack" score={score} />}>
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />
    </GameShell>
  );
}
