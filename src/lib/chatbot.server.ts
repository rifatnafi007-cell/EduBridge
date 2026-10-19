import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/integrations/supabase/client";

export type ChatHistoryItem = {
  role: "user" | "assistant" | "model";
  text: string;
};

export type ChatbotResponse = {
  reply: string;
  suggestions: string[];
};

type TutorRecord = {
  id: string;
  full_name: string | null;
  subjects: string[] | null;
  hourly_rate: number | null;
  avg_rating: number | null;
  total_reviews: number | null;
  experience_years: number | null;
  bio: string | null;
  qualifications: string | null;
};

const DEFAULT_SUGGESTIONS = [
  "🎓 Find top Math tutors",
  "💰 Affordable tutors (< ৳1000/hr)",
  "📅 How do booking offers work?",
  "⭐ Show highest rated tutors",
];

// In-memory cache for tutors context to avoid remote database roundtrips on every message
let cachedTutors: TutorRecord[] | null = null;
let lastCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch active tutors from Supabase database with in-memory caching.
 */
async function fetchTutorsContext(): Promise<TutorRecord[]> {
  const now = Date.now();
  if (cachedTutors && now - lastCacheTimestamp < CACHE_TTL_MS) {
    return cachedTutors;
  }

  try {
    const { data, error } = await supabase
      .from("public_tutors")
      .select("id, full_name, subjects, hourly_rate, avg_rating, total_reviews, experience_years, bio, qualifications")
      .eq("is_active", true)
      .order("avg_rating", { ascending: false })
      .limit(20);

    if (error || !data) {
      console.warn("[Chatbot] Could not load tutors context:", error?.message);
      return cachedTutors ?? [];
    }

    cachedTutors = data as TutorRecord[];
    lastCacheTimestamp = now;
    return cachedTutors;
  } catch (err) {
    console.warn("[Chatbot] Error querying tutors:", err);
    return cachedTutors ?? [];
  }
}

/**
 * Instant fast-path responses for common greetings and introductory queries (0 ms latency).
 */
function checkFastPathGreeting(userQuery: string): ChatbotResponse | null {
  const normalized = userQuery.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");

  const greetingMatches = [
    "hi",
    "hello",
    "hey",
    "salam",
    "assalamualaikum",
    "who are you",
    "who are u",
    "who r u",
    "who r you",
    "what are you",
    "what can you do",
    "what is edubridge",
    "tell me about yourself",
    "help",
  ];

  if (greetingMatches.includes(normalized)) {
    return {
      reply:
        "Hello! 👋 I am the **EduBridge AI Assistant**, your personal guide for online and in-person tuition in Bangladesh!\n\n" +
        "Here is how I can assist you:\n" +
        "• **Find Tutors**: Recommend top-rated tutors for Math, Physics, English, ICT, and more within your budget.\n" +
        "• **Booking & Offers**: Guide you on checking tutor schedules and submitting booking offers.\n" +
        "• **Platform Support**: Explain tuition fees, policies, and resolving complaints.\n\n" +
        "What subject or tutor are you looking for today?",
      suggestions: [
        "🎓 Find top Math tutors",
        "💰 Affordable tutors (< ৳1000/hr)",
        "📅 How do booking offers work?",
      ],
    };
  }

  return null;
}

/**
 * Intelligent fallback when GEMINI_API_KEY is not configured or network fails.
 * Grounded directly in live Supabase database data!
 */
