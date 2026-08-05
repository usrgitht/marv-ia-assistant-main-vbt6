import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowLeft, Sparkles, Send, Quote, Trash2, Plus, Heart, MessageCircle, Lock, Dices, Star, Settings as SettingsIcon, Target, Paperclip, Image as ImageIcon, Mic, Square, FileText, Download, Play, Pause, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface SparkleViewProps {
  onBack: () => void;
  userId: string;
  userEmail: string;
}

interface Msg {
  id: string; role: string; content: string; created_at: string; user_id: string;
  attachment_url?: string | null; attachment_type?: string | null;
  attachment_name?: string | null; attachment_mime?: string | null;
  read_at?: string | null;
}
interface QuoteRow { id: string; quote: string; context: string | null; created_at: string }
interface VisionRow { id: string; title: string; description: string | null; category: string; done: boolean; created_at: string; created_by: string }
interface CoupleState {
  id: string;
  locked_until: string | null;
  lock_reason: string | null;
  nickname_marvens: string;
  nickname_tracy: string;
}

const TRACY_EMAIL = "tracyrosemond05@gmail.com";
const MARVENS_EMAIL = "theplayboy117@gmail.com";

const AFFECTION_RX = /(je\s*t['’ ]?aime|m\s*renmen\s*w|mon\s*amour|chonchon|sparkle|mariposa|❤️|💖|💕|💗|🌸|✨|🥺|💎|🦋|kè\s*kontan|ti\s*chéri)/i;
const TENSION_RX = /(\b(ferme[zs]?\s*ta|ta\s*gueule|nique|connard|salope|idiot[es]*|stupide|t['’ ]?es\s*nul|déteste|haïs|hais|hate|fuck|shut\s*up|ridicule)\b)/i;

function isCapsHeavy(t: string) {
  const letters = t.replace(/[^a-zA-Zà-ÿÀ-Ÿ]/g, "");
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-ZÀ-Ÿ]/g, "").length;
  return upper / letters.length > 0.7;
}

function formatLastSeen(deltaMs: number): string {
  const s = Math.floor(deltaMs / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export default function SparkleView({ onBack, userId, userEmail }: SparkleViewProps) {
  const email = userEmail.toLowerCase();
  const isTracy = email === TRACY_EMAIL;
  const themeKey = isTracy ? "girly" : "boy";

  const [tab, setTab] = useState<"chat" | "quotes" | "vision">("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [vision, setVision] = useState<VisionRow[]>([]);
  const [couple, setCouple] = useState<CoupleState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [newQuote, setNewQuote] = useState("");
  const [newContext, setNewContext] = useState("");
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [newVision, setNewVision] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [particles, setParticles] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [lastUpdateBanner, setLastUpdateBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recentTension = useRef<number>(0);

  const myDisplayName = isTracy ? "Mme Zamy 🌸" : "Mr Zamy 🌸";
  const otherDisplayName = isTracy ? "Mr Zamy 🌸" : "Mme Zamy 🌸";

  // ---------- THEME ----------
  const theme = isTracy
    ? {
        bg: "bg-gradient-to-b from-[#1a0a1f] via-[#0f0f0f] to-[#1f0a1a]",
        accent: "from-pink-400 via-fuchsia-500 to-purple-500",
        bubbleMine: "bg-gradient-to-br from-pink-500/30 to-fuchsia-500/30 border-pink-400/40",
        bubbleOther: "bg-gradient-to-br from-purple-600/20 to-indigo-600/20 border-purple-400/30",
        ring: "shadow-pink-500/40",
        chip: "bg-pink-500/20 text-pink-200 border-pink-400/40",
        title: "Sparkle ✨",
        sub: `Bienvenue ${myDisplayName} — espace privé avec ${otherDisplayName}`,
      }
    : {
        bg: "bg-gradient-to-b from-[#0a0f1a] via-[#0f0f0f] to-[#1a1a0a]",
        accent: "from-cyan-400 via-blue-500 to-indigo-600",
        bubbleMine: "bg-gradient-to-br from-blue-500/25 to-cyan-500/25 border-cyan-400/40",
        bubbleOther: "bg-gradient-to-br from-pink-500/15 to-fuchsia-500/15 border-pink-400/30",
        ring: "shadow-cyan-500/40",
        chip: "bg-blue-500/20 text-cyan-200 border-cyan-400/40",
        title: "Sparkle ✨",
        sub: `Bienvenue ${myDisplayName} — espace privé avec ${otherDisplayName}`,
      };

  // ---------- LOAD ----------
  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from("sparkle_messages" as any)
      .select("*").order("created_at", { ascending: true }).limit(300);
    setMessages((data as any) || []);
  }, []);
  const loadQuotes = useCallback(async () => {
    const { data } = await supabase.from("sparkle_quotes" as any)
      .select("*").order("created_at", { ascending: false });
    setQuotes((data as any) || []);
  }, []);
  const loadVision = useCallback(async () => {
    const { data } = await supabase.from("sparkle_vision" as any)
      .select("*").order("created_at", { ascending: false });
    setVision((data as any) || []);
  }, []);
  const loadCouple = useCallback(async () => {
    const { data } = await supabase.from("sparkle_couple" as any)
      .select("*").limit(1).maybeSingle();
    setCouple((data as any) || null);
  }, []);

  useEffect(() => { loadMessages(); loadQuotes(); loadVision(); loadCouple(); }, [loadMessages, loadQuotes, loadVision, loadCouple]);

  // ---------- REALTIME ----------
  useEffect(() => {
    const ch = supabase.channel("sparkle-room")
      .on("postgres_changes", { event: "*", schema: "public", table: "sparkle_messages" }, (p) => {
        loadMessages();
        if (p.eventType === "INSERT" && (p.new as any).user_id !== userId) {
          // notify the other side (especially Tracy)
          if (isTracy) setLastUpdateBanner("💖 Nouveau message de Chonchon");
          else setLastUpdateBanner("✨ Nouveau message de Chonchonne");
          setTimeout(() => setLastUpdateBanner(null), 4000);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sparkle_couple" }, () => loadCouple())
      .on("postgres_changes", { event: "*", schema: "public", table: "sparkle_vision" }, () => loadVision())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, isTracy, loadMessages, loadCouple, loadVision]);

  // ---------- ONLINE PRESENCE (heartbeat) ----------
  // Other user id derived from messages
  const otherUserId = useMemo(() => {
    const o = messages.find(m => m.user_id && m.user_id !== userId);
    return o?.user_id || null;
  }, [messages, userId]);

  const [otherLastSeen, setOtherLastSeen] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    if (!otherUserId) return;
    let mounted = true;
    const fetchHB = async () => {
      const { data } = await supabase
        .from("user_heartbeats" as any)
        .select("last_seen_at")
        .eq("user_id", otherUserId)
        .maybeSingle();
      if (mounted && data) setOtherLastSeen(new Date((data as any).last_seen_at).getTime());
    };
    fetchHB();
    // Realtime: react to other user's heartbeat updates instantly
    const ch = supabase
      .channel(`hb-${otherUserId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "user_heartbeats", filter: `user_id=eq.${otherUserId}` },
        (payload) => {
          const ts = (payload.new as any)?.last_seen_at;
          if (mounted && ts) setOtherLastSeen(new Date(ts).getTime());
        })
      .subscribe();
    // Light tick (every 20s) to refresh "online/offline" derived state
    const i = setInterval(() => setNowTick(Date.now()), 20000);
    return () => { mounted = false; clearInterval(i); supabase.removeChannel(ch); };
  }, [otherUserId]);
  const otherOnline = otherLastSeen > 0 && (nowTick - otherLastSeen) < 90000; // 90s window

  // ---------- MARK MESSAGES AS READ when chat tab is open ----------
  const markIncomingRead = useCallback(async () => {
    if (tab !== "chat" || !otherUserId) return;
    const unread = messages.filter(m => m.user_id === otherUserId && !m.read_at && m.role === "user");
    if (unread.length === 0) return;
    const ids = unread.map(m => m.id).filter(id => !id.startsWith("tmp-"));
    if (!ids.length) return;
    await supabase.from("sparkle_messages" as any)
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
  }, [tab, otherUserId, messages]);

  useEffect(() => { markIncomingRead(); }, [markIncomingRead]);

  // tick clock for cool-down countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, tab]);

  // ---------- LOCK STATE ----------
  const lockedUntilMs = couple?.locked_until ? new Date(couple.locked_until).getTime() : 0;
  const isLocked = lockedUntilMs > now;
  const lockSecondsLeft = Math.max(0, Math.ceil((lockedUntilMs - now) / 1000));

  const triggerCooldown = useCallback(async () => {
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from("sparkle_couple" as any).update({
      locked_until: until,
      lock_reason: "Tension détectée — pause de 5 min ✨",
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).eq("id", couple?.id || "11111111-1111-1111-1111-111111111111");
    // Sparkle envoie un message d'apaisement
    try {
      await supabase.functions.invoke("sparkle-chat", { body: { message: "Le ton vient de monter, fais un message de cool-down maintenant.", mode: "cooldown_intro" } });
    } catch {}
    toast("✨ Sparkle a verrouillé le chat 5 minutes 🌸");
  }, [couple?.id, userId]);

  // ---------- SEND ----------
  const launchParticles = (text: string) => {
    if (!AFFECTION_RX.test(text)) return;
    const emojis = isTracy ? ["✨", "🌸", "💖", "🦋", "💎"] : ["✨", "💎", "🌟", "🚀", "💙"];
    const burst = Array.from({ length: 14 }, (_, i) => ({
      id: Date.now() + i,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: Math.random() * 100,
    }));
    setParticles((p) => [...p, ...burst]);
    setTimeout(() => setParticles((p) => p.filter(x => !burst.find(b => b.id === x.id))), 1800);
  };

  // ---------- UPLOADS ----------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const uploadAndSend = async (file: File, kind: "image" | "audio" | "file") => {
    if (isLocked) { toast.error("Chat verrouillé ✨"); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("Fichier trop lourd (max 25 Mo)"); return; }
    setUploading(true); setUploadPct(10);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      setUploadPct(40);
      const { error: upErr } = await supabase.storage.from("sparkle-media").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      setUploadPct(80);
      const { data: pub } = supabase.storage.from("sparkle-media").getPublicUrl(path);
      const url = pub.publicUrl;

      // Insert directly so it's instant; edge function call only if user typed alongside
      const caption = input.trim();
      await supabase.from("sparkle_messages" as any).insert({
        user_id: userId, role: "user",
        content: caption || (kind === "image" ? "📷 Image" : kind === "audio" ? "🎙️ Vocal" : `📎 ${file.name}`),
        attachment_url: url, attachment_type: kind, attachment_name: file.name, attachment_mime: file.type,
      });
      setInput("");
      setUploadPct(100);
      // Notify edge function silently to keep history coherent + maybe trigger Sparkle if caption mentions her
      if (caption) {
        supabase.functions.invoke("sparkle-chat", { body: { message: caption, mode: "chat" } }).catch(() => {});
      }
      await loadMessages();
      toast.success(kind === "audio" ? "Vocal envoyé 🎙️" : kind === "image" ? "Image envoyée ✨" : "Fichier envoyé 📎");
    } catch (e: any) {
      console.error(e); toast.error(e.message || "Échec upload");
    } finally {
      setTimeout(() => { setUploading(false); setUploadPct(0); }, 600);
    }
  };

  // Voice recorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recIntervalRef = useRef<number | null>(null);

  const startRecording = async () => {
    if (isLocked) { toast.error("Chat verrouillé ✨"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordedChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordedChunks.current, { type: "audio/webm" });
        const file = new File([blob], `vocal-${Date.now()}.webm`, { type: "audio/webm" });
        await uploadAndSend(file, "audio");
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true); setRecSeconds(0);
      recIntervalRef.current = window.setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (e: any) {
      toast.error("Micro indisponible : " + (e.message || ""));
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recIntervalRef.current) { clearInterval(recIntervalRef.current); recIntervalRef.current = null; }
  };

  const send = async (overrideMode?: string, overrideText?: string, force = false) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    if (isLocked) { toast.error("Chat verrouillé par Sparkle ✨"); return; }
    setSending(true);
    if (!overrideText) setInput("");

    // Client-side tension scan
    const tensionHit = TENSION_RX.test(text) || isCapsHeavy(text);
    if (tensionHit) recentTension.current += 2; else recentTension.current = Math.max(0, recentTension.current - 1);

    launchParticles(text);

    setMessages(m => [...m, { id: "tmp-" + Date.now(), role: "user", content: text, created_at: new Date().toISOString(), user_id: userId }]);
    try {
      const mode = overrideMode || "chat";
      const { data, error } = await supabase.functions.invoke("sparkle-chat", { body: { message: text, mode, force } });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "Erreur");
      }
      // If too tense → cooldown
      if (recentTension.current >= 3 && !isLocked) {
        recentTension.current = 0;
        await triggerCooldown();
      }
      await loadMessages();
    } catch (e: any) {
      toast.error(e.message || "Erreur réseau");
    } finally {
      setSending(false);
    }
  };

  const askSparkle = () => send("mediate", "Sparkle, on a besoin de ton regard sur ce qu'on vient de se dire. Aide-nous.", true);
  const trancher = () => {
    const q = input.trim() || "Tranche pour nous : qu'est-ce qu'on fait là ?";
    send("choice", q, true);
  };
  const flashback = () => send("flashback", "Sparkle, fais-nous un flashback des meilleurs moments récents 🌸", true);

  // ---------- QUOTES / VISION ----------
  const addQuote = async () => {
    const q = newQuote.trim();
    if (!q) return;
    const { error } = await supabase.from("sparkle_quotes" as any).insert({
      created_by: userId, quote: q, context: newContext.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setNewQuote(""); setNewContext(""); setShowQuoteForm(false);
    toast.success("Citation sauvegardée ✨"); loadQuotes();
  };
  const deleteQuote = async (id: string) => {
    const { error } = await supabase.from("sparkle_quotes" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadQuotes();
  };
  const addVision = async () => {
    const t = newVision.trim();
    if (!t) return;
    const { error } = await supabase.from("sparkle_vision" as any).insert({
      created_by: userId, title: t, category: "rêve",
    });
    if (error) { toast.error(error.message); return; }
    setNewVision(""); toast.success("Ajouté au Vision Board 💎");
  };
  const toggleVisionDone = async (v: VisionRow) => {
    await supabase.from("sparkle_vision" as any).update({ done: !v.done }).eq("id", v.id);
  };
  const deleteVision = async (id: string) => {
    await supabase.from("sparkle_vision" as any).delete().eq("id", id);
  };

  // ---------- SETTINGS (nicknames) ----------
  const [editNickMarvens, setEditNickMarvens] = useState("");
  const [editNickTracy, setEditNickTracy] = useState("");
  useEffect(() => {
    if (couple) {
      setEditNickMarvens(couple.nickname_marvens || "Chonchon");
      setEditNickTracy(couple.nickname_tracy || "Chonchonne");
    }
  }, [couple]);
  const saveNicknames = async () => {
    const { error } = await supabase.from("sparkle_couple" as any).update({
      nickname_marvens: editNickMarvens.trim() || "Chonchon",
      nickname_tracy: editNickTracy.trim() || "Chonchonne",
      updated_by: userId, updated_at: new Date().toISOString(),
    }).eq("id", couple?.id || "11111111-1111-1111-1111-111111111111");
    if (error) { toast.error(error.message); return; }
    toast.success("Surnoms mis à jour ✨"); setShowSettings(false);
  };

  // Carousel of quotes during lock
  const [carouselIdx, setCarouselIdx] = useState(0);
  useEffect(() => {
    if (!isLocked) return;
    const t = setInterval(() => setCarouselIdx(i => (i + 1) % Math.max(1, quotes.length)), 3500);
    return () => clearInterval(t);
  }, [isLocked, quotes.length]);

  return (
    <div className={`h-screen flex flex-col text-foreground ${theme.bg}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${theme.accent} flex items-center justify-center shadow-lg ${theme.ring}`}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight flex-1">
            <p className="text-sm font-bold">{theme.title}</p>
            <p className={`text-[10px] ${isTracy ? "text-pink-300" : "text-cyan-300"}`}>{theme.sub}</p>
            <p className="text-[10px] flex items-center gap-1 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${otherOnline ? "bg-green-400 animate-pulse" : "bg-white/30"}`} />
              <span className="opacity-70">
                {otherDisplayName} {otherOnline
                  ? "en ligne"
                  : otherLastSeen > 0
                    ? `vu ${formatLastSeen(nowTick - otherLastSeen)}`
                    : "hors ligne"}
              </span>
            </p>
          </div>
        </div>
        <button onClick={() => setShowSettings(s => !s)} className="p-2 rounded-lg hover:bg-white/5">
          <SettingsIcon className="w-4 h-4 opacity-70" />
        </button>
      </div>

      {/* Update banner (toujours visible si maj récente) */}
      {lastUpdateBanner && (
        <div className={`px-4 py-2 text-xs font-semibold text-center animate-fade-in ${isTracy ? "bg-pink-500/30 text-pink-100" : "bg-cyan-500/30 text-cyan-100"}`}>
          {lastUpdateBanner}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-white/10 bg-black/40 space-y-2 animate-fade-in">
          <p className="text-xs font-semibold opacity-80">Surnoms (visibles par Sparkle ✨)</p>
          <div className="flex gap-2">
            <input value={editNickMarvens} onChange={e => setEditNickMarvens(e.target.value)}
              placeholder="Surnom de Marvens"
              className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs outline-none" />
            <input value={editNickTracy} onChange={e => setEditNickTracy(e.target.value)}
              placeholder="Surnom de Tracy"
              className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs outline-none" />
          </div>
          <button onClick={saveNicknames} className={`w-full py-2 rounded-lg text-white text-xs font-semibold bg-gradient-to-r ${theme.accent}`}>
            Enregistrer
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-white/10">
        {([["chat", "Chat", MessageCircle], ["quotes", "Citations", Quote], ["vision", "Vision", Target]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`flex-1 text-xs py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-1 ${tab === k ? `${theme.chip} border` : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" /> {l}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 relative">
            {/* Particles */}
            <div className="pointer-events-none fixed inset-0 z-50">
              {particles.map(p => (
                <span key={p.id}
                  style={{ left: `${p.x}%`, animationDuration: "1.6s" }}
                  className="absolute bottom-20 text-2xl animate-[fade-out_1.6s_ease-out] [transform:translateY(-200px)]">
                  {p.emoji}
                </span>
              ))}
            </div>

            {messages.length === 0 && (
              <div className="text-center py-10">
                <Sparkles className="w-10 h-10 mx-auto mb-3 animate-pulse opacity-70" />
                <p className="text-sm text-muted-foreground">L'espace est tout neuf. Dis quelque chose ✨</p>
              </div>
            )}

            {messages.map(m => {
              const isMine = m.user_id === userId;
              const isAssistant = m.role === "assistant";
              if (isAssistant) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm border bg-gradient-to-br ${isTracy ? "from-pink-500/15 to-purple-500/15 border-pink-400/30" : "from-cyan-500/15 to-blue-500/15 border-cyan-400/30"}`}>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-80 mb-1">
                        <Sparkles className="w-3 h-3" /> Sparkle
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              }
              const senderLabel = m.user_id === userId
                ? myDisplayName
                : otherDisplayName;
              const timeStr = new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
              // Tick logic for MY messages only (not assistant, not other user)
              let tick: React.ReactNode = null;
              if (isMine && !m.id.startsWith("tmp-")) {
                if (m.read_at) {
                  tick = <CheckCheck className="w-3.5 h-3.5 text-sky-400" />;
                } else if (otherOnline) {
                  tick = <CheckCheck className="w-3.5 h-3.5 text-white/50" />;
                } else {
                  tick = <Check className="w-3.5 h-3.5 text-white/50" />;
                }
              }
              return (
                <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm border ${isMine ? theme.bubbleMine : theme.bubbleOther}`}>
                    <p className="text-[10px] opacity-60 mb-0.5">{senderLabel}</p>
                    {m.attachment_url && m.attachment_type === "image" && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer">
                        <img src={m.attachment_url} alt={m.attachment_name || "image"} className="rounded-lg max-h-64 mb-1 border border-white/10" />
                      </a>
                    )}
                    {m.attachment_url && m.attachment_type === "audio" && (
                      <audio controls src={m.attachment_url} className="w-full mb-1" />
                    )}
                    {m.attachment_url && m.attachment_type === "file" && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 mb-1 border border-white/10">
                        <FileText className="w-4 h-4 opacity-80" />
                        <span className="flex-1 text-xs truncate">{m.attachment_name || "fichier"}</span>
                        <Download className="w-3.5 h-3.5 opacity-70" />
                      </a>
                    )}
                    {m.content && (
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] opacity-60">
                      <span>{timeStr}</span>
                      {tick}
                    </div>
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex justify-center">
                <div className="text-xs text-muted-foreground italic">Sparkle scintille ✨…</div>
              </div>
            )}
          </div>

          {/* Cool-down overlay */}
          {isLocked && (
            <div className="px-4 py-3 border-t border-white/10 bg-gradient-to-r from-pink-500/20 via-fuchsia-500/20 to-purple-500/20 backdrop-blur text-center space-y-2 animate-fade-in">
              <div className="flex items-center justify-center gap-2 text-sm font-semibold">
                <Lock className="w-4 h-4" /> Sparkle a verrouillé le chat — {Math.floor(lockSecondsLeft / 60)}:{String(lockSecondsLeft % 60).padStart(2, "0")}
              </div>
              {quotes.length > 0 && (
                <div className="text-xs italic opacity-90 min-h-[2.5em] transition-opacity">
                  « {quotes[carouselIdx % quotes.length].quote} »
                </div>
              )}
              <p className="text-[10px] opacity-70">Respirez. Vous êtes un choix que vous referiez mille fois 🌸</p>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto">
            <button onClick={askSparkle} disabled={isLocked} className={`text-[11px] px-3 py-1.5 rounded-full border ${theme.chip} disabled:opacity-40 whitespace-nowrap flex items-center gap-1`}>
              <Heart className="w-3 h-3" /> Demander à Sparkle
            </button>
            <button onClick={trancher} disabled={isLocked} className={`text-[11px] px-3 py-1.5 rounded-full border ${theme.chip} disabled:opacity-40 whitespace-nowrap flex items-center gap-1`}>
              <Dices className="w-3 h-3" /> Trancher
            </button>
            <button onClick={flashback} disabled={isLocked} className={`text-[11px] px-3 py-1.5 rounded-full border ${theme.chip} disabled:opacity-40 whitespace-nowrap flex items-center gap-1`}>
              <Star className="w-3 h-3" /> Flashback
            </button>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="px-4 py-2 border-t border-white/10 bg-black/40">
              <div className="flex items-center gap-2 text-[11px] opacity-80 mb-1">
                <span>📤 Envoi en cours…</span>
                <span className="ml-auto">{uploadPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full bg-gradient-to-r ${theme.accent} transition-all`} style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="px-4 py-2 border-t border-white/10 bg-red-500/10 text-center text-xs flex items-center justify-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Enregistrement… {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
            </div>
          )}

          <div className="p-3 border-t border-white/10 bg-black/40 backdrop-blur">
            <input ref={imageInputRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSend(f, "image"); e.target.value = ""; }} />
            <input ref={fileInputRef} type="file" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSend(f, f.type.startsWith("audio/") ? "audio" : f.type.startsWith("image/") ? "image" : "file"); e.target.value = ""; }} />

            <div className="flex gap-1.5 items-end">
              <button onClick={() => imageInputRef.current?.click()} disabled={isLocked || uploading || isRecording}
                title="Image" className="w-9 h-9 rounded-full bg-muted hover:bg-white/10 flex items-center justify-center disabled:opacity-40">
                <ImageIcon className="w-4 h-4" />
              </button>
              <button onClick={() => fileInputRef.current?.click()} disabled={isLocked || uploading || isRecording}
                title="Fichier" className="w-9 h-9 rounded-full bg-muted hover:bg-white/10 flex items-center justify-center disabled:opacity-40">
                <Paperclip className="w-4 h-4" />
              </button>
              <button onClick={isRecording ? stopRecording : startRecording} disabled={isLocked || uploading}
                title={isRecording ? "Arrêter" : "Vocal"}
                className={`w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 ${isRecording ? "bg-red-500 text-white" : "bg-muted hover:bg-white/10"}`}>
                {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={isLocked ? "Chat verrouillé ✨" : (isTracy ? "Écris à Chonchon… (mentionne Sparkle si tu veux son avis)" : "Écris à Chonchonne… (mentionne Sparkle au besoin)")}
                rows={1}
                disabled={isLocked || isRecording}
                className="flex-1 bg-muted rounded-2xl px-4 py-2.5 text-sm outline-none resize-none max-h-32 disabled:opacity-50"
              />
              <button
                onClick={() => send()}
                disabled={sending || !input.trim() || isLocked || isRecording}
                className={`w-10 h-10 rounded-full bg-gradient-to-br ${theme.accent} text-white flex items-center justify-center disabled:opacity-40 shadow-lg ${theme.ring}`}>
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : tab === "quotes" ? (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <button onClick={() => setShowQuoteForm(s => !s)}
            className={`w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition ${theme.chip}`}>
            <Plus className="w-4 h-4" /> Nouvelle citation légendaire
          </button>

          {showQuoteForm && (
            <div className="mb-4 p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
              <textarea value={newQuote} onChange={(e) => setNewQuote(e.target.value)}
                placeholder="« Ta phrase légendaire… »" rows={3}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm outline-none resize-none" />
              <input value={newContext} onChange={(e) => setNewContext(e.target.value)}
                placeholder="Contexte (optionnel)"
                className="w-full bg-muted rounded-lg px-3 py-2 text-xs outline-none" />
              <div className="flex gap-2">
                <button onClick={addQuote} className={`flex-1 py-2 rounded-lg text-white text-sm font-semibold bg-gradient-to-r ${theme.accent}`}>
                  Sauvegarder ✨
                </button>
                <button onClick={() => setShowQuoteForm(false)} className="px-3 py-2 rounded-lg bg-muted text-sm">Annuler</button>
              </div>
            </div>
          )}

          {quotes.length === 0 && !showQuoteForm && (
            <div className="text-center py-10">
              <Quote className="w-8 h-8 opacity-50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Aucune citation pour l'instant.</p>
            </div>
          )}

          <div className="space-y-2">
            {quotes.map(q => (
              <div key={q.id} className="group p-3 rounded-xl border border-white/10 bg-black/30 hover:border-white/30 transition">
                <div className="flex items-start gap-2">
                  <Quote className="w-4 h-4 opacity-70 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm italic">« {q.quote} »</p>
                    {q.context && <p className="text-[11px] text-muted-foreground mt-1">— {q.context}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(q.created_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <button onClick={() => deleteQuote(q.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // VISION
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex gap-2 mb-3">
            <input value={newVision} onChange={e => setNewVision(e.target.value)}
              placeholder="Un rêve, un projet, un voyage…"
              onKeyDown={(e) => { if (e.key === "Enter") addVision(); }}
              className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none" />
            <button onClick={addVision} className={`px-4 rounded-lg text-white text-sm font-semibold bg-gradient-to-r ${theme.accent}`}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {vision.length === 0 && (
            <div className="text-center py-10">
              <Target className="w-8 h-8 opacity-50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Aucun rêve listé pour l'instant. Ajoutez le premier 💎</p>
            </div>
          )}
          <div className="space-y-2">
            {vision.map(v => (
              <div key={v.id} className={`group p-3 rounded-xl border bg-black/30 transition ${v.done ? "border-green-500/40 opacity-60" : "border-white/10 hover:border-white/30"}`}>
                <div className="flex items-start gap-2">
                  <button onClick={() => toggleVisionDone(v)}
                    className={`w-5 h-5 rounded-full border flex-shrink-0 mt-0.5 ${v.done ? "bg-green-500 border-green-500" : "border-white/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${v.done ? "line-through" : ""}`}>{v.title}</p>
                    {v.description && <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(v.created_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                  <button onClick={() => deleteVision(v.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
