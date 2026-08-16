import { getActiveSessions, getCurrentSession, getPasswordPolicy, getProfile } from "@/lib/api";
import { ProfileForms } from "./profile-forms";

export const metadata = { title: "My profile · ExcelEx" };

export default async function ProfilePage() {
  const [profile, sessions, session, policy] = await Promise.all([
    getProfile(),
    getActiveSessions(),
    getCurrentSession(),
    getPasswordPolicy(),
  ]);

  if (!profile) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Your profile could not be loaded.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">My profile</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Your own account. Changing these needs no permission — you are both the subject and the
          actor.
        </p>
      </header>

      <ProfileForms
        profile={profile}
        sessions={sessions ?? []}
        permissions={session?.user.permissions ?? []}
        policy={policy}
      />
    </div>
  );
}
