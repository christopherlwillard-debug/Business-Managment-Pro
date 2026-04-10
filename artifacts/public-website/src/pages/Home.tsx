import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { Trust } from "@/components/sections/Trust";
import { Portfolio } from "@/components/sections/Portfolio";
import { Clients } from "@/components/sections/Clients";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans">
      <Navbar />
      
      <main className="flex-1">
        <Hero />
        <Services />
        <Trust />
        <Portfolio />
        <Clients />
        <Contact />
      </main>

      <Footer />
    </div>
  );
}
