import React, { useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface QuoteFormContent {
  heading?: string;
  subheading?: string;
  serviceTypes?: string[];
  submitLabel?: string;
  requirePhone?: boolean;
  requireEmail?: boolean;
  successMessage?: string;
}

export function defaultQuoteFormContent(): QuoteFormContent {
  return {
    heading: "Request a Free Quote",
    subheading: "Tell us about your project and we'll be in touch within 24 hours.",
    serviceTypes: ["General Contracting", "Remodeling", "Repair & Maintenance", "New Construction", "Other"],
    submitLabel: "Send My Request",
    requirePhone: true,
    requireEmail: false,
    successMessage: "Thanks! We'll reach out within 24 hours.",
  };
}

interface QuoteFormSectionProps {
  content: QuoteFormContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: QuoteFormContent) => void;
  blockStyle?: BlockStyle;
  siteSlug?: string;
}

const CONTACT_OPTIONS = ["Phone", "Email", "Either"];

export function QuoteFormSection({ content, settings, isEditing, onChange, blockStyle, siteSlug }: QuoteFormSectionProps) {
  const c = { ...defaultQuoteFormContent(), ...content };

  const [form, setForm] = useState({
    name: "", phone: "", email: "",
    serviceType: "", description: "", preferredContact: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function update(patch: Partial<QuoteFormContent>) {
    onChange?.({ ...c, ...patch });
  }

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Please enter your name."); return; }
    if (c.requirePhone && !form.phone.trim()) { setError("Please enter your phone number."); return; }
    if (c.requireEmail && !form.email.trim()) { setError("Please enter your email address."); return; }
    setError("");
    setSubmitting(true);

    const labeledFields: Record<string, string> = {
      "Full Name": form.name,
      ...(form.phone ? { "Phone": form.phone } : {}),
      ...(form.email ? { "Email": form.email } : {}),
      ...(form.serviceType ? { "Service Type": form.serviceType } : {}),
      ...(form.description ? { "Project Description": form.description } : {}),
      ...(form.preferredContact ? { "Preferred Contact": form.preferredContact } : {}),
    };

    try {
      const slug = siteSlug ?? window.location.pathname.split("/")[1] ?? "";
      const resp = await fetch(`${BASE}/api/public/site/${slug}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labeledFields, name: form.name, phone: form.phone, email: form.email }),
      });
      if (!resp.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again or call us directly.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 text-sm rounded-lg";

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="px-6 py-16 bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto">
          {submitted ? (
            <div className="text-center py-12">
              <CheckCircle className="w-14 h-14 mx-auto mb-4" style={{ color: settings.brandColor }} />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Request Received!</h3>
              <p className="text-gray-500 dark:text-gray-400">{c.successMessage}</p>
            </div>
          ) : (
            <>
              {c.heading && (
                <h2 className="text-3xl font-bold text-center mb-2" style={{ color: "var(--theme-text, #111827)" }}>
                  {c.heading}
                </h2>
              )}
              {c.subheading && (
                <p className="text-center mb-8 text-gray-500 dark:text-gray-400">{c.subheading}</p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" required className={inputClass} placeholder="Your name" value={form.name} onChange={e => setField("name", e.target.value)} disabled={submitting} />
                </div>
                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone {c.requirePhone && <span className="text-red-500">*</span>}
                  </label>
                  <input type="tel" required={c.requirePhone} className={inputClass} placeholder="(555) 123-4567" value={form.phone} onChange={e => setField("phone", e.target.value)} disabled={submitting} />
                </div>
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email {c.requireEmail && <span className="text-red-500">*</span>}
                  </label>
                  <input type="email" required={c.requireEmail} className={inputClass} placeholder="you@example.com" value={form.email} onChange={e => setField("email", e.target.value)} disabled={submitting} />
                </div>
                {/* Service type */}
                {(c.serviceTypes ?? []).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Type</label>
                    <select className={inputClass} value={form.serviceType} onChange={e => setField("serviceType", e.target.value)} disabled={submitting}>
                      <option value="">Select a service…</option>
                      {(c.serviceTypes ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Description</label>
                  <textarea rows={4} className={`${inputClass} resize-none`} placeholder="Describe your project, location, and timeline…" value={form.description} onChange={e => setField("description", e.target.value)} disabled={submitting} />
                </div>
                {/* Preferred contact */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preferred Contact Method</label>
                  <select className={inputClass} value={form.preferredContact} onChange={e => setField("preferredContact", e.target.value)} disabled={submitting}>
                    <option value="">No preference</option>
                    {CONTACT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 text-sm text-white font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 rounded-lg"
                  style={{ backgroundColor: settings.brandColor }}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending…</span>
                  ) : (c.submitLabel ?? "Send My Request")}
                </button>
              </form>
            </>
          )}
        </div>
      </BlockStyleWrapper>
    );
  }

  // Editing mode
  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Quote Request Form</p>

        <input
          type="text"
          className="w-full text-lg font-bold bg-background border border-border text-foreground rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Form heading"
          value={c.heading ?? ""}
          onChange={e => update({ heading: e.target.value })}
        />

        <input
          type="text"
          className="w-full text-sm bg-background border border-border text-foreground rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Subheading (optional)"
          value={c.subheading ?? ""}
          onChange={e => update({ subheading: e.target.value })}
        />

        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Service Types (one per line)</p>
          <textarea
            rows={4}
            className="w-full text-xs border border-border bg-background text-foreground rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-y"
            value={(c.serviceTypes ?? []).join("\n")}
            onChange={e => update({ serviceTypes: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={c.requirePhone ?? true} onChange={e => update({ requirePhone: e.target.checked })} className="rounded accent-primary" />
            <span className="text-xs text-foreground">Require phone</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={c.requireEmail ?? false} onChange={e => update({ requireEmail: e.target.checked })} className="rounded accent-primary" />
            <span className="text-xs text-foreground">Require email</span>
          </label>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Submit button label</p>
          <input type="text" className="w-full text-sm border border-border bg-background text-foreground rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary" value={c.submitLabel ?? "Send My Request"} onChange={e => update({ submitLabel: e.target.value })} />
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Success message</p>
          <input type="text" className="w-full text-sm border border-border bg-background text-foreground rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary" value={c.successMessage ?? ""} onChange={e => update({ successMessage: e.target.value })} />
        </div>

        <p className="text-[10px] text-muted-foreground">
          Submissions appear in the same inbox as your Contact form. Fields: Name, Phone, Email, Service, Description, Preferred Contact.
        </p>
      </div>
    </BlockStyleWrapper>
  );
}
