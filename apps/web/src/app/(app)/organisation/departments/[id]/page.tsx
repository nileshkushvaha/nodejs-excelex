import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getDepartments } from "@/lib/api";
import { DepartmentForm } from "../department-form";

export const metadata = { title: "Edit department · ExcelEx" };

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const departments = await getDepartments();
  const department = departments?.find((row) => row.id === id);
  if (!department) notFound();

  return (
    <FormPage
      backHref="/organisation/departments"
      backLabel="Departments"
      title={`Edit ${department.name}`}
      description={`${department.designationCount} designation(s) belong to this department.`}
    >
      <DepartmentForm department={department} />
    </FormPage>
  );
}
