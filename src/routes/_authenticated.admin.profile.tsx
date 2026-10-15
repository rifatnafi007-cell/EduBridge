import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Copy,
  Check,
  Mail,
  Calendar,
  KeyRound,
  Users,
  AlertTriangle,
  FileCheck2,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/shared/profile-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/edubridge";

export const Route = createFileRoute("/_authenticated/admin/profile")({
  head: () => ({
    meta: [
      { title: "Admin Profile — EduBridge" },
      { name: "description", content: "Manage your administrator account credentials and contact details." },
      { property: "og:title", content: "Admin Profile — EduBridge" },
      { property: "og:description", content: "Administrator security and profile settings." },
    ],
  }),
  component: AdminProfilePage,
});

function AdminProfilePage() {
  const { user, profile } = useAuth();
  const [copiedId, setCopiedId] = useState(false);

  function copyAdminId() {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    toast.success("Administrator UID copied to clipboard.");
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Profile & Security"
        subtitle="Manage your personal details, platform administrative credentials, and privileged tools."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Privileged Administrative Role & Quick Jump */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border-purple-500/20 bg-gradient-to-b from-purple-500/5 to-transparent">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  System Role
                </CardTitle>
                <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20">
                  Administrator
                </Badge>
              </div>
              <CardDescription>
                Full administrative authority over platform users, tutors, and financial operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Admin Email
                </span>
                <p className="font-semibold text-foreground truncate">{user?.email ?? "—"}</p>
              </div>

              <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> User ID (UUID)
                  </span>
                  <button
                    type="button"
                    onClick={copyAdminId}
                    className="text-primary hover:underline flex items-center gap-1"
                    title="Copy UUID"
                  >
                    {copiedId ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span className="text-[10px]">{copiedId ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p className="font-mono text-[11px] text-foreground truncate">{user?.id ?? "—"}</p>
              </div>

              {user?.created_at && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Admin Since
                  </span>
                  <p className="font-semibold text-foreground">{formatDate(user.created_at)}</p>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <p className="font-medium text-foreground mb-2">Administrative Privileges:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Student suspension & reactivation
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Tutor verification & listing moderation
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Dispute & complaint resolution
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Platform offer overrides & financial auditing
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Quick Admin Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Moderation Hub</CardTitle>
              <CardDescription className="text-xs">
                Jump directly to admin control panels.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-xs h-9" asChild>
                <Link to="/admin/users">
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  Moderate Users & Students
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-xs h-9" asChild>
                <Link to="/admin/complaints">
                  <AlertTriangle className="h-4 w-4 mr-2 text-muted-foreground" />
                  Triage Urgent Complaints
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-xs h-9" asChild>
                <Link to="/admin/offers">
                  <FileCheck2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  Inspect Platform Offers
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-xs h-9" asChild>
                <Link to="/admin/reviews">
                  <Star className="h-4 w-4 mr-2 text-muted-foreground" />
                  Moderate Student Reviews
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Personal details form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Details</CardTitle>
              <CardDescription>
                Update your display name, administrator contact phone number, and avatar photo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
