import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Mic, ImagePlus, Copy, Check, StopCircle, Volume2, Share2, Crown, ArrowLeft, Sparkles, Image as ImageIcon, Camera, MapPin, Search, Brain, Zap, Rocket, Menu, Trash2, MessageSquarePlus, X, Square, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import ImageBubble from "@/components/ImageBubble";
import { streamChat, streamSearch, generateImage, saveMessage, createConversation, getMessages, type ChatMessage } from "@/lib/marvia-api";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useVoice } from "@/hooks/useVoice";
import { useLocation } from "@/hooks/useLocation";
import { useCamera } from "@/hooks/useCamera";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "sonner";
import EmotionalGlow from "@/components/visual-suite/EmotionalGlow";
import DocumentCanvas, { shouldUseCanvas } from "@/components/visual-suite/DocumentCanvas";
import SmartVisualizer, { detectVisualizableContent } from "@/components/visual-suite/SmartVisualizer";

type UIMessage = ChatMessage & { id: string; isGeneratedImage?: boolean };

interface ProConversation {
  id: string;
  title: string;
  updated_at: string;
  is_pro: boolean;
}

interface ProChatViewProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  credits: number;
  onConsumeCredit: () => Promise<boolean>;
  onRefreshCredits: () => void;
  onBack: () => void;
  activePersona?: { id: string; name: string; system_instructions: string; theme_color: string } | null;
  planId?: "starter" | "pro" | "ultra";
  proConversations?: ProConversation[];
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  onDeleteConversation?: (id: string) => void;
}

// Plan-specific configurations
const PLAN_CONFIG = {
  starter: {
    model: "google/gemini-2.5-flash",
    label: "Starter",
    modelLabel: "Gemini 2.5 Flash",
    icon: Zap,
    accentColor: "#3B82F6",
    gradientFrom: "from-blue-500",
    gradientTo: "to-cyan-500",
    bgClass: "bg-[hsl(220,25%,6%)]",
    cardClass: "bg-[hsl(220,20%,10%)]",
    borderClass: "border-blue-500/20",
    accentClass: "text-blue-400",
    mutedClass: "text-[hsl(220,10%,50%)]",
    fgClass: "text-[hsl(220,10%,92%)]",
    userBubble: "bg-gradient-to-br from-blue-500 to-cyan-500 text-white",
    aiBubble: "bg-[hsl(220,20%,12%)] text-[hsl(220,10%,90%)] border border-blue-500/10",
    emptyIcon: Zap,
    emptyTitle: "Mode Starter",
    emptySubtitle: "Gemini 2.5 Flash • Réponses rapides",
  },
  pro: {
    model: "google/gemini-2.5-pro",
    label: "Pro",
    modelLabel: "Gemini 2.5 Pro",
    icon: Crown,
    accentColor: "#F59E0B",
    gradientFrom: "from-amber-500",
    gradientTo: "to-orange-500",
    bgClass: "bg-[hsl(240,15%,6%)]",
    cardClass: "bg-[hsl(240,12%,10%)]",
    borderClass: "border-amber-500/20",
    accentClass: "text-amber-400",
    mutedClass: "text-[hsl(240,5%,45%)]",
    fgClass: "text-[hsl(45,10%,92%)]",
    userBubble: "bg-gradient-to-br from-amber-500 to-orange-500 text-white",
    aiBubble: "bg-[hsl(240,12%,12%)] text-[hsl(45,10%,90%)] border border-amber-500/10",
    emptyIcon: Crown,
    emptyTitle: "Marv-IA Pro",
    emptySubtitle: "Gemini 2.5 Pro • Raisonnement avancé • Génération d'images",
  },
  ultra: {
    model: "google/gemini-2.5-pro",
    label: "Ultra",
    modelLabel: "Gemini 2.5 Pro Max",
    icon: Rocket,
    accentColor: "#A855F7",
    gradientFrom: "from-purple-500",
    gradientTo: "to-pink-500",
    bgClass: "bg-[hsl(270,20%,5%)]",
    cardClass: "bg-[hsl(270,15%,9%)]",
    borderClass: "border-purple-500/20",
    accentClass: "text-purple-400",
    mutedClass: "text-[hsl(270,10%,50%)]",
    fgClass: "text-[hsl(270,10%,92%)]",
    userBubble: "bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 text-white shadow-lg shadow-purple-500/20",
    aiBubble: "bg-gradient-to-br from-[hsl(270,15%,11%)] to-[hsl(290,15%,11%)] text-[hsl(270,10%,92%)] border border-purple-500/15 shadow-lg shadow-purple-500/5",
    emptyIcon: Rocket,
    emptyTitle: "Marv-IA Ultra",
    emptySubtitle: "Tous les modèles • Puissance illimitée • Workspace complet",
  },
};

