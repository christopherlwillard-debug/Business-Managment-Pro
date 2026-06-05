import { useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

export type FormFieldType = "text" | "email" | "phone" | "textarea" | "dropdown" | "checkbox";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Text Area" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

export function defaultContactFields(serviceTypes: string[]): FormField[] {
  return [
    { id: "name", type: "text", label: "Full Name", placeholder: "John Smith", required: true },
    { id: "phone", type: "phone", label: "Phone Number", placeholder: "(555) 000-0000", required: false },
    { id: "email", type: "email", label: "Email Address", placeholder: "john@example.com", required: false },
    { id: "serviceType", type: "dropdown", label: "Service Needed", placeholder: "Select a service…", required: false, options: serviceTypes.length > 0 ? serviceTypes : ["General Inquiry", "Other"] },
    { id: "message", type: "textarea", label: "Message (optional)", placeholder: "Tell us about your project…", required: false },
  ];
}

function SortableFieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: FormField;
  onUpdate: (f: FormField) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const [expanded, setExpanded] = useState(false);

  function patch(p: Partial<FormField>) {
    onUpdate({ ...field, ...p });
  }

  function updateOption(idx: number, val: string) {
    const opts = [...(field.options ?? [])];
    opts[idx] = val;
    patch({ options: opts });
  }

  function addOption() {
    patch({ options: [...(field.options ?? []), ""] });
  }

  function removeOption(idx: number) {
    patch({ options: (field.options ?? []).filter((_, i) => i !== idx) });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <select
          value={field.type}
          onChange={e => patch({ type: e.target.value as FormFieldType })}
          className="text-[11px] bg-transparent border-0 outline-none text-gray-500 dark:text-gray-400 cursor-pointer flex-shrink-0"
        >
          {FIELD_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <input
          value={field.label}
          onChange={e => patch({ label: e.target.value })}
          placeholder="Field label"
          className="flex-1 min-w-0 text-sm bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-gray-800 dark:text-white placeholder-gray-400"
          onClick={e => e.stopPropagation()}
        />

        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer" title="Required">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={e => patch({ required: e.target.checked })}
            className="rounded"
          />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Req</span>
        </label>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          title={expanded ? "Collapse" : "More settings"}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          title="Remove field"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 py-2.5 space-y-2.5 border-t border-gray-100 dark:border-gray-700">
          {field.type !== "checkbox" && (
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">Placeholder</label>
              <input
                value={field.placeholder ?? ""}
                onChange={e => patch({ placeholder: e.target.value || undefined })}
                placeholder="Enter placeholder text…"
                className="w-full text-xs bg-transparent border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 outline-none focus:border-blue-500 dark:focus:border-blue-400 text-gray-700 dark:text-gray-300 placeholder-gray-400"
              />
            </div>
          )}
          {field.type === "dropdown" && (
            <div>
              <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">Options</label>
              <div className="space-y-1">
                {(field.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 text-xs bg-transparent border border-gray-200 dark:border-gray-600 rounded px-2 py-1 outline-none focus:border-blue-500 text-gray-700 dark:text-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addOption}
                  className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add option
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FormBuilderProps {
  fields: FormField[];
  notificationEmail?: string;
  onChangeFields: (fields: FormField[]) => void;
  onChangeEmail: (email: string) => void;
}

export function FormBuilder({ fields, notificationEmail = "", onChangeFields, onChangeEmail }: FormBuilderProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = fields.findIndex(f => f.id === active.id);
    const newIdx = fields.findIndex(f => f.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onChangeFields(arrayMove(fields, oldIdx, newIdx));
  }

  function addField() {
    const id = `field_${Date.now()}`;
    onChangeFields([...fields, { id, type: "text", label: "New Field", placeholder: "", required: false }]);
  }

  function updateField(id: string, updated: FormField) {
    onChangeFields(fields.map(f => f.id === id ? updated : f));
  }

  function removeField(id: string) {
    onChangeFields(fields.filter(f => f.id !== id));
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
          Notification Email
        </label>
        <input
          type="email"
          value={notificationEmail}
          onChange={e => onChangeEmail(e.target.value)}
          placeholder="owner@example.com — leave blank to skip"
          className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[10px] text-gray-400 mt-1">You'll receive an email when someone submits this form.</p>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
          Form Fields
        </label>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fields.map(f => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  onUpdate={updated => updateField(f.id, updated)}
                  onRemove={() => removeField(f.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          onClick={addField}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Field
        </button>
      </div>
    </div>
  );
}
