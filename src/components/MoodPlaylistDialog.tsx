import React, { useState } from "react";
import { X, Music, Sparkles, ExternalLink, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface MoodPlaylistDialogProps {
  open: boolean;
  onClose: () => void;
}

interface PlaylistResult {
  playlist_url: string;
  playlist_name: string;
  description: string;
  track_count: number;
  visibility: "public" | "private";
}

type Style = "auto" | "chill" | "party" | "focus";
type Language = "any" | "fr" | "en";
type Visibility = "private" | "public";

const OWNER_EMAILS = ["theplayboy117@gmail.com", "tracyrosmond05@gmail.com"];

export default function MoodPlaylistDialog({ open, onClose }: MoodPlaylistDialogProps) {
  const { user } = useAuth();
  const [mood, setMood] = useState("");
  const [style, setStyle] = useState<Style>("auto");
  const [language, setLanguage] = useState<Language>("any");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaylistResult | null>(null);

  if (!open) return null;

  const isOwner = OWNER_EMAILS.includes(user?.email?.toLowerCase() || "");

  const handleGenerate = async () => {
    if (!isOwner) return;
    if (mood.trim().length < 3) {
      toast.error("Décris ton humeur en quelques mots");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-mood-playlist", {
        body: { mood: mood.trim(), style, language, visibility },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as PlaylistResult);
      toast.success("Playlist créée 🎵");
    } catch (e: any) {
      const msg = e?.message ?? "Erreur inconnue";
      toast.error(msg.length > 120 ? "Erreur : impossible de créer la playlist" : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMood("");
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Playlist selon l'humeur</h2>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isOwner && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
            <Lock className="w-8 h-8 mx-auto mb-2 text-destructive" />
            <p className="text-sm font-semibold text-foreground">Fonctionnalité privée</p>
            <p className="text-xs text-muted-foreground mt-1">
              La playlist Spotify est connectée au compte personnel du propriétaire. Tu peux explorer le reste de Marv-IA librement.
            </p>
          </div>
        )}

        {isOwner && !result && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Décris ton humeur, je crée une playlist Spotify sur mesure.
            </p>
            <textarea
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="Ex: nostalgique mais envie de danser..."
              rows={3}
              maxLength={500}
              disabled={loading}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary resize-none"
            />

            {/* Options avancées */}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Style</label>
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {(["auto", "chill", "party", "focus"] as Style[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStyle(s)}
                      disabled={loading}
                      className={`text-xs py-1.5 rounded-md font-medium transition-colors ${
                        style === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "auto" ? "Auto" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Langue</label>
                <div className="grid grid-cols-3 gap-1 mt-1.5">
                  {([["any", "Toutes"], ["fr", "FR"], ["en", "EN"]] as [Language, string][]).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setLanguage(k)}
                      disabled={loading}
                      className={`text-xs py-1.5 rounded-md font-medium transition-colors ${
                        language === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visibilité</label>
                <div className="grid grid-cols-2 gap-1 mt-1.5">
                  {([["private", "Privée"], ["public", "Publique"]] as [Visibility, string][]).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setVisibility(k)}
                      disabled={loading}
                      className={`text-xs py-1.5 rounded-md font-medium transition-colors ${
                        visibility === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || mood.trim().length < 3}
              className="w-full mt-5 bg-primary text-primary-foreground py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Création...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Générer
                </>
              )}
            </button>
          </>
        )}

        {isOwner && result && (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground">{result.playlist_name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{result.description}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {result.track_count} pistes · {result.visibility === "public" ? "Publique" : "Privée"}
              </p>
            </div>
            <a
              href={result.playlist_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#1DB954] text-black py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-[#1ed760] transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Ouvrir dans Spotify
            </a>
            <button
              onClick={() => { setResult(null); setMood(""); }}
              className="w-full text-sm text-muted-foreground hover:text-foreground py-2"
            >
              Créer une autre playlist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
