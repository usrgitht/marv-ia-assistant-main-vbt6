import React, { useState, useEffect } from "react";
import { ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const OWNER_EMAILS = ["theplayboy117@gmail.com", "tracyrosemond05@gmail.com"];
const DISMISS_KEY = "identity_warning_dismissed_v1";
const STRIKE_KEY = "identity_strike_count_v1";

export default function IdentityWarningBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [forced, setForced] = useState(false);
  const [strikes, setStrikes] = useState(0);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    setStrikes(parseInt(localStorage.getItem(STRIKE_KEY) || "0", 10));
  }, [user?.id]);

  useEffect(() => {
    const onAttempt = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { count?: number; banned?: boolean } | undefined;
      const serverCount = detail?.count;
      const next = typeof serverCount === "number"
        ? serverCount
        : parseInt(localStorage.getItem(STRIKE_KEY) || "0", 10) + 1;
      localStorage.setItem(STRIKE_KEY, String(next));
      setStrikes(next);
      sessionStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
      setForced(true);
    };
    window.addEventListener("marvia:impersonation-attempt", onAttempt as EventListener);
    return () => window.removeEventListener("marvia:impersonation-attempt", onAttempt as EventListener);
  }, []);

  if (!user) return null;
  const email = user.email?.toLowerCase() ?? "";
  if (OWNER_EMAILS.includes(email)) return null;

  // Affiche la bannière uniquement après une tentative serveur détectée
  if (!forced || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground shadow-lg animate-in slide-in-from-top duration-300"
    >
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm leading-snug">
          <p className="font-bold">
            Identité non vérifiée {strikes > 0 && <span className="opacity-90">· Avertissement #{strikes}</span>}
          </p>
          <p className="opacity-95 mt-0.5">
            Tu n'es pas <span className="font-semibold">Marvens Zamy J.</span>, le propriétaire de Marv-IA.
            Toute usurpation d'identité peut entraîner un{" "}
            <span className="font-semibold underline">bannissement immédiat et définitif</span>.
            {strikes > 0 && strikes < 5 && (
              <span className="block mt-1 font-semibold">
                ⚠️ {strikes}/5 tentatives — bannissement automatique à la 5ᵉ.
              </span>
            )}
            {strikes >= 5 && (
              <span className="block mt-1 font-semibold">
                ⛔ Seuil atteint — votre compte va être banni.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Fermer"
          className="flex-shrink-0 p-1 rounded hover:bg-black/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

