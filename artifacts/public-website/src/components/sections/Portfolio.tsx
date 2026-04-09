import { useState } from "react";
import { usePortfolio } from "@/hooks/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Image as ImageIcon, X } from "lucide-react";

function getImageUrl(url: string): string {
  const objectsPath = url.replace(/^\/objects\//, "");
  return `/api/public/portfolio-image/${objectsPath}`;
}

export function Portfolio() {
  const { data: portfolio, isLoading, error } = usePortfolio();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxCaption, setLightboxCaption] = useState<string | null>(null);

  const categories = portfolio
    ? Array.from(new Set(portfolio.map(item => item.category).filter(Boolean))) as string[]
    : [];

  const filteredPortfolio = portfolio?.filter(item =>
    !activeCategory || item.category === activeCategory
  );

  function openLightbox(url: string, caption: string | null) {
    setLightboxUrl(url);
    setLightboxCaption(caption);
  }

  function closeLightbox() {
    setLightboxUrl(null);
    setLightboxCaption(null);
  }

  return (
    <section id="portfolio" className="py-24 bg-gray-50 border-t border-gray-200">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 uppercase tracking-tight mb-4">Our Work</h2>
            <div className="w-24 h-2 bg-secondary mb-6" />
            <p className="text-xl text-gray-600 max-w-2xl font-medium">
              Don't just take our word for it. See the results of hard work and attention to detail.
            </p>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-2 transition-colors ${
                  activeCategory === null
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-600 hover:border-gray-900 hover:text-gray-900"
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-2 transition-colors ${
                    activeCategory === cat
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-300 text-gray-600 hover:border-gray-900 hover:text-gray-900"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="aspect-square w-full rounded-none" />
            ))}
          </div>
        ) : error || !portfolio?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="aspect-square w-full bg-white border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-6 text-center group hover:border-primary transition-colors"
              >
                <Camera className="w-12 h-12 text-gray-400 mb-4 group-hover:text-primary transition-colors" />
                <h3 className="text-xl font-bold uppercase tracking-wide text-gray-900 mb-2">Hard at work</h3>
                <p className="text-gray-500 font-medium">Photos coming soon — check back!</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPortfolio?.map(item => {
              const imgSrc = getImageUrl(item.url);
              return (
                <div
                  key={item.id}
                  className="group relative aspect-square overflow-hidden bg-gray-200 cursor-pointer"
                  onClick={() => openLightbox(imgSrc, item.caption)}
                >
                  <img
                    src={imgSrc}
                    alt={item.caption || "Portfolio item"}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                    {item.category && (
                      <span className="text-primary font-bold text-xs uppercase tracking-widest mb-2 block">
                        {item.category}
                      </span>
                    )}
                    {item.caption ? (
                      <p className="text-white font-medium text-lg leading-tight">{item.caption}</p>
                    ) : (
                      <div className="flex items-center gap-2 text-white font-bold uppercase tracking-wider">
                        <ImageIcon className="w-5 h-5" /> View Detail
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt={lightboxCaption ?? "Portfolio photo"}
              className="w-full max-h-[85vh] object-contain"
            />
            {lightboxCaption && (
              <p className="text-white text-center mt-3 text-sm font-medium">{lightboxCaption}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
