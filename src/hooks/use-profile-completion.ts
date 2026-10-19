import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole, type Profile } from "@/hooks/use-auth";

export type ProfileCompletionItem = {
  label: string;
  completed: boolean;
  link: string;
  isRequiredForLocation?: boolean;
};

export type ProfileCompletion = {
  percentage: number;
  items: ProfileCompletionItem[];
  incompleteItems: ProfileCompletionItem[];
  isLocationSearchUnlocked: boolean;
  missingLocationRequirements: string[];
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
        .select("bio, qualifications, subjects, hourly_rate, latitude, longitude")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const baseItems = buildBaseItems(profile, role);

  if (role === "tutor") {
    const tutorData = tutorQuery.data ?? null;
    const tutorItems = buildTutorItems(tutorData, role);
    const allItems = [...baseItems, ...tutorItems];
    const completed = allItems.filter((i) => i.completed).length;
    const percentage = allItems.length > 0 ? Math.round((completed / allItems.length) * 100) : 0;

    const hasPhone = !!profile?.phone?.trim();
    const hasAddress = !!profile?.address?.trim();
    const hasEdu = !!profile?.institution?.trim() || !!tutorData?.qualifications?.trim();
    const hasGrade = !!profile?.grade?.trim() || !!tutorData?.qualifications?.trim();
    const hasSubjects = !!tutorData?.subjects && tutorData.subjects.length > 0;
    const hasRate = !!tutorData?.hourly_rate && tutorData.hourly_rate > 0;

    const missingLocationRequirements: string[] = [];
    if (!hasPhone) missingLocationRequirements.push("Mobile number");
    if (!hasAddress) missingLocationRequirements.push("Home tuition area / address");
    if (!hasEdu) missingLocationRequirements.push("Study institution");
    if (!hasGrade) missingLocationRequirements.push("Grades / qualifications");
    if (!hasSubjects) missingLocationRequirements.push("Subjects taught");
    if (!hasRate) missingLocationRequirements.push("Hourly tuition rate");

    const isLocationSearchUnlocked = missingLocationRequirements.length === 0;

    return {
      percentage,
      items: allItems,
      incompleteItems: allItems.filter((i) => !i.completed),
      isLocationSearchUnlocked,
      missingLocationRequirements,
      loading: tutorQuery.isLoading,
    };
  }

  // Student (or fallback)
  const completed = baseItems.filter((i) => i.completed).length;
  const percentage = baseItems.length > 0 ? Math.round((completed / baseItems.length) * 100) : 0;

  const hasPhone = !!profile?.phone?.trim();
  const hasAddress = !!profile?.address?.trim();
  const hasInstitution = !!profile?.institution?.trim();
  const hasGrade = !!profile?.grade?.trim();

  const missingLocationRequirements: string[] = [];
  if (!hasPhone) missingLocationRequirements.push("Mobile / phone number");
  if (!hasAddress) missingLocationRequirements.push("Home address / location");
  if (!hasInstitution) missingLocationRequirements.push("Current or passed study institution");
  if (!hasGrade) missingLocationRequirements.push("Current academic grade / GPA");

  const isLocationSearchUnlocked = missingLocationRequirements.length === 0;

  return {
    percentage,
    items: baseItems,
    incompleteItems: baseItems.filter((i) => !i.completed),
    isLocationSearchUnlocked,
    missingLocationRequirements,
    loading: false,
  };
}

function profileLink(role: AppRole | null) {
  if (role === "tutor") return "/tutor/profile";
  return "/student/profile";
}

function buildBaseItems(
  profile: Profile | null,
  role: AppRole | null,
): ProfileCompletionItem[] {
  const link = profileLink(role);
  return [
    {
      label: "Add your full name",
      completed: !!profile?.full_name?.trim(),
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Upload a profile photo",
      completed: !!profile?.avatar_url,
      link,
      isRequiredForLocation: false,
    },
    {
      label: "Add mobile / phone number",
      completed: !!profile?.phone?.trim(),
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Add address / home area",
      completed: !!profile?.address?.trim(),
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Add current study institution or passed one",
      completed: !!profile?.institution?.trim(),
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Add current grade / GPA / result",
      completed: !!profile?.grade?.trim(),
      link,
      isRequiredForLocation: true,
    },
  ];
}

function buildTutorItems(
  tutor: {
    bio: string | null;
    qualifications: string | null;
    subjects: string[] | null;
    hourly_rate: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null,
  role: AppRole | null,
): ProfileCompletionItem[] {
  const link = profileLink(role);
  return [
    {
      label: "Write a bio about yourself",
      completed: !!tutor?.bio?.trim(),
      link,
      isRequiredForLocation: false,
    },
    {
      label: "Add your qualifications & degrees",
      completed: !!tutor?.qualifications?.trim(),
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Select at least one subject",
      completed: !!tutor?.subjects && tutor.subjects.length > 0,
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Set your hourly rate",
      completed: !!tutor?.hourly_rate && tutor.hourly_rate > 0,
      link,
      isRequiredForLocation: true,
    },
    {
      label: "Set home tuition base location / coordinates",
      completed: typeof tutor?.latitude === "number" && typeof tutor?.longitude === "number",
      link,
      isRequiredForLocation: true,
    },
  ];
}
