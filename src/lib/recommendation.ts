import { DAYS, DAYS_SHORT, formatSlot, formatTaka } from "./edubridge";

export type AcademicGoal =
  | "exam_prep"
  | "concept_building"
  | "grade_improvement"
  | "homework_routine";

export type TeachingStylePreference =
  | "concept_builder"
  | "exam_drill"
  | "patient_encouraging"
  | "strict_structured";

export type MediumPreference = "bangla" | "english_version" | "english_medium" | "any";

export interface StudentPreferences {
  subject: string;
  level: string;
  maxBudget: number;
  location: string;
  preferredDays: number[];
  preferredTime: "any" | "morning" | "afternoon" | "evening";
  // Advanced Academic Consultation Dimensions
  primaryGoal?: AcademicGoal;
  teachingStyle?: TeachingStylePreference;
  medium?: MediumPreference;
  focusTopics?: string;
}

export const DEFAULT_PREFERENCES: StudentPreferences = {
  subject: "all",
  level: "all",
  maxBudget: 1500,
  location: "",
  preferredDays: [],
  preferredTime: "any",
  primaryGoal: "exam_prep",
  teachingStyle: "concept_builder",
  medium: "any",
  focusTopics: "",
};

export const GOAL_LABELS: Record<AcademicGoal, { title: string; desc: string }> = {
  exam_prep: {
    title: "Exam Preparation & Past Papers",
    desc: "Targeted board exam / term final revision, mock tests, and time management.",
  },
  concept_building: {
    title: "Foundational Concept Building",
    desc: "Clear fundamental doubts from the ground up with visual explanations.",
  },
  grade_improvement: {
    title: "Rapid Grade Improvement",
    desc: "Targeted interventions to move from C/B to solid A/A+.",
  },
  homework_routine: {
    title: "Daily Homework & Routine Support",
    desc: "Consistent weekly tracking, syllabus pacing, and daily task review.",
  },
};

export const STYLE_LABELS: Record<TeachingStylePreference, { title: string; desc: string }> = {
  concept_builder: {
    title: "Deep Conceptual Explainer",
    desc: "Focuses on 'why' formulas work before jumping into problems.",
  },
  exam_drill: {
    title: "Exam & Shortcut Specialist",
    desc: "Focuses on speed tricks, board question patterns, and marking schemes.",
  },
  patient_encouraging: {
    title: "Patient & Encouraging Guide",
    desc: "Gentle pacing, friendly environment, great for students lacking confidence.",
  },
  strict_structured: {
    title: "Strict & Disciplined Mentor",
    desc: "Structured daily assignments, strict accountability, and regular quizzes.",
  },
};

export const MEDIUM_LABELS: Record<MediumPreference, string> = {
  bangla: "Bangla Medium",
  english_version: "English Version (NCTB)",
  english_medium: "English Medium (Cambridge / Edexcel)",
  any: "Any Medium / Flexible",
};

export type TutorWithSlots = {
  id: string;
  user_id: string;
  bio: string | null;
  qualifications: string | null;
  subjects: string[];
  levels: string[];
  hourly_rate: number;
  avg_rating: number;
  total_reviews: number;
  experience_years: number;
  profiles: {
    full_name: string;
    avatar_url: string | null;
    address: string | null;
  } | null;
  schedule_slots?: Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_booked: boolean;
  }>;
};

export interface MatchBreakdown {
  overallScore: number;
  subjectScore: number;
  levelScore: number;
  budgetScore: number;
  scheduleScore: number;
  locationScore: number;
  styleScore: number;
  matchTags: string[];
  matchingSlots: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
  }>;
  aiRationale?: string;
}

export type ScoredTutor = {
  tutor: TutorWithSlots;
  match: MatchBreakdown;
  badgeType?: "best_overall" | "best_value" | "veteran_specialist" | "alternative";
};

/**
 * Checks if a slot time fits the preferred time of day.
 */
