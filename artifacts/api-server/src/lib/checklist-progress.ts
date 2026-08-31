export type ProgressItem = { id: number; completed: boolean; skipped: boolean; jobChecklistSectionId?: number };
export type ProgressPart = { jobChecklistItemId: number; completed: boolean };

export type ChecklistProgress = {
  totalItems: number;
  completedItems: number;
  weightedComplete: number;
  overallPercent: number;
};

export function calculateChecklistProgress(items: ProgressItem[], parts: ProgressPart[]): ChecklistProgress {
  const active = items.filter(item => !item.skipped);
  const partsByItem = new Map<number, ProgressPart[]>();
  for (const part of parts) {
    const values = partsByItem.get(part.jobChecklistItemId) ?? [];
    values.push(part);
    partsByItem.set(part.jobChecklistItemId, values);
  }
  const weightedComplete = active.reduce((sum, item) => {
    const itemParts = partsByItem.get(item.id) ?? [];
    return sum + (itemParts.length ? itemParts.filter(part => part.completed).length / itemParts.length : item.completed ? 1 : 0);
  }, 0);
  return {
    totalItems: active.length,
    completedItems: active.filter(item => item.completed).length,
    weightedComplete,
    overallPercent: active.length ? Math.round((weightedComplete / active.length) * 100) : 0,
  };
}