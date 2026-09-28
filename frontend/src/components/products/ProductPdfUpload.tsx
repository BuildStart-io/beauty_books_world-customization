import { useState, useCallback } from "react";
import { uploadMedia, deleteMedia } from "@/lib/mediaStorage";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, X, Loader2 } from "lucide-react";

interface ProductPdfUploadProps {
  pdfUrl: string | null;
  onChange: (pdfUrl: string | null) => void;
}

export default function ProductPdfUpload({ pdfUrl, onChange }: ProductPdfUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Invalid file", description: "Please upload a valid PDF document.", variant: "destructive" });
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF brochure must be under 30MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      onChange(await uploadMedia(file, "products"));
      toast({ title: "PDF uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [user, onChange, toast]);

  const removePdf = useCallback(async () => {
    if (pdfUrl) {
      await deleteMedia(pdfUrl);
      onChange(null);
    }
  }, [pdfUrl, onChange]);

  return (
    <div className="space-y-2">
      <Label>Product Brochure / Book PDF (optional)</Label>

      {pdfUrl ? (
        <div className="relative group w-full max-w-sm flex items-center gap-3 p-3 rounded-md border border-border bg-muted/40">
          <FileText className="h-6 w-6 text-primary flex-shrink-0" />
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline truncate max-w-[200px]"
          >
            {pdfUrl.split("/").pop() || "View PDF Document"}
          </a>
          <button
            type="button"
            onClick={removePdf}
            className="ml-auto bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="w-full max-w-sm h-16 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors gap-2 px-4">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Upload PDF brochure or catalog</span>
            </>
          )}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
