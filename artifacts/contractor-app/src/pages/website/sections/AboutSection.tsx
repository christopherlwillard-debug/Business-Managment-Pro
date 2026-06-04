interface AboutContent {
  heading: string;
  body: string;
  photoUrl?: string;
}

interface AboutSectionProps {
  content: AboutContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: AboutContent) => void;
}

export function AboutSection({ content, settings, isEditing, onChange }: AboutSectionProps) {
  function update(patch: Partial<AboutContent>) {
    onChange?.({ ...content, ...patch });
  }

  return (
    <div className="py-16 px-6 bg-gray-50 dark:bg-gray-800">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-10 items-center">
        <div className="flex-1">
          {isEditing ? (
            <>
              <input
                className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-gray-200 focus:border-blue-500 outline-none mb-4 w-full"
                value={content.heading}
                onChange={e => update({ heading: e.target.value })}
              />
              <textarea
                className="text-gray-600 dark:text-gray-300 bg-transparent border border-gray-200 focus:border-blue-500 outline-none resize-none w-full rounded p-2 text-sm leading-relaxed"
                value={content.body}
                rows={6}
                onChange={e => update({ body: e.target.value })}
              />
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{content.heading}</h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{content.body}</p>
            </>
          )}
        </div>
        <div className="w-full md:w-72 flex-shrink-0">
          {content.photoUrl ? (
            <img src={content.photoUrl} alt="About" className="w-full h-56 object-cover rounded-xl shadow-md" />
          ) : (
            <div
              className="w-full h-56 rounded-xl flex items-center justify-center text-white/60 text-sm font-medium"
              style={{ backgroundColor: settings.brandColor + "30", border: `2px dashed ${settings.brandColor}40` }}
            >
              {isEditing ? "Photo (optional)" : ""}
            </div>
          )}
          {isEditing && (
            <input
              className="mt-2 text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none w-full placeholder-gray-400"
              value={content.photoUrl ?? ""}
              placeholder="Photo URL (optional)"
              onChange={e => update({ photoUrl: e.target.value })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
