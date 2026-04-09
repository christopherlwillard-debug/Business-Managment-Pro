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
              We don't leave until<br />
              your home is<br />
              <span className="text-primary">move-in ready.</span>
            </h2>

            <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed font-medium">
              At Willard's General Contracting, we specialize in completing the final stages of manufactured home installation. We handle the critical finish work that transforms a manufactured unit into a polished, comfortable, move-in-ready home.
            </p>
            <p className="text-lg md:text-xl text-gray-300 mb-10 leading-relaxed font-medium">
              From seamless interior marriage lines and exterior siding to final plumbing connections and thorough inspections, we focus on the details that matter most. We treat every project as if it were our own — with honesty, care, and a commitment to quality that lasts for years.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <MapPin className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Specialized Experts</h4>
                  <p className="text-sm text-gray-400">We focus exclusively on manufactured home finishing and set completion.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <Hammer className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Precision Craftsmanship</h4>
                  <p className="text-sm text-gray-400">Seamless marriage lines, clean trim, texture blending, and paint touch-ups that look factory-perfect.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <BadgeCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Reliable & Professional</h4>
                  <p className="text-sm text-gray-400">On-time work you can trust from a veteran-owned local business.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-primary p-3 rounded-none">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="font-bold uppercase tracking-wide text-lg mb-1">Homeowner Focused</h4>
                  <p className="text-sm text-gray-400">We don't leave until your home is move-in ready and meets the highest standards.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Veteran Owned block */}
          <div className="relative">
            <div className="aspect-square bg-gray-900 border-8 border-white/10 relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-primary/20 mix-blend-multiply"></div>
              <div className="text-center p-12 relative z-10">
                <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">Proudly</p>
                <h3 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-2 opacity-90 leading-none">Veteran<br />Owned</h3>
                <div className="w-16 h-2 bg-primary mx-auto my-5"></div>
                <p className="text-xl md:text-2xl font-bold uppercase tracking-widest text-gray-300 mb-2">U.S. Marine Corps</p>
                <p className="mt-3 text-gray-400 font-medium leading-relaxed">Service-connected disabled veteran.<br />Military discipline in every project.</p>
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
