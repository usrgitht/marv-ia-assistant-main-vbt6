import React, { useState } from "react";
import { MessageSquarePlus, Trash2, Settings, Sparkles, Search, X, Crown, Globe2, Brain, BookOpen, Music, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import PersonaManager from "@/components/PersonaManager";
import MoodPlaylistDialog from "@/components/MoodPlaylistDialog";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  is_pro: boolean;
}

type FilterTab = "all" | "standard" | "pro";

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string, isPro?: boolean) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onOpenGalaxy?: () => void;
  onOpenSparkle?: () => void;
  showSparkle?: boolean;
  sparkleUnread?: number;
  activePersona?: { id: string; name: string; system_instructions: string; theme_color: string } | null;
  onSelectPersona?: (persona: { id: string; name: string; system_instructions: string; theme_color: string } | null) => void;
}

export default function SidebarDrawer({ open, onClose, conversations, activeId, onSelect, onNew, onDelete, onOpenSettings, onOpenGalaxy, onOpenSparkle, showSparkle, sparkleUnread = 0, activePersona, onSelectPersona }: SidebarDrawerProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showPersonas, setShowPersonas] = useState(false);
  const [showMoodPlaylist, setShowMoodPlaylist] = useState(false);

  const filtered = conversations
    .filter(c => {
      if (filter === "pro") return c.is_pro;
      if (filter === "standard") return !c.is_pro;
      return true;
    })
    .filter(c => !search.trim() || c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />}
      
      <div className={`fixed top-0 left-0 h-full w-72 bg-card border-r border-border z-50 transform transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"} flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground">Marv-IA</span>
          </div>
          <button onClick={onNew} className="p-2 text-primary hover:bg-muted rounded-lg transition-colors" title="Nouvelle conversation">
            <MessageSquarePlus className="w-5 h-5" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 pt-2">
          {([["all", "Tout"], ["standard", "Standard"], ["pro", "⚡ Pro"]] as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">
              {search ? "Aucun résultat" : "Aucune conversation"}
            </p>
          )}
          {filtered.map(conv => (
            <div
              key={conv.id}
              onClick={() => { onSelect(conv.id, conv.is_pro); onClose(); }}
              className={`flex items-center justify-between px-4 py-3 mx-2 rounded-lg cursor-pointer transition-colors group ${activeId === conv.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"}`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {conv.is_pro && <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                <span className="text-sm text-foreground truncate">{conv.title}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Espaces — groupe unifié */}
        <div className="border-t border-border px-3 py-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-1">
            Espaces
          </p>
          {onOpenGalaxy && (
            <button onClick={() => { onOpenGalaxy(); onClose(); }} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Globe2 className="w-4 h-4" />
              <span className="text-sm">Univers</span>
            </button>
          )}
          {showSparkle && onOpenSparkle && (
            <button onClick={() => { onOpenSparkle(); onClose(); }} className="relative flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-pink-500/10 transition-colors text-pink-300 hover:text-pink-200">
              <Heart className="w-4 h-4 fill-pink-400/40" />
              <span className="text-sm font-semibold flex-1 text-left">Sparkle ✨</span>
              {sparkleUnread > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-lg shadow-pink-500/50">
                  {sparkleUnread > 99 ? "99+" : sparkleUnread}
                </span>
              )}
            </button>
          )}
          {onSelectPersona && (
            <>
              <button
                onClick={() => setShowPersonas(!showPersonas)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Brain className="w-4 h-4" />
                <span className="text-sm flex-1 text-left">Personas</span>
                {activePersona && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border" style={{ color: activePersona.theme_color, borderColor: `${activePersona.theme_color}40`, backgroundColor: `${activePersona.theme_color}15` }}>
                    {activePersona.name}
                  </span>
                )}
              </button>
              {showPersonas && (
                <div className="mt-1 px-1">
                  <PersonaManager onSelectPersona={onSelectPersona} activePersonaId={activePersona?.id} />
                </div>
              )}
            </>
          )}
          <Link to="/library" onClick={onClose} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm">Bibliothèque</span>
          </Link>
          <button
            onClick={() => setShowMoodPlaylist(true)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <Music className="w-4 h-4" />
            <span className="text-sm">Playlist humeur</span>
          </button>
        </div>
        <MoodPlaylistDialog open={showMoodPlaylist} onClose={() => setShowMoodPlaylist(false)} />

        {/* Bottom — paramètres */}
        <div className="border-t border-border p-3">
          <button onClick={() => { onOpenSettings(); onClose(); }} className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Paramètres</span>
          </button>
        </div>
      </div>
    </>
  );
}
