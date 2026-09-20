import { useState, useCallback } from "react";
import { uploadMedia, deleteMedia } from "@/lib/mediaStorage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Video, X, Loader2 } from "lucide-react";

interface ProductVideoUploadProps {
  videoUrl: string | null;
  onChange: (videoUrl: string | null) => void;
}

export default function ProductVideoUpload({ videoUrl, onChange }: ProductVideoUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("video/")) {
      toast({ title: "Invalid file", description: "Please upload a video file.", variant: "destructive" });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Video must be under 20MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      onChange(await uploadMedia(file, "videos"));
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [user, onChange, toast]);

  const removeVideo = useCallback(async () => {
    if (videoUrl) {
      await deleteMedia(videoUrl);
      onChange(null);
    }
  }, [videoUrl, onChange]);

  return (
    <div className="space-y-2">
      <Label>Product Video (optional, max 1)</Label>

      {videoUrl ? (
        <div className="relative group w-full max-w-xs">
          <video src={videoUrl} controls className="w-full rounded-md border border-border" style={{ maxHeight: 160 }} />
          <button
            type="button"
            onClick={removeVideo}
            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <label className="w-full max-w-xs h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors gap-2">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Video className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Upload video</span>
            </>
          )}
          <input
            type="file"
            accept="video/mp4,video/mov,video/webm,video/3gpp"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
