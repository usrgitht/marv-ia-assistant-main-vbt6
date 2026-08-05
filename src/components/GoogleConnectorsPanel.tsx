import React, { useEffect, useState } from "react";
import { Mail, FolderOpen, Calendar, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { getGoogleStatus } from "@/services/google";
import { toast } from "sonner";

type Status = { ok: boolean; outcome?: string; error?: string };

const services = [
  { key: "gmail" as const, label: "Gmail", icon: Mail },
  { key: "drive" as const, label: "Google Drive", icon: FolderOpen },
  { key: "calendar" as const, label: "Google Calendar", icon: Calendar },
];

export default function GoogleConnectorsPanel() {
  const [status, setStatus] = useState<Record<string, Status> | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getGoogleStatus();
      setStatus(data as any);
    } catch (e: any) {
      toast.error("Erreur statut Google: " + (e.message || "inconnu"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-foreground">Connecteurs Google</h3>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          aria-label="Rafraîchir"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>

      <div className="space-y-2">
        {services.map(({ key, label, icon: Icon }) => {
          const s = status?.[key];
          const ok = s?.ok && (s.outcome === "verified" || s.outcome === "skipped");
          return (
            <div key={key} className="flex items-center justify-between bg-secondary/50 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-foreground font-medium">{label}</p>
                  {s?.error && <p className="text-xs text-destructive truncate max-w-[200px]">{s.error}</p>}
                  {!s?.error && s?.outcome && <p className="text-xs text-muted-foreground">{s.outcome}</p>}
                </div>
              </div>
              {status === null ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : ok ? (
                <div className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs font-medium">Connecté</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-4 h-4" />
                  <span className="text-xs font-medium">Erreur</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground pt-1">
        Marv-IA peut envoyer des emails, sauvegarder des fichiers sur Drive et créer des événements Calendar via ces connexions managées.
      </p>
    </div>
  );
}
