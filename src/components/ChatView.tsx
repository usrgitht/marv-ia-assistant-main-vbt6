import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { Send, Mic, ImagePlus, Sparkles, Copy, Check, StopCircle, Volume2, Share2, Camera, MapPin, Search, Flag, RotateCcw, Download, FileCode, Paperclip, Square, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import ImageBubble from "@/components/ImageBubble";
import MessageSkeleton from "@/components/MessageSkeleton";
import { streamChat, streamSearch, generateImage, saveMessage, createConversation, getMessages, extractMemories, reportContent, type ChatMessage } from "@/lib/marvia-api";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useVoice } from "@/hooks/useVoice";
import { useLocation } from "@/hooks/useLocation";
import { useCamera } from "@/hooks/useCamera";
import { useNotifications } from "@/hooks/useNotifications";
import { useConversationCache } from "@/hooks/useConversationCache";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmotionalGlow from "@/components/visual-suite/EmotionalGlow";
import DocumentCanvas, { shouldUseCanvas } from "@/components/visual-suite/DocumentCanvas";
import SmartVisualizer, { detectVisualizableContent } from "@/components/visual-suite/SmartVisualizer";
import GoogleActionRunner, { extractGoogleAction } from "@/components/GoogleActionRunner";

type UIMessage = ChatMessage & { id: string; error?: boolean; retryPayload?: any };

interface ChatViewProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  credits: number;
  onConsumeCredit: () => Promise<boolean>;
  onRefreshCredits: () => void;
  activePersona?: { id: string; name: string; system_instructions: string; theme_color: string } | null;
}

const FREE_MODELS = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"];

// Download code as file
function downloadCode(code: string, lang: string) {
  const extMap: Record<string, string> = { javascript: "js", typescript: "ts", python: "py", html: "html", css: "css", json: "json", jsx: "jsx", tsx: "tsx" };
  const ext = extMap[lang] || lang || "txt";
  const blob = new Blob([code], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `marvia-code.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Fichier .${ext} téléchargé !`);
}

