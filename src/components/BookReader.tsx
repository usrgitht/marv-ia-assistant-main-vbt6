import { useEffect, useState } from "react";
import { X, BookOpen, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookReaderProps {
  open: boolean;
  onClose: () => void;
  book: {
    title: string;
    authors: string[];
    google_book_id: string;
    preview_link: string | null;
    info_link: string | null;
    description: string | null;
  } | null;
}

/**
 * Lecteur de livre intégré.
 * - Si l'identifiant vient d'OpenLibrary (OL...W ou OL...M), on tente le lecteur Internet Archive.
 * - Sinon on tente le visualiseur Google Books embeddable.
 * - Fallback : description complète + lien externe.
 */
export default function BookReader({ open, onClose, book }: BookReaderProps) {
  const [loading, setLoading] = useState(true);
  const [readerSrc, setReaderSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !book) return;
    setLoading(true);
    setReaderSrc(null);

    const id = book.google_book_id || "";
    // Project Gutenberg books have id like "gut_<number>" with full readable HTML in preview_link
    const isGutenberg = /^gut_\d+$/i.test(id);
    // OpenLibrary IDs look like OL12345W (work) or OL12345M (edition)
    const isOpenLibrary = /^OL\d+[WM]$/i.test(id);

    if (isGutenberg && book.preview_link) {
      setReaderSrc(book.preview_link);
      setLoading(false);
    } else if (isOpenLibrary) {
      const olKey = id.toUpperCase().endsWith("W") ? `/works/${id}` : `/books/${id}`;
      (async () => {
        try {
          const resp = await fetch(`https://openlibrary.org${olKey}/editions.json?limit=10`);
          if (resp.ok) {
            const data = await resp.json();
            const editionWithIA = (data.entries || []).find((e: any) => e.ocaid);
            if (editionWithIA?.ocaid) {
              setReaderSrc(`https://archive.org/stream/${editionWithIA.ocaid}?ui=embed#mode/2up`);
              setLoading(false);
              return;
            }
          }
        } catch {
          /* ignore */
        }
        setReaderSrc(`https://openlibrary.org${olKey}`);
        setLoading(false);
      })();
    } else if (book.preview_link) {
      // Generic readable URL fallback
      setReaderSrc(book.preview_link);
      setLoading(false);
    } else if (id) {
      // Google Books embeddable viewer
      setReaderSrc(`https://books.google.com/books?id=${encodeURIComponent(id)}&pg=PP1&output=embed`);
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [open, book]);

  if (!open || !book) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur flex flex-col animate-in fade-in duration-200">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{book.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {book.authors.join(", ") || "Auteur inconnu"}
          </p>
        </div>
        {book.info_link && (
          <a href={book.info_link} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="h-8">
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              <span className="text-xs">Source</span>
            </Button>
          </a>
        )}
        <button
          onClick={onClose}
          aria-label="Fermer le lecteur"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-hidden bg-muted/30">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}
        {!loading && readerSrc && (
          <iframe
            src={readerSrc}
            title={`Lecture : ${book.title}`}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        )}
        {!loading && !readerSrc && (
          <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto">
            <h2 className="text-xl font-bold mb-2">{book.title}</h2>
            <p className="text-sm text-muted-foreground mb-4">{book.authors.join(", ")}</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {book.description || "Aucun aperçu de lecture disponible pour ce livre. Utilise le lien Source pour le consulter."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
