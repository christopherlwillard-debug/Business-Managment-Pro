import { Plus, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { AiCopyPopover } from "./AiCopyPopover";
import { InlineEditableText } from "../InlineEditableText";

interface ServiceItem {
  id: string;
  title: string;
  description: string;
}

interface ServicesContent {
  heading: string;
  items: ServiceItem[];
}

interface ServicesSectionProps {
  content: ServicesContent;
  settings: { brandColor: string; secondaryColor?: string; accentColor?: string };
  isEditing?: boolean;
  onChange?: (content: ServicesContent) => void;
  businessName?: string;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function ServicesSection({ content, settings, isEditing, onChange, businessName, blockStyle, sectionId }: ServicesSectionProps) {
  const biz = businessName ?? "a contractor business";
  const sid = sectionId ?? "services";

  function update(patch: Partial<ServicesContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateItem(id: string, patch: Partial<ServiceItem>) {
    update({ items: content.items.map(i => i.id === id ? { ...i, ...patch } : i) });
  }

  function addItem() {
    update({ items: [...content.items, { id: Date.now().toString(), title: "New Service", description: "Describe this service." }] });
  }

  function removeItem(id: string) {
    update({ items: content.items.filter(i => i.id !== id) });
  }

  return (
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6 bg-white dark:bg-gray-900"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-5xl mx-auto">
        {isEditing ? (
          <InlineEditableText
            id={`${sid}-heading`}
            as="h2"
            value={content.heading}
            placeholder="Section heading"
            className="text-3xl font-bold mb-10 text-center w-full"
            style={{ color: "var(--theme-text, #111827)" }}
            onCommit={v => update({ heading: v })}
          />
        ) : (
          <h2 data-edit-field="heading" className="text-3xl font-bold mb-10 text-center" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {content.items.map(item => (
            <div
              key={item.id}
              className="relative p-6"
              style={{
                backgroundColor: "var(--theme-surface, #f9fafb)",
                borderRadius: "var(--theme-card-radius, 0.75rem)",
                boxShadow: "var(--theme-card-shadow, none)",
                border: "var(--theme-card-border, 1px solid #f3f4f6)",
              }}
            >
              {isEditing && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors z-10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {/* Icon block — always visible so editing mode looks like the final site */}
              <div className="w-10 h-10 rounded-lg mb-4 flex items-center justify-center" style={{ backgroundColor: (settings.accentColor ?? settings.brandColor) + "20" }}>
                <div className="w-5 h-5 rounded-sm" style={{ backgroundColor: settings.accentColor ?? settings.brandColor }} />
              </div>
              {isEditing ? (
                <>
                  <InlineEditableText
                    id={`${sid}-svc-${item.id}-title`}
                    as="h3"
                    value={item.title}
                    placeholder="Service title"
                    className="font-semibold mb-2"
                    style={{ color: settings.secondaryColor || "#111827" }}
                    onCommit={v => updateItem(item.id, { title: v })}
                  />
                  <InlineEditableText
                    id={`${sid}-svc-${item.id}-desc`}
                    as="p"
                    value={item.description}
                    placeholder="Describe this service…"
                    multiline
                    className="text-sm"
                    style={{ color: "var(--theme-text-muted, #4b5563)" }}
                    onCommit={v => updateItem(item.id, { description: v })}
                  />
                  <AiCopyPopover
                    label={item.title}
                    defaultPrompt={`Write a 1-2 sentence description for the "${item.title}" service at ${biz}. Focus on the benefit to the customer, keep it under 25 words.`}
                    onAccept={v => updateItem(item.id, { description: v })}
                  />
                </>
              ) : (
                <>
                  <h3 className="font-semibold mb-2" style={{ color: settings.secondaryColor || "#111827" }}>{item.title}</h3>
                  <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{item.description}</p>
                </>
              )}
            </div>
          ))}
          {isEditing && (
            <button
              type="button"
              onClick={addItem}
              className="flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm">Add Service</span>
            </button>
          )}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
