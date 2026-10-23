import { createFileRoute } from "@tanstack/react-router";
import { handleChatbotRequest } from "@/lib/chatbot.server";

export const Route = createFileRoute("/api/chatbot")({
  server: {
    handlers: {
      POST: async ({ request, context }: { request: Request; context?: any }) => {
        try {
          const body = (await request.json()) as {
            message?: string;
            history?: Array<{ role: "user" | "assistant" | "model"; text: string }>;
          };

          const userMessage = body.message?.trim();
          if (!userMessage) {
            return Response.json(
              { reply: "Please enter a message.", suggestions: [] },
              { status: 400 },
            );
          }

          const runtimeKey =
            context?.cloudflare?.env?.GEMINI_API_KEY ||
            context?.env?.GEMINI_API_KEY ||
            (request as any)?.cf?.env?.GEMINI_API_KEY;

          const result = await handleChatbotRequest(userMessage, body.history || [], runtimeKey);
          return Response.json(result);
        } catch (error) {
          console.error("[api/chatbot error]", error);
          return Response.json(
            {
              reply: "Sorry, I had trouble processing that request. Please try again in a moment.",
              suggestions: ["Find Math tutors", "How do booking offers work?"],
            },
            { status: 200 },
          );
        }
      },
    },
  },
});
