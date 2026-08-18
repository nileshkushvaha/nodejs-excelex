import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getAccountGroups, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";
import { GroupForm } from "../group-form";

export const metadata = { title: "Edit account group · ExcelEx" };

export default async function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The whole list is needed anyway to offer the parents, so the row comes
  // from it rather than from a second request.
  const [groups, session] = await Promise.all([getAccountGroups(), getCurrentSession()]);
  const group = groups?.find((row) => row.id === id);
  if (!group) notFound();

  return (
    <FormPage
      backHref="/accounts/groups"
      backLabel="Account groups"
      title={`Edit ${group.code}`}
      description={group.name}
    >
      <GroupForm
        group={group}
        groups={groups ?? []}
        canManage={can(session, "zone", "update")}
      />
    </FormPage>
  );
}
