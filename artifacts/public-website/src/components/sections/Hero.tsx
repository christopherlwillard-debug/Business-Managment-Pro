import { Button } from "@/components/ui/button";
import { ArrowRight, HardHat, ShieldCheck, Ruler } from "lucide-react";

export function Hero() {
  const scrollToContact = () => {
    const element = document.querySelector("#contact");
    if (element) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 bg-gray-50 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary/10 text-secondary font-bold text-sm tracking-widest uppercase mb-8 border border-secondary/20">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            Owensboro, KY & Surrounding Areas
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-gray-900 tracking-tight leading-[1.1] mb-6 uppercase">
            Built to <span className="text-primary">Last.</span><br />
            Priced <span className="text-secondary">Honest.</span>
          </h1>
          
          <p className="text-lg md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
            Solid craftsmanship and dependable service for your toughest projects. When you need it done right the first time, you call Willard's.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              onClick={scrollToContact}
              className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white font-bold rounded-none px-8 py-7 text-lg uppercase tracking-wider group"
            >
              Get a Free Quote
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => {
                document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full sm:w-auto border-2 border-gray-900 text-gray-900 font-bold rounded-none px-8 py-7 text-lg uppercase tracking-wider hover:bg-gray-100"
            >
              View Our Work
            </Button>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 max-w-5xl mx-auto border-t border-gray-200 pt-12">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white border-2 border-gray-100 shadow-sm flex items-center justify-center mb-4 text-primary">
              <HardHat size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-2">Hardworking Crew</h3>
            <p className="text-gray-600 text-sm">We show up on time, put in the sweat, and clean up when we're done.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white border-2 border-gray-100 shadow-sm flex items-center justify-center mb-4 text-secondary">
              <ShieldCheck size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-2">Fully Insured</h3>
            <p className="text-gray-600 text-sm">Your property is protected. We run a professional operation.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white border-2 border-gray-100 shadow-sm flex items-center justify-center mb-4 text-primary">
              <Ruler size={32} strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-2">Honest Pricing</h3>
            <p className="text-gray-600 text-sm">No hidden fees, no sudden surprises. You get what you pay for.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
