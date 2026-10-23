import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  ShieldAlert,
  Users,
  Inbox,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  DollarSign,
  UserCheck,
  AlertCircle,
  ExternalLink,
  Star,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { RowsSkeleton } from "@/components/shared/loading-skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { RatingStars } from "@/components/shared/rating-stars";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatTaka } from "@/lib/edubridge";
import { OFFER_SELECT, type OfferRow } from "@/lib/selects";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin dashboard — EduBridge" },
      { name: "description", content: "Platform overview: revenue, users, offers analytics, and moderation triage." },
      { property: "og:title", content: "Admin dashboard — EduBridge" },
      { property: "og:description", content: "EduBridge moderation, financial metrics, and real-time activity." },
    ],
  }),
  component: AdminDashboard,
});

type UrgentComplaint = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  raised: { full_name: string } | null;
  target: { full_name: string } | null;
};

const STATUS_COLORS = {
  accepted: "#10b981", // emerald
  pending: "#f59e0b", // amber
  rejected: "#ef4444", // rose
  cancelled: "#64748b", // slate
} as const;

export function AdminDashboard() {
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const [
        usersRes,
        tutorsRes,
        offersRes,
        complaintsRes,
        rolesRes,
        recentOffersRes,
        urgentComplaintsRes,
        reviewsRes,
        allReviewsRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id, created_at"),
        supabase.from("tutor_profiles").select("id, is_active, hourly_rate"),
        supabase.from("offers").select("id, status, total_amount, created_at"),
        supabase.from("complaints").select("id, status").in("status", ["open", "in_review"]),
        supabase.from("user_roles").select("role"),
        supabase.from("offers").select(OFFER_SELECT).order("created_at", { ascending: false }).limit(5),
        supabase
          .from("complaints")
          .select(
            "id, title, description, status, created_at, raised:profiles!complaints_raised_by_fkey(full_name), target:profiles!complaints_against_fkey(full_name)",
          )
          .in("status", ["open", "in_review"])
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("reviews")
          .select(`
            id,
            rating,
            comment,
            created_at,
            student:profiles!reviews_student_id_fkey(full_name, avatar_url),
            tutor_profile:tutor_profiles!reviews_tutor_id_fkey(
              profiles!tutor_profiles_user_id_fkey(full_name)
            )
          `)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase.from("reviews").select("id, rating"),
      ]);

      const allOffers = offersRes.data ?? [];
      const allTutors = tutorsRes.data ?? [];
      const allRoles = rolesRes.data ?? [];
      const allComplaints = complaintsRes.data ?? [];

      const totalUsers = usersRes.data?.length ?? 0;
      const totalTutors = allTutors.length;
      const activeTutors = allTutors.filter((t) => t.is_active).length;
      const activeTutorsPct = totalTutors > 0 ? Math.round((activeTutors / totalTutors) * 100) : 0;

      // Offers metrics
      const totalOffers = allOffers.length;
      const acceptedOffers = allOffers.filter((o) => o.status === "accepted");
      const pendingOffers = allOffers.filter((o) => o.status === "pending");
      const rejectedOffers = allOffers.filter((o) => o.status === "rejected");
      const cancelledOffers = allOffers.filter((o) => o.status === "cancelled");

      const totalAcceptedVolume = acceptedOffers.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
      const totalVolume = allOffers.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
      const acceptanceRate = totalOffers > 0 ? Math.round((acceptedOffers.length / totalOffers) * 100) : 0;

      // Roles breakdown
      const studentCount = allRoles.filter((r) => r.role === "student").length;
      const tutorCount = allRoles.filter((r) => r.role === "tutor").length;
      const adminCount = allRoles.filter((r) => r.role === "admin").length;

      // Average tutor hourly rate
      const avgHourlyRate =
        allTutors.length > 0
          ? Math.round(allTutors.reduce((acc, t) => acc + (Number(t.hourly_rate) || 0), 0) / allTutors.length)
          : 0;

      // Offers distribution chart data
      const offerStatusData = [
        { name: "Accepted", value: acceptedOffers.length, color: STATUS_COLORS.accepted },
        { name: "Pending", value: pendingOffers.length, color: STATUS_COLORS.pending },
        { name: "Rejected", value: rejectedOffers.length, color: STATUS_COLORS.rejected },
        { name: "Cancelled", value: cancelledOffers.length, color: STATUS_COLORS.cancelled },
      ].filter((d) => d.value > 0);

      // Roles distribution chart data
      const userCompositionData = [
        { role: "Students", count: studentCount, fill: "#3b82f6" },
        { role: "Active Tutors", count: activeTutors, fill: "#10b981" },
        { role: "Inactive Tutors", count: Math.max(0, totalTutors - activeTutors), fill: "#94a3b8" },
        { role: "Admins", count: adminCount, fill: "#8b5cf6" },
      ];

      const allReviewsData = (allReviewsRes?.data ?? []) as { id: string; rating: number }[];
      const totalReviewsCount = allReviewsData.length;
      const platformAvgRating =
        totalReviewsCount > 0
          ? (allReviewsData.reduce((acc, r) => acc + (r.rating || 0), 0) / totalReviewsCount).toFixed(1)
          : "0.0";

      const marketplaceRatio = totalTutors > 0 ? (studentCount / totalTutors).toFixed(1) : "0";

      return {
        totalUsers,
        totalTutors,
        activeTutors,
        activeTutorsPct,
        marketplaceRatio,
        totalOffers,
        acceptedOffersCount: acceptedOffers.length,
        totalAcceptedVolume,
        totalVolume,
        acceptanceRate,
        unresolvedComplaints: allComplaints.length,
        openComplaints: allComplaints.filter((c) => c.status === "open").length,
        inReviewComplaints: allComplaints.filter((c) => c.status === "in_review").length,
        avgHourlyRate,
        totalReviewsCount,
        platformAvgRating,
        offerStatusData,
        userCompositionData,
        recentOffers: (recentOffersRes.data ?? []) as unknown as OfferRow[],
        urgentComplaints: (urgentComplaintsRes.data ?? []) as unknown as UrgentComplaint[],
        recentReviews: (reviewsRes.data ?? []) as any[],
      };
    },
  });

  async function handleQuickResolve(id: string, newStatus: "in_review" | "resolved") {
    setUpdatingId(id);
    const { error } = await supabase.from("complaints").update({ status: newStatus }).eq("id", id);

    if (error) {
      setUpdatingId(null);
      toast.error(error.message);
      return;
    }

    const { data: complaintData } = await supabase
      .from("complaints")
      .select("raised_by, title")
      .eq("id", id)
      .maybeSingle();

    if (complaintData?.raised_by) {
      await supabase.from("notifications").insert({
        user_id: complaintData.raised_by,
        title: newStatus === "resolved" ? "Complaint resolved" : "Complaint under review",
        body:
          newStatus === "resolved"
            ? `Your complaint regarding "${complaintData.title}" has been reviewed and resolved by administration.`
            : `An administrator is actively reviewing your complaint regarding "${complaintData.title}".`,
      });
    }

    setUpdatingId(null);
    toast.success(`Complaint marked as ${newStatus.replace("_", " ")}.`);
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin dashboard" subtitle="Loading platform metrics..." />
        <RowsSkeleton rows={4} />
      </div>
    );
  }

  const kpis = [
    {
      label: "Platform Tuition Volume",
      value: formatTaka(data?.totalAcceptedVolume ?? 0),
      subtext: `From ${data?.acceptedOffersCount ?? 0} accepted offers`,
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      to: "/admin/offers",
    },
    {
      label: "Total Registered Users",
      value: data?.totalUsers ?? 0,
      subtext: `${data?.activeTutors ?? 0} active tutors on platform`,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      to: "/admin/users",
    },
    {
      label: "Tutor Pool Health",
      value: `${data?.activeTutorsPct ?? 0}%`,
      subtext: `${data?.activeTutors ?? 0} of ${data?.totalTutors ?? 0} active listings`,
      icon: GraduationCap,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
      to: "/admin/users",
    },
    {
      label: "Offers Acceptance Rate",
      value: `${data?.acceptanceRate ?? 0}%`,
      subtext: `${data?.totalOffers ?? 0} total offers submitted`,
      icon: Inbox,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      to: "/admin/offers",
    },
    {
      label: "Pending Moderation",
      value: data?.unresolvedComplaints ?? 0,
      subtext: `${data?.openComplaints ?? 0} open · ${data?.inReviewComplaints ?? 0} in review`,
      icon: ShieldAlert,
      color: (data?.unresolvedComplaints ?? 0) > 0 ? "text-rose-500" : "text-muted-foreground",
      bg: (data?.unresolvedComplaints ?? 0) > 0 ? "bg-rose-500/10" : "bg-muted",
      to: "/admin/complaints",
      highlight: (data?.unresolvedComplaints ?? 0) > 0,
    },
    {
      label: "Platform Rating",
      value: `${data?.platformAvgRating ?? "0.0"} ★`,
      subtext: `From ${data?.totalReviewsCount ?? 0} student reviews`,
      icon: Star,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      to: "/admin/reviews",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Admin Dashboard"
          subtitle="Real-time platform metrics, revenue tracking, and moderation queues."
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" asChild>
            <Link to="/admin/users">
              <UserCheck className="mr-1.5 h-4 w-4 shrink-0" /> Manage Users
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" asChild>
            <Link to="/admin/offers">
              <Inbox className="mr-1.5 h-4 w-4 shrink-0" /> All Offers
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-center sm:w-auto" asChild>
            <Link to="/admin/reviews">
              <Star className="mr-1.5 h-4 w-4 shrink-0 text-amber-500 fill-amber-500" /> Reviews ({data?.totalReviewsCount ?? 0})
            </Link>
          </Button>
          <Button size="sm" className="w-full justify-center sm:w-auto" asChild>
            <Link to="/admin/complaints">
              <ShieldAlert className="mr-1.5 h-4 w-4 shrink-0" /> Moderation Queue
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            to={kpi.to}
            className={`group rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md ${kpi.highlight ? "border-rose-300 dark:border-rose-900/60" : "border-border"
              }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
            <p className="mt-1 flex items-center text-xs text-muted-foreground">
              {kpi.subtext}
              <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
          </Link>
        ))}
      </div>

      {/* Visual Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Donut Chart: Offers Status */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Tuition Offers Distribution</h2>
              <p className="text-xs text-muted-foreground">Status breakdown across all submitted offers.</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {data?.totalOffers ?? 0} Total
            </Badge>
          </div>

          <div className="mt-4 h-64 w-full">
            {(data?.offerStatusData ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.offerStatusData ?? []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(data?.offerStatusData ?? []).map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      const item = payload?.[0];
                      if (active && item) {
                        const total = data?.totalOffers || 1;
                        const pct = Math.round(((Number(item.value) || 0) / total) * 100);
                        return (
                          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                            <p className="font-semibold text-foreground">{item.name}</p>
                            <p className="text-muted-foreground">
                              {item.value} offers ({pct}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No offer activity recorded yet.
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs">
            {(data?.offerStatusData ?? []).map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}:</span>
                <span className="font-semibold text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart: User Roles Composition */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Platform Community Makeup</h2>
              <p className="text-xs text-muted-foreground">Distribution of students, active tutors, and admins.</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span>Avg Tutor Rate: {formatTaka(data?.avgHourlyRate ?? 0)}/hr</span>
            </div>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.userCompositionData ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                <XAxis dataKey="role" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(0, 0, 0, 0.04)" }}
                  content={({ active, payload }) => {
                    const item = payload?.[0];
                    if (active && item) {
                      const roleName = (item.payload as { role?: string })?.role ?? "Role";
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold text-foreground">{roleName}</p>
                          <p className="text-muted-foreground">{item.value} registered</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            <span>Marketplace Balance: {data?.marketplaceRatio ?? "0"} students per tutor</span>
            <Link to="/admin/users" className="font-medium text-primary hover:underline">
              Inspect user directory →
            </Link>
          </div>
        </div>
      </div>

      {/* Actionable Triage Section: Two Columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Urgent Moderation Queue (Complaints) */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">Urgent Moderation Queue</h3>
                <p className="text-xs text-muted-foreground">Unresolved reports from students and tutors.</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/complaints">
                View all ({data?.unresolvedComplaints ?? 0}) <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {(data?.urgentComplaints ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/70" />
                <p className="mt-2 text-sm font-medium text-foreground">Moderation queue is clean</p>
                <p className="text-xs text-muted-foreground">No open complaints requiring administrative review.</p>
              </div>
            ) : (
              data?.urgentComplaints.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-background p-3.5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.raised?.full_name ?? "Unknown"} reported {c.target?.full_name ?? "Unknown"} ·{" "}
                        {formatDate(c.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/50 pt-2.5">
                    {c.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={updatingId === c.id}
                        onClick={() => void handleQuickResolve(c.id, "in_review")}
                      >
                        <Clock className="mr-1 h-3 w-3" /> Mark in review
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={updatingId === c.id}
                      onClick={() => void handleQuickResolve(c.id, "resolved")}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Tuition Offers Stream */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 sm:pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Inbox className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">Recent Tuition Offers</h3>
                <p className="text-xs text-muted-foreground">Latest transactions created on EduBridge.</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/offers">
                View all ({data?.totalOffers ?? 0}) <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="mt-4">
            {(data?.recentOffers ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium text-foreground">No offers submitted yet</p>
                <p className="text-xs text-muted-foreground">New tuition offers will appear here automatically.</p>
              </div>
            ) : (
              <>
                {/* Mobile View: High-density offer cards (< sm) */}
                <div className="divide-y divide-border/60 sm:hidden">
                  {data?.recentOffers.map((o) => (
                    <div key={o.id} className="py-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            name={o.profiles?.full_name ?? "Student"}
                            path={o.profiles?.avatar_url}
                            className="h-8 w-8 text-xs shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {o.profiles?.full_name ?? "—"}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              Tutor: <span className="text-foreground/90 font-medium">{o.tutor_profiles?.profiles?.full_name ?? "—"}</span>
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-foreground">
                            {formatTaka(o.total_amount)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDate(o.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="inline-flex items-center rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          Offer #{o.id.slice(0, 8)}
                        </span>
                        <StatusBadge status={o.status} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop / Tablet View: Full Table (sm and up) */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Student</TableHead>
                        <TableHead className="text-xs">Tutor</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-right text-xs">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.recentOffers.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                name={o.profiles?.full_name ?? "Student"}
                                path={o.profiles?.avatar_url}
                                className="h-6 w-6 text-[10px]"
                              />
                              <span className="truncate text-xs font-medium text-foreground">
                                {o.profiles?.full_name ?? "—"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-xs text-muted-foreground">
                            {o.tutor_profiles?.profiles?.full_name ?? "—"}
                          </TableCell>
                          <TableCell className="py-2.5 text-xs font-semibold text-foreground">
                            {formatTaka(o.total_amount)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <StatusBadge status={o.status} />
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-xs text-muted-foreground">
                            {formatDate(o.created_at)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Student Reviews & Ratings Feed */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 sm:pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Star className="h-4 w-4 fill-amber-500" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground">Latest Student Reviews & Feedback</h3>
              <p className="text-xs text-muted-foreground">Recent ratings, comments, and stars left by students for tutors.</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/reviews">
              View all ({data?.totalReviewsCount ?? 0}) <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="mt-4">
          {(data?.recentReviews ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Star className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium text-foreground">No student reviews yet</p>
              <p className="text-xs text-muted-foreground">Reviews will appear here as students complete sessions and rate tutors.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {data?.recentReviews.map((r: any) => {
                const studentName = r.student?.full_name ?? "Student";
                const tutorName = r.tutor_profile?.profiles?.full_name ?? "Tutor";

                return (
                  <div key={r.id} className="rounded-xl border border-border bg-background p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <RatingStars value={r.rating} size={14} />
                        <span className="text-[11px] text-muted-foreground">{formatDate(r.created_at)}</span>
                      </div>
                      <p className="mt-2.5 text-xs text-foreground line-clamp-3">
                        {r.comment ? `"${r.comment}"` : <span className="italic text-muted-foreground">No comment written.</span>}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <UserAvatar name={studentName} path={r.student?.avatar_url} className="h-5 w-5 text-[9px]" />
                        <span className="truncate text-muted-foreground">{studentName}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">for <span className="font-medium text-foreground">{tutorName}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

