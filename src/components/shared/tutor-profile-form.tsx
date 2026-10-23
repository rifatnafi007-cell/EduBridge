import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { youtubeId } from "@/components/shared/demo-videos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LEVELS, SUBJECTS } from "@/lib/edubridge";
import { BANGLADESH_AREAS, getUserLocation } from "@/lib/geo";
import { cn } from "@/lib/utils";

export function TutorProfileForm({
  redirectOnCreate = false,
  className,
}: {
  redirectOnCreate?: boolean;
  className?: string;
} = {}) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [bio, setBio] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [rate, setRate] = useState("800");
  const [experience, setExperience] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [videos, setVideos] = useState<string[]>([""]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [detectingLoc, setDetectingLoc] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["my-tutor-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tutor_profiles")
        .select("id, bio, qualifications, subjects, levels, hourly_rate, experience_years, is_active, demo_video_urls, latitude, longitude")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setBio(existing.bio ?? "");
    setQualifications(existing.qualifications ?? "");
    setSubjects(existing.subjects ?? []);
    setLevels(existing.levels ?? []);
    setRate(String(existing.hourly_rate ?? "800"));
    setExperience(String(existing.experience_years ?? 0));
    setIsActive(existing.is_active ?? true);
    setVideos(existing.demo_video_urls?.length ? existing.demo_video_urls : [""]);
    if (typeof existing.latitude === "number" && typeof existing.longitude === "number") {
      setLat(existing.latitude);
      setLng(existing.longitude);
    }
  }, [existing]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (subjects.length === 0) {
      toast.error("Pick at least one subject.");
      return;
    }
    const filledVideos = videos.map((v) => v.trim()).filter(Boolean);
    const invalid = filledVideos.find((v) => !youtubeId(v));
    if (invalid) {
      toast.error(`Not a valid YouTube link: ${invalid}`);
      return;
    }
    setSaving(true);
    const payload = {
      bio: bio.trim() || null,
      qualifications: qualifications.trim() || null,
      subjects,
      levels,
      hourly_rate: Number(rate) || 0,
      experience_years: Number(experience) || 0,
      is_active: isActive,
      demo_video_urls: filledVideos,
      latitude: lat,
      longitude: lng,
    };
    const { error } = existing
      ? await supabase.from("tutor_profiles").update(payload).eq("id", existing.id)
      : await supabase.from("tutor_profiles").insert({ ...payload, user_id: user.id });

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
    toast.success(existing ? "Tutor profile updated." : "Tutor profile created.");
    if (!existing && redirectOnCreate) navigate({ to: "/tutor/availability" });
  }

  if (isLoading) return <div className={cn("h-40 animate-pulse rounded-xl bg-muted", className)} />;

  return (
    <form
      onSubmit={save}
      className={cn("w-full max-w-2xl space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm", className)}
    >
      <div className="space-y-2">
        <Label htmlFor="bio">About you</Label>
        <Textarea
          id="bio"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell students about your teaching style and results."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="quals">Qualifications</Label>
        <Input
          id="quals"
          value={qualifications}
          onChange={(e) => setQualifications(e.target.value)}
          placeholder="e.g. BSc in Physics, University of Dhaka"
        />
      </div>

      <div className="space-y-2">
        <Label>Subjects you teach</Label>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(subjects, setSubjects, s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                subjects.includes(s)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Levels</Label>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => toggle(levels, setLevels, l)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                levels.includes(l)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rate">Rate per session (৳)</Label>
          <Input id="rate" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exp">Years of experience</Label>
          <Input id="exp" type="number" min={0} value={experience} onChange={(e) => setExperience(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Demo class videos (YouTube)</Label>
        <p className="text-sm text-muted-foreground">Students can watch these on your profile.</p>
        <div className="space-y-2">
          {videos.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={v}
                onChange={(e) => setVideos(videos.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove video link"
                onClick={() => {
                  const next = videos.filter((_, j) => j !== i);
                  setVideos(next.length ? next : [""]);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setVideos([...videos, ""])}>
          <Plus className="mr-2 h-4 w-4" /> Add another video
        </Button>
      </div>

      {/* Home Tuition Geographic Location */}
      <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
        <div>
          <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" /> Home Tuition Base & Location
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set your teaching hub so nearby students can discover you on the map and calculate home tuition distance.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Select Hub Area</Label>
            <Select
              value={selectedArea}
              onValueChange={(val) => {
                setSelectedArea(val);
                const area = BANGLADESH_AREAS[val];
                if (area) {
                  setLat(area.lat);
                  setLng(area.lng);
                  toast.success(`Coordinates set to ${area.name}`);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick neighborhood / area" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BANGLADESH_AREAS).map(([key, loc]) => (
                  <SelectItem key={key} value={key}>
                    {loc.name} ({loc.division})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={detectingLoc}
              onClick={async () => {
                setDetectingLoc(true);
                try {
                  const loc = await getUserLocation();
                  setLat(loc.lat);
                  setLng(loc.lng);
                  toast.success("GPS location detected successfully!");
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : "Failed to detect location";
                  toast.error(message);
                } finally {
                  setDetectingLoc(false);
                }
              }}
              className="gap-1.5 text-xs h-10"
            >
              {detectingLoc ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="h-3.5 w-3.5 text-primary" />
              )}
              {detectingLoc ? "Detecting GPS..." : "Detect My Current Location"}
            </Button>
          </div>
        </div>

        {lat && lng && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 p-2.5 rounded-lg border border-emerald-500/20">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              Coordinates active: <strong>{lat.toFixed(4)}, {lng.toFixed(4)}</strong> (Ready for map & radius search)
            </span>
          </div>
        )}
      </div>


      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Visible in search</p>
          <p className="text-sm text-muted-foreground">Turn off to pause new offers.</p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {existing ? "Save changes" : "Create tutor profile"}
      </Button>
    </form>
  );
}
