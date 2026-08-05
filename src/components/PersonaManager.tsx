import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, Check, X, Sparkles, Brain, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Persona {
  id: string;
  name: string;
  system_instructions: string;
  theme_color: string;
}

interface PersonaManagerProps {
  onSelectPersona?: (persona: Persona | null) => void;
  activePersonaId?: string | null;
}

const DEFAULT_COLORS = ["#D4AF37", "#007BFF", "#FF4500", "#9B59B6", "#2ECC71", "#E91E63"];

export default function PersonaManager({ onSelectPersona, activePersonaId }: PersonaManagerProps) {
  const { user } = useAuth();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("custom_personas" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setPersonas(data as any);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!user || !name.trim()) return;
    if (editingId) {
      await supabase
        .from("custom_personas" as any)
        .update({ name: name.trim(), system_instructions: instructions.trim(), theme_color: color })
        .eq("id", editingId);
      toast.success("Persona mis à jour !");
    } else {
      await supabase
        .from("custom_personas" as any)
        .insert({ user_id: user.id, name: name.trim(), system_instructions: instructions.trim(), theme_color: color });
      toast.success("Persona créé !");
    }
    resetForm();
    load();
  };

  const resetForm = () => {
    setCreating(false);
    setEditingId(null);
    setName("");
    setInstructions("");
    setColor(DEFAULT_COLORS[0]);
  };

  const startEdit = (p: Persona) => {
    setEditingId(p.id);
    setCreating(true);
    setName(p.name);
    setInstructions(p.system_instructions);
    setColor(p.theme_color);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("custom_personas" as any).delete().eq("id", id);
    if (activePersonaId === id) onSelectPersona?.(null);
    setPersonas(prev => prev.filter(p => p.id !== id));
    toast.success("Persona supprimé");
  };

  const handleToggleActive = (p: Persona) => {
    if (activePersonaId === p.id) {
      onSelectPersona?.(null);
      toast("🧠 Persona désactivé — Marv-IA par défaut");
    } else {
      onSelectPersona?.(p);
      toast.success(`🧠 Persona "${p.name}" activé !`);
    }
  };

  return (
    <div className="space-y-3">
      {/* List */}
      {personas.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
            activePersonaId === p.id
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-secondary hover:bg-muted/50"
          }`}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: p.theme_color }}
          >
            {p.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{p.system_instructions || "Aucune instruction"}</p>
          </div>
          <div className="flex gap-1 items-center">
            <button
              onClick={() => handleToggleActive(p)}
              className={`p-1.5 rounded-lg transition-all ${
                activePersonaId === p.id
                  ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
              title={activePersonaId === p.id ? "Désactiver" : "Activer"}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); startEdit(p); }} className="p-1 text-muted-foreground hover:text-foreground">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Create/Edit form */}
      {creating ? (
        <div className="bg-secondary rounded-xl border border-border p-3 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du persona (ex: Marv-Hacker)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions système (ex: Tu es un expert en cybersécurité, réponds avec un style hacker...)"
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Couleur:</span>
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110" : "opacity-60 hover:opacity-100"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!name.trim()} className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />
              {editingId ? "Mettre à jour" : "Créer"}
            </button>
            <button onClick={resetForm} className="text-xs text-muted-foreground px-2 py-1.5">
              <X className="w-3.5 h-3.5 inline mr-1" />Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 w-full p-3 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Créer un persona</span>
        </button>
      )}

      {personas.length === 0 && !creating && (
        <div className="text-center py-4">
          <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Créez des versions personnalisées de Marv-IA avec leurs propres instructions et style.</p>
        </div>
      )}
    </div>
  );
}
