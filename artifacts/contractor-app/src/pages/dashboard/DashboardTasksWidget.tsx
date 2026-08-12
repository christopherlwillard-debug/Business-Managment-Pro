import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, Pencil, Trash2, ChevronDown, ChevronUp, X, Loader2, ListTodo, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardTask {
  id:          number;
  title:       string;
  notes:       string | null;
  priority:    "high" | "medium" | "low";
  dueDate:     string | null;
  businessId:  number | null;
  completedAt: string | null;
  createdAt:   string;
  updatedAt:   string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  high:   { dot: "bg-red-500",   label: "High",   inputCls: "border-red-200 bg-red-50"   },
  medium: { dot: "bg-amber-400", label: "Medium", inputCls: "border-amber-200 bg-amber-50" },
  low:    { dot: "bg-slate-300", label: "Low",    inputCls: ""                             },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyDue(dueDate: string | null | undefined): {
  label: string;
  cls:   string;
  isOverdue: boolean;
  isSoon:    boolean;
} | null {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDate + "T00:00:00");
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);

  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`,  cls: "text-red-700 bg-red-50 border-red-200",      isOverdue: true,  isSoon: false };
  if (diff === 0) return { label: "Due today",                   cls: "text-red-700 bg-red-50 border-red-200",      isOverdue: false, isSoon: true  };
  if (diff === 1) return { label: "Due tomorrow",                cls: "text-amber-700 bg-amber-50 border-amber-200", isOverdue: false, isSoon: true  };
  if (diff <= 7)  return { label: `Due in ${diff}d`,             cls: "text-amber-700 bg-amber-50 border-amber-200", isOverdue: false, isSoon: true  };
  return {
    label: "Due " + due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    cls: "text-muted-foreground bg-muted border-border",
    isOverdue: false,
    isSoon:    false,
  };
}

function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

// ── Task row ──────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task:       DashboardTask;
  onComplete: (id: number, done: boolean) => void;
  onDelete:   (id: number) => void;
  onSave:     (id: number, data: Partial<DashboardTask>) => void;
  completing: boolean;
}

function TaskRow({ task, onComplete, onDelete, onSave, completing }: TaskRowProps) {
  const [editing, setEditing]   = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPrio, setEditPrio]   = useState<"high"|"medium"|"low">(task.priority);
  const [editDue, setEditDue]     = useState(task.dueDate ?? "");
  const [editNotes, setEditNotes] = useState(task.notes ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) titleRef.current?.focus(); }, [editing]);

  const dueCfg = classifyDue(task.dueDate);
  const priCfg = PRIORITY_CONFIG[task.priority];

  function startEdit() {
    setEditTitle(task.title);
    setEditPrio(task.priority);
    setEditDue(task.dueDate ?? "");
    setEditNotes(task.notes ?? "");
    setEditing(true);
  }

  function cancelEdit() { setEditing(false); }

  function saveEdit() {
    if (!editTitle.trim()) return;
    onSave(task.id, {
      title:    editTitle.trim(),
      priority: editPrio,
      dueDate:  editDue || null,
      notes:    editNotes.trim() || null,
    });
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  }

  if (editing) {
    return (
      <div className={cn("px-3 py-3 border-t border-border/40 space-y-2", dueCfg?.isOverdue && "bg-red-50/30 dark:bg-red-950/10")}>
        <input
          ref={titleRef}
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Task title"
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={editPrio}
            onChange={e => setEditPrio(e.target.value as "high"|"medium"|"low")}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none"
          >
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">⚪ Low</option>
          </select>
          <input
            type="date"
            value={editDue}
            onChange={e => setEditDue(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none"
          />
        </div>
        <input
          value={editNotes}
          onChange={e => setEditNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none text-muted-foreground"
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={saveEdit}
            disabled={!editTitle.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Check className="w-3 h-3" /> Save
          </button>
          <button
            onClick={cancelEdit}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-start gap-3 px-3 py-2.5 border-t border-border/40 group transition-colors hover:bg-muted/20",
      dueCfg?.isOverdue && "bg-red-50/40 dark:bg-red-950/10",
      dueCfg?.isSoon && !dueCfg.isOverdue && "bg-amber-50/30 dark:bg-amber-950/10",
    )}>
      {/* Complete checkbox */}
      <button
        disabled={completing}
        onClick={() => onComplete(task.id, !task.completedAt)}
        className={cn(
          "flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
          task.completedAt
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border hover:border-primary",
          completing && "opacity-50"
        )}
        title={task.completedAt ? "Mark incomplete" : "Mark complete"}
      >
        {completing
          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
          : task.completedAt && <Check className="w-2.5 h-2.5" />
        }
      </button>

      {/* Priority dot */}
      <span className={cn("flex-shrink-0 mt-[5px] w-2 h-2 rounded-full", priCfg.dot)} title={priCfg.label + " priority"} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", task.completedAt ? "line-through text-muted-foreground" : "text-foreground")}>
          {task.title}
        </p>
        {task.notes && !task.completedAt && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.notes}</p>
        )}
        {dueCfg && (
          <span className={cn("inline-flex items-center gap-1 mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border", dueCfg.cls)}>
            {dueCfg.isOverdue
              ? <AlertTriangle className="w-2.5 h-2.5" />
              : <Clock className="w-2.5 h-2.5" />
            }
            {dueCfg.label}
          </span>
        )}
      </div>

      {/* Actions — show on hover */}
      {!task.completedAt && (
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={startEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${task.title}"?`)) onDelete(task.id);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Delete button for completed tasks */}
      {task.completedAt && (
        <button
          onClick={() => onDelete(task.id)}
          className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ onAdd, onCancel }: { onAdd: (data: { title: string; priority: string; dueDate: string | null; notes: string | null }) => void; onCancel: () => void }) {
  const [title, setTitle]       = useState("");
  const [priority, setPriority] = useState<"high"|"medium"|"low">("medium");
  const [dueDate, setDueDate]   = useState("");
  const [notes, setNotes]       = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), priority, dueDate: dueDate || null, notes: notes.trim() || null });
    setTitle(""); setPriority("medium"); setDueDate(""); setNotes("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <form onSubmit={handleSubmit} className="px-3 py-3 border-t border-border/40 space-y-2 bg-muted/10">
      <input
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What do you need to do?"
        required
        className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as "high"|"medium"|"low")}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none"
        >
          <option value="high">🔴 High priority</option>
          <option value="medium">🟡 Medium priority</option>
          <option value="low">⚪ Low priority</option>
        </select>
        <input
          type="date"
          value={dueDate}
          min={getTodayStr()}
          onChange={e => setDueDate(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none"
          title="Due date (optional)"
        />
      </div>
      <input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full text-xs px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none text-muted-foreground"
      />
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Task
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function DashboardTasksWidget() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd]           = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completingId, setCompletingId]   = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<{ incomplete: DashboardTask[]; completed: DashboardTask[] }>({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/dashboard-tasks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard-tasks"] });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      fetch(`${BASE}/api/dashboard-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { invalidate(); setShowAdd(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      fetch(`${BASE}/api/dashboard-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/dashboard-tasks/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => invalidate(),
  });

  async function handleComplete(id: number, done: boolean) {
    setCompletingId(id);
    await updateMutation.mutateAsync({
      id,
      data: { completedAt: done ? new Date().toISOString() : null },
    });
    setCompletingId(null);
  }

  const incomplete = data?.incomplete ?? [];
  const completed  = data?.completed  ?? [];

  // Separate overdue tasks for visual grouping
  const overdueTasks = incomplete.filter(t => {
    const d = classifyDue(t.dueDate);
    return d?.isOverdue;
  });
  const activeTasks = incomplete.filter(t => {
    const d = classifyDue(t.dueDate);
    return !d?.isOverdue;
  });

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-bold text-foreground">My To-Do List</h2>
        </div>
        <div className="animate-pulse h-20 rounded-2xl bg-muted/30" />
      </div>
    );
  }

  if (error) return null; // Fail silently — don't break the dashboard

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-display font-bold text-foreground">My To-Do List</h2>
          {incomplete.length > 0 && (
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              overdueTasks.length > 0
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            )}>
              {incomplete.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(a => !a)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
            showAdd
              ? "bg-muted border-border text-muted-foreground"
              : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
          )}
        >
          {showAdd ? <><X className="w-3.5 h-3.5" /> Cancel</> : <><Plus className="w-3.5 h-3.5" /> Add Task</>}
        </button>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">

        {/* Empty state */}
        {incomplete.length === 0 && completed.length === 0 && !showAdd && (
          <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
            <div className="p-3 rounded-2xl bg-muted/50">
              <ListTodo className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No tasks yet. Add anything you need to remember.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-1 text-xs font-semibold text-primary hover:underline"
            >
              + Add your first task
            </button>
          </div>
        )}

        {/* All clear state */}
        {incomplete.length === 0 && completed.length > 0 && !showAdd && (
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="p-1.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm text-muted-foreground">All caught up! No open tasks.</p>
          </div>
        )}

        {/* Overdue tasks — highlighted section */}
        {overdueTasks.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-red-50/60 dark:bg-red-950/20 border-b border-red-200/40 dark:border-red-900/30">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Overdue
              </p>
            </div>
            {overdueTasks.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                onComplete={handleComplete}
                onDelete={(id) => deleteMutation.mutate(id)}
                onSave={(id, data) => updateMutation.mutate({ id, data })}
                completing={completingId === t.id}
              />
            ))}
          </>
        )}

        {/* Active (non-overdue) incomplete tasks */}
        {activeTasks.map(t => (
          <TaskRow
            key={t.id}
            task={t}
            onComplete={handleComplete}
            onDelete={(id) => deleteMutation.mutate(id)}
            onSave={(id, data) => updateMutation.mutate({ id, data })}
            completing={completingId === t.id}
          />
        ))}

        {/* Add form */}
        {showAdd && (
          <AddTaskForm
            onAdd={(d) => createMutation.mutate(d)}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Completed tasks — collapsible */}
        {completed.length > 0 && (
          <>
            <button
              onClick={() => setShowCompleted(s => !s)}
              className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <span className="text-xs text-muted-foreground font-medium">
                {completed.length} completed
              </span>
              {showCompleted
                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              }
            </button>
            {showCompleted && completed.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                onComplete={handleComplete}
                onDelete={(id) => deleteMutation.mutate(id)}
                onSave={(id, data) => updateMutation.mutate({ id, data })}
                completing={completingId === t.id}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
