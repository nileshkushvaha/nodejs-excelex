import { FormPage } from "@/components/form-page";
import { DepartmentForm } from "../department-form";

export const metadata = { title: "New department · ExcelEx" };

export default function NewDepartmentPage() {
  return (
    <FormPage
      backHref="/organisation/departments"
      backLabel="Departments"
      title="New department"
      description="Departments group job titles and, later, the staff who hold them."
    >
      <DepartmentForm department={null} />
    </FormPage>
  );
}
