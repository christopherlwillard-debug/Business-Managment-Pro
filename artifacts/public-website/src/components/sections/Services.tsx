import { useServices } from "@/hooks/api";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function Services() {
  const { data: services, isLoading, error } = useServices();

  return (
    <section id="services" className="py-24 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-gray-900 uppercase tracking-tight mb-4">Our Services</h2>
          <div className="w-24 h-2 bg-primary mx-auto mb-6"></div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto font-medium">
            From ground up to finish work, we handle it all with the same dedication to quality.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="border border-gray-200 p-6">
                <Skeleton className="h-12 w-12 rounded-none mb-6" />
                <Skeleton className="h-8 w-3/4 mb-4" />
                <Skeleton className="h-20 w-full mb-6" />
                <Skeleton className="h-6 w-1/3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive" className="max-w-2xl mx-auto rounded-none border-2">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="uppercase font-bold tracking-wide">Error</AlertTitle>
            <AlertDescription>
              Failed to load services. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        ) : !services?.length ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 bg-gray-50">
            <p className="text-gray-500 font-medium uppercase tracking-wide">No services listed at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => (
              <div 
                key={service.id} 
                className="group relative border border-gray-200 bg-white hover:border-secondary transition-colors duration-300 flex flex-col h-full shadow-sm hover:shadow-md"
              >
                <div className="p-8 flex-1 flex flex-col">
                  {/* Icon & Title */}
                  <div className="flex items-start gap-4 mb-6">
                    {service.icon && (
                      <div className="text-4xl bg-gray-50 w-16 h-16 flex items-center justify-center border border-gray-100 flex-shrink-0">
                        {service.icon}
                      </div>
                    )}
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 uppercase tracking-tight leading-tight">{service.name}</h3>
                      {service.priceDisplay && (
                        <div className="mt-2 inline-flex flex-col">
                          <span className="text-primary font-black text-lg">{service.priceDisplay}</span>
                          {service.priceNote && (
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{service.priceNote}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {service.description && (
                    <p className="text-gray-600 mb-8 leading-relaxed flex-1">
                      {service.description}
                    </p>
                  )}

                  {/* Whats Included & Add-ons */}
                  <div className="space-y-6 mt-auto pt-6 border-t border-gray-100">
                    {service.whatsIncluded && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-secondary" />
                          What's Included
                        </h4>
                        <p className="text-sm text-gray-600 pl-6">{service.whatsIncluded}</p>
                      </div>
                    )}
                    
                    {service.addOns && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Plus className="w-4 h-4 text-primary" />
                          Available Add-ons
                        </h4>
                        <p className="text-sm text-gray-600 pl-6">{service.addOns}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Get a Quote CTA */}
                <div className="px-8 pb-6">
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("prefill-contact", { detail: { service: service.name } }));
                      const contactEl = document.querySelector("#contact");
                      if (contactEl) contactEl.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="w-full py-3 bg-gray-900 text-white font-bold uppercase tracking-wider text-sm hover:bg-primary transition-colors duration-200 group-hover:bg-primary"
                  >
                    Get a Quote for This Service
                  </button>
                </div>

                {/* Bottom decorative bar */}
                <div className="h-1 w-full bg-gray-200 group-hover:bg-primary transition-colors duration-300"></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
