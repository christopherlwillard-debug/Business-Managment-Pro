const API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY ?? "") as string;

function loadGapi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).gapi?.load) { resolve(); return; }
    if (document.getElementById("gapi-script")) {
      const wait = setInterval(() => {
        if ((window as any).gapi?.load) { clearInterval(wait); resolve(); }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API JS"));
    document.head.appendChild(script);
  });
}

function loadPickerLib(): Promise<void> {
  return new Promise(resolve => {
    (window as any).gapi.load("picker", { callback: () => resolve() });
  });
}

export async function openDrivePicker(token: string): Promise<File | null> {
  if (!API_KEY) {
    throw new Error("VITE_GOOGLE_API_KEY is not configured. Add it in your environment settings.");
  }
  await loadGapi();
  await loadPickerLib();

  const gp = (window as any).google.picker;

  return new Promise(resolve => {
    const view = new gp.DocsView()
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    const picker = new gp.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setCallback(async (data: any) => {
        if (data[gp.Response.ACTION] === gp.Action.PICKED) {
          const doc = data[gp.Response.DOCUMENTS][0];
          const fileId: string = doc[gp.Document.ID];
          const fileName: string = doc[gp.Document.NAME];
          const mimeType: string = doc[gp.Document.MIME_TYPE] ?? "application/octet-stream";

          try {
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const resp = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) { resolve(null); return; }
            const blob = await resp.blob();
            resolve(new File([blob], fileName, { type: mimeType }));
          } catch {
            resolve(null);
          }
        } else if (data[gp.Response.ACTION] === gp.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
