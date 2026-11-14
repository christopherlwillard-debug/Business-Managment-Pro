export function isJobCreationStepVisible(
  _isCreate: boolean,
  _activeStep: string,
  _sectionStep: string,
): boolean {
  return true;
}

export type JobWorkspaceSectionId =
  | "details"
  | "work"
  | "subcontractors"
  | "materials"
  | "financials"
  | "photos"
  | "closeout";

export type JobWorkspaceSection = {
  id: JobWorkspaceSectionId;
  label: string;
  description: string;
};

export function getJobWorkspaceSections(): JobWorkspaceSection[] {
  return [
    { id: "details", label: "Job Details", description: "Customer, work type, and location" },
    { id: "work", label: "Work & Checklist", description: "Progress, checklist, and job history" },
    { id: "subcontractors", label: "Subcontractors & Pay", description: "Assigned crew, balances, and payments" },
    { id: "materials", label: "Materials", description: "Job material lists and costs" },
    { id: "financials", label: "Job Financials", description: "Revenue, costs, and profit breakdown" },
    { id: "photos", label: "Photos & Documents", description: "Daily logs, photos, and trip documents" },
    { id: "closeout", label: "Closeout", description: "Required work, invoice, and payment checks" },
  ];
}
