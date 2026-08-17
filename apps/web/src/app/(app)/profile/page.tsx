import Link from "next/link";

import { getActiveSessions, getCurrentSession, getProfile } from "@/lib/api";
import { ProfileForms } from "./profile-forms";

export const metadata = { title: "My profile · ExcelEx" };

export default async function ProfilePage() {
  const [profile, sessions, session] = await Promise.all([
    getProfile(),
    getActiveSessions(),
    getCurrentSession(),
  ]);

  if (!profile) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        Your profile could not be loaded.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">My profile</h1>
          <p className="mt-0.5 text-sm text-muted">
            Your own account. Changing these needs no permission — you are both the subject and the
            actor.
          </p>
        </div>
        <Link
          href="/profile/password"
          className="shrink-0 btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
        >
          Change password
        </Link>
      </header>

      <ProfileForms
        profile={profile}
        sessions={sessions ?? []}
        permissions={session?.user.permissions ?? []}
      />
    </div>
  );
}
