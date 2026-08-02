import { Link2, Copy, ExternalLink, Info } from "lucide-react";

export interface CustomDomainPanelProps {
  customDomain: string;
  appHost: string;
  siteUrl: string;
  onChange: (v: string) => void;
  onCopy: (v: string) => void;
}

export function CustomDomainPanel({
  customDomain,
  appHost,
  siteUrl,
  onChange,
  onCopy,
}: CustomDomainPanelProps) {
  return (
    <div className="border-t border-border p-3 space-y-3">
      {/* Live site URL — always available */}
      {siteUrl && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Link2 className="w-3 h-3" />
            Your Website
          </p>
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-1.5 flex items-center gap-1.5">
            <span className="flex-1 text-[10px] font-mono text-emerald-800 dark:text-emerald-300 break-all">{siteUrl}</span>
            <button type="button" onClick={() => onCopy(siteUrl)} className="flex-shrink-0 text-emerald-600 hover:text-emerald-800" title="Copy link"><Copy className="w-3 h-3" /></button>
            <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-emerald-600 hover:text-emerald-800" title="Open site"><ExternalLink className="w-3 h-3" /></a>
          </div>
          <p className="text-[10px] text-muted-foreground">Share this link right now — no domain setup needed.</p>
        </div>
      )}

      {/* Custom domain */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <Link2 className="w-3 h-3" />
          Custom Domain
        </p>
        <input
          type="text"
          placeholder="www.yourdomain.com"
          value={customDomain}
          onChange={e => onChange(e.target.value.trim())}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {customDomain ? (
          <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-2.5 space-y-2.5">
            <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1">
              <Info className="w-3 h-3 flex-shrink-0" />
              3-Step Setup
            </p>
            <div className="flex gap-2">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold mt-0.5">1</span>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Add domain to your Replit deployment</p>
                <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                  In Replit, go to your published app → <strong>Deployments</strong> → <strong>Custom Domains</strong> → add <strong>{customDomain}</strong>. Do this once per domain.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold mt-0.5">2</span>
              <div className="space-y-1 w-full">
                <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Add a CNAME record at your registrar</p>
                <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                  At GoDaddy, Cloudflare, etc. — add a <strong>CNAME</strong> pointing to:
                </p>
                <div className="rounded bg-blue-100 dark:bg-blue-900/40 px-2 py-1 flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-blue-900 dark:text-blue-200 break-all">{appHost}</span>
                  <button type="button" onClick={() => onCopy(appHost)} className="flex-shrink-0 text-blue-600 hover:text-blue-800 dark:text-blue-400" title="Copy CNAME target">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[10px] text-blue-500 dark:text-blue-400 leading-relaxed">DNS changes can take up to 48 hours to propagate.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold mt-0.5">3</span>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Publish this site</p>
                <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                  The domain you entered above is saved with this business. Hit <strong>Publish</strong> and your site will be live at <strong>{customDomain}</strong>.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Enter your domain above to see setup instructions.
          </p>
        )}
      </div>
    </div>
  );
}
