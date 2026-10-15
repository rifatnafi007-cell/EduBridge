import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Search,
  Trash2,
  FileCheck2,
  User,
  GraduationCap,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { RatingStars } from "@/components/shared/rating-stars";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { RowsSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/edubridge";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reviews — EduBridge admin" },
      { name: "description", content: "Moderate student ratings and reviews across tutors on EduBridge." },
      { property: "og:title", content: "Reviews — EduBridge admin" },
      { property: "og:description", content: "Platform-wide review and ratings moderation." },
    ],
  }),
  component: AdminReviews,
});

type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  offer_id: string | null;
  student: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  tutor_profile: {
    id: string;
    profiles: {
      id: string;
      full_name: string;
      avatar_url: string | null;
    } | null;
  } | null;
};

const RATING_TABS = ["all", "5", "4", "3", "2", "1"] as const;

export function AdminReviews() {
  const queryClient = useQueryClient();
  const [ratingTab, setRatingTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [reviewToDelete, setReviewToDelete] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          comment,
          created_at,
          offer_id,
          student:profiles!reviews_student_id_fkey(id, full_name, avatar_url, phone),
          tutor_profile:tutor_profiles!reviews_tutor_id_fkey(
            id,
            profiles!tutor_profiles_user_id_fkey(id, full_name, avatar_url)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as AdminReview[];
    },
  });

  const allReviews = data ?? [];

  // Filter reviews
  const filteredReviews = useMemo(() => {
    return allReviews.filter((r) => {
      const matchesRating = ratingTab === "all" || r.rating.toString() === ratingTab;
      const query = q.toLowerCase().trim();
      const studentName = r.student?.full_name?.toLowerCase() ?? "";
      const tutorName = r.tutor_profile?.profiles?.full_name?.toLowerCase() ?? "";
      const comment = r.comment?.toLowerCase() ?? "";

      const matchesQuery =
        !query ||
        studentName.includes(query) ||
        tutorName.includes(query) ||
        comment.includes(query) ||
        r.id.toLowerCase().includes(query);

      return matchesRating && matchesQuery;
    });
  }, [allReviews, ratingTab, q]);

  // Counts by rating
  const counts = useMemo(() => {
    return {
      all: allReviews.length,
      "5": allReviews.filter((r) => r.rating === 5).length,
      "4": allReviews.filter((r) => r.rating === 4).length,
      "3": allReviews.filter((r) => r.rating === 3).length,
      "2": allReviews.filter((r) => r.rating === 2).length,
      "1": allReviews.filter((r) => r.rating === 1).length,
    };
  }, [allReviews]);

  async function handleDeleteReview() {
    if (!reviewToDelete) return;
    setDeleting(true);

    const { error } = await supabase.from("reviews").delete().eq("id", reviewToDelete.id);

    setDeleting(false);
    setReviewToDelete(null);

    if (error) {
      if (error.code === "42501" || error.message?.includes("policy")) {
        toast.error("Please run the admin SQL migration in Supabase to grant review deletion permission.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Review deleted. Tutor rating has been automatically updated.");
    void queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews & Ratings Moderation"
        subtitle="Inspect student ratings, monitor platform feedback, and remove abusive or fraudulent reviews."
      />

      {/* Tabs and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={ratingTab} onValueChange={setRatingTab}>
          <TabsList className="flex flex-wrap h-auto">
            {RATING_TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize gap-1.5">
                {t === "all" ? "All Stars" : `${t} ★`}
                <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold">
                  {counts[t]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search student, tutor, comment..."
            className="pl-9"
            aria-label="Search reviews"
          />
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={4} />
      ) : filteredReviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews found"
          description={q ? "No reviews match your search query." : "No reviews in this star rating tier."}
        />
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((r) => {
            const studentName = r.student?.full_name ?? "Student";
            const tutorName = r.tutor_profile?.profiles?.full_name ?? "Tutor";

            return (
              <div
                key={r.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-border/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Rating Stars and Date */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <RatingStars value={r.rating} />
                      <Badge
                        variant="secondary"
                        className={
                          r.rating >= 4
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : r.rating === 3
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                        }
                      >
                        {r.rating} / 5 Stars
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitted on {formatDate(r.created_at)} · ID: <span className="font-mono">{r.id.slice(0, 8)}</span>
                    </p>
                  </div>

                  {/* Actions: View Offer or Delete */}
                  <div className="flex items-center gap-2">
                    {r.offer_id && (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" asChild>
                        <Link to="/admin/offers">
                          <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Inspect Offer
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
                      onClick={() => setReviewToDelete(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Review
                    </Button>
                  </div>
                </div>

                {/* Parties Involved */}
                <div className="mt-3 flex flex-wrap items-center gap-4 border-y border-border/50 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={studentName} path={r.student?.avatar_url} className="h-6 w-6 text-[10px]" />
                    <span className="text-muted-foreground">Student:</span>
                    <span className="font-medium text-foreground">{studentName}</span>
                  </div>

                  <span className="text-muted-foreground">→</span>

                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={tutorName}
                      path={r.tutor_profile?.profiles?.avatar_url}
                      className="h-6 w-6 text-[10px]"
                    />
                    <span className="text-muted-foreground">Tutor:</span>
                    <span className="font-medium text-foreground">{tutorName}</span>
                  </div>
                </div>

                {/* Comment Content */}
                <div className="mt-3 text-sm text-foreground">
                  {r.comment ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{r.comment}</p>
                  ) : (
                    <p className="italic text-muted-foreground">No written feedback provided with this rating.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(reviewToDelete)}
        onOpenChange={(open) => !open && setReviewToDelete(null)}
        title="Delete this student review?"
        description="Are you sure you want to delete this review? The review will be permanently removed and the tutor's average rating and total review count will be automatically recalculated."
        confirmLabel={deleting ? "Deleting..." : "Delete Review"}
        destructive
        onConfirm={() => void handleDeleteReview()}
      />
    </div>
  );
}
