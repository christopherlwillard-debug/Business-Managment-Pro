import logoUrl from "@assets/IMG_3827_1775756333117.jpeg";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-950 text-gray-400 py-16 border-t-[12px] border-secondary">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-center text-center md:text-left">
          
          {/* Logo & Identity */}
          <div className="flex flex-col items-center md:items-start">
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
            <p className="text-sm font-medium uppercase tracking-wider text-gray-500">
              Solid craftsmanship. Honest pricing.
            </p>
          </div>

          {/* Service Area */}
          <div className="flex flex-col items-center md:items-start">
            <h4 className="text-white font-bold uppercase tracking-widest text-lg mb-4">Service Area</h4>
            <p className="font-medium text-gray-400">
              Proudly serving<br />
              Owensboro, KY &<br />
              surrounding areas.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-end">
            <h4 className="text-white font-bold uppercase tracking-widest text-lg mb-4">Site Links</h4>
            <nav className="flex flex-col gap-2 text-center md:text-right">
              <button onClick={() => document.querySelector("#services")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-sm font-bold tracking-wider">Services</button>
              <button onClick={() => document.querySelector("#trust")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-sm font-bold tracking-wider">Why Us</button>
              <button onClick={() => document.querySelector("#portfolio")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-sm font-bold tracking-wider">Portfolio</button>
              <button onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-white transition-colors uppercase text-sm font-bold tracking-wider">Contact</button>
            </nav>
          </div>
          
        </div>

        <div className="mt-16 pt-8 border-t border-gray-900 text-center text-sm font-medium text-gray-600">
          <p>&copy; {currentYear} Willard's General Contracting LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