function generateFallbackResponse(
  userQuery: string,
  tutors: TutorRecord[],
  hasApiKey: boolean,
): ChatbotResponse {
  const query = userQuery.toLowerCase();

  const keyBanner = !hasApiKey
    ? "\n\n---\n*💡 Note: Running in database-grounded mode. Add `GEMINI_API_KEY` to your `.env` to enable full Google Gemini LLM reasoning! (Free at [Google AI Studio](https://aistudio.google.com))*"
    : "";

  // 1. Booking / Offer flow questions
  if (
    query.includes("how") &&
    (query.includes("book") || query.includes("offer") || query.includes("work") || query.includes("hire"))
  ) {
    return {
      reply:
        "**How Booking Works on EduBridge:**\n\n" +
        "1. **Find a Tutor**: Browse tutors on the [Search Page](/student/search) by subject, price, or rating.\n" +
        "2. **Check Availability**: View the tutor's profile to see their qualifications, demo video, and available schedule slots.\n" +
        "3. **Submit an Offer**: Choose the desired day & time slots, enter your proposed location and total amount, and send the offer.\n" +
        "4. **Tutor Accepts**: Once the tutor accepts, your session is confirmed! You can track all bookings under [My Offers](/student/offers)." +
        keyBanner,
      suggestions: [
        "🎓 Find Math tutors",
        "⭐ Show top rated tutors",
        "⚠️ How do complaints work?",
      ],
    };
  }

  // 2. Complaints / Support questions
  if (query.includes("complaint") || query.includes("dispute") || query.includes("refund") || query.includes("problem")) {
    return {
      reply:
        "**EduBridge Dispute & Complaint Resolution:**\n\n" +
        "If you ever face an issue with a session or tutor:\n" +
        "• Go to **[Complaints](/student/complaints)** from your student menu.\n" +
        "• Submit a ticket with details regarding the session or offer.\n" +
        "• An EduBridge Administrator will review the complaint, investigate with both parties, and take appropriate action." +
        keyBanner,
      suggestions: [
        "📅 How do booking offers work?",
        "🎓 Find verified tutors",
        "⭐ Highest rated tutors",
      ],
    };
  }

  // 3. Subject-based searches (Math, Physics, English, etc.)
  const matchedTutorsBySubject = tutors.filter((t) =>
    (t.subjects || []).some((s) => query.includes(s.toLowerCase())),
  );

  if (matchedTutorsBySubject.length > 0) {
    const list = matchedTutorsBySubject
      .slice(0, 4)
      .map(
        (t) =>
          `• **[${t.full_name || "Verified Tutor"}](/student/tutor/${t.id})**\n` +
          `  - Subjects: ${(t.subjects || []).join(", ")}\n` +
          `  - Rate: ৳${t.hourly_rate ?? 0}/session | Rating: ⭐ ${t.avg_rating ?? "New"} (${t.total_reviews ?? 0} reviews)\n` +
          `  - ${t.bio ? t.bio.slice(0, 90) + "..." : "Experienced verified educator."}`,
      )
      .join("\n\n");

    return {
      reply:
        `Here are the matching tutors found in our database:\n\n${list}\n\n` +
        `Click any tutor's name to view their full profile and schedule slots!` +
        keyBanner,
      suggestions: [
        "💰 Affordable tutors (< ৳1000/hr)",
        "📅 How do booking offers work?",
        "🔎 Search all tutors",
      ],
    };
  }

  // 4. Affordable / Cheap / Price queries
  if (query.includes("cheap") || query.includes("afford") || query.includes("low") || query.includes("price") || query.includes("cost") || query.includes("rate")) {
    const sorted = [...tutors].sort((a, b) => (a.hourly_rate ?? 9999) - (b.hourly_rate ?? 9999));
    const list = sorted
      .slice(0, 4)
      .map(
        (t) =>
          `• **[${t.full_name || "Verified Tutor"}](/student/tutor/${t.id})** — ৳${t.hourly_rate ?? 0}/session\n` +
          `  Subjects: ${(t.subjects || []).join(", ")} | Rating: ⭐ ${t.avg_rating ?? "New"}`,
      )
      .join("\n\n");

    return {
      reply:
        `Here are some of the most budget-friendly tutors available on EduBridge:\n\n${list}\n\n` +
        `You can filter by your exact budget range on the [Search Page](/student/search).` +
        keyBanner,
      suggestions: [
        "🎓 Find Math tutors",
        "⭐ Show highest rated tutors",
        "📅 How do booking offers work?",
      ],
    };
  }

  // 5. General top tutors
  const topTutors = tutors.slice(0, 3);
  if (topTutors.length > 0) {
    const list = topTutors
      .map(
        (t) =>
          `• **[${t.full_name || "Verified Tutor"}](/student/tutor/${t.id})** (⭐ ${t.avg_rating ?? "5.0"})\n` +
          `  Subjects: ${(t.subjects || []).join(", ")} | Rate: ৳${t.hourly_rate ?? 0}/session`,
      )
      .join("\n\n");

    return {
      reply:
        `Hello! I'm here to help you navigate EduBridge. Here are some of our top active tutors right now:\n\n${list}\n\n` +
        `What subject or level are you looking for help with?` +
        keyBanner,
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  return {
    reply:
      "Hello! Welcome to EduBridge. I can help you find tutors for Math, Physics, English, ICT, and more. You can also ask me how booking offers, scheduling, and complaints work!" +
      keyBanner,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

function getGeminiApiKey(): string | undefined {
  const envKey = process.env["GEMINI_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  if (envKey && envKey.trim()) return envKey.trim();

  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // Ignore file read error
  }
  return undefined;
}

/**
 * Handle incoming chat requests using Google Gemini API with Supabase database grounding.
 */
export async function handleChatbotRequest(
  message: string,
  history: ChatHistoryItem[] = [],
): Promise<ChatbotResponse> {
  // 1. Instant fast-path for simple greetings & "who are you" (0 ms)
  const fastGreeting = checkFastPathGreeting(message);
  if (fastGreeting) {
    return fastGreeting;
  }

  const apiKey = getGeminiApiKey();

  // 2. Fetch live tutor database context (cached in memory)
  const tutors = await fetchTutorsContext();

  // If no Gemini API key is configured, provide our rich database-grounded response
  if (!apiKey || apiKey.trim() === "" || apiKey === "your-gemini-api-key-here") {
    return generateFallbackResponse(message, tutors, false);
  }

  // 3. Prepare database context string for Gemini
  const tutorsSummary =
    tutors.length > 0
      ? tutors
          .map(
            (t) =>
              `- ID: ${t.id} | Name: ${t.full_name || "Tutor"} | Subjects: ${(t.subjects || []).join(", ")} | Rate: ৳${t.hourly_rate ?? 0} | Rating: ${t.avg_rating ?? "New"} (${t.total_reviews ?? 0} reviews) | Bio: ${t.bio ? t.bio.slice(0, 100) : "N/A"}`,
          )
          .join("\n")
      : "No tutors currently listed in database.";

  const systemInstruction = `You are the friendly, intelligent AI Assistant for EduBridge (edubridge.com), an online and in-person tutoring platform in Bangladesh.
Currency: Bangladeshi Taka (৳).

Key Platform Features:
1. Student & Tutor Matching: Students can find tutors by subject (Math, Physics, Chemistry, Biology, English, Bangla, ICT, Economics, Accounting, Arabic), level (Primary to Higher Secondary), and budget.
2. Booking & Offers: Students select available slots from a tutor's schedule, enter proposed fee and location, and submit an offer. Tutors accept or decline.
3. Profile & Demos: Tutors showcase qualifications, experience, and demo video lessons.
4. Complaints & Safety: If any dispute arises, users can raise a complaint reviewed by administrators.

Current Live Database of Active Tutors:
${tutorsSummary}

Guidelines for Responses:
- Language Matching: If the user asks in Bengali or Banglish (e.g., "Math er valo kon teacher ache"), reply warmly in natural, polite Bengali. If they ask in English, reply in English.
- Links & URLs:
  * When recommending a tutor, ALWAYS format their profile link with a friendly label: [View <Name>'s Profile](/student/tutor/<Tutor_ID>) or [<Name> - View Profile & Book](/student/tutor/<Tutor_ID>).
  * When referring to search, format as: [Browse All Tutors](/student/search).
  * NEVER write raw URLs, domain names (like localhost or http://...), or raw path strings (like "/student/search" or UUIDs) as visible text. Always use clean human-readable titles!
- Keep your answers concise, structured (bullet points), polite, and educational.
- Do not make up fake tutors not present in the database.
- At the very end of your response, on a new line, always provide 3 relevant follow-up questions formatted exactly as:
SUGGESTIONS: ["Question 1?", "Question 2?", "Question 3?"]`;

  try {
    // 4. Prepare Gemini conversation contents with role alternation
    const contents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];

    for (const h of history.slice(-4)) {
      const role = h.role === "assistant" || h.role === "model" ? "model" : "user";
      // Gemini requires first content to be 'user'
      if (contents.length === 0 && role === "model") continue;

      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts[0].text += `\n${h.text}`;
      } else {
        contents.push({ role, parts: [{ text: h.text }] });
      }
    }

    const lastContent = contents[contents.length - 1];
    if (lastContent && lastContent.role === "user") {
      lastContent.parts[0].text += `\n${message}`;
    } else {
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    };

    // 5. Try ultra-fast gemini-flash-lite-latest first, fallback to gemini-flash-latest
    let res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      console.warn("[Gemini flash-lite failed, falling back to gemini-flash-latest]");
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Gemini API Error]", res.status, errText);
      return generateFallbackResponse(message, tutors, true);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return generateFallbackResponse(message, tutors, true);
    }

    // Extract dynamic suggestions if present
    let reply = rawText;
    let suggestions: string[] = [];

    const suggestionsMatch = rawText.match(/SUGGESTIONS:\s*(\[[^\]]+\])/i);
    if (suggestionsMatch && suggestionsMatch[1]) {
      try {
        const parsed = JSON.parse(suggestionsMatch[1]) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          suggestions = parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {
        // Ignored if JSON parsing fails
      }
      reply = rawText.replace(/SUGGESTIONS:\s*\[[^\]]+\]/i, "").trim();
    }

    if (suggestions.length === 0) {
      suggestions = DEFAULT_SUGGESTIONS;
    }

    return {
      reply,
      suggestions,
    };
  } catch (err) {
    console.error("[Gemini Fetch Error]", err);
    return generateFallbackResponse(message, tutors, true);
  }
}
