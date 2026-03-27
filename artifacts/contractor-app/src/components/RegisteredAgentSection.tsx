import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Phone, Mail, Globe, MapPin,
  Save, Pencil, Plus, Trash2, RefreshCw, FileCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api`;

const inp = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

const AGENT_RECURRENCES = [
  { value: "one-time",  label: "One-time"  },
  { value: "monthly",   label: "Monthly"   },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual",    label: "Annual"    },
];

interface AgentTask {
  id: number;
  registeredAgentId: number;
  title: string;
  recurrence: string;
  notes: string | null;
  createdAt: string;
}

interface RegisteredAgent {
  id: number;
  agentName: string | null;
  companyName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  state: string | null;
  notes: string | null;
  tasks: AgentTask[];
}

function useRegisteredAgent() {
  return useQuery<RegisteredAgent>({
    queryKey: ["registered-agent"],
    queryFn: async () => {
      const res = await fetch(`${API}/registered-agent`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<RegisteredAgent>) => {
      const res = await fetch(`${API}/registered-agent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registered-agent"] }),
  });
}

function useCreateAgentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; recurrence: string; notes?: string }) => {
      const res = await fetch(`${API}/registered-agent/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registered-agent"] }),
  });
}

function useUpdateAgentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; title: string; recurrence: string; notes?: string }) => {
      const res = await fetch(`${API}/registered-agent/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registered-agent"] }),
  });
}

function useDeleteAgentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API}/registered-agent/tasks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registered-agent"] }),
  });
}

function AgentTaskForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: AgentTask;
  onSave: (d: { title: string; recurrence: string; notes?: string }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    title:      initial?.title      ?? "",
    recurrence: initial?.recurrence ?? "annual",
    notes:      initial?.notes      ?? "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ title: form.title.trim(), recurrence: form.recurrence, notes: form.notes.trim() || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Task / Filing Name *</label>
          <input className={inp} required placeholder="e.g. Annual Report Filing"
            value={form.title} onChange={e => set("title", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Recurrence</label>
          <select className={inp} value={form.recurrence} onChange={e => set("recurrence", e.target.value)}>
            {AGENT_RECURRENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Notes</label>
        <input className={inp} placeholder="Optional notes or instructions"
          value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 rounded-xl text-sm text-gray-500 hover:bg-white transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-1.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving…" : initial ? "Update" : "Add Task"}
        </button>
      </div>
    </form>
  );
}

export function RegisteredAgentSection({ className }: { className?: string } = {}) {
  const { data: agent, isLoading } = useRegisteredAgent();
  const updateAgent = useUpdateAgent();
  const createTask  = useCreateAgentTask();
  const updateTask  = useUpdateAgentTask();
  const deleteTask  = useDeleteAgentTask();

  const [editing,     setEditing]    = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<AgentTask | null>(null);
  const [agentForm,   setAgentForm]  = useState<Partial<RegisteredAgent>>({});
  const setAF = (k: string, v: string) => setAgentForm(f => ({ ...f, [k]: v }));

  function openEdit() {
    setAgentForm({
      agentName:   agent?.agentName   ?? "",
      companyName: agent?.companyName ?? "",
      address:     agent?.address     ?? "",
      phone:       agent?.phone       ?? "",
      email:       agent?.email       ?? "",
      state:       agent?.state       ?? "",
      notes:       agent?.notes       ?? "",
    });
    setEditing(true);
  }

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    await updateAgent.mutateAsync(agentForm);
    setEditing(false);
  }

  async function handleSaveTask(data: { title: string; recurrence: string; notes?: string }) {
    if (editingTask) {
      await updateTask.mutateAsync({ id: editingTask.id, ...data });
      setEditingTask(null);
    } else {
      await createTask.mutateAsync(data);
      setShowAddTask(false);
    }
  }

  const hasDetails = agent && (agent.agentName || agent.companyName || agent.email || agent.phone);

  return (
    <div className={className ?? "space-y-4 pt-6 border-t border-border/50"}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-500" />
          Registered Agent
        </h2>
        {!editing && (
          <button onClick={openEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
            {hasDetails ? "Edit Details" : "Add Agent"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-400 italic">Loading…</div>
      ) : editing ? (
        <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm p-5">
          <form onSubmit={handleSaveAgent} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Agent Name</label>
                <input className={inp} placeholder="e.g. John Smith"
                  value={agentForm.agentName ?? ""} onChange={e => setAF("agentName", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Company / Agency</label>
                <input className={inp} placeholder="e.g. National Registered Agents"
                  value={agentForm.companyName ?? ""} onChange={e => setAF("companyName", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={lbl}>Address</label>
              <input className={inp} placeholder="Street, City, State, ZIP"
                value={agentForm.address ?? ""} onChange={e => setAF("address", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={lbl}>Phone</label>
                <input className={inp} type="tel" placeholder="(555) 000-0000"
                  value={agentForm.phone ?? ""} onChange={e => setAF("phone", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input className={inp} type="email" placeholder="agent@example.com"
                  value={agentForm.email ?? ""} onChange={e => setAF("email", e.target.value)} />
              </div>
              <div>
                <label className={lbl}>State</label>
                <input className={inp} placeholder="e.g. KY"
                  value={agentForm.state ?? ""} onChange={e => setAF("state", e.target.value)} />
              </div>
            </div>
            <div>
              <label className={lbl}>Notes</label>
              <textarea className={inp + " resize-none"} rows={2}
                placeholder="Account numbers, portal URLs, login info…"
                value={agentForm.notes ?? ""} onChange={e => setAF("notes", e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={updateAgent.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center gap-1.5 shadow">
                <Save className="w-3.5 h-3.5" />
                {updateAgent.isPending ? "Saving…" : "Save Agent"}
              </button>
            </div>
          </form>
        </div>
      ) : hasDetails ? (
        <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {agent.agentName && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0 pt-0.5">Agent</span>
                <span className="text-gray-800 font-medium">{agent.agentName}</span>
              </div>
            )}
            {agent.companyName && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20 flex-shrink-0 pt-0.5">Company</span>
                <span className="text-gray-800">{agent.companyName}</span>
              </div>
            )}
            {agent.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{agent.address}</span>
              </div>
            )}
            {agent.state && (
              <div className="flex items-start gap-2">
                <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">State: {agent.state}</span>
              </div>
            )}
            {agent.phone && (
              <div className="flex items-start gap-2">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <a href={`tel:${agent.phone}`} className="text-indigo-600 hover:underline">{agent.phone}</a>
              </div>
            )}
            {agent.email && (
              <div className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <a href={`mailto:${agent.email}`} className="text-indigo-600 hover:underline">{agent.email}</a>
              </div>
            )}
          </div>
          {agent.notes && (
            <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 leading-relaxed">
              {agent.notes}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-indigo-50 border border-dashed border-indigo-200 rounded-2xl p-6 text-center">
          <Building2 className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">No registered agent on file</p>
          <p className="text-xs text-gray-400 mt-1">Add your registered agent's contact details and the compliance tasks they handle.</p>
          <button onClick={openEdit}
            className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow">
            Add Registered Agent
          </button>
        </div>
      )}

      {!isLoading && agent && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-indigo-400" />
              Tasks Handled by Agent
            </h3>
            {!showAddTask && !editingTask && (
              <button onClick={() => setShowAddTask(true)}
                className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Task
              </button>
            )}
          </div>

          {showAddTask && (
            <AgentTaskForm
              onSave={handleSaveTask}
              onCancel={() => setShowAddTask(false)}
              saving={createTask.isPending}
            />
          )}

          {agent.tasks.length === 0 && !showAddTask ? (
            <p className="text-xs text-gray-400 italic pl-1">
              No agent tasks yet. Add annual reports, state notifications, and other filings your agent handles.
            </p>
          ) : (
            <div className="space-y-2">
              {agent.tasks.map(task => (
                editingTask?.id === task.id ? (
                  <AgentTaskForm
                    key={task.id}
                    initial={task}
                    onSave={handleSaveTask}
                    onCancel={() => setEditingTask(null)}
                    saving={updateTask.isPending}
                  />
                ) : (
                  <div key={task.id}
                    className="flex items-start justify-between gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 group hover:border-indigo-200 hover:shadow-sm transition-all">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                            <RefreshCw className="w-2.5 h-2.5" />
                            {AGENT_RECURRENCES.find(r => r.value === task.recurrence)?.label ?? task.recurrence}
                          </span>
                          {task.notes && (
                            <span className="text-xs text-gray-400 truncate">{task.notes}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingTask(task); setShowAddTask(false); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={async () => {
                        if (!confirm("Delete this task?")) return;
                        await deleteTask.mutateAsync(task.id);
                      }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