function matchesTimeOfDay(
  startTime: string,
  timePref: StudentPreferences["preferredTime"],
): boolean {
  if (timePref === "any") return true;
  const hour = parseInt(startTime.split(":")[0] ?? "0", 10);
  if (timePref === "morning") return hour < 12;
  if (timePref === "afternoon") return hour >= 12 && hour < 17;
  if (timePref === "evening") return hour >= 17;
  return true;
}

/**
 * Calculate multi-criteria match score for a tutor against student preferences.
 */
export function calculateMatchScore(
  tutor: TutorWithSlots,
  prefs: StudentPreferences,
): MatchBreakdown {
  const tags: string[] = [];

  // 1. Subject match (25% weight)
  let subjectScore = 40;
  if (prefs.subject === "all") {
    subjectScore = 85;
  } else if (
    tutor.subjects.some(
      (s) => s.toLowerCase() === prefs.subject.toLowerCase(),
    )
  ) {
    subjectScore = 100;
    tags.push(`🎯 ${prefs.subject} Expert`);
  } else {
    subjectScore = 20;
  }

  // 2. Level match (10% weight)
  let levelScore = 50;
  if (prefs.level === "all") {
    levelScore = 85;
  } else if (
    tutor.levels.some((l) => l.toLowerCase() === prefs.level.toLowerCase())
  ) {
    levelScore = 100;
    tags.push(`📚 ${prefs.level}`);
  } else {
    levelScore = 30;
  }

  // 3. Budget match (20% weight)
  const rate = Number(tutor.hourly_rate) || 0;
  let budgetScore = 100;
  if (rate <= prefs.maxBudget) {
    budgetScore = 100;
    const diff = prefs.maxBudget - rate;
    if (diff > 0) {
      tags.push(`💰 ${formatTaka(rate)} (Within Budget)`);
    } else {
      tags.push(`💰 ${formatTaka(rate)}`);
    }
  } else {
    const overPercent = (rate - prefs.maxBudget) / Math.max(1, prefs.maxBudget);
    budgetScore = Math.max(15, Math.round(100 - overPercent * 160));
  }

  // 4. Location match (15% weight)
  let locationScore = 80;
  const tutorAddress = tutor.profiles?.address?.toLowerCase() ?? "";
  const studentLoc = prefs.location.trim().toLowerCase();

  if (!studentLoc) {
    locationScore = 80;
  } else if (tutorAddress.includes(studentLoc)) {
    locationScore = 100;
    tags.push(`📍 ${prefs.location} Area`);
  } else {
    const tokens = studentLoc.split(/\s+/).filter((t) => t.length > 2);
    const hasTokenMatch = tokens.some((tok) => tutorAddress.includes(tok));
    if (hasTokenMatch) {
      locationScore = 85;
      tags.push(`📍 Nearby Area`);
    } else {
      locationScore = 35;
    }
  }

  // 5. Schedule / Availability match (15% weight)
  let scheduleScore = 80;
  const openSlots = (tutor.schedule_slots ?? []).filter((s) => !s.is_booked);
  const matchingSlots: MatchBreakdown["matchingSlots"] = [];

  for (const slot of openSlots) {
    const dayMatches =
      prefs.preferredDays.length === 0 ||
      prefs.preferredDays.includes(slot.day_of_week);
    const timeMatches = matchesTimeOfDay(slot.start_time, prefs.preferredTime);

    if (dayMatches && timeMatches) {
      matchingSlots.push(slot);
    }
  }

  if (prefs.preferredDays.length === 0 && prefs.preferredTime === "any") {
    scheduleScore = openSlots.length > 0 ? 95 : 60;
    if (openSlots.length > 0) {
      tags.push(`📅 ${openSlots.length} Open Slots`);
    }
  } else {
    if (matchingSlots.length >= 3) {
      scheduleScore = 100;
      tags.push(`📅 ${matchingSlots.length} Matching Slots`);
    } else if (matchingSlots.length > 0) {
      scheduleScore = 85;
      const daysSummary = Array.from(
        new Set(matchingSlots.map((s) => DAYS_SHORT[s.day_of_week])),
      ).join(", ");
      tags.push(`📅 Open on ${daysSummary}`);
    } else if (openSlots.length > 0) {
      scheduleScore = 45;
    } else {
      scheduleScore = 20;
    }
  }

  // 6. Teaching Style & Goal Fit (15% weight)
  let styleScore = 80;
  const bio = (tutor.bio || "").toLowerCase();
  const qual = (tutor.qualifications || "").toLowerCase();

  if (prefs.teachingStyle === "exam_drill") {
    if (bio.includes("exam") || bio.includes("board") || bio.includes("test") || bio.includes("shortcut") || tutor.experience_years >= 4) {
      styleScore = 100;
      tags.push("⚡ Exam Specialist");
    }
  } else if (prefs.teachingStyle === "concept_builder") {
    if (bio.includes("concept") || bio.includes("foundation") || bio.includes("basic") || bio.includes("deep") || qual.includes("engineering") || qual.includes("science")) {
      styleScore = 100;
      tags.push("💡 Concept Builder");
    }
  } else if (prefs.teachingStyle === "patient_encouraging") {
    if (bio.includes("patient") || bio.includes("friendly") || bio.includes("care") || Number(tutor.avg_rating) >= 4.7) {
      styleScore = 100;
      tags.push("🤝 Patient Mentor");
    }
  } else if (prefs.teachingStyle === "strict_structured") {
    if (bio.includes("structured") || bio.includes("homework") || bio.includes("discipline") || bio.includes("regular")) {
      styleScore = 100;
      tags.push("📋 Structured Track");
    }
  }

  // Quality boost
  let qualityBoost = 0;
  const rating = Number(tutor.avg_rating) || 0;
  if (rating >= 4.8) qualityBoost += 4;
  else if (rating >= 4.0) qualityBoost += 2;
  if (tutor.experience_years >= 3) qualityBoost += 2;

  const rawScore =
    subjectScore * 0.25 +
    levelScore * 0.10 +
    budgetScore * 0.20 +
    locationScore * 0.15 +
    scheduleScore * 0.15 +
    styleScore * 0.15 +
    qualityBoost;

  const overallScore = Math.min(99, Math.max(30, Math.round(rawScore)));

  return {
    overallScore,
    subjectScore,
    levelScore,
    budgetScore,
    scheduleScore,
    locationScore,
    styleScore,
    matchTags: tags.slice(0, 4),
    matchingSlots,
  };
}

