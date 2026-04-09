import logoUrl from "@assets/IMG_3827_1775756333117.jpeg";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-950 text-gray-400 py-16 border-t-[12px] border-secondary">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 items-start">

          {/* Logo & Identity */}
          <div className="flex flex-col items-center md:items-start lg:col-span-1">
            <div className="flex items-center gap-3 mb-4 bg-white p-2 w-fit">
              <img
                src={logoUrl}
                alt="Willard's General Contracting LLC"
                className="h-12 w-auto object-contain"
              />
              <div>
                <div className="font-black text-xl leading-tight text-primary uppercase tracking-tight">Willard's</div>
                <div className="text-xs font-bold text-secondary uppercase tracking-widest">Contracting</div>
              </div>
            </div>
            <p className="text-sm font-medium uppercase tracking-wider text-gray-500 text-center md:text-left">
              Precision Finishing for Manufactured Homes.
            </p>
          </div>

          {/* Service Area */}
          <div className="flex flex-col items-center md:items-start">
            <h4 className="text-white font-bold uppercase tracking-widest text-sm mb-4">Service Area</h4>
            <p className="font-medium text-gray-400 text-sm text-center md:text-left">
              Proudly serving<br />
              Owensboro, KY &<br />
              surrounding areas.
            </p>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-col items-center md:items-start gap-5">
            <div className="text-center md:text-left">
              <h4 className="text-white font-bold uppercase tracking-widest text-sm mb-1">Veteran Owned & Operated</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                U.S. Marine Corps Veteran<br />
                Service-Connected Disabled Veteran
              </p>
            </div>
            <div className="text-center md:text-left">
              <h4 className="text-white font-bold uppercase tracking-widest text-sm mb-1">General Liability Insured</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                $1 million per occurrence<br />
                $2 million aggregate<br />
                Full details available on request
              </p>
            </div>
          </div>

          {/* Site Links */}
          <div className="flex flex-col items-center md:items-start lg:items-end">
            <h4 className="text-white font-bold uppercase tracking-widest text-sm mb-4">Site Links</h4>
            <nav className="flex flex-col gap-2 text-center md:text-left lg:text-right">
              <button onClick={() => document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-xs font-bold tracking-wider">Services</button>
              <button onClick={() => document.querySelector("#trust")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-xs font-bold tracking-wider">Why Us</button>
              <button onClick={() => document.querySelector("#portfolio")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-xs font-bold tracking-wider">Portfolio</button>
              <button onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-xs font-bold tracking-wider">Contact</button>
            </nav>
          </div>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-900 text-center text-sm font-medium text-gray-600">
          <p>&copy; {currentYear} Willard's General Contracting LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
