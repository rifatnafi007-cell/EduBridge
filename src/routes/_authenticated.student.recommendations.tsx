import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Bot,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Lightbulb,
  SearchX,
  Target,
  GraduationCap,
  TrendingUp,
  BrainCircuit,
  Award,
  DollarSign,
  CalendarDays,
  Copy,
  Check,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { RatingStars } from "@/components/shared/rating-stars";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DAYS,
  DAYS_SHORT,
  LEVELS,
  SUBJECTS,
  formatSlot,
  formatTaka,
} from "@/lib/edubridge";
import {
  DEFAULT_PREFERENCES,
  GOAL_LABELS,
  STYLE_LABELS,
  MEDIUM_LABELS,
  rankTutorsByPreferences,
  type AcademicGoal,
  type TeachingStylePreference,
  type MediumPreference,
  type StudentPreferences,
  type TutorWithSlots,
  type ScoredTutor,
} from "@/lib/recommendation";
import type { AIRecommendationResponse } from "@/lib/recommendation.server";

export const Route = createFileRoute("/_authenticated/student/recommendations")({
  head: () => ({
    meta: [
      { title: "AI Tutor Matchmaker & Advisor — EduBridge" },
      {
        name: "description",
        content: "Personalized AI academic diagnostic, study roadmap, and tutor recommendation advisor.",
      },
      { property: "og:title", content: "AI Tutor Matchmaker & Advisor — EduBridge" },
      {
        property: "og:description",
        content: "Diagnose your academic goals, get a 4-week roadmap, and match with the ideal verified tutor.",
      },
    ],
  }),
  component: StudentRecommendationsPage,
});

const STORAGE_KEY = "edubridge_student_academic_consultation";

const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  Math: ["Higher Math Calculus", "Trigonometry & Geometry", "Algebra & Functions", "Statistics & Probability"],
  Physics: ["Newtonian Mechanics", "Electricity & Magnetism", "Thermodynamics", "Wave & Optics"],
  Chemistry: ["Organic Reaction Mechanisms", "Periodic Properties & Bonding", "Chemical Equilibrium", "Stoichiometry"],
  Biology: ["Genetics & Molecular Biology", "Human Physiology", "Plant Ecology", "Cell Division"],
  English: ["Creative Writing & Essays", "Grammar & Sentence Correction", "IELTS / Speaking Fluency", "Comprehension & Vocabulary"],
  ICT: ["C Programming & Algorithms", "HTML / Web Design", "Database & SQL", "Number Systems & Logic Gates"],
};