/**
 * Score and rank tutors, assigning strategic category badges (Best Overall, Best Value, Veteran Specialist).
 */
export function rankTutorsByPreferences(
  tutors: TutorWithSlots[],
  prefs: StudentPreferences,
): ScoredTutor[] {
  const scored: ScoredTutor[] = tutors.map((tutor) => ({
    tutor,
    match: calculateMatchScore(tutor, prefs),
  }));

  scored.sort((a, b) => {
    if (b.match.overallScore !== a.match.overallScore) {
      return b.match.overallScore - a.match.overallScore;
    }
    const ratingDiff = Number(b.tutor.avg_rating) - Number(a.tutor.avg_rating);
    if (ratingDiff !== 0) return ratingDiff;
    return Number(a.tutor.hourly_rate) - Number(b.tutor.hourly_rate);
  });

  if (scored.length > 0 && scored[0]) {
    scored[0].badgeType = "best_overall";
  }

  const remaining = scored.slice(1);
  if (remaining.length > 0) {
    const bestValue = [...remaining].sort(
      (a, b) => Number(a.tutor.hourly_rate) - Number(b.tutor.hourly_rate)
    )[0];
    if (bestValue) {
      bestValue.badgeType = "best_value";
    }

    const veteran = [...remaining]
      .filter((s) => s !== bestValue)
      .sort((a, b) => b.tutor.experience_years - a.tutor.experience_years)[0];
    if (veteran) {
      veteran.badgeType = "veteran_specialist";
    }

    for (const item of remaining) {
      if (!item.badgeType) {
        item.badgeType = "alternative";
      }
    }
  }

  return scored;
}
