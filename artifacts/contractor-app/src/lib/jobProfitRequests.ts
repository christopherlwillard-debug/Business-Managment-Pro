export function canApplyJobResponse(
  requestKey: number,
  currentKey: number,
  requestedJobId: number,
  currentJobId: number,
): boolean {
  return requestKey === currentKey && requestedJobId === currentJobId;
}