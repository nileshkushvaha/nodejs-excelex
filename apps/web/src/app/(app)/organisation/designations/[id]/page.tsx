import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getDepartments, getDesignations } from "@/lib/api";
import { DesignationForm } from "../designation-form";

export const metadata = { title: "Edit designation · ExcelEx" };

export default async function EditDesignationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [designations, departments] = await Promise.all([getDesignations(), getDepartments()]);
  const designation = designations?.find((row) => row.id === id);
  if (!designation) notFound();

  return (
    <FormPage
      backHref="/organisation/designations"
      backLabel="Designations"
      title={`Edit ${designation.name}`}
      description={designation.department?.name ?? "Company-wide"}
    >
      <DesignationForm designation={designation} departments={departments ?? []} />
    </FormPage>
  );
}
