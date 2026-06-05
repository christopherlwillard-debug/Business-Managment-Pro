import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

interface ContactContent {
  heading: string;
  subheading: string;
  serviceTypes: string[];
}

interface ContactFormSectionProps {
  content: ContactContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: ContactContent) => void;
  onSubmit?: (data: { name: string; phone: string; email: string; serviceType: string; message: string }) => Promise<void>;
  blockStyle?: BlockStyle;
}

export function ContactFormSection({ content, settings, isEditing, onChange, onSubmit, blockStyle }: ContactFormSectionProps) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", serviceType: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function update(patch: Partial<ContactContent>) {
    onChange?.({ ...content, ...patch });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name && !form.phone && !form.email) {
      setError("Please fill in at least your name, phone, or email.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onSubmit?.(form);
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
              className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none mb-2 w-full"
              value={content.heading}
              onChange={e => update({ heading: e.target.value })}
            />
            <input
              className="text-gray-500 dark:text-gray-400 bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none mb-6 w-full text-sm"
              value={content.subheading}
              onChange={e => update({ subheading: e.target.value })}
            />
          </>
        ) : (
          <>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center">{content.heading}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-center mb-8">{content.subheading}</p>
          </>
        )}

        {submitted && !isEditing ? (
          <div className="text-center py-12">
            <CheckCircle className="w-14 h-14 mx-auto mb-4" style={{ color: settings.brandColor }} />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Request Received!</h3>
            <p className="text-gray-500 dark:text-gray-400">We'll be in touch within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={isEditing ? e => e.preventDefault() : handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 text-sm"
                  style={{ "--tw-ring-color": settings.brandColor } as React.CSSProperties}
                  placeholder="John Smith"
                  value={isEditing ? "" : form.name}
                  disabled={isEditing}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none text-sm"
                  placeholder="(555) 000-0000"
                  value={isEditing ? "" : form.phone}
                  disabled={isEditing}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
              <input
                type="email"
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none text-sm"
                placeholder="john@example.com"
                value={isEditing ? "" : form.email}
                disabled={isEditing}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Needed</label>
              <select
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none text-sm"
                value={isEditing ? "" : form.serviceType}
                disabled={isEditing}
                onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))}
              >
                <option value="">Select a service…</option>
                {content.serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message (optional)</label>
              <textarea
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none text-sm resize-none"
                rows={4}
                placeholder="Tell us about your project…"
                value={isEditing ? "" : form.message}
                disabled={isEditing}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={isEditing || submitting}
              className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: settings.brandColor }}
            >
              {submitting ? "Sending…" : "Send Request"}
            </button>
          </form>
        )}
      </div>
    </BlockStyleWrapper>
  );
}
