import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";

export type ProfileCompletionItem = {
  label: string;
  completed: boolean;
  link: string;
};

export type ProfileCompletion = {
  percentage: number;
  items: ProfileCompletionItem[];
  incompleteItems: ProfileCompletionItem[];
  loading: boolean;
};

export function useProfileCompletion(): ProfileCompletion {
  const { user, profile, role } = useAuth();

  const tutorQuery = useQuery({
    queryKey: ["profile-completion-tutor", user?.id],
    enabled: !!user && role === "tutor",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tutor_profiles")
        .select("bio, qualifications, subjects, hourly_rate")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const baseItems = buildBaseItems(profile, role);

  if (role === "tutor") {
    const tutorItems = buildTutorItems(tutorQuery.data ?? null, role);
    const allItems = [...baseItems, ...tutorItems];
    const completed = allItems.filter((i) => i.completed).length;
    const percentage = allItems.length > 0 ? Math.round((completed / allItems.length) * 100) : 0;
    return {
      percentage,
      items: allItems,
      incompleteItems: allItems.filter((i) => !i.completed),
      loading: tutorQuery.isLoading,
    };
  }

  // Student (or fallback)
  const completed = baseItems.filter((i) => i.completed).length;
  const percentage = baseItems.length > 0 ? Math.round((completed / baseItems.length) * 100) : 0;
  return {
    percentage,
    items: baseItems,
    incompleteItems: baseItems.filter((i) => !i.completed),
    loading: false,
  };
}

function profileLink(role: AppRole | null) {
  if (role === "tutor") return "/tutor/profile";
  return "/student/profile";
}

function buildBaseItems(
  profile: { full_name: string; avatar_url: string | null; phone: string | null; address: string | null } | null,
  role: AppRole | null,
): ProfileCompletionItem[] {
  const link = profileLink(role);
  return [
    {
      label: "Add your full name",
      completed: !!profile?.full_name?.trim(),
      link,
    },
    {
      label: "Upload a profile photo",
      completed: !!profile?.avatar_url,
      link,
    },
    {
      label: "Add your phone number",
      completed: !!profile?.phone?.trim(),
      link,
    },
    {
      label: "Add your address",
      completed: !!profile?.address?.trim(),
      link,
    },
  ];
}

function buildTutorItems(
  tutor: { bio: string | null; qualifications: string | null; subjects: string[] | null; hourly_rate: number | null } | null,
  role: AppRole | null,
): ProfileCompletionItem[] {
  const link = profileLink(role);
  return [
    {
      label: "Write a bio about yourself",
      completed: !!tutor?.bio?.trim(),
      link,
    },
    {
      label: "Add your qualifications",
      completed: !!tutor?.qualifications?.trim(),
      link,
    },
    {
      label: "Select at least one subject",
      completed: !!tutor?.subjects && tutor.subjects.length > 0,
      link,
    },
    {
      label: "Set your hourly rate",
      completed: !!tutor?.hourly_rate && tutor.hourly_rate > 0,
      link,
    },
  ];
}
