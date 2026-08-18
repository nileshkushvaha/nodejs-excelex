import { FormPage } from "@/components/form-page";
import { getAccountGroups, getCurrentSession } from "@/lib/api";
import { GroupForm } from "../group-form";

export const metadata = { title: "New account group · ExcelEx" };

export default async function NewGroupPage() {
  const [groups, session] = await Promise.all([getAccountGroups(), getCurrentSession()]);

  return (
    <FormPage
      backHref="/accounts/groups"
      backLabel="Account groups"
      title="New account group"
      description="A node in the chart of accounts. Leave Under group empty for a top-level heading."
    >
      <GroupForm
        group={null}
        groups={groups ?? []}
        canManage={session?.user.permissions.includes("masters.rate.manage") ?? false}
      />
    </FormPage>
  );
}
