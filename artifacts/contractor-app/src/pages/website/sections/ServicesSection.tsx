import { Plus, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { AiCopyPopover } from "./AiCopyPopover";

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
}

export function ServicesSection({ content, settings, isEditing, onChange, businessName, blockStyle }: ServicesSectionProps) {
  const biz = businessName ?? "a contractor business";

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
          <input
            className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none mb-10 w-full"
            value={content.heading}
            onChange={e => update({ heading: e.target.value })}
          />
        ) : (
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-10 text-center">{content.heading}</h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {content.items.map(item => (
            <div key={item.id} className="relative bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
              {isEditing ? (
                <>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <input
                    className="font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none mb-2 w-full"
                    value={item.title}
                    onChange={e => updateItem(item.id, { title: e.target.value })}
                  />
                  <textarea
                    className="text-sm text-gray-600 dark:text-gray-300 bg-transparent border border-gray-200 focus:border-blue-500 outline-none resize-none w-full rounded p-1"
                    value={item.description}
                    rows={3}
                    onChange={e => updateItem(item.id, { description: e.target.value })}
                  />
                  <AiCopyPopover
                    label={item.title}
                    defaultPrompt={`Write a 1-2 sentence description for the "${item.title}" service at ${biz}. Focus on the benefit to the customer, keep it under 25 words.`}
                    onAccept={v => updateItem(item.id, { description: v })}
                  />
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-lg mb-4 flex items-center justify-center" style={{ backgroundColor: (settings.accentColor ?? settings.brandColor) + "20" }}>
                    <div className="w-5 h-5 rounded-sm" style={{ backgroundColor: settings.accentColor ?? settings.brandColor }} />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
                </>
              )}
            </div>
          ))}
          {isEditing && (
            <button
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
