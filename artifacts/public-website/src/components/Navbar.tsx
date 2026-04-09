import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/IMG_3827_1775756333117.jpeg";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Services", href: "#services" },
    { name: "Why Us", href: "#trust" },
    { name: "Portfolio", href: "#portfolio" },
  ];

  const scrollTo = (href: string) => {
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
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
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-white shadow-md py-2" : "bg-white/95 backdrop-blur-sm py-4"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="flex items-center gap-3 group"
          >
            <img 
              src={logoUrl} 
              alt="Willard's General Contracting LLC" 
              className="h-12 w-auto object-contain rounded-sm"
            />
            <div className="hidden sm:block">
              <div className="font-bold text-xl leading-tight text-primary uppercase tracking-tight">Willard's</div>
              <div className="text-xs font-semibold text-secondary uppercase tracking-widest">General Contracting</div>
            </div>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6">
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => scrollTo(link.href)}
                  className="text-sm font-semibold text-gray-700 hover:text-primary transition-colors uppercase tracking-wide"
                >
                  {link.name}
                </button>
              ))}
            </div>
            <Button 
              onClick={() => scrollTo("#contact")}
              className="bg-primary hover:bg-primary/90 text-white font-bold rounded-none px-6 py-6 uppercase tracking-wider"
            >
              Get a Quote
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-gray-700"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-xl py-4 flex flex-col">
          {navLinks.map((link) => (
            <button
              key={link.name}
              onClick={() => scrollTo(link.href)}
              className="px-6 py-4 text-left text-base font-semibold text-gray-800 border-b border-gray-50 uppercase tracking-wide hover:bg-gray-50"
            >
              {link.name}
            </button>
          ))}
          <div className="p-6">
            <Button 
              onClick={() => scrollTo("#contact")}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold rounded-none py-6 uppercase tracking-wider"
            >
              Get a Free Quote
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
