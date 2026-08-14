import { Award } from "lucide-react";

export default function Grants() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="rounded-full bg-primary/10 p-5 mb-6">
        <Award className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">Small Business Grants</h1>
      <p className="text-muted-foreground max-w-md">
        Grant discovery is coming soon. This section will surface federal, state,
        and local grant opportunities specifically matched to your business type
        and location — separate from government contract bids.
      </p>
    </div>
  );
}
