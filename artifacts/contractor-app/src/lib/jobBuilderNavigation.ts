export type JobCreationStepId =
  | "details"
  | "customer"
  | "subcontractors"
  | "review";

export type JobCreationStep = {
  id: JobCreationStepId;
  label: string;
  optional: boolean;
};

export function isJobCreationStepVisible(
  isCreate: boolean,
  activeStep: string,
  sectionStep: string,
): boolean {
  return !isCreate || activeStep === sectionStep;
}

export type JobWorkspaceSectionId =
  | "details"
  | "schedule"
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

export function getJobCreationSteps(
  workflow: string | null,
  businessLine: string,
): JobCreationStep[] {
  const detailsLabel = workflow === "mh_production"
    ? "Home & production details"
    : workflow === "mh_service"
      ? "Service job details"
      : workflow === "general_contracting" || businessLine === "general_contracting"
        ? "Project details"
        : businessLine === "asphalt_sealing"
          ? "Asphalt job details"
          : "Job details";

  return [
    { id: "details", label: detailsLabel, optional: false },
    { id: "customer", label: "Customer & location", optional: true },
    { id: "subcontractors", label: "Subcontractors", optional: true },
    { id: "review", label: "Review & create", optional: false },
  ];
}

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