export default function ChatView({ conversationId, onConversationCreated, credits, onConsumeCredit, onRefreshCredits, activePersona }: ChatViewProps) {
  const { user, accountStatus, isOwner } = useAuth();
  const { aiModel, voiceEnabled, voiceTone, responseStyle } = useSettings();
  const { speak, startListening } = useVoice();
  const { location, error: locationError, requestLocation } = useLocation();
  const { capture } = useCamera();
  const { notifyIfHidden } = useNotifications();
  const convCache = useConversationCache();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [locationActive, setLocationActive] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);
  const userScrolledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // Cache-first loading: show cached instantly, revalidate in background
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    
    const cached = convCache.get(conversationId);
    if (cached) {
      setMessages(cached.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: (m.content || "").replace(/^\[Image envoyée\]\n?/, ""), image_url: m.image_url || undefined })));
    } else {
      setIsLoadingHistory(true);
    }

    // Background revalidation
    getMessages(conversationId).then(({ data }) => {
      if (data) {
        const mapped = data.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: (m.content || "").replace(/^\[Image envoyée\]\n?/, ""), image_url: m.image_url || undefined }));
        setMessages(mapped);
        convCache.set(conversationId, data);
      }
      setIsLoadingHistory(false);
    });
  }, [conversationId]);

  // Smart auto-scroll: only auto-scroll if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Detect user scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledRef.current = !isAtBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copié !");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (text: string) => {
    const cleanText = text.replace(/[#*_`]/g, "").slice(0, 1000);
    if (navigator.share) {
      try { await navigator.share({ title: "Marv-IA", text: cleanText }); } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(cleanText)}`, "_blank");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // For text-based files, read content and add to input
    const textTypes = ["text/", "application/json", "application/xml", "application/javascript", "application/typescript"];
    if (/\.(zip)$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      // ZIP: list file names from the archive
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const buffer = reader.result as ArrayBuffer;
          const view = new DataView(buffer);
          const fileNames: string[] = [];
          let offset = 0;
          while (offset < view.byteLength - 4) {
            const sig = view.getUint32(offset, true);
            if (sig !== 0x04034b50) break; // local file header
            const nameLen = view.getUint16(offset + 26, true);
            const extraLen = view.getUint16(offset + 28, true);
            const compSize = view.getUint32(offset + 18, true);
            const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 30, nameLen));
            if (!name.endsWith("/")) fileNames.push(name);
            offset += 30 + nameLen + extraLen + compSize;
          }
          const listing = fileNames.length > 0
            ? fileNames.slice(0, 50).join("\n") + (fileNames.length > 50 ? `\n... et ${fileNames.length - 50} autres fichiers` : "")
            : "(archive vide ou format non lisible)";
          setInput(prev => prev + (prev ? "\n" : "") + `📎 ${file.name} (ZIP - ${fileNames.length} fichiers):\n\`\`\`\n${listing}\n\`\`\``);
          toast.success(`📎 ${file.name} ajouté (${fileNames.length} fichiers)`);
        } catch {
          setInput(prev => prev + (prev ? "\n" : "") + `📎 ${file.name} (archive ZIP jointe)`);
          toast.success(`📎 ${file.name} ajouté`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (textTypes.some(t => file.type.startsWith(t)) || /\.(txt|md|csv|json|xml|html|css|js|ts|py|java|c|cpp|rb|go|rs|sql|yaml|yml|toml|ini|env|log|sh|bat)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setInput(prev => prev + (prev ? "\n" : "") + `📎 ${file.name}:\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``);
        toast.success(`📎 ${file.name} ajouté`);
      };
      reader.readAsText(file);
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      toast.error("Type de fichier non supporté. Utilisez des fichiers texte ou des images.");
    }
  };

  const handleVoice = () => {
    if (isListening) { stopListeningRef.current?.(); setIsListening(false); return; }
    setIsListening(true);
    stopListeningRef.current = startListening(
      (text) => { setInput(prev => prev + text); },
      () => setIsListening(false)
    );
  };

  const handleCamera = async () => {
    const photo = await capture();
    if (photo) setImagePreview(photo);
  };

  const handleLocation = async () => {
    if (locationActive) {
      setLocationActive(false);
      toast("📍 Localisation désactivée");
      return;
    }

    if (!navigator.geolocation) {
      toast.error("📍 Géolocalisation non disponible sur ce navigateur.", { duration: 5000 });
      return;
    }

    toast("📡 Acquisition GPS...", { duration: 3000 });
    const loc = await requestLocation();
    if (loc) {
      setLocationActive(true);
      const alt = loc.altitude ? ` | Alt: ${loc.altitude.toFixed(0)}m` : "";
      toast.success(`📡 GPS verrouillé ! Précision: ${loc.accuracy.toFixed(0)}m${alt}`, { duration: 4000 });
    } else {
      const isIframe = window.self !== window.top;
      if (isIframe) {
        toast.error("📍 Le GPS ne fonctionne pas dans l'aperçu. Installez ou ouvrez l'app depuis votre navigateur.", { duration: 8000 });
      } else if (locationError === "denied") {
        const toastId = toast.error(
          <div className="flex flex-col gap-2">
            <p className="text-sm">📍 Localisation bloquée par votre navigateur.</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  toast.dismiss(toastId);
                  toast.info("Cliquez sur l'icône 🔒 dans la barre d'adresse → Autorisations → Localisation → Autoriser, puis réessayez.", { duration: 12000 });
                }}
                className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium"
              >
                Comment activer
              </button>
              <button onClick={() => toast.dismiss(toastId)} className="text-xs text-muted-foreground px-2 py-1.5">
                Fermer
              </button>
            </div>
          </div>,
          { duration: 15000 }
        );
      } else {
        toast.error("📍 Impossible d'obtenir la position. Vérifiez que le GPS est activé sur votre appareil.", { duration: 6000 });
      }
    }
  };

  // Force free model in normal mode
  const effectiveModel = FREE_MODELS.includes(aiModel) ? aiModel : "google/gemini-3-flash-preview";

  const send = useCallback(async (retryContent?: string) => {
    const trimmed = retryContent || input.trim();
    if (!trimmed && !imagePreview) return;
    if (isLoading) return;

    // PROBATION RESTRICTIONS — vérification persistée côté serveur (RPC).
    // Le serveur applique aussi la limite à l'envoi : aucune triche possible
    // même après redémarrage / nouvelle conversation.
    if (accountStatus === "probation" && !isOwner && user?.id) {
      try {
        const { data: q } = await supabase.rpc("get_probation_quota", { _user_id: user.id });
        const used = (q as any)?.used ?? 0;
        const limit = (q as any)?.limit ?? 10;
        const status = (q as any)?.status;
        if (status === "banned") {
          toast.error("⛔ Compte banni. Aucun message ne peut être envoyé.", { icon: "🚫" });
          return;
        }
        if (status === "probation" && used >= limit) {
          toast.error(`⚖️ Probation : limite de ${limit} messages/jour atteinte. Réessayez demain.`, { icon: "🔒" });
          return;
        }
      } catch (e) {
        // Si la RPC échoue, on laisse passer côté client : le serveur appliquera la règle.
        console.warn("get_probation_quota failed", e);
      }
    }

    // PRO UPSELL: After 160-200 messages, suggest upgrading (owners exempt)
    if (!isOwner) {
      const totalMessages = messages.length;
      const PRO_THRESHOLD = 160;
      if (totalMessages >= PRO_THRESHOLD && totalMessages % 20 === 0) {
        toast(
          "🌟 Vous adorez Marv-IA ! Passez en mode Pro pour un accès illimité, un IDE premium, la génération d'images HD et bien plus !",
          { duration: 8000, icon: "👑" }
        );
      }
      if (totalMessages >= 200) {
        toast.error(
          "🔒 Limite atteinte ! Passez au mode Pro pour continuer cette conversation avec des fonctionnalités premium.",
          { duration: 10000, icon: "👑" }
        );
        return;
      }
    }

    // Image generation detection
    const imageNouns = "image|photo|illustration|logo|dessin|picture|artwork|affiche|poster|icon|icône|bannière|banner|portrait|avatar|fond|wallpaper|graphique|graphic|visuel|visual|schéma|schema|infographie|mockup|maquette|art|peinture|painting|sketch|croquis|thumbnail|miniature|cover|couverture|sticker|emoji|mascotte|personnage|character|scene|scène|paysage|landscape";
    const imageVerbs = "génère|genere|dessine|crée|cree|créer|imagine|fais|fait|génére|generate|draw|create|make|illustre|montre|affiche|produis|conçois|fabrique|peins|trace|compose|réalise|realise|rends|render|design|sketch|craft|show|représente|visualise|modélise|sculpte";
    const imageKeywords = new RegExp(`^(${imageVerbs})\\s.{0,20}(${imageNouns})`, "i");
    const directObjectKeywords = new RegExp(`^(je veux|j'aimerais|j'ai besoin d'?|donne|montre|peux-tu|tu peux|peut-tu|pourrais-tu|est-ce que tu peux|tu pourrais)\\s.{0,30}(${imageNouns})`, "i");
    const nounFirstPattern = new RegExp(`^(un|une|le|la|des|du|mon|ma|mes|notre|nos|votre|vos|ton|ta|tes)\\s+(${imageNouns})\\b`, "i");
    const containsImageNoun = new RegExp(`(${imageNouns})`, "i");
    const imageActionVerbs = new RegExp(`(${imageVerbs})`, "i");
    const isExplicitCmd = trimmed.toLowerCase().startsWith("/image ") || trimmed.toLowerCase().startsWith("/img ");
    const isImageGen = isExplicitCmd || imageKeywords.test(trimmed) || directObjectKeywords.test(trimmed) || nounFirstPattern.test(trimmed) || (containsImageNoun.test(trimmed) && imageActionVerbs.test(trimmed));
    // Block images during probation (unless owner)
    if (isImageGen && accountStatus === "probation" && !isOwner) {
      toast.error("⚖️ Probation : génération d'images désactivée.", { icon: "🔒" });
      return;
    }
    if (isImageGen && credits <= 0) {
      toast.error("Crédits épuisés ! Revenez demain.", { icon: "⚡" });
      return;
    }

    const isSearch = deepResearch || trimmed.toLowerCase().startsWith("/search ") || trimmed.toLowerCase().startsWith("/s ");

    let currentConvId = conversationId;
    if (!currentConvId && user) {
      const title = (isSearch ? "🔍 " : "") + (trimmed.slice(0, 50) || "Nouvelle conversation");
      const { data } = await createConversation(user.id, title);
      if (data) { currentConvId = data.id; onConversationCreated(data.id); }
    }

    const userMsgId = crypto.randomUUID();
    const userContent = trimmed || (imagePreview ? " " : "");
    
    if (!retryContent) {
      const userMsg: UIMessage = { id: userMsgId, role: "user", content: userContent, image_url: imagePreview || undefined };
      setMessages(prev => [...prev, userMsg]);
      setInput("");
    }
    
    const sentImage = imagePreview;
    setImagePreview(null);
    userScrolledRef.current = false; // Reset scroll lock on new message

    if (currentConvId && user && !retryContent) saveMessage(currentConvId, user.id, "user", userContent, sentImage || undefined);

    setIsLoading(true);
    setIsStreaming(true);

    // Image generation
    if (isImageGen) {
      const ok = await onConsumeCredit();
      if (!ok) { setIsLoading(false); setIsStreaming(false); toast.error("Crédits épuisés !"); return; }
      let prompt = trimmed.replace(/^\/(image|img)\s+/i, "");
      prompt = prompt.replace(/^(génère|genere|dessine|crée|cree|créer|imagine|fais|fait|génére|generate|draw|create|make|illustre|montre|affiche|produis|conçois|fabrique|peins|trace|compose|réalise|realise|rends|render|design|sketch|craft|show|représente|visualise|je veux|j'aimerais|peux-tu|tu peux|peut-tu|pourrais-tu|est-ce que tu peux)\s*([-]?\s*(moi|me|nous))?\s*/i, "").trim();
      if (!prompt || prompt.length < 3) prompt = trimmed;
      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "🎨 Génération en cours..." }]);
      const result = await generateImage(prompt);
      if (result.error) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `❌ ${result.error}`, error: true, retryPayload: trimmed } : m));
      } else if (result.imageUrl) {
        const content = result.text || "Image générée ✨";
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content, image_url: result.imageUrl } : m));
        if (currentConvId && user) saveMessage(currentConvId, user.id, "assistant", content, result.imageUrl);
      }
      setIsLoading(false);
      setIsStreaming(false);
      onRefreshCredits();
      return;
    }

    let assistantSoFar = "";
    const assistantId = crypto.randomUUID();

    if (isSearch) {
      const rawQuery = trimmed.replace(/^\/(search|s)\s+/i, "");
      const searchQuery = deepResearch
        ? `MODE DEEP RESEARCH (raisonnement étendu, multimodal) — Effectue une recherche approfondie sur le web, croise au moins 3 sources fiables et récentes, puis produis une synthèse structurée et nuancée. Format attendu :\n1. **Réponse synthétique** (2-4 phrases)\n2. **Analyse détaillée** (sections claires, comparaisons, chiffres clés)\n3. **Points de divergence** entre sources si pertinent\n4. **Sources vérifiées** (liste numérotée avec titre + URL)\n\nQuestion : ${rawQuery}`
        : rawQuery;
      await streamSearch({
        query: searchQuery,
        location: locationActive ? location : null,
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.id === assistantId) return prev.map(m => m.id === assistantId ? { ...m, content: assistantSoFar } : m);
            return [...prev, { id: assistantId, role: "assistant", content: assistantSoFar }];
          });
        },
        onDone: () => {
          setIsLoading(false);
          setIsStreaming(false);
          if (currentConvId && user && assistantSoFar) saveMessage(currentConvId, user.id, "assistant", assistantSoFar);
          if (voiceEnabled && assistantSoFar) speak(assistantSoFar.replace(/[#*_`]/g, "").slice(0, 500), voiceTone);
          if (assistantSoFar) notifyIfHidden("Marv-IA 🔍", assistantSoFar.replace(/[#*_`]/g, "").slice(0, 120));
        },
        onError: (err) => {
          setIsLoading(false);
          setIsStreaming(false);
          setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: `❌ Erreur de connexion. ${err}`, error: true, retryPayload: trimmed }]);
        },
      });
      return;
    }

    const apiMessages: any[] = messages.filter(m => !m.error).map(m => ({ role: m.role, content: m.content }));

    if (sentImage) {
      apiMessages.push({ role: "user", content: [{ type: "image_url", image_url: { url: sentImage } }, { type: "text", text: trimmed || "Analyse cette image." }] });
    } else {
      let stylePrefix = "";
      if (responseStyle === "precise") stylePrefix = "[Réponds de manière concise et précise] ";
      else if (responseStyle === "creative") stylePrefix = "[Réponds de manière détaillée et créative] ";
      if (locationActive && location) stylePrefix += `[Position: ${location.latitude}, ${location.longitude}] `;
      apiMessages.push({ role: "user", content: stylePrefix + trimmed });
    }

    const apiStartTime = performance.now();
    let firstChunkTime = 0;

    // Track latency history for rolling average
    const mon = (window as any).__marviaMonitoring || {};
    if (!mon.latencyHistory) mon.latencyHistory = [];

    const controller = new AbortController();
    abortControllerRef.current = controller;

    await streamChat({
      messages: apiMessages,
      model: effectiveModel,
      userId: user?.id,
      userEmail: user?.email,
      personaInstructions: activePersona?.system_instructions || undefined,
      signal: controller.signal,
      onDelta: (chunk) => {
        if (!firstChunkTime) {
          firstChunkTime = performance.now();
          const latency = Math.round(firstChunkTime - apiStartTime);
          mon.latencyHistory.push(latency);
          if (mon.latencyHistory.length > 5) mon.latencyHistory.shift();
          const avgLatency = Math.round(mon.latencyHistory.reduce((a: number, b: number) => a + b, 0) / mon.latencyHistory.length);
          (window as any).__marviaMonitoring = {
            ...mon,
            latency: avgLatency,
            lastLatency: latency,
            promptTokens: Math.round(JSON.stringify(apiMessages).length / 4),
          };
        }
        assistantSoFar += chunk;
        const cleaned = assistantSoFar
          .replace(/\[\[IMPERSONATION_ATTEMPT\]\]/g, "")
          .replace(/\[\[OWNER_CLAIM_ATTEMPT\]\]/g, "")
          .trimEnd();
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.id === assistantId) return prev.map(m => m.id === assistantId ? { ...m, content: cleaned } : m);
          return [...prev, { id: assistantId, role: "assistant", content: cleaned }];
        });
      },
      onDone: () => {
        setIsLoading(false);
        setIsStreaming(false);
        const ownerClaimDetected = /\[\[OWNER_CLAIM_ATTEMPT\]\]/.test(assistantSoFar);
        const impersonationDetected = ownerClaimDetected || /\[\[IMPERSONATION_ATTEMPT\]\]/.test(assistantSoFar);
        const cleaned = assistantSoFar
          .replace(/\[\[IMPERSONATION_ATTEMPT\]\]/g, "")
          .replace(/\[\[OWNER_CLAIM_ATTEMPT\]\]/g, "")
          .trim();
        (window as any).__marviaMonitoring = {
          ...((window as any).__marviaMonitoring || {}),
          responseTokens: Math.round(cleaned.length / 4),
        };
        if (currentConvId && user && cleaned) {
          saveMessage(currentConvId, user.id, "assistant", cleaned);
          setMessages(prev => {
            convCache.set(currentConvId!, prev as any);
            return prev;
          });
        }
        if (voiceEnabled && cleaned) speak(cleaned.replace(/[#*_`]/g, "").slice(0, 500), voiceTone);
        if (cleaned) notifyIfHidden("Marv-IA", cleaned.replace(/[#*_`]/g, "").slice(0, 120));
        if (user && cleaned) {
          const recentMsgs = [...apiMessages.slice(-4), { role: "assistant" as const, content: cleaned }];
          extractMemories(user.id, recentMsgs);
        }
        if (impersonationDetected && user) {
          (async () => {
            try {
              const { data } = await supabase.rpc("record_impersonation_strike", {
                _user_id: user.id,
                _claimed_owner: ownerClaimDetected,
              } as any);
              const result = (data || {}) as { strike_count?: number; banned?: boolean; contestable?: boolean };
              const count = result.strike_count ?? 0;
              const banned = result.banned ?? false;
              const contestable = result.contestable ?? true;
              if (banned) {
                toast.error(contestable ? "⛔ Compte banni automatiquement" : "⛔ Compte banni DÉFINITIVEMENT — non contestable", {
                  description: contestable
                    ? "5 tentatives d'usurpation détectées. Bannissement immédiat — vous pouvez contester."
                    : "5 tentatives de vous faire passer pour le propriétaire. Aucune contestation possible.",
                  duration: 12000,
                });
                window.location.reload();
              } else {
                const remaining = Math.max(0, 5 - count);
                toast.error(`⚠️ ${ownerClaimDetected ? "Prétention de propriété" : "Tentative d'usurpation"} #${count}/5`, {
                  description: ownerClaimDetected
                    ? `Tu n'es pas le propriétaire de Marv-IA. ${remaining} tentative${remaining > 1 ? "s" : ""} avant bannissement DÉFINITIF non contestable.`
                    : `${remaining} tentative${remaining > 1 ? "s" : ""} avant bannissement automatique.`,
                  duration: 9000,
                });
              }
              window.dispatchEvent(new CustomEvent("marvia:impersonation-attempt", { detail: { count, banned } }));
            } catch (e) {
              console.error("strike rpc failed", e);
              window.dispatchEvent(new CustomEvent("marvia:impersonation-attempt"));
            }
          })();
          try { sessionStorage.removeItem("identity_warning_dismissed_v1"); } catch { /* ignore */ }
        }
      },
      onError: (err) => {
        setIsLoading(false);
        setIsStreaming(false);
        setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: `❌ Erreur de connexion, veuillez réessayer.`, error: true, retryPayload: trimmed }]);
      },
    });
  }, [input, imagePreview, isLoading, conversationId, user, messages, effectiveModel, responseStyle, voiceEnabled, voiceTone, speak, onConversationCreated, location, locationActive, credits, onConsumeCredit, onRefreshCredits, notifyIfHidden]);

  const handleRetry = (payload: string) => {
    setMessages(prev => prev.filter(m => !m.error));
    send(payload);
  };

  const handleStopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const handleEditMessage = useCallback((msgId: string, content: string) => {
    setEditingMessageId(msgId);
    setEditingContent(content.replace(/\[Image envoyée\]\n?/, ""));
  }, []);

  const handleSaveEdit = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    // Remove all messages after the edited one and resend
    const trimmedMessages = messages.slice(0, idx);
    setMessages(trimmedMessages);
    setEditingMessageId(null);
    setInput(editingContent);
    setEditingContent("");
  }, [messages, editingContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Extract code blocks for download buttons
  const extractCodeBlocks = (content: string): { lang: string; code: string }[] => {
    const blocks: { lang: string; code: string }[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({ lang: match[1] || "txt", code: match[2].trim() });
    }
    return blocks;
  };

  const lastAssistantMsg = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === "assistant");
    return assistantMsgs[assistantMsgs.length - 1]?.content || "";
  }, [messages]);

  const handleBlockAction = useCallback((action: "simplify" | "deepen" | "variant", blockContent: string) => {
    const prompts = {
      simplify: `Simplifie ce passage de manière concise :\n\n${blockContent}`,
      deepen: `Approfondis et explique en détail ce passage :\n\n${blockContent}`,
      variant: `Propose une reformulation alternative de ce passage :\n\n${blockContent}`,
    };
    setInput(prompts[action]);
    inputRef.current?.focus();
  }, []);

  return (
    <EmotionalGlow isGenerating={isLoading} lastAssistantMessage={lastAssistantMsg} className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 pt-2 pb-4 space-y-3">
        {isLoadingHistory && messages.length === 0 && <MessageSkeleton count={4} />}
        {!isLoadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-60 space-y-3">
            <Sparkles className="w-12 h-12 text-primary" />
            <p className="text-lg font-semibold text-foreground">Marv-IA</p>
            <p className="text-sm text-muted-foreground text-center max-w-[260px]">Posez votre question, Marv-IA est à votre service.</p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const isLastAssistant = msg.role === "assistant" && idx === messages.length - 1;
          const showCursor = isLastAssistant && isStreaming;
          const codeBlocks = msg.role === "assistant" ? extractCodeBlocks(msg.content) : [];
          
          return (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}>
              <div className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-secondary text-secondary-foreground rounded-bl-md"
              }`}>
                {/* User image */}
                {msg.image_url && msg.role === "user" && (
                  <img src={msg.image_url} alt="Image" className="rounded-lg mb-2 max-w-full max-h-64 object-contain shadow-[0_0_12px_hsl(var(--primary)/0.3)]" />
                )}
                {msg.image_url && msg.role === "assistant" && (
                  <ImageBubble src={msg.image_url} />
                )}

                {/* Editing mode for user messages */}
                {msg.role === "user" && editingMessageId === msg.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      className="w-full bg-primary-foreground/10 text-primary-foreground rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(msg.id)} className="text-xs bg-primary-foreground/20 text-primary-foreground px-3 py-1 rounded-lg font-medium">
                        <Check className="w-3 h-3 inline mr-1" />Renvoyer
                      </button>
                      <button onClick={() => setEditingMessageId(null)} className="text-xs text-primary-foreground/60 px-2 py-1">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Document Canvas for long responses */}
                    {(() => {
                      const { action: gAction, cleaned } = msg.role === "assistant" && !msg.error
                        ? extractGoogleAction(msg.content)
                        : { action: null, cleaned: msg.content };
                      const displayContent = cleaned;
                      return (
                        <>
                          {msg.role === "assistant" && !msg.error && shouldUseCanvas(displayContent) ? (
                            <DocumentCanvas content={displayContent} onBlockAction={handleBlockAction} />
                          ) : (
                            <div className={`prose prose-sm prose-invert max-w-none break-words text-[15px] leading-relaxed [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:rounded-lg [&_pre]:bg-background/50 [&_pre]:p-3 [&_pre]:text-xs [&_code]:break-all [&_pre_code]:break-normal [&_pre_code]:whitespace-pre-wrap [&_pre]:my-2 overflow-hidden ${showCursor ? "streaming-cursor" : ""}`}>
                              <ReactMarkdown>{displayContent}</ReactMarkdown>
                            </div>
                          )}
                          {gAction && !isStreaming && <GoogleActionRunner action={gAction} />}
                        </>
                      );
                    })()}
                  </>
                )}

                {/* Smart Visualizer */}
                {msg.role === "assistant" && !msg.error && !isStreaming && detectVisualizableContent(msg.content) && (
                  <SmartVisualizer content={msg.content} />
                )}

                {/* Error retry button */}
                {msg.error && msg.retryPayload && (
                  <button
                    onClick={() => handleRetry(msg.retryPayload)}
                    className="flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline font-medium"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Réessayer
                  </button>
                )}

                {/* Code block download buttons */}
                {codeBlocks.length > 0 && !msg.error && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-1.5 border-t border-border/30">
                    {codeBlocks.map((block, i) => (
                      <button
                        key={i}
                        onClick={() => downloadCode(block.code, block.lang)}
                        className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-md hover:bg-primary/20 transition-colors font-medium"
                      >
                        <Download className="w-2.5 h-2.5" />
                        .{block.lang}
                      </button>
                    ))}
                  </div>
                )}

                {/* Edit button for user messages */}
                {msg.role === "user" && !isLoading && editingMessageId !== msg.id && (
                  <div className="flex justify-end mt-1 -mb-0.5">
                    <button onClick={() => handleEditMessage(msg.id, msg.content)} className="text-primary-foreground/50 hover:text-primary-foreground transition-colors p-0.5">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {msg.role === "assistant" && !msg.error && (
                  <div className="flex gap-2 mt-1.5 -mb-0.5">
                    <button onClick={() => handleCopy(msg.content, msg.id)} className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                      {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleShare(msg.content)} className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    {voiceEnabled && (
                      <button onClick={() => speak(msg.content.replace(/[#*_`]/g, "").slice(0, 500), voiceTone)} className="text-muted-foreground hover:text-primary transition-colors p-0.5">
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!user) return;
                        if (accountStatus === "probation" && !isOwner) {
                          toast.error("⚖️ Probation : signalements désactivés.", { icon: "🔒" });
                          return;
                        }
                        const { error } = await reportContent(user.id, msg.content, "inappropriate", conversationId || undefined);
                        if (error) toast.error("Erreur lors du signalement");
                        else toast.success("⚠️ Contenu signalé. Merci !", { duration: 3000 });
                      }}
                      className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                      title="Signaler ce contenu"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start animate-slide-up">
            <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-primary rounded-full" style={{ animation: "typing-dot 1.4s infinite 0s" }} />
                <span className="w-2 h-2 bg-primary rounded-full" style={{ animation: "typing-dot 1.4s infinite 0.2s" }} />
                <span className="w-2 h-2 bg-primary rounded-full" style={{ animation: "typing-dot 1.4s infinite 0.4s" }} />
              </div>
            </div>
          </div>
        )}
        {/* Stop generation button */}
        {isStreaming && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleStopGeneration}
              className="flex items-center gap-1.5 px-4 py-2 bg-secondary border border-border rounded-full text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              Arrêter la génération
            </button>
          </div>
        )}
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-3 pb-1">
          <div className="relative inline-block">
            <img src={imagePreview} alt="Preview" className="h-16 rounded-lg border border-border" />
            <button onClick={() => setImagePreview(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center">×</button>
          </div>
        </div>
      )}

      {/* Location indicator */}
      {locationActive && (
        <div className="px-3 pb-1">
          <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
            <MapPin className="w-3 h-3" /> Position activée
            <button onClick={() => setLocationActive(false)} className="ml-1 hover:text-destructive">×</button>
          </span>
        </div>
      )}

      {/* Input bar */}
      <div className="px-3 pb-3 safe-bottom">
        <div className="flex items-end gap-1.5 bg-secondary rounded-2xl px-3 py-2 border border-border">
          <label className="cursor-pointer text-muted-foreground hover:text-primary transition-colors flex-shrink-0 self-end pb-1">
            <ImagePlus className="w-5 h-5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
          <label className="cursor-pointer text-muted-foreground hover:text-primary transition-colors flex-shrink-0 self-end pb-1" title="Joindre un fichier">
            <Paperclip className="w-5 h-5" />
            <input type="file" accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.rb,.go,.rs,.sql,.yaml,.yml,.toml,.ini,.log,.sh,.bat,.pdf,.zip,image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={handleCamera} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0 self-end pb-1">
            <Camera className="w-5 h-5" />
          </button>
          <button onClick={handleLocation} className={`flex-shrink-0 self-end pb-1 transition-colors ${locationActive ? "text-primary" : "text-muted-foreground hover:text-primary"}`}>
            <MapPin className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setDeepResearch(v => !v); toast.success(deepResearch ? "Deep Research désactivé" : "🔬 Deep Research activé — synthèse multi-sources vérifiées"); }}
            title="Deep Research multimodale (raisonnement étendu)"
            className={`flex-shrink-0 self-end pb-1 transition-colors ${deepResearch ? "text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.7)]" : "text-muted-foreground hover:text-primary"}`}
          >
            <Search className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/search news • /image prompt • Message..."
            rows={1}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-[15px] max-h-32 py-1 select-text"
            style={{ minHeight: "24px" }}
          />
          <button onClick={handleVoice} className={`flex-shrink-0 self-end pb-1 transition-colors ${isListening ? "text-destructive" : "text-muted-foreground hover:text-primary"}`}>
            {isListening ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={() => send()} disabled={isLoading || (!input.trim() && !imagePreview)} className="flex-shrink-0 self-end pb-0.5 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity active-glow">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </EmotionalGlow>
  );
}
