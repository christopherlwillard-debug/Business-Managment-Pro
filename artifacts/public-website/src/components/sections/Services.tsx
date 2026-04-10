import { useServices } from "@/hooks/api";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
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
            Once your manufactured home is delivered and placed, we handle the critical final stages that make it truly yours — seamlessly and professionally.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="border border-gray-200 p-6">
                <Skeleton className="h-12 w-12 rounded-none mb-4" />
                <Skeleton className="h-6 w-3/4 mb-3" />
                <Skeleton className="h-16 w-full" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="group border border-gray-200 bg-white hover:border-primary hover:shadow-md transition-all duration-300 p-6 flex flex-col gap-3"
              >
                {service.icon && (
                  <div className="text-4xl w-14 h-14 flex items-center justify-center bg-gray-50 border border-gray-100 flex-shrink-0">
                    {service.icon}
                  </div>
                )}
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight leading-tight group-hover:text-primary transition-colors duration-200">
                  {service.name}
                </h3>
                {service.description && (
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {service.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
