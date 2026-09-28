import { useState, useCallback } from "react";
import { uploadMedia, deleteMedia } from "@/lib/mediaStorage";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Volume2, X, Loader2 } from "lucide-react";

interface ProductAudioUploadProps {
  audioUrl: string | null;
  onChange: (audioUrl: string | null) => void;
}

export default function ProductAudioUpload({ audioUrl, onChange }: ProductAudioUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name)) {
      toast({ title: "Invalid file", description: "Please upload an audio file (.mp3, .wav, .m4a).", variant: "destructive" });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Audio preview must be under 20MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      onChange(await uploadMedia(file, "products"));
      toast({ title: "Audio uploaded successfully" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [user, onChange, toast]);

  const removeAudio = useCallback(async () => {
    if (audioUrl) {
      await deleteMedia(audioUrl);
      onChange(null);
    }
  }, [audioUrl, onChange]);

  return (
    <div className="space-y-2">
      <Label>Product Audio Guide / Voice Sample (optional)</Label>

      {audioUrl ? (
        <div className="relative group w-full max-w-sm p-3 rounded-md border border-border bg-muted/40 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                {audioUrl.split("/").pop() || "Audio File"}
              </span>
            </div>
            <button
              type="button"
              onClick={removeAudio}
              className="bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <audio src={audioUrl} controls className="w-full h-8" />
        </div>
      ) : (
        <label className="w-full max-w-sm h-16 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors gap-2 px-4">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Volume2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Upload MP3 audio preview</span>
            </>
          )}
          <input
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,.mp3,.wav,.m4a"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