function StudentRecommendationsPage() {
  const { profile } = useAuth();
  const [copiedProposal, setCopiedProposal] = useState(false);

  // Load initial consultation preferences
  const [preferences, setPreferences] = useState<StudentPreferences>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved) as StudentPreferences;
      } catch {
        // Ignore parse error
      }
    }
    return {
      ...DEFAULT_PREFERENCES,
      location: profile?.address || "",
    };
  });

  const [activeTab, setActiveTab] = useState<"advisor" | "consultation">("advisor");
  const [aiInsights, setAiInsights] = useState<AIRecommendationResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Sync profile address if available
  useEffect(() => {
    if (profile?.address && !preferences.location) {
      setPreferences((prev) => ({ ...prev, location: profile.address || "" }));
    }
  }, [profile?.address]);

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore storage error
    }
  }, [preferences]);

  // Fetch active tutors with their full profile and schedule slots
  const { data: tutors = [], isLoading } = useQuery({
    queryKey: ["tutors-with-slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tutor_profiles")
        .select(`
          id, user_id, bio, qualifications, subjects, levels, hourly_rate, avg_rating, total_reviews, experience_years,
          profiles(full_name, avatar_url, address),
          schedule_slots(id, day_of_week, start_time, end_time, is_booked)
        `)
        .eq("is_active", true);

      if (error) throw error;
      return (data ?? []) as unknown as TutorWithSlots[];
    },
  });

  // Calculate multi-criteria ranking
  const rankedTutors = useMemo(() => {
    return rankTutorsByPreferences(tutors, preferences);
  }, [tutors, preferences]);

  // Top categorized matches
  const topChampion = rankedTutors[0];
  const bestValueTutor = rankedTutors.find((s) => s.badgeType === "best_value" && s !== topChampion);
  const veteranTutor = rankedTutors.find((s) => s.badgeType === "veteran_specialist" && s !== topChampion && s !== bestValueTutor);

  // Fetch AI insights from backend endpoint
  useEffect(() => {
    if (rankedTutors.length === 0) return;

    let isMounted = true;
    setIsAiLoading(true);

    const timer = setTimeout(async () => {
      try {
        const topSlice = rankedTutors.slice(0, 4);
        const res = await fetch("/api/recommendation-insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preferences,
            topMatches: topSlice,
          }),
        });

        if (res.ok && isMounted) {
          const json = (await res.json()) as AIRecommendationResponse;
          setAiInsights(json);
        }
      } catch (err) {
        console.warn("[Recommendations] AI insights fetch failed:", err);
      } finally {
        if (isMounted) setIsAiLoading(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [
    preferences.subject,
    preferences.level,
    preferences.maxBudget,
    preferences.location,
    preferences.primaryGoal,
    preferences.teachingStyle,
    preferences.focusTopics,
    preferences.preferredTime,
    preferences.preferredDays.join(","),
  ]);

  function handleDayToggle(dayIndex: number) {
    setPreferences((prev) => {
      const exists = prev.preferredDays.includes(dayIndex);
      const nextDays = exists
        ? prev.preferredDays.filter((d) => d !== dayIndex)
        : [...prev.preferredDays, dayIndex].sort();
      return { ...prev, preferredDays: nextDays };
    });
  }

  function handleCopyProposal() {
    if (!aiInsights?.prefilledOfferMessage) return;
    navigator.clipboard.writeText(aiInsights.prefilledOfferMessage);
    setCopiedProposal(true);
    toast.success("Offer proposal copied to clipboard!");
    setTimeout(() => setCopiedProposal(false), 2500);
  }

  function askAiAboutTutor(tutorName: string) {
    if (typeof window !== "undefined") {
      const event = new CustomEvent("edubridge:open-chat", {
        detail: {
          prompt: `Can you analyze tutor ${tutorName}'s teaching background and explain how they can help me with ${
            preferences.focusTopics || preferences.subject
          }?`,
        },
      });
      window.dispatchEvent(event);
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header with Diagnostic Indicator */}
      <PageHeader
        title="AI Academic Matchmaker & Study Advisor"
        subtitle="A personalized consultation engine that diagnoses your academic goals, maps a 4-week study roadmap, and pairs you with the ideal verified tutor."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "advisor" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("advisor")}
              className="gap-1.5"
            >
              <BrainCircuit className="h-4 w-4" /> AI Advisory Report
            </Button>
            <Button
              variant={activeTab === "consultation" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("consultation")}
              className="gap-1.5"
            >
              <Target className="h-4 w-4" /> Edit Goals & Criteria
            </Button>
          </div>
        }
      />

      {/* VIEW 1: CONSULTATION / DIAGNOSTIC CRITERIA */}
      {activeTab === "consultation" && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-8 animate-in fade-in duration-200">
          <div className="border-b border-border pb-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Step 1: Tell Us What You Need to Master
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              The AI uses your specific learning goals, syllabus hurdles, and preferred teaching style to match tutors rather than simply filtering names.
            </p>
          </div>

          {/* Academic Primary Goal */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-foreground">1. What is your primary learning goal?</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 w-full min-w-0">
              {(Object.keys(GOAL_LABELS) as AcademicGoal[]).map((goalKey) => {
                const isSelected = preferences.primaryGoal === goalKey;
                const info = GOAL_LABELS[goalKey];
                return (
                  <button
                    key={goalKey}
                    type="button"
                    onClick={() => setPreferences((p) => ({ ...p, primaryGoal: goalKey }))}
                    className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-sm text-foreground">{info.title}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{info.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject & Weak Topics */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">2. Target Subject & Academic Level</Label>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={preferences.subject}
                  onValueChange={(val) => setPreferences((p) => ({ ...p, subject: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any / General Subject</SelectItem>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={preferences.level}
                  onValueChange={(val) => setPreferences((p) => ({ ...p, level: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Academic Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Level</SelectItem>
                    {LEVELS.map((lvl) => (
                      <SelectItem key={lvl} value={lvl}>
                        {lvl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Specific Topics or Chapters */}
            <div className="space-y-2">
              <Label htmlFor="focus-topics" className="text-sm font-semibold text-foreground">
                Specific Topics or Chapters You Struggle With
              </Label>
              <Input
                id="focus-topics"
                placeholder="e.g. Calculus, Organic Chemistry reactions, Trigonometry"
                value={preferences.focusTopics ?? ""}
                onChange={(e) => setPreferences((p) => ({ ...p, focusTopics: e.target.value }))}
              />
              {/* Quick suggestions based on selected subject */}
              {Boolean(TOPIC_SUGGESTIONS[preferences.subject]) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {TOPIC_SUGGESTIONS[preferences.subject]?.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreferences((p) => ({ ...p, focusTopics: t }))}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Teaching Style Preference */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-foreground">3. What teaching style works best for you?</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 w-full min-w-0">
              {(Object.keys(STYLE_LABELS) as TeachingStylePreference[]).map((styleKey) => {
                const isSelected = preferences.teachingStyle === styleKey;
                const info = STYLE_LABELS[styleKey];
                return (
                  <button
                    key={styleKey}
                    type="button"
                    onClick={() => setPreferences((p) => ({ ...p, teachingStyle: styleKey }))}
                    className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-sm text-foreground">{info.title}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{info.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Budget, Schedule & Location */}
          <div className="grid gap-6 md:grid-cols-3 border-t border-border pt-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-semibold text-foreground">Max Hourly Budget</Label>
                <span className="font-bold text-primary">{formatTaka(preferences.maxBudget)}</span>
              </div>
              <Slider
                value={[preferences.maxBudget]}
                min={300}
                max={3000}
                step={50}
                onValueChange={(vals) => setPreferences((p) => ({ ...p, maxBudget: vals[0] ?? 1500 }))}
              />
              <p className="text-xs text-muted-foreground">Adjust maximum rate you want to pay per session.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">Home Neighborhood / Area</Label>
              <Input
                value={preferences.location}
                onChange={(e) => setPreferences((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Dhanmondi, Mirpur"
              />
              <p className="text-xs text-muted-foreground">Used for matching nearby tutors who can travel to your home.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">Preferred Time Slot</Label>
              <Select
                value={preferences.preferredTime}
                onValueChange={(val: StudentPreferences["preferredTime"]) =>
                  setPreferences((p) => ({ ...p, preferredTime: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Flexible / Any Time</SelectItem>
                  <SelectItem value="morning">Morning (before 12 PM)</SelectItem>
                  <SelectItem value="afternoon">Afternoon (12 PM – 5 PM)</SelectItem>
                  <SelectItem value="evening">Evening (after 5 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button size="lg" onClick={() => setActiveTab("advisor")} className="gap-2 shadow-sm font-semibold">
              <Sparkles className="h-4 w-4" /> Generate AI Advisory Report & Roadmap
            </Button>
          </div>
        </section>
      )}

      {/* VIEW 2: THE AI ADVISORY REPORT (RADICALLY DIFFERENT FROM SEARCH) */}
      {activeTab === "advisor" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Diagnostic Assessment Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-br from-primary/10 via-card to-accent/15 p-6 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">AI Academic Diagnostic Assessment</h2>
                    {isAiLoading && (
                      <span className="flex items-center gap-1 text-xs text-primary font-medium animate-pulse">
                        <Bot className="h-3.5 w-3.5" /> Synthesizing with Gemini AI...
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 max-w-3xl">
                    {aiInsights?.summary ||
                      `Analyzing student goals for ${
                        preferences.subject === "all" ? "general academics" : preferences.subject
                      } with emphasis on ${preferences.focusTopics || "core problem-solving"}.`}
                  </p>
                  {aiInsights?.diagnosticReport && (
                    <p className="text-xs leading-relaxed text-muted-foreground border-l-2 border-primary/50 pl-3 italic">
                      "{aiInsights.diagnosticReport}"
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-start">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("consultation")}
                  className="bg-card/70 gap-1.5"
                >
                  <Target className="h-3.5 w-3.5" /> Edit Goals
                </Button>
              </div>
            </div>

            {/* Academic Tip Chip */}
            {aiInsights?.studyTip && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-card/90 border border-border/80 px-4 py-2.5 text-xs text-foreground">
                <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <span className="font-semibold">AI Study Strategy: </span>
                  <span className="text-muted-foreground">{aiInsights.studyTip}</span>
                </div>
              </div>
            )}
          </div>

          {/* Active Diagnostic Criteria Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-foreground">Active Criteria:</span>
              <Badge variant="secondary" className="gap-1 font-medium">
                <Target className="h-3 w-3 text-primary" />
                {GOAL_LABELS[preferences.primaryGoal || "exam_prep"].title}
              </Badge>
              <Badge variant="secondary" className="gap-1 font-medium">
                <BookOpen className="h-3 w-3 text-primary" />
                {preferences.subject === "all" ? "All Subjects" : preferences.subject}
              </Badge>
              {preferences.focusTopics && (
                <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary font-medium">
                  Focus: {preferences.focusTopics}
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1 font-medium">
                <DollarSign className="h-3 w-3 text-emerald-600" />
                Max {formatTaka(preferences.maxBudget)}
              </Badge>
              {preferences.location && (
                <Badge variant="secondary" className="gap-1 font-medium">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {preferences.location}
                </Badge>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("consultation")}
              className="h-8 text-xs gap-1.5 font-medium"
            >
              <Target className="h-3.5 w-3.5 text-primary" /> Adjust Diagnostic Goals
            </Button>
          </div>

          {/* 4-WEEK CUSTOM STUDY ROADMAP */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" /> Recommended 4-Week Study Progression
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  AI-designed syllabus pacing for your focus:{" "}
                  <strong className="text-foreground">{preferences.focusTopics || preferences.subject}</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 w-full min-w-0">
              {(aiInsights?.fourWeekRoadmap || [
                { week: 1, title: "Diagnostic Assessment", focus: "Baseline concept check & formula inventory." },
                { week: 2, title: "Problem-Solving Drills", focus: "Step-by-step textbook and creative exercises." },
                { week: 3, title: "Board Question Patterns", focus: "Timed practice with high-yield exam questions." },
                { week: 4, title: "Full Mock Assessment", focus: "Test conditions assessment and error correction." },
              ]).map((item) => (
                <div
                  key={item.week}
                  className="rounded-xl border border-border bg-card p-4 shadow-2xs relative flex flex-col justify-between"
                >
                  <div>
                    <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary mb-2">
                      WEEK {item.week}
                    </span>
                    <h4 className="text-sm font-semibold text-foreground line-clamp-1">{item.title}</h4>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.focus}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* CURATED MATCHES (CHAMPION SPOTLIGHT + STRATEGIC ALTERNATIVES) */}
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" /> Curated Strategic Tutor Matches
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ranked by compatibility with your academic goals, schedule slots, and budget.
                </p>
              </div>
            </div>

            {isLoading ? (
              <LoadingSkeleton count={3} />
            ) : rankedTutors.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No direct tutor match found"
                description="Try broadening your criteria or increasing your maximum budget."
                action={
                  <Button variant="outline" onClick={() => setActiveTab("consultation")}>
                    Adjust Criteria
                  </Button>
                }
              />
            ) : (
              <div className="space-y-6">
                {/* 1. SPOTLIGHT: #1 TOP CHAMPION RECOMMENDATION */}
                {topChampion && (
                  <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-card p-4 sm:p-6 shadow-md transition-all hover:shadow-lg">
                    <div className="sm:absolute sm:top-0 sm:right-0 inline-flex mb-3 sm:mb-0 w-fit rounded-lg sm:rounded-none sm:rounded-bl-xl bg-primary px-3 sm:px-4 py-1 text-xs font-bold text-primary-foreground shadow-2xs items-center gap-1">
                      <Award className="h-3.5 w-3.5" /> #1 Best Overall Match ({topChampion.match.overallScore}%)
                    </div>

                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between sm:pt-2">
                      {/* Left: Avatar & Profile */}
                      <div className="flex flex-col sm:flex-row items-start gap-4 max-w-2xl">
                        <UserAvatar
                          name={topChampion.tutor.profiles?.full_name ?? "Tutor"}
                          path={topChampion.tutor.profiles?.avatar_url}
                          className="h-16 w-16 rounded-2xl ring-2 ring-primary/20 shrink-0"
                        />
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-bold text-foreground">
                              {topChampion.tutor.profiles?.full_name ?? "Tutor"}
                            </h4>
                            <Badge variant="secondary" className="font-medium text-xs">
                              {topChampion.tutor.experience_years} yrs experience
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <RatingStars value={topChampion.tutor.avg_rating} showValue count={topChampion.tutor.total_reviews} />
                            {topChampion.tutor.profiles?.address && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {topChampion.tutor.profiles.address}
                              </span>
                            )}
                          </div>

                          {/* Subjects */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {topChampion.tutor.subjects.map((sub) => (
                              <Badge key={sub} variant="outline" className="text-xs font-normal">
                                {sub}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Rate & Booking */}
                      <div className="flex flex-row items-center justify-between border-t border-border pt-4 lg:flex-col lg:items-end lg:border-0 lg:pt-0 shrink-0">
                        <div className="lg:text-right">
                          <p className="text-2xl font-black text-foreground">
                            {formatTaka(topChampion.tutor.hourly_rate)}
                          </p>
                          <p className="text-xs text-muted-foreground">per session</p>
                        </div>

                        <div className="flex items-center gap-2 lg:mt-3">
                          <Button asChild size="default" className="font-semibold shadow-xs gap-1.5">
                            <Link to="/student/tutor/$id" params={{ id: topChampion.tutor.id }}>
                              Book / Send Offer <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* AI Match Rationale */}
                    <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-foreground">
                      <div className="flex items-center gap-1.5 font-bold text-primary mb-1.5">
                        <Sparkles className="h-4 w-4" /> Why this tutor is your #1 match:
                      </div>
                      <p className="text-muted-foreground pl-5.5">
                        {aiInsights?.tutorRationales?.[topChampion.tutor.id] ||
                          `${topChampion.tutor.profiles?.full_name ?? "This tutor"} has verified mastery in ${
                            preferences.subject
                          }, fits within your ${formatTaka(preferences.maxBudget)} budget, and offers weekly schedule slots that match your availability.`}
                      </p>
                    </div>

                    {/* Match Score Breakdown Bars */}
                    <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-3 text-xs grid-cols-2 sm:grid-cols-4">
                      <div>
                        <div className="flex justify-between text-muted-foreground mb-1">
                          <span>Subject & Goal</span>
                          <span className="font-bold text-foreground">{topChampion.match.subjectScore}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${topChampion.match.subjectScore}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-muted-foreground mb-1">
                          <span>Budget Fit</span>
                          <span className="font-bold text-foreground">{topChampion.match.budgetScore}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${topChampion.match.budgetScore}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-muted-foreground mb-1">
                          <span>Schedule Match</span>
                          <span className="font-bold text-foreground">{topChampion.match.scheduleScore}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${topChampion.match.scheduleScore}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-muted-foreground mb-1">
                          <span>Location Fit</span>
                          <span className="font-bold text-foreground">{topChampion.match.locationScore}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${topChampion.match.locationScore}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. STRATEGIC ALTERNATIVES & REMAINING MATCHES */}
                {rankedTutors.length > 1 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-foreground">
                      Alternative Options ({rankedTutors.length - 1})
                    </h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 w-full min-w-0">
                      {rankedTutors.slice(1).map((alt) => {
                        const isBestValue = alt.badgeType === "best_value";
                        const isVeteran = alt.badgeType === "veteran_specialist";

                        return (
                          <article
                            key={alt.tutor.id}
                            className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                {isBestValue ? (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 font-semibold gap-1 text-xs"
                                  >
                                    <DollarSign className="h-3 w-3" /> Best Value Alternative ({alt.match.overallScore}%)
                                  </Badge>
                                ) : isVeteran ? (
                                  <Badge
                                    variant="outline"
                                    className="border-blue-500/30 bg-blue-500/10 text-blue-600 font-semibold gap-1 text-xs"
                                  >
                                    <GraduationCap className="h-3 w-3" /> Senior Exam Specialist ({alt.match.overallScore}%)
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="font-semibold text-xs">
                                    Alternative Match ({alt.match.overallScore}%)
                                  </Badge>
                                )}
                                <span className="text-base font-bold text-foreground">
                                  {formatTaka(alt.tutor.hourly_rate)}/session
                                </span>
                              </div>

                              <div className="flex items-start gap-3">
                                <UserAvatar
                                  name={alt.tutor.profiles?.full_name ?? "Tutor"}
                                  path={alt.tutor.profiles?.avatar_url}
                                  className="h-12 w-12 rounded-xl"
                                />
                                <div>
                                  <h4 className="font-bold text-foreground">
                                    {alt.tutor.profiles?.full_name ?? "Tutor"}
                                  </h4>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{alt.tutor.experience_years} yrs exp</span>
                                    <span>•</span>
                                    <span>{alt.tutor.subjects.join(", ")}</span>
                                  </div>
                                </div>
                              </div>

                              <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                                {aiInsights?.tutorRationales?.[alt.tutor.id] ||
                                  `${alt.tutor.profiles?.full_name ?? "This tutor"} offers instruction in ${alt.tutor.subjects.join(
                                    ", ",
                                  )} at ${formatTaka(alt.tutor.hourly_rate)}/session.`}
                              </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => askAiAboutTutor(alt.tutor.profiles?.full_name || "Tutor")}
                                className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1"
                              >
                                <Bot className="h-3 w-3" /> Ask AI
                              </button>
                              <Button asChild size="sm" variant="outline">
                                <Link to="/student/tutor/$id" params={{ id: alt.tutor.id }}>
                                  View & Book
                                </Link>
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* PRE-FILLED OFFER PROPOSAL BOX */}
          {aiInsights?.prefilledOfferMessage && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-bold text-foreground">AI-Drafted Booking Proposal</h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyProposal}
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedProposal ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedProposal ? "Copied!" : "Copy Proposal"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 p-3.5 rounded-xl border border-border/60">
                "{aiInsights.prefilledOfferMessage}"
              </p>
              <p className="text-[11px] text-muted-foreground">
                Tip: Paste this proposal into your offer message when booking any tutor to clearly convey your study goals and weak topics.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
