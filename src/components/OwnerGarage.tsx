import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Key, RefreshCw, Activity, Shield, Database, Wifi, WifiOff, Clock, Bug, X, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OwnerGarageProps {
  onBack: () => void;
}

interface ApiKeyEntry {
  id?: string;
  name: string;
  value: string;
  visible: boolean;
  saved: boolean;
}

interface ErrorEntry {
  timestamp: string;
  type: string;
  message: string;
  source?: string;
}

/* ── Isolated input to prevent keyboard dismiss on parent re-render ── */
const StableInput = React.memo(({ 
  value, onCommit, placeholder, type = "text", className 
}: { 
  value: string; onCommit: (v: string) => void; placeholder: string; type?: string; className?: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      ref={ref}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      placeholder={placeholder}
      type={type}
      className={className || "w-full bg-background text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none focus:border-primary"}
    />
  );
});
StableInput.displayName = "StableInput";

export default function OwnerGarage({ onBack }: OwnerGarageProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showAddKey, setShowAddKey] = useState(false);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0, totalConversations: 0, totalMessages: 0, activeToday: 0,
    dbStatus: "connected" as "connected" | "error",
    edgeFunctionsStatus: "unknown" as "ok" | "error" | "unknown",
  });
  const [loading, setLoading] = useState(true);

  // Capture global errors
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setErrors(prev => [{ timestamp: new Date().toISOString(), type: "Runtime Error", message: event.message, source: `${event.filename}:${event.lineno}` }, ...prev].slice(0, 50));
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      setErrors(prev => [{ timestamp: new Date().toISOString(), type: "Unhandled Promise", message: String(event.reason?.message || event.reason) }, ...prev].slice(0, 50));
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejectionHandler);
    return () => { window.removeEventListener("error", handler); window.removeEventListener("unhandledrejection", rejectionHandler); };
  }, []);

  // Load API keys from database
  const loadApiKeys = useCallback(async () => {
    const { data, error } = await supabase.from("owner_api_keys" as any).select("*").order("created_at");
    if (error) { console.error("load keys error:", error); return; }
    if (data) {
      setApiKeys((data as any[]).map((k: any) => ({ id: k.id, name: k.key_name, value: k.key_value, visible: false, saved: true })));
    }
  }, []);

  // Load stats
  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, convsRes, msgsRes, heartbeatsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("user_heartbeats" as any).select("id").gte("last_seen_at", new Date(Date.now() - 86400000).toISOString()),
      ]);
      setStats({
        totalUsers: profilesRes.count || 0, totalConversations: convsRes.count || 0,
        totalMessages: msgsRes.count || 0, activeToday: heartbeatsRes.data?.length || 0,
        dbStatus: profilesRes.error ? "error" : "connected", edgeFunctionsStatus: "ok",
      });
    } catch { setStats(prev => ({ ...prev, dbStatus: "error" })); }
    setLoading(false);
  }, []);

  useEffect(() => { loadStats(); loadApiKeys(); }, [loadStats, loadApiKeys]);

  const testEdgeFunctions = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marvia-chat`, {
        method: "OPTIONS", headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      setStats(prev => ({ ...prev, edgeFunctionsStatus: resp.ok ? "ok" : "error" }));
      toast.success(resp.ok ? "Edge Functions: OK ✓" : "Edge Functions: Erreur");
    } catch {
      setStats(prev => ({ ...prev, edgeFunctionsStatus: "error" }));
      toast.error("Edge Functions: Inaccessible");
    }
  };

  const addApiKey = async () => {
    const name = newKeyName.trim().toUpperCase().replace(/\s+/g, "_");
    if (!name || !newKeyValue.trim()) return;
    if (apiKeys.some(k => k.name === name)) { toast.error("Cette clé existe déjà"); return; }
    
    setSavingKey(name);
    const { error } = await supabase.from("owner_api_keys" as any).insert({ key_name: name, key_value: newKeyValue.trim() });
    setSavingKey(null);
    if (error) { toast.error("Erreur"); console.error(error); return; }
    
    setApiKeys(prev => [...prev, { name, value: newKeyValue.trim(), visible: false, saved: true }]);
    setNewKeyName(""); setNewKeyValue(""); setShowAddKey(false);
    toast.success(`${name} ajoutée et sauvegardée ✓`);
  };

  const removeKey = async (name: string) => {
    const { error } = await supabase.from("owner_api_keys" as any).delete().eq("key_name", name);
    if (error) { toast.error("Erreur de suppression"); return; }
    setApiKeys(prev => prev.filter(k => k.name !== name));
    toast.success("Clé supprimée");
  };

  const toggleVisibility = (name: string) => {
    setApiKeys(prev => prev.map(k => k.name === name ? { ...k, visible: !k.visible } : k));
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const Section: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ icon, title, action, children }) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2.5">
          <span className="text-primary">{icon}</span>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </div>
      <div className="bg-secondary rounded-xl border border-border overflow-hidden">{children}</div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <button onClick={onBack} className="text-primary"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 flex-1">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-foreground">Garage Owner</h2>
        </div>
        <button onClick={() => { loadStats(); loadApiKeys(); }} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4">
        {/* System Status */}
        <Section icon={<Activity className="w-4 h-4" />} title="État du système" action={
          <button onClick={testEdgeFunctions} className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">Test Fonctions</button>
        }>
          <div className="grid grid-cols-2 gap-px bg-border">
            {[
              { label: "Utilisateurs", value: stats.totalUsers, icon: "👥" },
              { label: "Conversations", value: stats.totalConversations, icon: "💬" },
              { label: "Messages", value: stats.totalMessages, icon: "📨" },
              { label: "Actifs 24h", value: stats.activeToday, icon: "🟢" },
            ].map(s => (
              <div key={s.label} className="bg-secondary px-4 py-3 flex flex-col items-center">
                <span className="text-lg">{s.icon}</span>
                <span className="text-lg font-bold text-foreground">{loading ? "—" : s.value.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground flex items-center gap-2"><Database className="w-3.5 h-3.5" /> Base de données</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stats.dbStatus === "connected" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                {stats.dbStatus === "connected" ? "Connectée" : "Erreur"}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground flex items-center gap-2">
                {stats.edgeFunctionsStatus === "ok" ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />} Edge Functions
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                stats.edgeFunctionsStatus === "ok" ? "bg-emerald-500/15 text-emerald-400" :
                stats.edgeFunctionsStatus === "error" ? "bg-red-500/15 text-red-400" : "bg-muted text-muted-foreground"
              }`}>
                {stats.edgeFunctionsStatus === "ok" ? "OK" : stats.edgeFunctionsStatus === "error" ? "Erreur" : "Non testé"}
              </span>
            </div>
          </div>
        </Section>

        {/* API Keys - Persisted */}
        <Section icon={<Key className="w-4 h-4" />} title="Clés API (Persistées)" action={
          <button onClick={() => setShowAddKey(true)} className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">+ Ajouter</button>
        }>
          <div className="px-4 py-2 bg-primary/5 border-b border-border">
            <p className="text-[10px] text-primary">✓ Les clés sont sauvegardées en base et utilisées par les fonctions backend</p>
          </div>

          {showAddKey && (
            <div className="px-4 py-3 border-b border-border space-y-2">
              <StableInput value={newKeyName} onCommit={setNewKeyName} placeholder="Nom (ex: OPENAI_API_KEY)" />
              <StableInput value={newKeyValue} onCommit={setNewKeyValue} placeholder="Valeur" type="password" />
              <div className="flex gap-2">
                <button onClick={addApiKey} disabled={savingKey !== null} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
                  {savingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Sauvegarder
                </button>
                <button onClick={() => setShowAddKey(false)} className="text-xs text-muted-foreground px-2 py-1.5">Annuler</button>
              </div>
            </div>
          )}
          <div className="divide-y divide-border">
            {apiKeys.length === 0 && !showAddKey && (
              <div className="px-4 py-6 text-center">
                <Key className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted-foreground">Aucune clé API configurée</p>
                <p className="text-[10px] text-muted-foreground mt-1">Ajoutez des clés pour activer les intégrations</p>
              </div>
            )}
            {apiKeys.map(key => (
              <div key={key.name} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-primary">{key.name}</span>
                    {key.saved && <span className="text-[8px] font-bold bg-emerald-500/15 text-emerald-400 px-1 py-0.5 rounded">ACTIF</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {key.visible ? key.value : "••••••••" + key.value.slice(-4)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => toggleVisibility(key.name)} className="text-muted-foreground hover:text-foreground p-1">
                    {key.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => removeKey(key.name)} className="text-muted-foreground hover:text-red-400 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Error Log */}
        <Section icon={<Bug className="w-4 h-4" />} title={`Erreurs en temps réel (${errors.length})`} action={
          errors.length > 0 ? (
            <button onClick={() => setErrors([])} className="text-[10px] font-bold text-destructive px-2 py-1 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors">Vider</button>
          ) : null
        }>
          {errors.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aucune erreur détectée</p>
              <p className="text-[10px] text-muted-foreground mt-1">Les erreurs JavaScript s'afficheront ici en temps réel</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-64 overflow-y-auto scrollbar-hide">
              {errors.map((err, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">{err.type}</span>
                    <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{formatTime(err.timestamp)}</span>
                  </div>
                  <p className="text-xs text-foreground break-all leading-relaxed">{err.message}</p>
                  {err.source && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{err.source}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Performance Monitor */}
        <Section icon={<Activity className="w-4 h-4" />} title="Performance">
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground">Mémoire JS (heap)</span>
              <span className="text-xs text-muted-foreground font-mono">
                {(performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)}MB` : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground">Nœuds DOM</span>
              <span className="text-xs text-muted-foreground font-mono">{document.querySelectorAll("*").length}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground">Latence IA (moy.)</span>
              <span className="text-xs text-muted-foreground font-mono">
                {(window as any).__marviaMonitoring?.latency ? `${(window as any).__marviaMonitoring.latency}ms` : "N/A"}
              </span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
