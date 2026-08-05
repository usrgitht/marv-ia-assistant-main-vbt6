import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Download, Clock } from "lucide-react";
import { useVersionCheck } from "@/hooks/useVersionCheck";

/**
 * Affiche un dialog dès qu'une nouvelle version est détectée.
 * Aucune installation automatique : l'utilisateur choisit "Installer" ou "Plus tard".
 */
export default function UpdateAvailableDialog() {
  const { latest, currentVersion, dismiss, installNow } = useVersionCheck();

  if (!latest) return null;

  const typeLabel: Record<string, { label: string; cls: string }> = {
    major: { label: "Mise à jour majeure", cls: "bg-primary text-primary-foreground" },
    minor: { label: "Nouvelle version", cls: "bg-accent text-accent-foreground" },
    patch: { label: "Correctif", cls: "bg-muted text-muted-foreground" },
  };
  const meta = typeLabel[latest.type] ?? typeLabel.minor;

  return (
    <Dialog open={true} onOpenChange={() => { /* mandatory : no outside-click dismiss */ }}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <Badge className={meta.cls}>{meta.label}</Badge>
          </div>
          <DialogTitle className="text-xl">
            Marv-IA <span className="text-primary">v{latest.version}</span> est disponible
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3 h-3" />
            Publiée le {new Date(latest.releaseDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            <span className="opacity-70">Vous utilisez v{currentVersion}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-sm font-medium text-foreground">Nouveautés :</p>
          <ul className="space-y-1.5">
            {latest.highlights.map((h, i) => (
              <li key={i} className="text-sm text-muted-foreground leading-relaxed flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={dismiss}>Plus tard</Button>
          <Button onClick={installNow} className="gap-2">
            <Download className="w-4 h-4" />
            Installer maintenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
