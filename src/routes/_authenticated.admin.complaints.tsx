import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Save,
  ExternalLink,
  User,
  FileCheck2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RowsSkeleton } from "@/components/shared/loading-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/edubridge";

export const Route = createFileRoute("/_authenticated/admin/complaints")({
  head: () => ({
    meta: [
      { title: "Complaints — EduBridge admin" },
      { name: "description", content: "Review, annotate and resolve complaints raised by students and tutors." },
      { property: "og:title", content: "Complaints — EduBridge admin" },
      { property: "og:description", content: "Moderation queue for EduBridge complaints." },
    ],
  }),
  component: AdminComplaints,
});

const TABS = ["all", "open", "in_review", "resolved", "dismissed"] as const;

type ComplaintDetail = {
  id: string;
  title: string;
  description: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  raised_by: string;
  against: string | null;
  offer_id: string | null;
  raised: { id: string; full_name: string; phone: string | null } | null;
  target: { id: string; full_name: string; phone: string | null } | null;
};

function AdminComplaints() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("open");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select(
          "id, title, description, status, admin_note, created_at, raised_by, against, offer_id, raised:profiles!complaints_raised_by_fkey(id, full_name, phone), target:profiles!complaints_against_fkey(id, full_name, phone)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ComplaintDetail[];
    },
  });

  const allComplaints = data ?? [];

  // Filter complaints by tab and search
  const filteredComplaints = useMemo(() => {
    return allComplaints.filter((c) => {
      const matchesTab = tab === "all" || c.status === tab;
      const query = q.toLowerCase().trim();
      const matchesQuery =
        !query ||
        c.title.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query) ||
        c.raised?.full_name?.toLowerCase().includes(query) ||
        c.target?.full_name?.toLowerCase().includes(query) ||
        c.admin_note?.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query);

      return matchesTab && matchesQuery;
    });
  }, [allComplaints, tab, q]);

  // Tab counter badges
  const counts = useMemo(() => {
    return {
      all: allComplaints.length,
      open: allComplaints.filter((c) => c.status === "open").length,
      in_review: allComplaints.filter((c) => c.status === "in_review").length,
      resolved: allComplaints.filter((c) => c.status === "resolved").length,
      dismissed: allComplaints.filter((c) => c.status === "dismissed").length,
    };
  }, [allComplaints]);

  async function handleSaveNote(complaint: ComplaintDetail) {
    const note = (notes[complaint.id] ?? complaint.admin_note ?? "").trim();
    setSavingNoteId(complaint.id);

    const { error } = await supabase
      .from("complaints")
      .update({ admin_note: note || null })
      .eq("id", complaint.id);

    setSavingNoteId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Admin note saved.");
    void queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
  }

  async function handleStatusChange(complaint: ComplaintDetail, newStatus: string) {
    setUpdatingStatusId(complaint.id);
    const note = (notes[complaint.id] ?? complaint.admin_note ?? "").trim();

    const updatePayload: { status: string; admin_note?: string | null } = { status: newStatus };
    if (note) updatePayload.admin_note = note;

    const { error } = await supabase
      .from("complaints")
      .update(updatePayload)
      .eq("id", complaint.id);

    if (error) {
      setUpdatingStatusId(null);
      toast.error(error.message);
      return;
    }

    // Send notification to the user who raised the complaint
    if (complaint.raised_by) {
      let notifyTitle = "Complaint update";
      let notifyBody = `Your complaint regarding "${complaint.title}" has been updated.`;

      if (newStatus === "resolved") {
        notifyTitle = "Complaint resolved";
        notifyBody = `Your complaint regarding "${complaint.title}" was investigated and resolved by EduBridge administration.`;
      } else if (newStatus === "in_review") {
        notifyTitle = "Complaint in review";
        notifyBody = `An administrator has initiated review of your report: "${complaint.title}".`;
      } else if (newStatus === "dismissed") {
        notifyTitle = "Complaint dismissed";
        notifyBody = `Your complaint regarding "${complaint.title}" was reviewed and dismissed by administration.`;
      }

      if (note) {
        notifyBody += ` Admin note: "${note}"`;
      }

      await supabase.from("notifications").insert({
        user_id: complaint.raised_by,
        title: notifyTitle,
        body: notifyBody,
      });
    }

    setUpdatingStatusId(null);
    toast.success(`Complaint status changed to ${newStatus.replace("_", " ")}.`);
    void queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints & Dispute Moderation"
        subtitle="Investigate reports from students and tutors, record decisions, and take disciplinary action."
      />

      {/* Tabs and Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize gap-1.5">
                {t.replace("_", " ")}
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
            placeholder="Search complaints, users, keywords..."
            className="pl-9"
            aria-label="Search complaints"
          />
        </div>
      </div>

      {isLoading ? (
        <RowsSkeleton rows={4} />
      ) : filteredComplaints.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No complaints in this queue"
          description={q ? "No reports match your search query." : "All reports in this category have been addressed."}
        />
      ) : (
        <div className="space-y-4">
          {filteredComplaints.map((c) => {
            const currentNote = notes[c.id] !== undefined ? notes[c.id] : (c.admin_note ?? "");
            const isUpdating = updatingStatusId === c.id;
            const isSavingNote = savingNoteId === c.id;

            return (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-border/80"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reported {formatDate(c.created_at)} · ID: <span className="font-mono">{c.id.slice(0, 8)}</span>
                    </p>
                  </div>

                  {/* Quick links to user or offer */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {c.target && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                        <Link to="/admin/users">
                          <User className="h-3 w-3 text-muted-foreground" />
                          Target: {c.target.full_name}
                        </Link>
                      </Button>
                    )}
                    {c.offer_id && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                        <Link to="/admin/offers">
                          <FileCheck2 className="h-3 w-3 text-muted-foreground" />
                          Linked Offer
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Parties Details Pill Bar */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <div className="rounded-lg bg-accent/40 px-2.5 py-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Complainant:</span>{" "}
                    {c.raised?.full_name ?? "Unknown"} {c.raised?.phone ? `(${c.raised.phone})` : ""}
                  </div>
                  <div className="rounded-lg bg-accent/40 px-2.5 py-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Against:</span>{" "}
                    {c.target ? `${c.target.full_name} ${c.target.phone ? `(${c.target.phone})` : ""}` : "General / Platform"}
                  </div>
                </div>

                {/* Complaint Body */}
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm text-foreground">
                  <p className="whitespace-pre-wrap leading-relaxed">{c.description}</p>
                </div>

                {/* Admin Note Section */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor={`note-${c.id}`} className="text-xs font-semibold text-foreground">
                      Administrative Note & Resolution Record:
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-primary"
                      disabled={isSavingNote || currentNote === (c.admin_note ?? "")}
                      onClick={() => void handleSaveNote(c)}
                    >
                      <Save className="h-3 w-3" />
                      {isSavingNote ? "Saving..." : "Save Note"}
                    </Button>
                  </div>
                  <Textarea
                    id={`note-${c.id}`}
                    rows={2}
                    placeholder="Record notes on investigation, communication, or disciplinary actions taken..."
                    value={currentNote}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="text-xs"
                  />
                </div>

                {/* Resolution Status Action Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                  {c.status !== "in_review" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      disabled={isUpdating}
                      onClick={() => void handleStatusChange(c, "in_review")}
                    >
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      Mark in review
                    </Button>
                  )}

                  {c.status !== "resolved" && (
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={isUpdating}
                      onClick={() => void handleStatusChange(c, "resolved")}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve & Close
                    </Button>
                  )}

                  {c.status !== "dismissed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive"
                      disabled={isUpdating}
                      onClick={() => void handleStatusChange(c, "dismissed")}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Dismiss / Reject
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
