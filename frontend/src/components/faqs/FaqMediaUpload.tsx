import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, X, FileText, Film, Image as ImageIcon } from "lucide-react";
import { uploadMedia, deleteMedia } from "@/lib/mediaStorage";

const MAX_FILES = 2;

interface FaqMediaUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
}

function kindOf(url: string): "image" | "video" | "document" {
  const lower = url.toLowerCase().split("?")[0];
  if (/\.(mp4|mov|webm|3gp|3gpp|avi)$/.test(lower)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt)$/.test(lower)) return "document";
  return "image";
}

export default function FaqMediaUpload({ value, onChange }: FaqMediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_FILES - value.length;
    if (remaining <= 0) {
      toast({ title: `Maximum ${MAX_FILES} attachments per FAQ`, variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const picked = Array.from(files).slice(0, remaining);
      const urls: string[] = [];
      for (const file of picked) {
        urls.push(await uploadMedia(file, "faq"));
      }
      onChange([...value, ...urls]);
      toast({ title: `${urls.length} file${urls.length > 1 ? "s" : ""} uploaded` });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (url: string) => {
    onChange(value.filter((u) => u !== url));
    await deleteMedia(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {value.map((url) => {
          const kind = kindOf(url);
          return (
            <div key={url} className="relative w-24 h-24 rounded-md border overflow-hidden bg-muted">
              {kind === "image" ? (
                <img src={url} alt="FAQ attachment" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground p-1">
                  {kind === "video" ? <Film className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                  <span className="text-[10px] text-center break-all line-clamp-2">
                    {decodeURIComponent(url.split("/").pop() || "file")}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => handleRemove(url)}
                className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5 border"
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading || value.length >= MAX_FILES}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Add media ({value.length}/{MAX_FILES})
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <ImageIcon className="h-3 w-3" />
        Images, videos or PDFs. Sent once per customer the first time this FAQ is used.
      </p>
    </div>
  );
}
