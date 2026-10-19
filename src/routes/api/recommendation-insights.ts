import { createFileRoute } from "@tanstack/react-router";
import { generateAIRecommendationInsights } from "@/lib/recommendation.server";
import type { StudentPreferences, ScoredTutor } from "@/lib/recommendation";

export const Route = createFileRoute("/api/recommendation-insights")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = (await request.json()) as {
            preferences?: StudentPreferences;
            topMatches?: ScoredTutor[];
          };

          if (!body.preferences || !Array.isArray(body.topMatches)) {
            return Response.json(
              { error: "Invalid payload: preferences and topMatches are required." },
              { status: 400 },
            );
          }

          const result = await generateAIRecommendationInsights(body.preferences, body.topMatches);
          return Response.json(result);
        } catch (error) {
          console.error("[api/recommendation-insights error]", error);
          return Response.json(
            { error: "Failed to generate recommendation insights." },
            { status: 500 },
          );
        }
      },
    },
  },
});
