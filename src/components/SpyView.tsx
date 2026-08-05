import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Eye, Send, Bell, Users, MessageSquare, ChevronRight, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { sendSpyNotification, sendSpyReply } from "@/lib/marvia-api";

interface SpyViewProps {
  onBack: () => void;
}

export default function SpyView({ onBack }: SpyViewProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [notifText, setNotifText] = useState("");
  const [notifTitle, setNotifTitle] = useState("");
  const [showNotifForm, setShowNotifForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Load all users with profiles
  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url, account_status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setUsers(data || []);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Load conversations for selected user
  const loadConversations = useCallback(async (userId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at, is_pro")
      .eq("user_id", userId)
      .is("deleted_at" as any, null)
      .order("updated_at", { ascending: false });
    setConversations(data || []);
    setSelectedConvId(null);
    setMessages([]);
    setLoading(false);
  }, []);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, image_url, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setLoading(false);
  }, []);

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedConvId(null);
    setMessages([]);
    loadConversations(userId);
  };

  const handleSelectConv = (convId: string) => {
    setSelectedConvId(convId);
    loadMessages(convId);
  };

  // Send a reply as the AI (assistant role)
  const handleReply = async () => {
    if (!replyText.trim() || !selectedConvId || !selectedUserId) return;
    setSending(true);
    const { error } = await sendSpyReply(selectedConvId, selectedUserId, replyText.trim());
    if (error) {
      toast.error(typeof error === "string" ? error : "Erreur d'envoi");
    } else {
      toast.success("Message envoyé comme Marv-IA");
      setReplyText("");
      loadMessages(selectedConvId);
    }
    setSending(false);
  };

  // Send notification to user
  const handleSendNotif = async () => {
    if (!notifText.trim() || !selectedUserId) return;
    const { error } = await sendSpyNotification(
      selectedUserId,
      notifTitle.trim() || "Message de l'administrateur",
      notifText.trim(),
    );
    if (error) {
      toast.error(typeof error === "string" ? error : "Erreur d'envoi de notification");
    } else {
      toast.success("Notification envoyée");
      setNotifText("");
      setNotifTitle("");
      setShowNotifForm(false);
    }
  };

  const filteredUsers = users.filter(u =>
    !searchQuery || (u.display_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.user_id.includes(searchQuery)
  );

  const selectedUser = users.find(u => u.user_id === selectedUserId);

  // Conversation messages view
  if (selectedConvId && selectedUserId) {
    const conv = conversations.find(c => c.id === selectedConvId);
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <button onClick={() => { setSelectedConvId(null); setMessages([]); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{conv?.title || "Conversation"}</p>
            <p className="text-[10px] text-muted-foreground">{selectedUser?.display_name} • {messages.length} msgs</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotifForm(!showNotifForm)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Envoyer une notification">
              <Bell className="w-4 h-4 text-primary" />
            </button>
            <button onClick={() => loadMessages(selectedConvId)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Notif form */}
        {showNotifForm && (
          <div className="px-4 py-3 bg-primary/5 border-b border-primary/20 space-y-2">
            <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Titre de la notification..." className="w-full bg-background text-xs px-3 py-2 rounded-lg border border-border outline-none" />
            <textarea value={notifText} onChange={e => setNotifText(e.target.value)} placeholder="Message de la notification..." className="w-full bg-background text-xs px-3 py-2 rounded-lg border border-border outline-none resize-none h-16" />
            <div className="flex gap-2">
              <button onClick={handleSendNotif} disabled={!notifText.trim()} className="text-[11px] font-bold bg-primary text-primary-foreground px-4 py-1.5 rounded-lg disabled:opacity-50">Envoyer la notif</button>
              <button onClick={() => setShowNotifForm(false)} className="text-[11px] text-muted-foreground">Annuler</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
          ) : messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-secondary text-foreground rounded-bl-md"
              }`}>
                {msg.image_url && (
                  <img src={msg.image_url} alt="" className="rounded-xl mb-2 max-h-48 object-cover" />
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                <p className={`text-[9px] mt-1 ${msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Reply bar */}
        <div className="px-4 py-3 border-t border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleReply()}
                placeholder="Répondre comme Marv-IA..."
                className="w-full bg-secondary text-sm px-4 py-2.5 rounded-xl border border-border outline-none pr-10"
              />
            </div>
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || sending}
              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
            <Eye className="w-3 h-3 inline mr-1" />
            Mode Spy — Ce message sera envoyé comme Marv-IA à l'utilisateur
          </p>
        </div>
      </div>
    );
  }

  // Conversations list for a user
  if (selectedUserId) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <button onClick={() => { setSelectedUserId(null); setConversations([]); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{selectedUser?.display_name || "Utilisateur"}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{selectedUserId.slice(0, 12)}...</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotifForm(!showNotifForm)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Envoyer une notification">
              <Bell className="w-4 h-4 text-primary" />
            </button>
          </div>
        </div>

        {/* Notif form */}
        {showNotifForm && (
          <div className="px-4 py-3 bg-primary/5 border-b border-primary/20 space-y-2">
            <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Titre..." className="w-full bg-background text-xs px-3 py-2 rounded-lg border border-border outline-none" />
            <textarea value={notifText} onChange={e => setNotifText(e.target.value)} placeholder="Message..." className="w-full bg-background text-xs px-3 py-2 rounded-lg border border-border outline-none resize-none h-16" />
            <div className="flex gap-2">
              <button onClick={handleSendNotif} disabled={!notifText.trim()} className="text-[11px] font-bold bg-primary text-primary-foreground px-4 py-1.5 rounded-lg disabled:opacity-50">Envoyer</button>
              <button onClick={() => setShowNotifForm(false)} className="text-[11px] text-muted-foreground">Annuler</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">Aucune conversation</p>
            </div>
          ) : conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => handleSelectConv(conv.id)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border flex items-center justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(conv.updated_at).toLocaleDateString("fr-FR")} • {conv.is_pro ? "PRO" : "Standard"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Users list
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Eye className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Mode Spy</p>
            <p className="text-[10px] text-primary">Voir les conversations de tous les utilisateurs</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Rechercher un utilisateur..."
          className="w-full bg-secondary text-sm px-3 py-2 rounded-xl border border-border outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {filteredUsers.map(u => (
          <button
            key={u.user_id}
            onClick={() => handleSelectUser(u.user_id)}
            className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                {(u.display_name || "?")[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{u.display_name || "Sans nom"}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-muted-foreground font-mono">{u.user_id.slice(0, 8)}...</p>
                  {u.account_status === "probation" && <span className="text-[8px] font-bold bg-yellow-500/15 text-yellow-500 px-1 py-0.5 rounded">PROB</span>}
                  {u.account_status === "banned" && <span className="text-[8px] font-bold bg-destructive/15 text-destructive px-1 py-0.5 rounded">BAN</span>}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
