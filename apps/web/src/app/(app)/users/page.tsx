import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata = { title: "Users · ExcelEx" };

export default function UsersPage() {
  return (
    <PlaceholderPage
      title="Users"
      phase="Phase 1 · in progress"
      description="Staff accounts for this client. Invitation-based activation, single-use hashed tokens and a 72-hour expiry are specified; the screens land with the rest of the authentication milestone. Self-service signup is deliberately absent — assigning a plan is a platform-owner action."
    />
  );
}
