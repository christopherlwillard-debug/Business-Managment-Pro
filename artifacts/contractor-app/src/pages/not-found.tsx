import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <AlertCircle className="w-16 h-16 text-muted-foreground/30 mb-4" />
      <h1 className="text-4xl font-display font-bold text-foreground mb-2">404 Not Found</h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">The page you are looking for doesn't exist or has been moved.</p>
      <Link href="/" className="px-6 py-3 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
        Return to Dashboard
      </Link>
    </div>
  );
}
