import { FormPage } from "@/components/form-page";
import { getDepartments } from "@/lib/api";
import { DesignationForm } from "../designation-form";

export const metadata = { title: "New designation · ExcelEx" };

export default async function NewDesignationPage() {
  const departments = await getDepartments();

  return (
    <FormPage
      backHref="/organisation/designations"
      backLabel="Designations"
      title="New designation"
      description="A job title. Leave the department blank for one that sits above any single department."
    >
      <DesignationForm designation={null} departments={departments ?? []} />
    </FormPage>
  );
}
