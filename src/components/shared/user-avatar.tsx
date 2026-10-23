import { useEffect, useState } from "react";
import { Maximize2, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/edubridge";
import { cn } from "@/lib/utils";

const cache = new Map<string, string>();

function useAvatarUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(path && cache.get(path) ? cache.get(path)! : null);

  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    if (path.startsWith("http")) {
      setUrl(path);
      return;
    }
    const cached = cache.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    supabase.storage
      .from("avatars")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!active || !data?.signedUrl) return;
        cache.set(path, data.signedUrl);
        setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);

  return url;
}

export function UserAvatar({
  name,
  path,
  className,
  previewable = false,
}: {
  name: string;
  path?: string | null | undefined;
  className?: string;
  previewable?: boolean;
}) {
  const url = useAvatarUrl(path);
  const [previewOpen, setPreviewOpen] = useState(false);

  const avatar = (
    <Avatar
      className={cn(
        "h-10 w-10",
        previewable && url && "cursor-pointer transition-transform hover:scale-105 active:scale-95 hover:ring-2 hover:ring-primary/40",
        className,
      )}
    >
      {url && <AvatarImage src={url} alt={name} className="object-cover" />}
      <AvatarFallback className="bg-accent text-sm font-medium text-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!previewable || !url) {
    return avatar;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="group relative inline-flex shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        title="Tap to preview profile photo"
        aria-label={`Preview ${name}'s profile photo`}
      >
        {avatar}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="h-4 w-4 text-white drop-shadow" />
        </span>
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[min(92vw,24rem)] sm:max-w-md p-5 text-center">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground truncate">
              {name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Profile photo preview
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 flex items-center justify-center">
            <div className="relative h-56 w-56 sm:h-64 sm:w-64 overflow-hidden rounded-full border-4 border-border/80 bg-muted shadow-xl ring-4 ring-primary/20">
              <img
                src={url}
                alt={name}
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                View full image
              </a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPreviewOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
