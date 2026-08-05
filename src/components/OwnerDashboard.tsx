import React, { useState, useEffect, useCallback } from "react";
import { Activity, Users, Hash, Clock, HeartPulse, MessageSquareWarning, CheckCircle, Shield, Ban, ChevronRight, X, AlertTriangle, Eye, Trash2, MessageSquare, Server, Gavel, Timer, Sparkles, Zap, Radio, UserPlus, Bot, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { resolveContestByOwner, inviteOwner, deleteUserAccount, aiAssistOwner, revokeOwner, listOwners } from "@/lib/marvia-api";
import GoogleConnectorsPanel from "./GoogleConnectorsPanel";
import SummerFeedbackPanel from "./SummerFeedbackPanel";

interface OwnerDashboardProps {
  formatDate: (d: string) => string;
}

export default function OwnerDashboard({ formatDate }: OwnerDashboardProps) {
  const [ownerStats, setOwnerStats] = useState({
    activeUsers: 0, userCount: 0, messageCount: 0,
    reports: [] as any[], recentUsers: [] as any[], recentConversations: [] as any[],
  });
  const [activityData, setActivityData] = useState<{ day: string; messages: number }[]>([]);
  const [systemHealth, setSystemHealth] = useState<"ok" | "degraded" | "down">("ok");
  const [apiStatus, setApiStatus] = useState<Record<string, "ok" | "error">>({ gemini: "ok", firecrawl: "ok" });
  const [metricFlash, setMetricFlash] = useState<Record<string, boolean>>({});
  const [monitorData, setMonitorData] = useState({ promptTokens: 0, responseTokens: 0, latency: 0 });
  const [bans, setBans] = useState<any[]>([]);
  const [probationUsers, setProbationUsers] = useState<any[]>([]);
  const [banInput, setBanInput] = useState("");
  const [banReason, setBanReason] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [reviewingReport, setReviewingReport] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [liveEvaluations, setLiveEvaluations] = useState<any[]>([]);
  const [assistingContestId, setAssistingContestId] = useState<string | null>(null);
  const [contestHelpNote, setContestHelpNote] = useState("");
  const [contestActionLoading, setContestActionLoading] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [ownersList, setOwnersList] = useState<any[]>([]);

  const flashMetric = (key: string) => {
    setMetricFlash(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setMetricFlash(prev => ({ ...prev, [key]: false })), 600);
  };

  // Load owners list (with email + main owner flag, server-side)
  const loadOwnersList = useCallback(async () => {
    const { data, error } = await listOwners();
    if (error || !data?.owners) {
      setOwnersList([]);
      return;
    }
    setOwnersList(data.owners);
  }, []);

  // Load all owner data
  useEffect(() => {
    loadOwnersList();
    const loadStats = async () => {
      try {
        const [profilesRes, messagesRes, reportsRes, heartbeatsRes, recentUsersRes, recentConvsRes, bansRes, probationRes] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("messages").select("id", { count: "exact", head: true }),
          supabase.from("content_reports").select("*").order("created_at", { ascending: false }).limit(50),
          supabase.from("user_heartbeats").select("id", { count: "exact", head: true })
            .gte("last_seen_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()),
          supabase.from("profiles").select("user_id, display_name, avatar_url, created_at, account_status, internal_trust_score, abuse_count").order("created_at", { ascending: false }).limit(10),
          supabase.from("conversations").select("id, title, user_id, created_at, is_pro").order("created_at", { ascending: false }).limit(20),
          supabase.from("user_bans" as any).select("*").order("created_at", { ascending: false }),
          supabase.from("profiles").select("user_id, display_name, account_status, probation_until, internal_trust_score, abuse_count").eq("account_status", "probation" as any),
        ]);
        setOwnerStats({
          activeUsers: (heartbeatsRes as any).count || 0,
          userCount: profilesRes.count || 0,
          messageCount: messagesRes.count || 0,
          reports: reportsRes.data || [],
          recentUsers: recentUsersRes.data || [],
          recentConversations: recentConvsRes.data || [],
        });
        setBans(bansRes.data || []);
        setProbationUsers(probationRes.data || []);
      } catch { /* ignore */ }
    };
    loadStats();

    // Load activity data (messages per day, last 7 days)
    const loadActivity = async () => {
      const days: { day: string; messages: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStr = date.toISOString().split("T")[0];
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const { count } = await supabase.from("messages").select("id", { count: "exact", head: true })
          .gte("created_at", dayStr).lt("created_at", nextDate.toISOString().split("T")[0]);
        days.push({ day: date.toLocaleDateString("fr-FR", { weekday: "short" }), messages: count || 0 });
      }
      setActivityData(days);
    };
    loadActivity();

    // Check API status
    const checkApis = async () => {
      try {
        const geminiResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marvia-chat`, {
          method: "OPTIONS", signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        setApiStatus(prev => ({ ...prev, gemini: geminiResp ? "ok" : "error" }));

        const firecrawlResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marvia-search`, {
          method: "OPTIONS", signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        setApiStatus(prev => ({ ...prev, firecrawl: firecrawlResp ? "ok" : "error" }));

        const start = performance.now();
        const healthResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marvia-chat`, {
          method: "OPTIONS", signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        const elapsed = performance.now() - start;
        if (!healthResp || elapsed > 4000) setSystemHealth("down");
        else if (elapsed > 2000) setSystemHealth("degraded");
        else setSystemHealth("ok");
      } catch { setSystemHealth("down"); }
    };
    checkApis();
    const healthInterval = setInterval(checkApis, 60000);

    // Realtime subscriptions
    const msgChannel = supabase.channel("owner-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        setOwnerStats(prev => { flashMetric("messageCount"); return { ...prev, messageCount: prev.messageCount + 1 }; });
      }).subscribe();

    const reportChannel = supabase.channel("owner-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_reports" }, (payload) => {
        if (payload.eventType === "INSERT") {
          flashMetric("reports");
          const newReport = payload.new as any;
          setOwnerStats(prev => ({ ...prev, reports: [newReport, ...prev.reports].slice(0, 50) }));
          // Add to live evaluations as "processing"
          setLiveEvaluations(prev => [{
            id: newReport.id,
            status: "processing",
            message_content: newReport.message_content,
            reason: newReport.reason,
            user_id: newReport.user_id,
            created_at: newReport.created_at,
          }, ...prev].slice(0, 20));
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as any;
          // Update live evaluations with AI result
          setLiveEvaluations(prev => prev.map(e =>
            e.id === updated.id ? {
              ...e,
              status: "completed",
              ai_verdict: updated.ai_verdict,
              ai_reasoning: updated.ai_reasoning,
              is_abusive_report: updated.is_abusive_report,
            } : e
          ));
          // Update reports list
          setOwnerStats(prev => ({
            ...prev,
            reports: prev.reports.map(r => r.id === updated.id ? { ...r, ...updated } : r),
          }));
        }
      }).subscribe();

    // Monitor for ban changes
    const banChannel = supabase.channel("owner-bans")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_bans" }, () => {
        // Refresh bans
        supabase.from("user_bans" as any).select("*").order("created_at", { ascending: false }).then(({ data }) => {
          if (data) setBans(data);
        });
      }).subscribe();

    // Monitor polling
    const monitorInterval = setInterval(() => {
      const data = (window as any).__marviaMonitoring;
      if (data) {
        setMonitorData(prev => {
          const n = { promptTokens: data.promptTokens || 0, responseTokens: data.responseTokens || 0, latency: data.latency || 0 };
          if (n.latency !== prev.latency) flashMetric("latency");
          return n;
        });
      }
    }, 1000);

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(reportChannel);
      supabase.removeChannel(banChannel);
      clearInterval(healthInterval);
      clearInterval(monitorInterval);
    };
  }, []);

  const handleReviewReport = async (reportId: string, status: "reviewed" | "dismissed") => {
    const { error } = await supabase.from("content_reports").update({
      status, review_note: reviewNote || null, reviewed_at: new Date().toISOString(),
    } as any).eq("id", reportId);
    if (error) { toast.error("Erreur"); return; }

    const report = ownerStats.reports.find(r => r.id === reportId);
    if (report && status === "reviewed") {
      await supabase.from("user_notifications" as any).insert({
        user_id: report.user_id,
        title: "Signalement traité",
        message: `Votre signalement a été examiné. ${reviewNote ? `Note: ${reviewNote}` : "Merci pour votre vigilance."}`,
      });
    }

    setOwnerStats(prev => ({
      ...prev,
      reports: prev.reports.map(r => r.id === reportId ? { ...r, status, review_note: reviewNote, reviewed_at: new Date().toISOString() } : r),
    }));
    setReviewingReport(null);
    setReviewNote("");
    toast.success(status === "reviewed" ? "Signalement traité" : "Signalement rejeté");
  };

  // GRÂCE: immediate unban from probation
  const handleGrace = async (userId: string) => {
    await supabase.from("profiles").update({
      account_status: "active",
      probation_until: null,
      internal_trust_score: 75,
      abuse_count: 0,
    } as any).eq("user_id", userId);
    await supabase.from("user_bans" as any).delete().eq("user_id", userId);
    await supabase.from("user_notifications" as any).insert({
      user_id: userId, title: "Grâce accordée ⚖️", message: "L'administrateur a levé votre probation. Bienvenue de retour !",
    });
    setProbationUsers(prev => prev.filter(u => u.user_id !== userId));
    toast.success("Grâce accordée");
  };

  // EXIL: permanent ban from probation
  const handleExil = async (userId: string) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    await supabase.from("user_bans" as any).insert({
      user_id: userId, reason: "Exil définitif par l'administrateur", banned_by: session.session.user.id,
      ban_type: "manual", is_contestable: false,
    });
    await supabase.from("profiles").update({
      account_status: "banned", probation_until: null, internal_trust_score: 0,
    } as any).eq("user_id", userId);
    await supabase.from("user_notifications" as any).insert({
      user_id: userId, title: "Ban définitif", message: "Votre compte a été définitivement banni par l'administrateur.",
    });
    setProbationUsers(prev => prev.filter(u => u.user_id !== userId));
    setBans(prev => [...prev, { user_id: userId, reason: "Exil définitif", created_at: new Date().toISOString(), ban_type: "manual" }]);
    toast.success("Utilisateur exilé définitivement");
  };

  const handleBanUser = async (userId: string, reason: string) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    const { error } = await supabase.from("user_bans" as any).insert({
      user_id: userId, reason: reason || "Violation des règles", banned_by: session.session.user.id,
      ban_type: "manual", is_contestable: true,
    });
    if (error) { toast.error("Erreur de ban"); return; }
    await supabase.from("profiles").update({ account_status: "banned" } as any).eq("user_id", userId);
    await supabase.from("user_notifications" as any).insert({
      user_id: userId, title: "Compte suspendu", message: `Votre compte a été suspendu. Raison : ${reason || "Violation des règles"}`,
    });
    setBans(prev => [...prev, { user_id: userId, reason, created_at: new Date().toISOString(), ban_type: "manual" }]);
    toast.success("Utilisateur banni");
  };

  const handleUnban = async (userId: string) => {
    await supabase.from("user_bans" as any).delete().eq("user_id", userId);
    await supabase.from("profiles").update({
      account_status: "active", probation_until: null, internal_trust_score: 50, abuse_count: 0,
    } as any).eq("user_id", userId);
    setBans(prev => prev.filter(b => b.user_id !== userId));
    await supabase.from("user_notifications" as any).insert({
      user_id: userId, title: "Compte rétabli", message: "Votre compte a été rétabli. Bienvenue de retour !",
    });
    toast.success("Utilisateur débanni");
  };

  const toggle = (s: string) => setExpandedSection(expandedSection === s ? null : s);
  const contestedBans = bans.filter((ban: any) => ban.contest_status === "pending" || !!ban.contest_message);

  const handleContestAssistance = async (banId: string, resolution: "REJECT" | "PROBATION" | "UNBAN") => {
    setContestActionLoading(`${banId}-${resolution}`);
    const { error } = await resolveContestByOwner(banId, resolution, contestHelpNote);
    setContestActionLoading(null);

    if (error) {
      toast.error(typeof error === "string" ? error : "Erreur de traitement");
      return;
    }

    setContestHelpNote("");
    setAssistingContestId(null);
    toast.success(`Contestation traitée : ${resolution}`);
  };

  const Section: React.FC<{ icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 mb-2 px-1">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className="bg-secondary rounded-xl border border-border overflow-hidden divide-y divide-border">{children}</div>
    </div>
  );

  const Row: React.FC<{ label: React.ReactNode; children?: React.ReactNode; onClick?: () => void }> = ({ label, children, onClick }) => (
    <div className={`flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      <span className="text-xs text-foreground">{label}</span>
      {children}
    </div>
  );

  const pendingReports = ownerStats.reports.filter(r => !r.status || r.status === "pending");
  const processedReports = ownerStats.reports.filter(r => r.status && r.status !== "pending");

  return (
    <>
      {/* Stats Overview */}
      <Section icon={<Activity className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">Dashboard Owner
          <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">v3.0</span>
        </span>
      }>
        <Row label={<span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-muted-foreground" />Utilisateurs actifs (5min)</span>}>
          <span className={`text-xs font-mono text-primary font-bold ${metricFlash.activeUsers ? "metric-updated" : ""}`}>{ownerStats.activeUsers}</span>
        </Row>
        <Row label={<span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-muted-foreground" />Total inscrits</span>}>
          <span className="text-xs font-mono text-primary">{ownerStats.userCount}</span>
        </Row>
        <Row label={<span className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" />Total messages</span>}>
          <span className={`text-xs font-mono text-primary ${metricFlash.messageCount ? "metric-updated" : ""}`}>{ownerStats.messageCount.toLocaleString()}</span>
        </Row>
        <Row label={<span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-muted-foreground" />Latence API</span>}>
          <span className={`text-xs font-mono ${metricFlash.latency ? "metric-updated" : ""} ${monitorData.latency > 0 ? (monitorData.latency < 1000 ? "text-primary" : monitorData.latency < 3000 ? "text-yellow-500" : "text-destructive") : "text-primary"}`}>
            {monitorData.latency > 0 ? `${monitorData.latency}ms` : "—"}
          </span>
        </Row>
        <Row label={<span className="flex items-center gap-2"><HeartPulse className="w-3.5 h-3.5 text-muted-foreground" />État système</span>}>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${systemHealth === "ok" ? "text-primary" : systemHealth === "degraded" ? "text-yellow-500" : "text-destructive"}`}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${systemHealth === "ok" ? "bg-primary" : systemHealth === "degraded" ? "bg-yellow-500" : "bg-destructive"}`} />
            {systemHealth === "ok" ? "Opérationnel" : systemHealth === "degraded" ? "Dégradé" : "Hors ligne"}
          </span>
        </Row>
      </Section>

      <Section icon={<Gavel className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">Contestations Gemini
          {contestedBans.length > 0 && <span className="text-[9px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full">{contestedBans.length}</span>}
        </span>
      }>
        {contestedBans.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Gavel className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">Aucune contestation active</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto scrollbar-hide divide-y divide-border">
            {contestedBans.map((ban: any) => (
              <div key={ban.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono text-foreground">User: {ban.user_id?.slice(0, 8)}...</p>
                    <p className="text-[10px] text-muted-foreground">{ban.reason}</p>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ban.contest_status === "pending" ? "bg-amber-500/15 text-amber-500" : ban.contest_status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                    {ban.contest_status === "pending" ? "Gemini traite" : ban.contest_status === "rejected" ? "Rejetée" : "Reçue"}
                  </span>
                </div>

                <div className="bg-muted/40 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] text-muted-foreground mb-1">Message utilisateur :</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{ban.contest_message || "Contestation transmise à Gemini"}</p>
                </div>

                {assistingContestId === ban.id ? (
                  <div className="space-y-2 bg-muted/50 rounded-lg p-2">
              <input
                type="text"
                value={contestHelpNote}
                onChange={(e) => setContestHelpNote(e.target.value)}
                placeholder="Consigne owner pour aider Gemini..."
                className="w-full bg-background text-xs px-2 py-1.5 rounded border border-border outline-none focus:ring-1 focus:ring-primary"
              />
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={() => handleContestAssistance(ban.id, "REJECT")}
                        disabled={contestActionLoading !== null}
                        className="text-[10px] font-bold bg-destructive text-destructive-foreground py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Rejeter
                      </button>
                      <button
                        onClick={() => handleContestAssistance(ban.id, "PROBATION")}
                        disabled={contestActionLoading !== null}
                        className="text-[10px] font-bold bg-yellow-500/80 text-background py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Probation
                      </button>
                      <button
                        onClick={() => handleContestAssistance(ban.id, "UNBAN")}
                        disabled={contestActionLoading !== null}
                        className="text-[10px] font-bold bg-primary text-primary-foreground py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Unban
                      </button>
                    </div>
                    <button onClick={() => { setAssistingContestId(null); setContestHelpNote(""); }} className="text-[9px] text-muted-foreground">Annuler</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAssistingContestId(ban.id); setContestHelpNote(""); }}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Aider Gemini
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* API Status */}
      <Section icon={<Server className="w-4 h-4" />} title="Statut API externe">
        <Row label={<span className="flex items-center gap-2">Gemini AI (Chat + Évaluation)</span>}>
          <span className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${apiStatus.gemini === "ok" ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
            <span className={apiStatus.gemini === "ok" ? "text-green-500" : "text-red-500"}>
              {apiStatus.gemini === "ok" ? "En ligne" : "Hors ligne"}
            </span>
          </span>
        </Row>
        <Row label={<span className="flex items-center gap-2">Firecrawl (Recherche web)</span>}>
          <span className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${apiStatus.firecrawl === "ok" ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
            <span className={apiStatus.firecrawl === "ok" ? "text-green-500" : "text-red-500"}>
              {apiStatus.firecrawl === "ok" ? "En ligne" : "Hors ligne"}
            </span>
          </span>
        </Row>
        <Row label={<span className="flex items-center gap-2">Gemini Image Pro</span>}>
          <span className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${apiStatus.gemini === "ok" ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
            <span className={apiStatus.gemini === "ok" ? "text-green-500" : "text-red-500"}>
              {apiStatus.gemini === "ok" ? "En ligne" : "Hors ligne"}
            </span>
          </span>
        </Row>
      </Section>

      {/* Google Connectors */}
      <GoogleConnectorsPanel />

      {/* Summer Boost Feedback */}
      <SummerFeedbackPanel />

      {/* Activity Chart */}
      <Section icon={<Activity className="w-4 h-4" />} title="Activité (7 jours)">
        <div className="px-2 py-3">
          {activityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={activityData}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={30} />
                <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Chargement...</p>
          )}
        </div>
      </Section>

      {/* 🔴 LIVE AI Evaluation Processing */}
      <Section icon={<Radio className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">
          Traitement IA en direct
          {liveEvaluations.some(e => e.status === "processing") && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </span>
      }>
        {liveEvaluations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Zap className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">Aucun traitement récent</p>
            <p className="text-[9px] text-muted-foreground mt-1">Les évaluations IA apparaîtront ici en temps réel</p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto scrollbar-hide divide-y divide-border">
            {liveEvaluations.map((ev) => (
              <div key={ev.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  {ev.status === "processing" ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      ⏳ Analyse en cours...
                    </span>
                  ) : (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      ev.ai_verdict === "SAFE" ? "bg-primary/15 text-primary" :
                      ev.ai_verdict === "SPAM" ? "bg-destructive/15 text-destructive" :
                      ev.ai_verdict === "OWNER_REPORT" ? "bg-amber-500/15 text-amber-500" :
                      "bg-yellow-500/15 text-yellow-500"
                    }`}>
                      {ev.ai_verdict === "SAFE" ? "✓ SAFE (Signalement abusif)" :
                       ev.ai_verdict === "SPAM" ? "🚫 SPAM DÉTECTÉ" :
                       ev.ai_verdict === "OWNER_REPORT" ? "👑 OWNER" :
                       ev.ai_verdict === "UNSAFE" ? "⚠ UNSAFE (Légitime)" :
                       "📋 En attente"}
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground">{formatDate(ev.created_at)}</span>
                </div>
                <p className="text-[10px] text-foreground line-clamp-2">{ev.message_content}</p>
                <p className="text-[9px] text-muted-foreground">Raison: {ev.reason}</p>
                {ev.ai_reasoning && (
                  <p className="text-[9px] text-muted-foreground italic bg-muted/50 rounded px-2 py-1">
                    🤖 {ev.ai_reasoning}
                  </p>
                )}
                {ev.is_abusive_report && (
                  <span className="text-[9px] font-bold text-destructive">→ Signalement abusif détecté, score utilisateur diminué</span>
                )}
                <p className="text-[9px] text-muted-foreground font-mono">User: {ev.user_id?.slice(0, 8)}...</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Recent Users */}
      <Section icon={<Users className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">Utilisateurs récents
          <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">{ownerStats.recentUsers.length}</span>
        </span>
      }>
        <div className="max-h-48 overflow-y-auto scrollbar-hide divide-y divide-border">
          {ownerStats.recentUsers.map((u: any) => (
            <div key={u.user_id} className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                  {(u.display_name || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{u.display_name || "Sans nom"}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9px] text-muted-foreground font-mono">{u.user_id?.slice(0, 8)}...</p>
                    {u.account_status === "probation" && <span className="text-[8px] font-bold bg-yellow-500/15 text-yellow-500 px-1 py-0.5 rounded">PROBATION</span>}
                    {u.account_status === "banned" && <span className="text-[8px] font-bold bg-destructive/15 text-destructive px-1 py-0.5 rounded">BANNI</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.internal_trust_score !== undefined && (
                  <span className={`text-[9px] font-mono ${(u.internal_trust_score || 0) > 50 ? "text-primary" : (u.internal_trust_score || 0) > 25 ? "text-yellow-500" : "text-destructive"}`}>
                    🛡{u.internal_trust_score}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground">{formatDate(u.created_at)}</span>
                {!bans.find(b => b.user_id === u.user_id) ? (
                  <button onClick={() => { setBanInput(u.user_id); toggle("ban-form"); }} className="text-[9px] text-destructive hover:underline">Ban</button>
                ) : (
                  <span className="text-[9px] text-destructive font-bold">BANNI</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Conversation Logs */}
      <Section icon={<MessageSquare className="w-4 h-4" />} title="Conversations récentes">
        <div className="max-h-48 overflow-y-auto scrollbar-hide divide-y divide-border">
          {ownerStats.recentConversations.map((c: any) => (
            <div key={c.id} className="px-4 py-2 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground truncate">{c.title}</p>
                <p className="text-[9px] text-muted-foreground font-mono">User: {c.user_id?.slice(0, 8)}... • {formatDate(c.created_at)}</p>
              </div>
              {c.is_pro && <span className="text-[8px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full ml-2">PRO</span>}
            </div>
          ))}
        </div>
      </Section>

      {/* Moderation */}
      <Section icon={<MessageSquareWarning className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">Modération
          {pendingReports.length > 0 && (
            <>
              <span className={`text-[9px] font-bold bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full ${metricFlash.reports ? "metric-updated" : ""}`}>{pendingReports.length} en attente</span>
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            </>
          )}
        </span>
      }>
        {pendingReports.length === 0 && processedReports.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <CheckCircle className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aucun signalement</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto scrollbar-hide divide-y divide-border">
            {pendingReports.map((report: any) => (
              <div key={report.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-destructive font-medium uppercase">⚠ {report.reason}</span>
                    {report.ai_verdict && (
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                        report.ai_verdict === "SAFE" ? "bg-primary/15 text-primary" :
                        report.ai_verdict === "UNSAFE" ? "bg-yellow-500/15 text-yellow-500" :
                        "bg-destructive/15 text-destructive"
                      }`}>
                        IA: {report.ai_verdict}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{formatDate(report.created_at)}</span>
                </div>
                <p className="text-xs text-foreground line-clamp-3">{report.message_content}</p>
                {report.ai_reasoning && (
                  <p className="text-[9px] text-muted-foreground italic bg-muted/30 rounded px-2 py-1">🤖 {report.ai_reasoning}</p>
                )}
                <p className="text-[9px] text-muted-foreground font-mono">User: {report.user_id?.slice(0, 8)}...</p>

                {reviewingReport === report.id ? (
                  <div className="space-y-2 bg-muted/50 rounded-lg p-2">
                    <input
                      type="text" value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                      placeholder="Note de traitement (optionnel)..."
                      className="w-full bg-background text-xs px-2 py-1.5 rounded border border-border outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => handleReviewReport(report.id, "reviewed")}
                        className="flex-1 text-[10px] font-bold bg-primary text-primary-foreground py-1.5 rounded-lg">
                        ✓ Traiter
                      </button>
                      <button onClick={() => handleReviewReport(report.id, "dismissed")}
                        className="flex-1 text-[10px] font-bold bg-muted text-muted-foreground py-1.5 rounded-lg">
                        ✗ Rejeter
                      </button>
                      <button onClick={() => { handleBanUser(report.user_id, `Signalement: ${report.reason}`); handleReviewReport(report.id, "reviewed"); }}
                        className="text-[10px] font-bold bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg">
                        Ban
                      </button>
                    </div>
                    <button onClick={() => setReviewingReport(null)} className="text-[9px] text-muted-foreground">Annuler</button>
                  </div>
                ) : (
                  <button onClick={() => setReviewingReport(report.id)}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Traiter ce signalement
                  </button>
                )}
              </div>
            ))}

            {processedReports.length > 0 && (
              <div className="px-4 py-2">
                <button onClick={() => toggle("processed")} className="text-[10px] text-muted-foreground hover:underline flex items-center gap-1">
                  <ChevronRight className={`w-3 h-3 transition-transform ${expandedSection === "processed" ? "rotate-90" : ""}`} />
                  {processedReports.length} signalements traités
                </button>
                {expandedSection === "processed" && (
                  <div className="mt-2 space-y-2">
                    {processedReports.map((r: any) => (
                      <div key={r.id} className="bg-muted/30 rounded-lg p-2 text-[10px]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={r.status === "reviewed" ? "text-primary" : r.status === "dismissed" ? "text-muted-foreground" : "text-yellow-500"}>
                              {r.status === "reviewed" ? "✓ Traité" : r.status === "dismissed" ? "✗ Rejeté" : r.status}
                            </span>
                            {r.ai_verdict && (
                              <span className={`text-[8px] px-1 rounded ${
                                r.ai_verdict === "SAFE" ? "bg-primary/10 text-primary" : "bg-yellow-500/10 text-yellow-500"
                              }`}>
                                IA:{r.ai_verdict}
                              </span>
                            )}
                          </div>
                          <span className="text-muted-foreground">{formatDate(r.reviewed_at || r.created_at)}</span>
                        </div>
                        <p className="text-foreground line-clamp-1 mt-0.5">{r.message_content}</p>
                        {r.review_note && <p className="text-muted-foreground italic mt-0.5">Note: {r.review_note}</p>}
                        {r.ai_reasoning && <p className="text-muted-foreground italic mt-0.5">🤖 {r.ai_reasoning}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Ban Management */}
      <Section icon={<Ban className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">Utilisateurs bannis
          {bans.length > 0 && <span className="text-[9px] font-bold bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full">{bans.length}</span>}
        </span>
      }>
        {/* Ban form */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-[10px] text-muted-foreground">Bannir un utilisateur par ID :</p>
          <div className="flex gap-1.5">
             <input type="text" value={banInput} onChange={e => setBanInput(e.target.value)}
              placeholder="User ID..." className="flex-1 bg-muted text-xs px-2 py-1.5 rounded border border-border outline-none font-mono focus:ring-1 focus:ring-primary" />
          </div>
          <input type="text" value={banReason} onChange={e => setBanReason(e.target.value)}
            placeholder="Raison (optionnel)..." className="w-full bg-muted text-xs px-2 py-1.5 rounded border border-border outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={() => { if (banInput.trim()) { handleBanUser(banInput.trim(), banReason); setBanInput(""); setBanReason(""); } }}
            disabled={!banInput.trim()}
            className="w-full text-[11px] font-bold bg-destructive text-destructive-foreground py-1.5 rounded-lg disabled:opacity-50">
            Bannir l'utilisateur
          </button>
        </div>

        {bans.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-muted-foreground">Aucun utilisateur banni</p>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto scrollbar-hide divide-y divide-border">
            {bans.map((ban: any, i: number) => (
              <div key={ban.id || `${ban.user_id}-${i}`} className="px-4 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-mono text-foreground">{ban.user_id?.slice(0, 12)}...</p>
                    <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                      ban.ban_type === "auto_spam" ? "bg-destructive/15 text-destructive" :
                      ban.ban_type === "auto_abuse" ? "bg-yellow-500/15 text-yellow-500" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {ban.ban_type === "auto_spam" ? "SPAM" : ban.ban_type === "auto_abuse" ? "ABUS" : "MANUEL"}
                    </span>
                    {ban.contest_status === "pending" && <span className="text-[8px] font-bold bg-amber-500/15 text-amber-500 px-1 py-0.5 rounded">CONTESTÉ</span>}
                    {ban.contest_status === "rejected" && <span className="text-[8px] font-bold bg-destructive/15 text-destructive px-1 py-0.5 rounded">REJETÉ</span>}
                  </div>
                  <p className="text-[9px] text-muted-foreground">{ban.reason} • {formatDate(ban.created_at)}</p>
                  {ban.contest_message && (
                    <p className="text-[9px] text-muted-foreground italic mt-0.5">💬 "{ban.contest_message?.slice(0, 80)}..."</p>
                  )}
                </div>
                <button onClick={() => handleUnban(ban.user_id)} className="text-[10px] text-primary hover:underline flex-shrink-0 ml-2">Débannir</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Justice Panel */}
      <Section icon={<Gavel className="w-4 h-4" />} title={
        <span className="flex items-center gap-2">Panel Justice ⚖️
          {probationUsers.length > 0 && (
            <span className="text-[9px] font-bold bg-yellow-500/15 text-yellow-500 px-1.5 py-0.5 rounded-full animate-pulse">{probationUsers.length} en probation</span>
          )}
        </span>
      }>
        {probationUsers.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Gavel className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">Aucun utilisateur en probation</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto scrollbar-hide divide-y divide-border">
            {probationUsers.map((u: any) => {
              const remaining = u.probation_until ? Math.max(0, Math.ceil((new Date(u.probation_until).getTime() - Date.now()) / (1000 * 60 * 60))) : 0;
              return (
                <div key={u.user_id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-[10px] font-bold text-yellow-500">
                        {(u.display_name || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">{u.display_name || "Sans nom"}</p>
                        <p className="text-[9px] text-muted-foreground font-mono">{u.user_id?.slice(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3 h-3 text-yellow-500" />
                      <span className="text-[10px] font-bold text-yellow-500">{remaining}h</span>
                    </div>
                  </div>

                  {/* Trust Score Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-muted-foreground">Score de confiance</span>
                      <span className={`font-bold ${(u.internal_trust_score || 0) > 50 ? "text-primary" : (u.internal_trust_score || 0) > 25 ? "text-yellow-500" : "text-destructive"}`}>
                        {u.internal_trust_score || 0}/100
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${(u.internal_trust_score || 0) > 50 ? "bg-primary" : (u.internal_trust_score || 0) > 25 ? "bg-yellow-500" : "bg-destructive"}`}
                        style={{ width: `${u.internal_trust_score || 0}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground">Abus détectés: {u.abuse_count || 0}</p>
                  </div>

                  {/* Restrictions Info */}
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-2 py-1.5">
                    <p className="text-[9px] text-yellow-600 font-medium">Restrictions actives:</p>
                    <p className="text-[8px] text-yellow-600/80">• 10 messages/jour max • Pas d'images • Pas de signalements</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleGrace(u.user_id)}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold bg-primary/15 text-primary py-2 rounded-lg hover:bg-primary/25 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      GRÂCE
                    </button>
                    <button
                      onClick={() => handleExil(u.user_id)}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold bg-destructive/15 text-destructive py-2 rounded-lg hover:bg-destructive/25 transition-colors"
                    >
                      <Ban className="w-3 h-3" />
                      EXIL
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* AI Evaluation Stats */}
      <Section icon={<Shield className="w-4 h-4" />} title="Évaluations IA récentes">
        <div className="max-h-48 overflow-y-auto scrollbar-hide divide-y divide-border">
          {ownerStats.reports.filter((r: any) => r.ai_verdict).length === 0 ? (
            <div className="px-4 py-4 text-center">
              <p className="text-xs text-muted-foreground">Aucune évaluation IA encore</p>
            </div>
          ) : (
            ownerStats.reports.filter((r: any) => r.ai_verdict).slice(0, 10).map((r: any) => (
              <div key={r.id} className="px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    r.ai_verdict === "SAFE" ? "bg-primary/15 text-primary" :
                    r.ai_verdict === "SPAM" ? "bg-destructive/15 text-destructive" :
                    r.ai_verdict === "OWNER_REPORT" ? "bg-amber-500/15 text-amber-500" :
                    "bg-yellow-500/15 text-yellow-500"
                  }`}>
                    {r.ai_verdict === "SAFE" ? "✓ SAFE (Abusif)" :
                     r.ai_verdict === "SPAM" ? "🚫 SPAM" :
                     r.ai_verdict === "OWNER_REPORT" ? "👑 OWNER" :
                     "⚠ UNSAFE"}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{formatDate(r.created_at)}</span>
                </div>
                <p className="text-[10px] text-foreground line-clamp-1">{r.message_content}</p>
                {r.ai_reasoning && <p className="text-[9px] text-muted-foreground italic">{r.ai_reasoning}</p>}
                <p className="text-[9px] text-muted-foreground font-mono">User: {r.user_id?.slice(0, 8)}...</p>
              </div>
            ))
          )}
        </div>
      </Section>

      {/* Invite & Manage Owners */}
      <Section icon={<UserPlus className="w-4 h-4" />} title="Gestion des Owners">
        <div className="px-4 py-3 space-y-2">
          <p className="text-[10px] text-muted-foreground">Promouvoir un utilisateur existant au rôle Owner</p>
          <div className="flex gap-1.5">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="email@exemple.com"
              className="flex-1 bg-muted text-xs px-3 py-2 rounded-lg border border-border outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={async () => {
                if (!inviteEmail.trim()) return;
                setInviteLoading(true);
                const { data, error } = await inviteOwner(inviteEmail.trim());
                setInviteLoading(false);
                if (error) { toast.error(typeof error === "string" ? error : "Erreur"); return; }
                toast.success(`${inviteEmail} promu Owner !`);
                setInviteEmail("");
                // Refresh owners list
                loadOwnersList();
              }}
              disabled={!inviteEmail.trim() || inviteLoading}
              className="text-[11px] font-bold bg-primary text-primary-foreground px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {inviteLoading ? "..." : "Promouvoir"}
            </button>
          </div>
        </div>

        {/* Current Owners List */}
        <div className="px-4 py-2">
          <p className="text-[10px] text-muted-foreground mb-2">Owners actuels :</p>
          {ownersList.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">Chargement...</p>
          ) : (
            <div className="space-y-1.5">
              {ownersList.map((o: any) => (
                <div key={o.user_id} className="flex items-center justify-between bg-muted/40 rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className={`w-3.5 h-3.5 flex-shrink-0 ${o.is_main_owner ? "text-amber-400" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-foreground truncate">{o.display_name || o.email || o.user_id?.slice(0, 12)}</p>
                      <p className="text-[9px] text-muted-foreground font-mono truncate">{o.email || `${o.user_id?.slice(0, 8)}...`}</p>
                    </div>
                  </div>
                  {o.is_main_owner ? (
                    <span className="text-[8px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">PRINCIPAL</span>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!confirm(`Rétrograder ${o.display_name || o.email} ?`)) return;
                        const { error } = await revokeOwner(o.user_id);
                        if (error) { toast.error(typeof error === "string" ? error : "Erreur"); return; }
                        toast.success("Rôle Owner révoqué");
                        loadOwnersList();
                      }}
                      className="text-[9px] text-destructive hover:underline whitespace-nowrap"
                    >
                      Rétrograder
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Delete Banned User Account */}
      {bans.length > 0 && (
        <Section icon={<Trash2 className="w-4 h-4" />} title="Supprimer comptes bannis">
          <div className="max-h-48 overflow-y-auto scrollbar-hide divide-y divide-border">
            {bans.map((ban: any) => (
              <div key={ban.id || ban.user_id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-foreground">{ban.user_id?.slice(0, 12)}...</p>
                  <p className="text-[9px] text-muted-foreground">{ban.reason}</p>
                </div>
                {deleteConfirm === ban.user_id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={async () => {
                        const { error } = await deleteUserAccount(ban.user_id);
                        if (error) { toast.error(typeof error === "string" ? error : "Erreur"); }
                        else {
                          toast.success("Compte supprimé définitivement");
                          setBans(prev => prev.filter(b => b.user_id !== ban.user_id));
                        }
                        setDeleteConfirm(null);
                      }}
                      className="text-[9px] font-bold bg-destructive text-destructive-foreground px-2 py-1 rounded"
                    >
                      Confirmer
                    </button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-[9px] text-muted-foreground px-2 py-1">Non</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(ban.user_id)}
                    className="text-[9px] text-destructive hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* AI Assistant Owner */}
      <Section icon={<Bot className="w-4 h-4" />} title="Aide IA Owner">
        <div className="px-4 py-3 space-y-2">
          <p className="text-[10px] text-muted-foreground">Posez une question à Gemini pour vous aider dans vos décisions de modération</p>
          <textarea
            value={aiQuestion}
            onChange={e => setAiQuestion(e.target.value)}
            placeholder="Ex: Ce user a 3 abus, dois-je le bannir ? / Que faire si..."
            className="w-full bg-muted text-xs px-3 py-2 rounded-lg border border-border outline-none resize-none h-16 focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={async () => {
              if (!aiQuestion.trim()) return;
              setAiLoading(true);
              setAiReply("");
              const context = `Stats: ${ownerStats.userCount} users, ${ownerStats.messageCount} messages, ${bans.length} bans actifs, ${probationUsers.length} en probation.`;
              const { data, error } = await aiAssistOwner(aiQuestion.trim(), context);
              setAiLoading(false);
              if (error) { toast.error(typeof error === "string" ? error : "Erreur IA"); return; }
              setAiReply(data?.reply || "Pas de réponse");
            }}
            disabled={!aiQuestion.trim() || aiLoading}
            className="w-full text-[11px] font-bold bg-primary text-primary-foreground py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {aiLoading ? (
              <><Sparkles className="w-3.5 h-3.5 animate-pulse" /> Gemini réfléchit...</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> Demander à Gemini</>
            )}
          </button>
          {aiReply && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
              <p className="text-[10px] text-primary font-bold mb-1">🤖 Réponse Gemini :</p>
              <p className="text-xs text-foreground whitespace-pre-wrap">{aiReply}</p>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