export default function ProChatView({ conversationId, onConversationCreated, credits, onConsumeCredit, onRefreshCredits, onBack, activePersona, planId = "pro", proConversations = [], onSelectConversation, onNewConversation, onDeleteConversation }: ProChatViewProps) {
  const { user, isOwner } = useAuth();
  const { voiceEnabled, voiceTone, responseStyle } = useSettings();
  const { speak, startListening } = useVoice();
  const { location, requestLocation } = useLocation();
  const { capture } = useCamera();
  const { notifyIfHidden } = useNotifications();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [locationActive, setLocationActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const config = PLAN_CONFIG[planId];
  const PlanIcon = config.icon;

  useEffect(() => {
    if (conversationId) {
      getMessages(conversationId).then(({ data }) => {
        if (data) setMessages(data.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: (m.content || "").replace(/^\[Image envoyée\]\n?/, ""), image_url: m.image_url || undefined })));
      });
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copié !");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (text: string) => {
    const cleanText = text.replace(/[#*_`]/g, "").slice(0, 1000);
    if (navigator.share) {
      try { await navigator.share({ title: `Marv-IA ${config.label}`, text: cleanText }); } catch {}
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
    if (locationActive) { setLocationActive(false); toast("📍 Localisation désactivée"); return; }
    toast("📍 Demande d'accès à votre position...", { duration: 3000 });
    const loc = await requestLocation();
    if (loc) {
      setLocationActive(true);
      toast.success(`📍 Position activée !`, { duration: 4000 });
    } else {
      toast.error("📍 Accès refusé.", { duration: 6000 });
    }
  };

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed && !imagePreview) return;
    if (isLoading) return;

    const isImageGen = trimmed.toLowerCase().startsWith("/image ") || trimmed.toLowerCase().startsWith("/img ");

    // Owners have unlimited credits
    if (!isOwner) {
      if (credits <= 0) {
        toast.error("Crédits Pro épuisés ! Revenez demain ou passez en mode gratuit.", { icon: "⚡" });
        return;
      }
      const success = await onConsumeCredit();
      if (!success) { toast.error("Crédits Pro épuisés !", { icon: "⚡" }); return; }
    }

    let currentConvId = conversationId;
    if (!currentConvId && user) {
      const planEmoji = planId === "ultra" ? "🚀" : planId === "starter" ? "⚡" : "👑";
      const title = `${planEmoji} ${trimmed.slice(0, 45)}` || `${planEmoji} Conversation ${config.label}`;
      const { data } = await createConversation(user.id, title, true);
      if (data) { currentConvId = data.id; onConversationCreated(data.id); }
    }

    const userMsgId = crypto.randomUUID();
    const userContent = trimmed || (imagePreview ? " " : "");
    const userMsg: UIMessage = { id: userMsgId, role: "user", content: userContent, image_url: imagePreview || undefined };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    const sentImage = imagePreview;
    setImagePreview(null);

    if (currentConvId && user) saveMessage(currentConvId, user.id, "user", userContent, sentImage || undefined);

    if (isImageGen) {
      setIsLoading(true);
      const prompt = trimmed.replace(/^\/(image|img)\s+/i, "");
      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "🎨 Génération en cours...", isGeneratedImage: true }]);
      const result = await generateImage(prompt);
      if (result.error) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `❌ ${result.error}` } : m));
      } else if (result.imageUrl) {
        const content = result.text || "Image générée :";
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content, image_url: result.imageUrl } : m));
        if (currentConvId && user) saveMessage(currentConvId, user.id, "assistant", content, result.imageUrl);
      }
      setIsLoading(false);
      onRefreshCredits();
      return;
    }

    const isSearch = trimmed.toLowerCase().startsWith("/search ") || trimmed.toLowerCase().startsWith("/s ");
    if (isSearch) {
      setIsLoading(true);
      const searchQuery = trimmed.replace(/^\/(search|s)\s+/i, "");
      let assistantSoFar = "";
      const assistantId = crypto.randomUUID();
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
          if (currentConvId && user && assistantSoFar) saveMessage(currentConvId, user.id, "assistant", assistantSoFar);
          if (assistantSoFar) notifyIfHidden("Marv-IA 🔍", assistantSoFar.replace(/[#*_`]/g, "").slice(0, 120));
          onRefreshCredits();
        },
        onError: (err) => {
          setIsLoading(false);
          toast.error(err);
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `❌ ${err}` }]);
        },
      });
      return;
    }

    setIsLoading(true);
    setIsStreaming(true);
    let assistantSoFar = "";
    const assistantId = crypto.randomUUID();
    const apiMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }));

    if (sentImage) {
      apiMessages.push({ role: "user", content: [{ type: "image_url", image_url: { url: sentImage } }, { type: "text", text: trimmed || "Analyse cette image." }] });
    } else {
      let stylePrefix = "";
      if (responseStyle === "precise") stylePrefix = "[Réponds de manière concise et précise] ";
      else if (responseStyle === "creative") stylePrefix = "[Réponds de manière détaillée et créative] ";
      if (locationActive && location) stylePrefix += `[Position: ${location.latitude}, ${location.longitude}] `;
      apiMessages.push({ role: "user", content: stylePrefix + trimmed });
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    await streamChat({
      messages: apiMessages,
      model: config.model,
      personaInstructions: activePersona?.system_instructions || undefined,
      signal: controller.signal,
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
        if (assistantSoFar) notifyIfHidden(`Marv-IA ${config.label} 👑`, assistantSoFar.replace(/[#*_`]/g, "").slice(0, 120));
        onRefreshCredits();
      },
      onError: (err) => {
        setIsLoading(false);
        setIsStreaming(false);
        toast.error(err);
        setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: `❌ ${err}` }]);
      },
    });
  }, [input, imagePreview, isLoading, conversationId, user, messages, responseStyle, voiceEnabled, voiceTone, speak, onConversationCreated, credits, onConsumeCredit, onRefreshCredits, location, locationActive, activePersona, config, planId, isOwner]);

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
    setMessages(messages.slice(0, idx));
    setEditingMessageId(null);
    setInput(editingContent);
    setEditingContent("");
  }, [messages, editingContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Plan-specific empty state
  const EmptyIcon = config.emptyIcon;

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
  }, []);

  return (
    <EmotionalGlow isGenerating={isLoading} lastAssistantMessage={lastAssistantMsg} className={`flex flex-col h-full ${config.bgClass}`}>
      {/* Pro Sidebar Drawer */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed top-0 left-0 h-full w-72 z-50 transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} flex flex-col border-r`} style={{ backgroundColor: `hsl(${planId === "ultra" ? "270,20%,8%" : planId === "starter" ? "220,25%,8%" : "240,15%,8%"})`, borderColor: `${config.accentColor}20` }}>
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: `${config.accentColor}20` }}>
          <div className="flex items-center gap-2">
            <PlanIcon className="w-5 h-5" style={{ color: config.accentColor }} />
            <span className="font-bold" style={{ color: config.accentColor }}>Pro — {config.label}</span>
          </div>
          <button onClick={() => { onNewConversation?.(); setSidebarOpen(false); }} className="p-2 rounded-lg transition-colors" style={{ color: config.accentColor }}>
            <MessageSquarePlus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
          {proConversations.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: `${config.accentColor}80` }}>Aucune conversation Pro</p>
          )}
          {proConversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => { onSelectConversation?.(conv.id); setSidebarOpen(false); }}
              className={`flex items-center justify-between px-4 py-3 mx-2 rounded-lg cursor-pointer transition-colors group ${conversationId === conv.id ? "border" : "hover:bg-white/5"}`}
              style={conversationId === conv.id ? { backgroundColor: `${config.accentColor}15`, borderColor: `${config.accentColor}30` } : undefined}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: config.accentColor }} />
                <span className="text-sm truncate" style={{ color: "hsl(45,10%,88%)" }}>{conv.title}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteConversation?.(conv.id); }}
                className="opacity-0 group-hover:opacity-100 transition-all p-1 hover:text-red-400"
                style={{ color: `${config.accentColor}60` }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${config.cardClass} border-b ${config.borderClass} flex-shrink-0`}>
        <button onClick={() => setSidebarOpen(true)} className={`${config.accentClass} hover:opacity-80 transition-opacity`}>
          <Menu className="w-5 h-5" />
        </button>
        <button onClick={onBack} className={`${config.accentClass} hover:opacity-80 transition-opacity`}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: activePersona ? `${activePersona.theme_color}26` : `${config.accentColor}26` }}>
            {activePersona ? (
              <span className="text-xs font-bold" style={{ color: activePersona.theme_color }}>{activePersona.name[0]?.toUpperCase()}</span>
            ) : (
              <PlanIcon className="w-4 h-4" style={{ color: config.accentColor }} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className={`text-sm font-bold ${config.fgClass} leading-tight`}>{activePersona ? activePersona.name : `Marv-IA ${config.label}`}</p>
              {activePersona && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border" style={{ color: activePersona.theme_color, borderColor: `${activePersona.theme_color}40`, backgroundColor: `${activePersona.theme_color}15` }}>
                  <Brain className="w-2.5 h-2.5 inline mr-0.5" />
                  Persona
                </span>
              )}
            </div>
            <p className={`text-[11px] ${config.accentClass} leading-tight`}>{config.modelLabel}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border`} style={{ backgroundColor: `${config.accentColor}15`, borderColor: `${config.accentColor}30` }}>
          <PlanIcon className="w-3.5 h-3.5" style={{ color: config.accentColor }} />
          <span className="text-xs font-bold" style={{ color: config.accentColor }}>{isOwner ? "∞" : credits}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 pt-2 pb-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border ${planId === "ultra" ? "bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-rose-500/20 border-purple-500/30 shadow-xl shadow-purple-500/10" : ""}`} style={{ backgroundColor: planId !== "ultra" ? `${config.accentColor}15` : undefined, borderColor: planId !== "ultra" ? `${config.accentColor}30` : undefined }}>
              <EmptyIcon className="w-10 h-10" style={{ color: config.accentColor }} />
            </div>
            <div className="text-center space-y-2">
              <p className={`text-xl font-bold ${config.fgClass}`}>{config.emptyTitle}</p>
              <p className={`text-sm ${config.mutedClass} max-w-[280px]`}>{config.emptySubtitle}</p>
            </div>
            <div className="flex gap-2">
              {[
                { icon: <Sparkles className="w-3.5 h-3.5" />, label: "Raisonnement" },
                { icon: <ImageIcon className="w-3.5 h-3.5" />, label: "Images" },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border" style={{ color: config.accentColor, borderColor: `${config.accentColor}30`, backgroundColor: `${config.accentColor}15` }}>
                  {f.icon}
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}>
            <div className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 ${
              msg.role === "user"
                ? `${config.userBubble} rounded-br-md`
                : `${config.aiBubble} rounded-bl-md`
            }`}>
              {msg.image_url && msg.role === "user" && (
                <img src={msg.image_url} alt="Image" className="rounded-lg mb-2 max-w-full max-h-64 object-contain" />
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
                    className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(msg.id)} className="text-xs bg-white/20 text-white px-3 py-1 rounded-lg font-medium">
                      <Check className="w-3 h-3 inline mr-1" />Renvoyer
                    </button>
                    <button onClick={() => setEditingMessageId(null)} className="text-xs text-white/60 px-2 py-1">Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  {msg.role === "assistant" && shouldUseCanvas(msg.content) ? (
                    <DocumentCanvas content={msg.content} onBlockAction={handleBlockAction} />
                  ) : (
                    <div className={`prose prose-sm prose-invert max-w-none break-words text-[15px] leading-relaxed [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1`}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </>
              )}

              {msg.role === "assistant" && !isLoading && detectVisualizableContent(msg.content) && (
                <SmartVisualizer content={msg.content} />
              )}

              {/* Edit button for user messages */}
              {msg.role === "user" && !isLoading && editingMessageId !== msg.id && (
                <div className="flex justify-end mt-1 -mb-0.5">
                  <button onClick={() => handleEditMessage(msg.id, msg.content)} className="text-white/40 hover:text-white transition-colors p-0.5">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}

              {msg.role === "assistant" && (
                <div className="flex gap-2 mt-1.5 -mb-0.5">
                  <button onClick={() => handleCopy(msg.content, msg.id)} className={`${config.mutedClass} hover:${config.accentClass} transition-colors p-0.5`}>
                    {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleShare(msg.content)} className={`${config.mutedClass} hover:${config.accentClass} transition-colors p-0.5`}>
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  {voiceEnabled && (
                    <button onClick={() => speak(msg.content.replace(/[#*_`]/g, "").slice(0, 500), voiceTone)} className={`${config.mutedClass} hover:${config.accentClass} transition-colors p-0.5`}>
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start animate-slide-up">
            <div className={`${config.cardClass} rounded-2xl rounded-bl-md px-4 py-3 border ${config.borderClass}`}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.accentColor, animation: "typing-dot 1.4s infinite 0s" }} />
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.accentColor, animation: "typing-dot 1.4s infinite 0.2s" }} />
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.accentColor, animation: "typing-dot 1.4s infinite 0.4s" }} />
              </div>
            </div>
          </div>
        )}
        {/* Stop generation button */}
        {isStreaming && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleStopGeneration}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border transition-colors"
              style={{ borderColor: `${config.accentColor}30`, color: config.accentColor, backgroundColor: `${config.accentColor}10` }}
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
            <img src={imagePreview} alt="Preview" className={`h-16 rounded-lg border ${config.borderClass}`} />
            <button onClick={() => setImagePreview(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center">×</button>
          </div>
        </div>
      )}

      {/* Location indicator */}
      {locationActive && (
        <div className="px-3 pb-1">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border" style={{ color: config.accentColor, borderColor: `${config.accentColor}30`, backgroundColor: `${config.accentColor}15` }}>
            <MapPin className="w-3 h-3" /> Position activée
            <button onClick={() => setLocationActive(false)} className="ml-1 hover:text-destructive">×</button>
          </span>
        </div>
      )}

      {/* Input bar */}
      <div className="px-3 pb-3 safe-bottom">
        <div className={`flex items-end gap-1.5 ${config.cardClass} rounded-2xl px-3 py-2 border ${config.borderClass}`}>
          <label className={`cursor-pointer ${config.mutedClass} hover:${config.accentClass} transition-colors flex-shrink-0 self-end pb-1`}>
            <ImagePlus className="w-5 h-5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
          <button onClick={handleCamera} className={`${config.mutedClass} hover:${config.accentClass} transition-colors flex-shrink-0 self-end pb-1`}>
            <Camera className="w-5 h-5" />
          </button>
          <button onClick={handleLocation} className={`flex-shrink-0 self-end pb-1 transition-colors ${locationActive ? config.accentClass : `${config.mutedClass} hover:${config.accentClass}`}`}>
            <MapPin className="w-5 h-5" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${config.label}...`}
            rows={1}
            className={`flex-1 bg-transparent ${config.fgClass} text-sm placeholder:${config.mutedClass} outline-none resize-none max-h-24 py-1.5`}
            style={{ minHeight: "36px" }}
          />
          {isListening ? (
            <button onClick={handleVoice} className="text-destructive flex-shrink-0 self-end pb-1">
              <StopCircle className="w-5 h-5 animate-pulse" />
            </button>
          ) : (
            <button onClick={handleVoice} className={`${config.mutedClass} hover:${config.accentClass} transition-colors flex-shrink-0 self-end pb-1`}>
              <Mic className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={send}
            disabled={isLoading || (!input.trim() && !imagePreview)}
            className={`p-2 rounded-xl transition-all flex-shrink-0 self-end disabled:opacity-30 bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} text-white`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </EmotionalGlow>
  );
}
