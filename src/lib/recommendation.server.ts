import fs from "node:fs";
import path from "node:path";
import type { StudentPreferences, ScoredTutor } from "./recommendation";
import { formatTaka } from "./edubridge";

export interface AIRecommendationResponse {
  summary: string;
  diagnosticReport: string;
  studyTip: string;
  fourWeekRoadmap: Array<{
    week: number;
    title: string;
    focus: string;
  }>;
  tutorRationales: Record<string, string>;
  prefilledOfferMessage: string;
}

function getGeminiApiKey(): string | undefined {
  const g = globalThis as any;
  const envKey =
    process.env["GEMINI_API_KEY"] ||
    process.env["VITE_GEMINI_API_KEY"] ||
    g?.GEMINI_API_KEY ||
    g?.VITE_GEMINI_API_KEY ||
    g?.env?.GEMINI_API_KEY ||
    g?.env?.VITE_GEMINI_API_KEY ||
    g?.__env__?.GEMINI_API_KEY;

  if (envKey && typeof envKey === "string" && envKey.trim()) return envKey.trim();

  try {
    for (const fileName of [".env.local", ".env"]) {
      const envPath = path.resolve(process.cwd(), fileName);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
        if (match && match[1] && match[1].trim()) {
          return match[1].trim();
        }
      }
    }
  } catch {
    // Ignore file read error on serverless edge runtimes
  }
  return undefined;
}

/**
 * Deterministic fallback rationale and roadmap generator.
 */
function generateFallbackInsights(
  prefs: StudentPreferences,
  topMatches: ScoredTutor[],
): AIRecommendationResponse {
  const rationales: Record<string, string> = {};

  for (const item of topMatches) {
    const { tutor, match } = item;
    const name = tutor.profiles?.full_name ?? "This tutor";
    const subjectText =
      prefs.subject !== "all" && tutor.subjects.includes(prefs.subject)
        ? `specializes in ${prefs.subject}`
        : `teaches ${tutor.subjects.slice(0, 2).join(" & ")}`;

    const budgetText =
      Number(tutor.hourly_rate) <= prefs.maxBudget
        ? `fits your ${formatTaka(prefs.maxBudget)} budget at ${formatTaka(tutor.hourly_rate)}/session`
        : `is priced at ${formatTaka(tutor.hourly_rate)}/session`;

    const scheduleText =
      match.matchingSlots.length > 0
        ? `has ${match.matchingSlots.length} open schedule slots matching your weekly availability`
        : "has flexible weekly slots published";

    rationales[tutor.id] =
      `${name} (${match.overallScore}% match) ${subjectText}, ${budgetText}, and ${scheduleText}. With a ${Number(tutor.avg_rating).toFixed(1)}★ rating and ${tutor.experience_years} years experience, they are a strong fit for your learning goals.`;
  }

  const subjectName = prefs.subject === "all" ? "academics" : prefs.subject;
  const focus = prefs.focusTopics?.trim() || "core syllabus topics";

  return {
    summary: `Based on your goal for ${subjectName} focusing on ${focus}${prefs.location ? ` in ${prefs.location}` : ""} within ${formatTaka(prefs.maxBudget)}/session, we've developed an academic roadmap and matched the top compatible tutors.`,
    diagnosticReport: `Targeting rapid progress in ${subjectName} requires regular structured feedback, diagnostic past-paper problem reviews, and consistent weekly accountability.`,
    studyTip: `For ${subjectName}, booking 2-3 sessions weekly with targeted homework problem sets accelerates mastery by over 40%.`,
    fourWeekRoadmap: [
      {
        week: 1,
        title: "Diagnostic Assessment & Core Concepts",
        focus: `Baseline assessment of ${focus}, identifying specific knowledge gaps and formula fundamentals.`,
      },
      {
        week: 2,
        title: "Intensive Problem-Solving Drills",
        focus: `Guided step-by-step problem breakdown, standard textbook exercises, and conceptual clarity.`,
      },
      {
        week: 3,
        title: "Board / Past-Paper Exam Patterns",
        focus: `Time-trial practice with past board exam questions and high-yield creative questions.`,
      },
      {
        week: 4,
        title: "Full Mock Assessment & Review",
        focus: `Timed mock examination under test conditions, followed by error log review and exam tips.`,
      },
    ],
    tutorRationales: rationales,
    prefilledOfferMessage: `Hello! I would like to book tuition sessions with you for ${subjectName}. My primary goal is ${prefs.primaryGoal || "academic improvement"}, focusing on ${focus}. I am looking for a ${prefs.teachingStyle || "concept-oriented"} approach within my budget of ${formatTaka(prefs.maxBudget)}/session.`,
  };
}

