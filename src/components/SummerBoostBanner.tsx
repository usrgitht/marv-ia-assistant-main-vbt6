import { useEffect, useState } from "react";
import { Sun, Sparkles, MessageSquarePlus, X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Campagne active jusqu'au 5 juin 2026 (~4 semaines à partir du 8 mai 2026)
const CAMPAIGN_END = new Date("2026-06-05T23:59:59Z").getTime();
const DISMISS_KEY = "marvia-summer-boost-2026-dismissed";

export default function SummerBoostBanner({ userId }: { userId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const active = Date.now() < CAMPAIGN_END;

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!active || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const handleSubmit = async () => {
    const text = content.trim();
    if (text.length < 5) {
      toast.error("Décris un peu plus ton idée 🙂");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("summer_feedback" as any).insert({
      user_id: userId,
      content: text,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Impossible d'envoyer ta suggestion");
      return;
    }
    toast.success("Merci ! Ta suggestion est envoyée 🌞");
    setContent("");
    setOpen(false);
  };

  return (
    <>
      <div className="relative flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-500/25 via-orange-500/25 to-pink-500/25 border-b border-amber-500/40">
        <Sun className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-amber-200 leading-tight truncate">
            ☀️ SUMMER BOOST 2026 — Activités & filières d'excellence en route
          </p>
          <p className="text-[9px] text-amber-100/80 leading-tight truncate">
            Dis-nous ce qui te ferait plaisir cet été
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold hover:bg-amber-400 transition"
        >
          <MessageSquarePlus className="w-3 h-3" />
          Idée
        </button>
        <button onClick={handleDismiss} className="text-amber-200/70 hover:text-amber-100 p-0.5">
          <X className="w-3 h-3" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-border">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-foreground flex-1">Summer Boost 2026 — Ton idée</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Quelles activités, filières ou fonctionnalités aimerais-tu voir cet été ?
              </p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ex: cours d'anglais ludiques, défis quotidiens, club de débat…"
                className="w-full min-h-[100px] px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/60 resize-none"
                maxLength={500}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{content.length}/500</span>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || content.trim().length < 5}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition"
                >
                  <Send className="w-3 h-3" />
                  {submitting ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
