import { useEffect, useState, useCallback } from "react";
import { Sun, Send, RefreshCw, MessageSquare, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendSpyNotification } from "@/lib/marvia-api";
import { toast } from "sonner";

type FeedbackRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name?: string | null;
};

export default function SummerFeedbackPanel() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [repliedIds, setRepliedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("summer_feedback" as any)
      .select("id, user_id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setLoading(false);
      return;
    }
    const rows = (data || []) as any as FeedbackRow[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      const map = new Map((profs || []).map((p: any) => [p.user_id, p.display_name]));
      rows.forEach((r) => { r.display_name = map.get(r.user_id) || null; });
    }
    setItems(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSend = async (item: FeedbackRow) => {
    const text = reply.trim();
    if (text.length < 2) {
      toast.error("Écris une réponse");
      return;
    }
    setSending(true);
    const { error } = await sendSpyNotification(
      item.user_id,
      "☀️ Réponse à ta suggestion Summer Boost",
      text,
    );
    setSending(false);
    if (error) {
      toast.error(typeof error === "string" ? error : "Envoi impossible");
      return;
    }
    toast.success("Réponse envoyée à l'utilisateur 🌞");
    setRepliedIds((prev) => new Set(prev).add(item.id));
    setReply("");
    setOpenId(null);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 mb-2 px-1">
        <Sun className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex-1">
          Summer Boost — Feedback ({items.length})
        </h3>
        <button
          onClick={load}
          className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="bg-secondary rounded-xl border border-border overflow-hidden divide-y divide-border">
        {items.length === 0 && !loading && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Aucune suggestion pour le moment.
          </div>
        )}
        {items.map((it) => {
          const open = openId === it.id;
          const replied = repliedIds.has(it.id);
          return (
            <div key={it.id} className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-foreground truncate">
                      {it.display_name || it.user_id.slice(0, 8)}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(it.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {replied && (
                      <span className="flex items-center gap-0.5 text-[9px] text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> répondu
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">{it.content}</p>
                </div>
                <button
                  onClick={() => { setOpenId(open ? null : it.id); setReply(""); }}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex-shrink-0"
                >
                  {open ? "Fermer" : "Répondre"}
                </button>
              </div>
              {open && (
                <div className="mt-2 pl-5 space-y-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    maxLength={1000}
                    placeholder="Ta réponse à l'utilisateur (envoyée comme notification)…"
                    className="w-full min-h-[70px] px-3 py-2 bg-muted/40 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/60 resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground">{reply.length}/1000</span>
                    <button
                      onClick={() => handleSend(it)}
                      disabled={sending || reply.trim().length < 2}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[11px] font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      {sending ? "Envoi…" : "Envoyer"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