/**
 * Handle AI recommendation synthesis using Google Gemini.
 */
export async function generateAIRecommendationInsights(
  prefs: StudentPreferences,
  topMatches: ScoredTutor[],
): Promise<AIRecommendationResponse> {
  const fallback = generateFallbackInsights(prefs, topMatches);
  if (topMatches.length === 0) return fallback;

  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    return fallback;
  }

  const topSample = topMatches.slice(0, 4);

  const tutorsInfo = topSample
    .map(
      (m, idx) =>
        `#${idx + 1}: ID: "${m.tutor.id}", Name: "${m.tutor.profiles?.full_name || "Tutor"}", Subjects: [${m.tutor.subjects.join(", ")}], Levels: [${m.tutor.levels.join(", ")}], HourlyRate: ৳${m.tutor.hourly_rate}, Rating: ${m.tutor.avg_rating}★ (${m.tutor.total_reviews} reviews), Experience: ${m.tutor.experience_years} yrs, Area: "${m.tutor.profiles?.address || "Dhaka"}", Bio: "${m.tutor.bio || ""}", Qualifications: "${m.tutor.qualifications || ""}", MatchingSlots: ${m.match.matchingSlots.length}, OverallScore: ${m.match.overallScore}%`,
    )
    .join("\n");

  const prompt = `You are EduBridge's AI Academic Diagnostic & Matchmaker Advisor.
A student in Bangladesh submitted an academic diagnostic consultation:
- Target Subject: ${prefs.subject}
- Academic Level: ${prefs.level}
- Primary Learning Goal: ${prefs.primaryGoal || "Exam Preparation"}
- Specific Focus / Weak Topics: ${prefs.focusTopics || "General Syllabus"}
- Preferred Teaching Style: ${prefs.teachingStyle || "Conceptual & Problem-Solving"}
- Medium of Instruction: ${prefs.medium || "Bangla / English Version"}
- Maximum Budget: ৳${prefs.maxBudget} per session
- Location / Area: ${prefs.location || "Flexible / Home"}
- Preferred Days: ${prefs.preferredDays.length > 0 ? prefs.preferredDays.join(", ") : "Flexible"}
- Preferred Time: ${prefs.preferredTime}

Here are the top candidate tutors scored by our compatibility matching algorithm:
${tutorsInfo}

Your task:
Analyze this student's exact academic profile and return a STRICT JSON object with these EXACT keys:
1. "summary": A warm, encouraging 2-sentence executive summary explaining how these tutors match the student's learning goals, budget, and location.
2. "diagnosticReport": A 2-sentence academic diagnosis of what the student needs to achieve their goal in ${prefs.subject}.
3. "studyTip": A concrete, actionable 1-sentence study recommendation for mastering ${prefs.subject}.
4. "fourWeekRoadmap": An array of exactly 4 objects: [{ "week": 1, "title": "...", "focus": "..." }, ... { "week": 4, "title": "...", "focus": "..." }] mapping a 4-week lesson plan tailored to their focus topics: "${prefs.focusTopics || prefs.subject}".
5. "tutorRationales": A JSON object mapping each tutor's ID to a 1-sentence personalized rationale explaining why this tutor fits the student's learning style, budget, and weak areas.
6. "prefilledOfferMessage": A polite, professional 2-sentence proposal message the student can send when booking, mentioning their goal and focus topics.

DO NOT include markdown code fences or backticks. Return RAW JSON ONLY.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("[AI Recommendations] Gemini API returned error:", response.status);
      return fallback;
    }

    const json = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return fallback;

    const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleanJson) as AIRecommendationResponse;

    return {
      summary: parsed.summary?.trim() || fallback.summary,
      diagnosticReport: parsed.diagnosticReport?.trim() || fallback.diagnosticReport,
      studyTip: parsed.studyTip?.trim() || fallback.studyTip,
      fourWeekRoadmap: Array.isArray(parsed.fourWeekRoadmap) && parsed.fourWeekRoadmap.length === 4 ? parsed.fourWeekRoadmap : fallback.fourWeekRoadmap,
      tutorRationales: parsed.tutorRationales || fallback.tutorRationales,
      prefilledOfferMessage: parsed.prefilledOfferMessage?.trim() || fallback.prefilledOfferMessage,
    };
  } catch (err) {
    console.warn("[AI Recommendations] Gemini call failed, using fallback:", err);
    return fallback;
  }
}
