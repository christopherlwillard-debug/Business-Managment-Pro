import { Hammer, MapPin, BadgeCheck, Clock } from "lucide-react";

export function Trust() {
  return (
    <section id="trust" className="py-24 bg-secondary text-white relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")' }}></div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left: Text Content */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 font-bold text-sm tracking-widest uppercase mb-6 border border-white/20">
              Why Willard's
            </div>
            
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-6 leading-tight">
              We build it right, <br/>
              <span className="text-primary">because our name</span> <br/>
              is on it.
            </h2>
            
            <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed font-medium">
              We're not some faceless corporation. We're your neighbors right here in Owensboro. When we take on a job, we treat your property with the respect it deserves, and we don't cut corners. 
            </p>
            <p className="text-lg md:text-xl text-gray-300 mb-10 leading-relaxed font-medium">
              Straight talk, fair prices, and hard work. That's the Willard's guarantee.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <MapPin className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Local & Proud</h4>
                  <p className="text-sm text-gray-400">Serving Owensboro and the surrounding counties.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <Hammer className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Tough Jobs</h4>
                  <p className="text-sm text-gray-400">We don't back down from hard work.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <BadgeCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Quality First</h4>
                  <p className="text-sm text-gray-400">Materials and craftsmanship you can rely on.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">On Time</h4>
                  <p className="text-sm text-gray-400">We show up when we say we will. Period.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Big Stat / Image block */}
          <div className="relative">
            <div className="aspect-square bg-gray-900 border-8 border-white/10 relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/20 mix-blend-multiply"></div>
              {/* Abstract structural graphic */}
              <div className="text-center p-12 relative z-10">
                <h3 className="text-6xl md:text-8xl font-black text-white uppercase tracking-tighter mb-4 opacity-90">100%</h3>
                <div className="w-16 h-2 bg-primary mx-auto mb-6"></div>
                <p className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-gray-300">Commitment</p>
                <p className="mt-4 text-gray-400 font-medium">To every single job.</p>
              </div>
            </div>
            
            {/* Accent block */}
            <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-primary z-0 hidden lg:block"></div>
          </div>
          
        </div>
      </div>
    </section>
  );
}
