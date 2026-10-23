import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  SearchX,
  SlidersHorizontal,
  Sparkles,
  MapPin,
  Navigation,
  Map as MapIcon,
  LayoutGrid,
  Loader2,
  X,
  LocateFixed,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { TutorCard, type TutorListItem } from "@/components/shared/tutor-card";
import { TutorMap, type MapTutor } from "@/components/shared/tutor-map";
import { ProfileGateCard } from "@/components/shared/profile-gate-card";
import { useProfileCompletion } from "@/hooks/use-profile-completion";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, SUBJECTS, formatTaka } from "@/lib/edubridge";
import { cn } from "@/lib/utils";
import {
  BANGLADESH_AREAS,
  calculateDistanceKm,
  formatDistance,
  getTutorCoordinates,
  getUserLocation,
  type Coordinates,
} from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/student/search")({
  head: () => ({
    meta: [
      { title: "Find tutors — EduBridge" },
      { name: "description", content: "Search EduBridge tutors by subject, level, budget, rating and geographic location." },
      { property: "og:title", content: "Find tutors — EduBridge" },
      { property: "og:description", content: "Discover verified nearby tutors on the interactive map for home tuition." },
    ],
  }),
  component: SearchPage,
});

type TutorSearchItem = TutorListItem & {
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
  coords?: Coordinates | null;
  profiles: TutorListItem["profiles"] & { address?: string | null };
};

