import { useEffect, useState, type CSSProperties } from "react";
import { Heart } from "lucide-react";
import { Cat, type CatMood } from "@/components/cats/Cat";
import {
  MOOD_LINES,
  MOOD_RANK,
  moneyMood,
  type MoneyMood,
} from "@/lib/cat-mood";
import { meow, purr } from "@/lib/meow";

const POSE: Record<MoneyMood, CatMood> = {
  party: "party",
  happy: "happy",
  okay: "sit",
  worried: "worried",
  sad: "sad",
};

// Survives remounts, so coming back to the page after a change elsewhere still gets a meow.
let lastMood: MoneyMood | null = null;

/** The mascot: happier with more money free after the bills, sadder with less. Pet it to cheer it up. */
export function MoodCat({
  free,
  paycheck,
}: {
  free: number;
  paycheck: number;
}) {
  const mood = moneyMood(free, paycheck);
  const [hearts, setHearts] = useState<number[]>([]);
  const [wiggle, setWiggle] = useState(0);

  useEffect(() => {
    const before = lastMood;
    lastMood = mood;
    if (before === null || before === mood) return;
    // Brighter mew when things got better, a low sad one when they got worse.
    meow(MOOD_RANK[mood] > MOOD_RANK[before] ? 1.25 : 0.75, 0.1);
  }, [mood]);

  function pet() {
    setWiggle((w) => w + 1);
    purr(1.1, 0.08);
    const base = Date.now();
    setHearts([base, base + 1, base + 2]);
    window.setTimeout(() => setHearts([]), 1600);
  }

  return (
    <div className="flex w-36 shrink-0 flex-col items-center gap-1 text-center">
      <button
        type="button"
        onClick={pet}
        title={MOOD_LINES[mood]}
        aria-label={`Gatinho: ${MOOD_LINES[mood]}`}
        className="squish relative rounded-2xl p-1 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span key={wiggle} className={wiggle > 0 ? "wiggle" : undefined}>
          <Cat mood={POSE[mood]} size={72} />
        </span>
        {hearts.map((id, i) => (
          <Heart
            key={id}
            size={12}
            aria-hidden
            className="float-up pointer-events-none absolute top-2 left-1/2 fill-[var(--ink)] text-[var(--ink)]"
            style={
              {
                "--drift": `${(i - 1) * 16}px`,
                animationDelay: `${i * 0.1}s`,
                opacity: 0,
              } as CSSProperties
            }
          />
        ))}
      </button>
      <span className="text-[11px] leading-tight font-semibold text-muted-foreground">
        {MOOD_LINES[mood]}
      </span>
    </div>
  );
}
