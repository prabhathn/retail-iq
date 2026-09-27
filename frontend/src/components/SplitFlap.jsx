import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// Split-flap ("Solari board") display. Each phrase is two words; each word gets
// its own row of fixed-width tiles. When the phrase changes, every tile steps
// through the character set until it reaches its target, like a real board.
const CHARSET = ' abcdefghijklmnopqrstuvwxyz';
const STEP_MS = 45;

function toBoard(phrase, cols) {
  return phrase.split(' ').slice(0, 2).map((w) => w.padEnd(cols, ' ').slice(0, cols).split(''));
}

export default function SplitFlap({ phrases, holdMs = 2800 }) {
  const cols = Math.max(...phrases.flatMap((p) => p.split(' ').map((w) => w.length)));
  const [index, setIndex] = useState(0);
  const [board, setBoard] = useState(() => toBoard(phrases[0], cols));
  const target = useRef(toBoard(phrases[0], cols));

  // Advance to the next phrase on a fixed cadence.
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % phrases.length), holdMs);
    return () => clearInterval(id);
  }, [phrases.length, holdMs]);

  // Step each tile one character closer to its target until the board settles.
  useEffect(() => {
    target.current = toBoard(phrases[index], cols);
    const id = setInterval(() => {
      setBoard((prev) => {
        let settled = true;
        const next = prev.map((row, r) =>
          row.map((ch, c) => {
            const goal = target.current[r][c];
            if (ch === goal) return ch;
            settled = false;
            return CHARSET[(CHARSET.indexOf(ch) + 1) % CHARSET.length];
          })
        );
        if (settled) clearInterval(id);
        return settled ? prev : next;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [index, phrases, cols]);

  return (
    <span className="block mt-3 space-y-1.5" aria-live="polite" aria-label={phrases[index]}>
      {board.map((row, r) => (
        <span key={r} className="flex w-full gap-1" aria-hidden="true">
          {row.map((ch, c) => (
            <span
              key={c}
              className="relative flex-1 min-w-0 h-[2.6rem] rounded-md bg-slate-800/90 border border-slate-700/70 shadow-inner shadow-black/40 flex items-center justify-center overflow-hidden [perspective:200px]"
            >
              <motion.span
                key={ch}
                initial={{ rotateX: -80, opacity: 0.4 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={{ duration: 0.08 }}
                className="font-mono text-2xl font-bold uppercase text-retail-300"
              >
                {ch === ' ' ? '\u00a0' : ch}
              </motion.span>
              {/* the hinge line across the middle of each flap */}
              <span className="absolute inset-x-0 top-1/2 h-px bg-black/60" />
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