function SearchPage() {
  const navigate = useNavigate();
  const { isLocationSearchUnlocked } = useProfileCompletion();

  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [level, setLevel] = useState("all");
  const [maxRate, setMaxRate] = useState(2000);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("distance");
  const [onlyRated, setOnlyRated] = useState(false);

  // Geographic Location & Radius states
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [filterByRadius, setFilterByRadius] = useState<boolean>(false);
  const [detectingGps, setDetectingGps] = useState<boolean>(false);
  const [selectedHub, setSelectedHub] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"split" | "grid" | "map">("split");
  const [selectedMapTutorId, setSelectedMapTutorId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tutor-search"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tutor_profiles")
        .select(
          "id, user_id, bio, qualifications, subjects, levels, hourly_rate, avg_rating, total_reviews, experience_years, latitude, longitude, profiles(full_name, avatar_url, address, phone)",
        )
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as TutorSearchItem[];
    },
  });

  // Calculate distance & apply multi-filter
  const results = useMemo(() => {
    const list = (data ?? []).map((t) => {
      const coords = getTutorCoordinates(t);
      let distanceKm: number | null = null;
      if (userLocation && coords) {
        distanceKm = calculateDistanceKm(userLocation, coords);
      }
      return {
        ...t,
        coords,
        distanceKm,
      };
    });

    const isTutorLocationComplete = (t: TutorSearchItem) => {
      const hasPhone = !!t.profiles?.phone?.trim();
      const hasAddress = !!t.profiles?.address?.trim() || (typeof t.latitude === "number" && typeof t.longitude === "number");
      const hasQuals = !!t.qualifications?.trim();
      return hasPhone && hasAddress && hasQuals;
    };

    const filtered = list.filter((t) => {
      const name = t.profiles?.full_name?.toLowerCase() ?? "";
      const address = t.profiles?.address?.toLowerCase() ?? "";

      // 1. Text & keyword search
      if (q && !name.includes(q.toLowerCase()) && !t.subjects.join(" ").toLowerCase().includes(q.toLowerCase()))
        return false;

      // 2. Subject filter
      if (subject !== "all" && !t.subjects.includes(subject)) return false;

      // 3. Level filter
      if (level !== "all" && t.levels.length > 0 && !t.levels.includes(level)) return false;

      // 4. Rate filter
      if (Number(t.hourly_rate) > maxRate) return false;

      // 5. Rating filter
      if (Number(t.avg_rating) < minRating) return false;

      // 6. Only reviewed
      if (onlyRated && t.total_reviews === 0) return false;

      // 7. Area Hub filter (Location-based: tutor must have completed profile)
      if (selectedHub !== "all") {
        if (!isTutorLocationComplete(t)) return false;
        const hub = BANGLADESH_AREAS[selectedHub];
        if (hub && !address.includes(selectedHub) && !address.includes(hub.name.toLowerCase())) {
          return false;
        }
      }

      // 8. Geographic Distance Radius filter (Requires tutor completed profile)
      if (filterByRadius && userLocation) {
        if (!isTutorLocationComplete(t)) return false;
        if (typeof t.distanceKm !== "number" || t.distanceKm > radiusKm) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "distance") {
        if (typeof a.distanceKm === "number" && typeof b.distanceKm === "number") {
          return a.distanceKm - b.distanceKm;
        }
        if (typeof a.distanceKm === "number") return -1;
        if (typeof b.distanceKm === "number") return 1;
        return Number(b.avg_rating) - Number(a.avg_rating);
      }
      if (sort === "rate-asc") return Number(a.hourly_rate) - Number(b.hourly_rate);
      if (sort === "rate-desc") return Number(b.hourly_rate) - Number(a.hourly_rate);
      if (sort === "experience") return b.experience_years - a.experience_years;
      return Number(b.avg_rating) - Number(a.avg_rating);
    });
  }, [
    data,
    q,
    subject,
    level,
    maxRate,
    minRating,
    selectedHub,
    sort,
    onlyRated,
    userLocation,
    radiusKm,
  ]);

  const activeFilterCount =
    (q.trim() ? 1 : 0) +
    (subject !== "all" ? 1 : 0) +
    (level !== "all" ? 1 : 0) +
    (userLocation ? 1 : 0) +
    (maxRate < 2000 ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (onlyRated ? 1 : 0);

  // Format tutors for Leaflet map component (Only tutors with completed location profiles)
  const mapTutors: MapTutor[] = useMemo(() => {
    return results
      .filter((t) => {
        if (!t.coords) return false;
        const hasPhone = !!t.profiles?.phone?.trim();
        const hasAddress = !!t.profiles?.address?.trim() || (typeof t.latitude === "number" && typeof t.longitude === "number");
        const hasQuals = !!t.qualifications?.trim();
        return hasPhone && hasAddress && hasQuals;
      })
      .map((t) => ({
        id: t.id,
        name: t.profiles?.full_name ?? "Tutor",
        avatarUrl: t.profiles?.avatar_url,
        subjects: t.subjects,
        hourlyRate: t.hourly_rate,
        avgRating: t.avg_rating,
        totalReviews: t.total_reviews,
        lat: t.coords!.lat,
        lng: t.coords!.lng,
        distanceKm: t.distanceKm,
        address: t.profiles?.address,
      }));
  }, [results]);

  // Detect student's current GPS location
  async function handleDetectGps() {
    if (!isLocationSearchUnlocked) {
      toast.error(
        "Profile incomplete: Please complete your Mobile, Address, Study Institution, and Grades before using location search.",
        {
          action: {
            label: "Complete Profile",
            onClick: () => navigate({ to: "/student/profile" }),
          },
        },
      );
      return;
    }

    setDetectingGps(true);
    try {
      const loc = await getUserLocation();
      setUserLocation(loc);
      setLocationLabel("Current GPS Location");
      setFilterByRadius(true);
      setSort("distance");
      toast.success("GPS Location detected! Tutors sorted by nearest distance.");
    } catch (err: any) {
      toast.error(err.message || "Could not detect GPS location.");
    } finally {
      setDetectingGps(false);
    }
  }

  function handleSelectHubArea(hubKey: string) {
    if (hubKey !== "all" && !isLocationSearchUnlocked) {
      toast.error(
        "Profile incomplete: Please complete your profile (Phone, Address, Institution, and Grade) to enable location matching.",
        {
          action: {
            label: "Complete Profile",
            onClick: () => navigate({ to: "/student/profile" }),
          },
        },
      );
      return;
    }

    setSelectedHub(hubKey);
    if (hubKey === "all") {
      setLocationLabel("");
      return;
    }
    const area = BANGLADESH_AREAS[hubKey];
    if (area) {
      setUserLocation({ lat: area.lat, lng: area.lng });
      setLocationLabel(area.name);
      setFilterByRadius(true);
      setSort("distance");
      toast.success(`Search center set to ${area.name}`);
    }
  }

  function clearLocation() {
    setUserLocation(null);
    setLocationLabel("");
    setFilterByRadius(false);
    setSelectedHub("all");
    setSort("rating");
  }

  function reset() {
    setQ("");
    setSubject("all");
    setLevel("all");
    setMaxRate(2000);
    setMinRating(0);
    setOnlyRated(false);
    clearLocation();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find Tutors"
        subtitle="Discover verified home tutors by geographic distance, interactive map, subject, and rate."
        action={
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground gap-1.5 shadow-2xs"
            >
              <Link to="/student/recommendations">
                <Sparkles className="h-4 w-4" /> AI Tutor Matcher
              </Link>
            </Button>
          </div>
        }
      />

      <ProfileGateCard />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Left Filter Sidebar */}
        <aside
          className={cn(
            "h-fit rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-6 transition-all",
            !mobileFiltersOpen && "hidden lg:block",
          )}
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Filters & Location</h2>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-bold">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="lg:hidden text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {/* Search Input */}
            <div className="space-y-1.5">
              <Label htmlFor="q" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Search
              </Label>
              <Input
                id="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name or subject"
              />
            </div>

            {/* Geographic Location & Near Me GPS */}
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Location & Near Me
                </Label>
                {userLocation && (
                  <button
                    type="button"
                    onClick={clearLocation}
                    className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>

              {!isLocationSearchUnlocked && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Location Search Locked</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Complete your mobile, address, institution, and grades to unlock distance & map search.
                  </p>
                  <Button asChild size="sm" variant="outline" className="w-full h-7 text-[11px] border-amber-500/40 text-amber-800 dark:text-amber-200 font-semibold mt-1">
                    <Link to="/student/profile">Complete Profile Now</Link>
                  </Button>
                </div>
              )}

              {/* GPS Button */}
              <Button
                type="button"
                variant={userLocation && locationLabel.includes("GPS") ? "default" : "outline"}
                size="sm"
                disabled={detectingGps || !isLocationSearchUnlocked}
                onClick={handleDetectGps}
                className="w-full gap-1.5 text-xs h-9 shadow-2xs font-semibold"
              >
                {!isLocationSearchUnlocked ? (
                  <>
                    <Lock className="h-3.5 w-3.5 text-amber-500" />
                    <span>GPS Locked (Profile Incomplete)</span>
                  </>
                ) : detectingGps ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" />
                )}
                {isLocationSearchUnlocked && (detectingGps ? "Detecting GPS..." : "📍 Use My Current Location")}
              </Button>

              {/* Or Select Hub Area */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-[11px] text-muted-foreground">Or pick neighborhood center:</Label>
                <Select value={selectedHub} onValueChange={handleSelectHubArea} disabled={!isLocationSearchUnlocked}>
                  <SelectTrigger className="w-full h-8 text-xs bg-card">
                    <SelectValue placeholder="All neighborhoods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All neighborhoods</SelectItem>
                    {Object.entries(BANGLADESH_AREAS).map(([key, loc]) => (
                      <SelectItem key={key} value={key}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Distance Radius Slider */}
              {userLocation && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-foreground">Distance Radius</span>
                    <span className="font-bold text-primary">{radiusKm} km</span>
                  </div>
                  <Slider
                    value={[radiusKm]}
                    min={2}
                    max={25}
                    step={1}
                    onValueChange={(vals) => {
                      setRadiusKm(vals[0] ?? 10);
                      setFilterByRadius(true);
                    }}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>2 km (Walking)</span>
                    <span>25 km (Citywide)</span>
                  </div>
                </div>
              )}

              {userLocation && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <Navigation className="h-3 w-3 shrink-0" />
                  <span>Center: {locationLabel || "Custom Point"}</span>
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Subject
              </Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Level */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Academic Level
              </Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Max Rate
                </Label>
                <span className="font-bold text-foreground text-xs">{formatTaka(maxRate)}</span>
              </div>
              <Slider
                value={[maxRate]}
                min={200}
                max={3000}
                step={100}
                onValueChange={(v) => setMaxRate(v[0] ?? 2000)}
              />
            </div>

            {/* Rating */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Min Rating
                </Label>
                <span className="font-bold text-foreground text-xs">{minRating.toFixed(1)}★</span>
              </div>
              <Slider
                value={[minRating]}
                min={0}
                max={5}
                step={0.5}
                onValueChange={(v) => setMinRating(v[0] ?? 0)}
              />
            </div>

            {/* Reviewed Only */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={onlyRated} onCheckedChange={(v) => setOnlyRated(v === true)} />
              Only reviewed tutors
            </label>
          </div>
        </aside>

        {/* Right Search Results & Interactive Map */}
        <div className="space-y-4">
          {/* Top Bar with View Mode and Sort */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm font-semibold text-foreground">
                  {results.length} tutor{results.length === 1 ? "" : "s"} found
                </p>
                {userLocation && (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-[10px] sm:text-[11px] gap-1 font-semibold py-0.5">
                    <MapPin className="h-3 w-3" /> Within {radiusKm} km
                  </Badge>
                )}
              </div>

              {/* Mobile Filter Toggle Button */}
              <Button
                type="button"
                variant={mobileFiltersOpen || activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setMobileFiltersOpen((prev) => !prev)}
                className="lg:hidden gap-1.5 text-xs h-7.5 px-2.5 font-semibold"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4.5 min-w-4 px-1 text-[10px] ml-0.5 bg-background text-foreground font-bold"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
                <button
                  type="button"
                  title="Split Map & Grid"
                  onClick={() => setViewMode("split")}
                  className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-all ${
                    viewMode === "split"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline sm:inline">Split</span>
                </button>
                <button
                  type="button"
                  title="Grid Only"
                  onClick={() => setViewMode("grid")}
                  className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-all ${
                    viewMode === "grid"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline sm:inline">Grid</span>
                </button>
                <button
                  type="button"
                  title="Map Only"
                  onClick={() => setViewMode("map")}
                  className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-all ${
                    viewMode === "map"
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline sm:inline">Map</span>
                </button>
              </div>

              {/* Sort Dropdown */}
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-32 sm:w-40 h-7.5 sm:h-8 text-xs bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="distance">📍 Nearest first</SelectItem>
                  <SelectItem value="rating">Highest rated</SelectItem>
                  <SelectItem value="rate-asc">Lowest rate</SelectItem>
                  <SelectItem value="rate-desc">Highest rate</SelectItem>
                  <SelectItem value="experience">Most experienced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Interactive Map View */}
          {(viewMode === "split" || viewMode === "map") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Interactive Home Tuition Map
                </span>
                <span className="hidden sm:inline">Click any pin to inspect tutor rate & distance</span>
              </div>
              {!isLocationSearchUnlocked && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 font-medium">
                  <Lock className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Home Tuition Location Search is locked.</strong> Complete your profile (Mobile, Address, Study Institution, and Grades) to enable nearest-distance home tuition pins and GPS.
                  </span>
                </div>
              )}
              <TutorMap
                tutors={mapTutors}
                userLocation={userLocation}
                radiusKm={radiusKm}
                selectedTutorId={selectedMapTutorId}
                onSelectTutor={(id) => setSelectedMapTutorId(id)}
                className={viewMode === "map" ? "h-[min(620px,calc(100dvh-13rem))] min-h-[380px] w-full" : "h-[240px] sm:h-[360px] w-full"}
              />
            </div>
          )}

          {/* Grid Cards View */}
          {viewMode !== "map" && (
            <div>
              {isLoading ? (
                <LoadingSkeleton />
              ) : results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="No tutors found in this area"
                  description="Try widening your distance radius, adjusting your budget, or clearing the location filter."
                  action={
                    <Button variant="outline" onClick={reset}>
                      Reset filters
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3 w-full min-w-0">
                  {results.map((t) => (
                    <TutorCard
                      key={t.id}
                      tutor={t}
                      distanceKm={t.distanceKm}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
