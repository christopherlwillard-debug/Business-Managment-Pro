import { useFeaturedClients } from "@/hooks/api";

export function Clients() {
  const { data: clients = [], isLoading } = useFeaturedClients();

  if (isLoading || clients.length === 0) return null;

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Trusted By</p>
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-gray-900">
            Our Clients
          </h2>
          <div className="w-12 h-1 bg-primary mx-auto mt-4" />
        </div>

        <div className="flex flex-wrap justify-center items-center gap-10 md:gap-16">
          {clients.map(client => {
            const inner = client.logoUrl ? (
              <img
                src={`/api/public/client-logo/${client.logoUrl.replace(/^\/objects\//, "")}`}
                alt={client.name}
                className="max-h-16 max-w-[180px] w-auto object-contain grayscale hover:grayscale-0 transition-all duration-300"
              />
            ) : (
              <span className="text-xl font-black uppercase tracking-tight text-gray-400 hover:text-gray-700 transition-colors duration-300">
                {client.name}
              </span>
            );

            return client.websiteUrl ? (
              <a
                key={client.id}
                href={client.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-300"
                title={client.name}
              >
                {inner}
              </a>
            ) : (
              <div
                key={client.id}
                className="flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-300"
                title={client.name}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
