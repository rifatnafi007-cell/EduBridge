import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/shared/profile-form";
import { ProfileCompletionBanner } from "@/components/shared/profile-completion-card";
import { ProfileGateCard } from "@/components/shared/profile-gate-card";

export const Route = createFileRoute("/_authenticated/student/profile")({
  head: () => ({
    meta: [
      { title: "My profile — EduBridge" },
      { name: "description", content: "Update your EduBridge contact details, address and profile photo." },
      { property: "og:title", content: "My profile — EduBridge" },
      { property: "og:description", content: "Keep your student profile up to date." },
    ],
  }),
  component: () => (
    <div>
      <ProfileCompletionBanner />
      <ProfileGateCard />
      <PageHeader title="My profile" subtitle="Tutors see these details when you send an offer." />
      <ProfileForm />
    </div>
  ),
});

