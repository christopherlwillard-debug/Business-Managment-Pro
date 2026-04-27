const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function renderHtmlToPdf(html: string): Promise<Blob> {
  const res = await fetch(`${BASE}/api/pdf/render-html`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  });
  if (!res.ok) {
    throw new Error(`PDF render failed: ${res.statusText}`);
  }
  const { pdfBase64 } = await res.json();
  const binary = atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}
