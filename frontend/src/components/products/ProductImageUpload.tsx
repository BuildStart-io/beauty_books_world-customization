import { useState, useCallback } from "react";
import { uploadMedia, deleteMedia } from "@/lib/mediaStorage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, X, Loader2, AlertTriangle } from "lucide-react";

interface ProductImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages: number;
}

export default function ProductImageUpload({ images, onChange, maxImages }: ProductImageUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      toast({ title: "Image limit reached", description: `Your plan allows ${maxImages} images per product.`, variant: "destructive" });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploading(true);

    try {
      const uploaded: string[] = [];
      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 5 * 1024 * 1024) {
          toast({ title: "File too large", description: `${file.name} exceeds 5MB limit.`, variant: "destructive" });
          continue;
        }

        uploaded.push(await uploadMedia(file, "products"));
      }
      onChange([...images, ...uploaded]);
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [user, images, maxImages, onChange, toast]);

  const removeImage = useCallback(async (url: string) => {
    await deleteMedia(url);
    onChange(images.filter((img) => img !== url));
  }, [images, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Product Images</Label>
        <span className="text-xs text-muted-foreground">
          {images.length}/{maxImages}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {images.map((url) => (
          <div key={url} className="relative group w-20 h-20 rounded-md overflow-hidden border border-border">
            <img src={url} alt="Product" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(url)}
              className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {images.length < maxImages && (
          <label className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {images.length >= maxImages && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Image limit reached. Upgrade your plan for more.
        </p>
      )}
    </div>
  );
}
