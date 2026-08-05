import React, { useState } from "react";
import { Mail, FolderOpen, Calendar, Loader2, Check, X } from "lucide-react";
import { gmailService, driveService, calendarService } from "@/services/google";
import { toast } from "sonner";

export type GoogleAction = {
  service: "gmail" | "drive" | "calendar";
  action: "send" | "upload" | "createEvent";
  payload: any;
};

const ACTION_RE = /```google-action\s*([\s\S]*?)```/i;

export function extractGoogleAction(content: string): { action: GoogleAction | null; cleaned: string } {
  const m = content.match(ACTION_RE);
  if (!m) return { action: null, cleaned: content };
  try {
    const parsed = JSON.parse(m[1].trim());
    if (parsed?.service && parsed?.action) {
      return { action: parsed as GoogleAction, cleaned: content.replace(ACTION_RE, "").trim() };
    }
  } catch { /* ignore */ }
  return { action: null, cleaned: content };
}

const labels = {
  gmail: { icon: Mail, name: "Gmail", verb: "Envoyer le mail" },
  drive: { icon: FolderOpen, name: "Drive", verb: "Sauvegarder sur Drive" },
  calendar: { icon: Calendar, name: "Calendar", verb: "Créer l'événement" },
} as const;

export default function GoogleActionRunner({ action }: { action: GoogleAction }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "cancelled">("idle");
  const meta = labels[action.service];
  const Icon = meta?.icon || Mail;

  const summary = (() => {
    try {
      if (action.service === "gmail") return `À : ${action.payload?.to} — ${action.payload?.subject}`;
      if (action.service === "drive") return `Fichier : ${action.payload?.name}`;
      if (action.service === "calendar") return `${action.payload?.event?.summary} — ${action.payload?.event?.start?.dateTime}`;
    } catch { /* ignore */ }
    return "";
  })();

  const run = async () => {
    setState("running");
    try {
      if (action.service === "gmail" && action.action === "send") {
        await gmailService.send(action.payload);
        toast.success("Email envoyé");
      } else if (action.service === "drive" && action.action === "upload") {
        await driveService.upload(action.payload);
        toast.success("Fichier sauvegardé sur Drive");
      } else if (action.service === "calendar" && action.action === "createEvent") {
        await calendarService.createEvent(action.payload.event, action.payload.calendarId);
        toast.success("Événement créé");
      } else {
        throw new Error("Action non supportée");
      }
      setState("done");
    } catch (e: any) {
      toast.error("Échec : " + (e.message || "inconnu"));
      setState("idle");
    }
  };

  if (state === "cancelled") return null;

  return (
    <div className="mt-2 border border-primary/30 bg-primary/5 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Action Google {meta?.name}</span>
      </div>
      {summary && <p className="text-xs text-muted-foreground break-words">{summary}</p>}
      {state === "done" ? (
        <div className="flex items-center gap-1.5 text-xs text-green-500 font-medium">
          <Check className="w-3.5 h-3.5" /> Effectué
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={state === "running"}
            className="flex-1 bg-primary text-primary-foreground rounded-lg py-1.5 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {state === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {meta?.verb}
          </button>
          <button
            onClick={() => setState("cancelled")}
            disabled={state === "running"}
            className="px-3 bg-secondary text-foreground rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> Annuler
          </button>
        </div>
      )}
    </div>
  );
}
