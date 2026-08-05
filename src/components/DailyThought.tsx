import { useMemo, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";

const THOUGHTS = [
  "Un petit pas chaque jour vaut mieux qu'un grand bond une fois par an.",
  "La curiosité est le moteur le plus puissant que tu possèdes.",
  "Ce que tu cherches te cherche aussi.",
  "Avance même quand tu ne vois que le prochain pas.",
  "La discipline est le pont entre les rêves et la réalité.",
  "Sois patient avec toi-même : tu grandis.",
  "Ton énergie attire ce que tu vis.",
  "Le doute tue plus de rêves que l'échec.",
  "Apprendre, c'est se rendre libre.",
  "La meilleure version de toi est en construction — fais-lui confiance.",
  "Le calme est une superpuissance.",
  "Chaque jour est une nouvelle chance d'être qui tu veux.",
  "Fais simple, fais bien, fais maintenant.",
  "Ton attention est ta monnaie la plus précieuse.",
  "Cultive ce qui te rend vivant.",
];

function dayIndex() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export default function DailyThought() {
  const [shuffleOffset, setShuffleOffset] = useState(0);
  const idx = useMemo(() => (dayIndex() + shuffleOffset) % THOUGHTS.length, [shuffleOffset]);
  return (
    <div className="mb-4 relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-amber-500/10 via-pink-500/10 to-purple-500/10 p-3">
      <div className="flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-amber-300/80 mb-1">
            Pensée du jour
          </p>
          <p className="text-xs text-foreground/90 italic leading-relaxed">"{THOUGHTS[idx]}"</p>
        </div>
        <button
          onClick={() => setShuffleOffset((o) => o + 1)}
          className="p-1 rounded-lg hover:bg-muted/40 text-muted-foreground flex-shrink-0"
          title="Une autre"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
