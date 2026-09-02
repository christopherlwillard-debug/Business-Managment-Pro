export interface ReassignedReimbursementJob {
  jobId: number;
  jobTitle: string | null;
}

export interface ReimbursementReassignmentNotice {
  title: string;
  description: string;
}

export function buildReimbursementReassignmentNotice(
  reassignedJobs: ReassignedReimbursementJob[],
): ReimbursementReassignmentNotice | null {
  if (reassignedJobs.length === 0) return null;

  const jobNames = reassignedJobs.map((job) => job.jobTitle || `Job #${job.jobId}`);
  return {
    title: "Subcontractor deleted",
    description: `Mileage reimbursement reassigned to the business owner for: ${jobNames.join(", ")}.`,
  };
}