import React, { useEffect, useState } from "react";
import { CheckCircle, Loader2, InboxIcon, Settings } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { TextStyleToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { FormBuilder, defaultContactFields, type FormField } from "./FormBuilder";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ContactContent {
  heading: string;
  subheading: string;
  serviceTypes: string[];
  fields?: FormField[];
  notificationEmail?: string;
  headingStyle?: TextStyle;
  subheadingStyle?: TextStyle;
}

interface ContactFormSectionProps {
  content: ContactContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: ContactContent) => void;
  onSubmit?: (data: Record<string, unknown>) => Promise<void>;
  blockStyle?: BlockStyle;
  businessId?: number;
}

function renderFieldInput(
  field: FormField,
  value: string,
  onChange: (v: string) => void,
  brandColor: string,
  disabled: boolean
) {
  const baseClass = "w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 text-sm";
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          rows={4}
          className={`${baseClass} resize-none`}
          placeholder={field.placeholder ?? ""}
          value={value}
          required={field.required}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "dropdown":
      return (
        <select
          className={baseClass}
          value={value}
          required={field.required}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">{field.placeholder || "Select an option…"}</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded"
            checked={value === "true"}
            required={field.required}
            disabled={disabled}
            onChange={e => onChange(e.target.checked ? "true" : "")}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{field.placeholder || field.label}</span>
        </label>
      );
    default:
      return (
        <input
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          className={baseClass}
          placeholder={field.placeholder ?? ""}
          value={value}
          required={field.required}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        />
      );
  }
}

interface Submission {
  id: number;
  submittedAt: string;
  fields: Record<string, string>;
}

function SubmissionsViewer({ businessId }: { businessId?: number }) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    fetch(`${BASE}/api/website/form-submissions?businessId=${businessId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject("Failed"))
      .then(data => setSubs(data))
      .catch(() => setError("Could not load submissions."))
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (error) return <p className="text-sm text-red-500 py-4">{error}</p>;
  if (subs.length === 0) return (
    <div className="py-10 text-center text-muted-foreground">
      <InboxIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No submissions yet.</p>
    </div>
  );

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {subs.map(sub => (
        <div key={sub.id} className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-[10px] text-muted-foreground mb-2">
            {new Date(sub.submittedAt).toLocaleString()}
          </p>
          <div className="space-y-1">
            {Object.entries(sub.fields).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-sm">
                <span className="font-medium text-foreground min-w-[100px] flex-shrink-0">{k}:</span>
                <span className="text-muted-foreground break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactFormSection({ content, settings, isEditing, onChange, onSubmit, blockStyle, businessId }: ContactFormSectionProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [editTab, setEditTab] = useState<"builder" | "submissions">("builder");

  const fields = content.fields ?? defaultContactFields(content.serviceTypes ?? []);

  function update(patch: Partial<ContactContent>) {
    onChange?.({ ...content, ...patch });
  }

  function setFieldsAndEmail(f: FormField[], email: string) {
    update({ fields: f, notificationEmail: email });
  }

  function setFieldValue(id: string, val: string) {
    setFieldValues(prev => ({ ...prev, [id]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasValue = fields.some(f => fieldValues[f.id]);
    if (!hasValue) {
      setError("Please fill in at least one field.");
      return;
    }
    setError("");
    setSubmitting(true);

    const labeledValues: Record<string, string> = {};
    fields.forEach(f => {
      const v = fieldValues[f.id];
      if (v) labeledValues[f.label] = v;
    });

    try {
      if (onSubmit) {
        await onSubmit({ fieldValues: { ...fieldValues }, labeledValues });
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BlockStyleWrapper
      id="contact"
      wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-2xl mx-auto">
        {isEditing ? (
          <>
            <input
              className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none mb-1 w-full"
              style={textStyleToCSS(content.headingStyle)}
              value={content.heading}
              onChange={e => update({ heading: e.target.value })}
            />
            <TextStyleToolbar
              dark={false}
              style={content.headingStyle}
              onChange={s => update({ headingStyle: s })}
            />
            <input
              className="text-gray-500 dark:text-gray-400 bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none mb-4 w-full text-sm"
              style={textStyleToCSS(content.subheadingStyle)}
              value={content.subheading}
              onChange={e => update({ subheading: e.target.value })}
            />
            <TextStyleToolbar
              dark={false}
              style={content.subheadingStyle}
              onChange={s => update({ subheadingStyle: s })}
            />

            <div className="mt-2 flex border-b border-border mb-4">
              <button
                type="button"
                onClick={() => setEditTab("builder")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  editTab === "builder" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Form Builder
              </button>
              <button
                type="button"
                onClick={() => setEditTab("submissions")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  editTab === "submissions" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <InboxIcon className="w-3.5 h-3.5" />
                Submissions
              </button>
            </div>

            {editTab === "builder" ? (
              <FormBuilder
                fields={fields}
                notificationEmail={content.notificationEmail ?? ""}
                onChangeFields={f => setFieldsAndEmail(f, content.notificationEmail ?? "")}
                onChangeEmail={e => setFieldsAndEmail(fields, e)}
              />
            ) : (
              <SubmissionsViewer businessId={businessId} />
            )}
          </>
        ) : submitted ? (
          <div className="text-center py-12">
            <CheckCircle className="w-14 h-14 mx-auto mb-4" style={{ color: settings.brandColor }} />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Request Received!</h3>
            <p className="text-gray-500 dark:text-gray-400">We'll be in touch within 24 hours.</p>
          </div>
        ) : (
          <>
            <h2
              className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center"
              style={textStyleToCSS(content.headingStyle)}
            >
              {content.heading}
            </h2>
            <p
              className="text-gray-500 dark:text-gray-400 text-center mb-8"
              style={textStyleToCSS(content.subheadingStyle)}
            >
              {content.subheading}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map(field => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {renderFieldInput(
                    field,
                    fieldValues[field.id] ?? "",
                    v => setFieldValue(field.id, v),
                    settings.brandColor,
                    submitting
                  )}
                </div>
              ))}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: settings.brandColor }}
              >
                {submitting ? "Sending…" : "Send Request"}
              </button>
            </form>
          </>
        )}
      </div>
    </BlockStyleWrapper>
  );
}
