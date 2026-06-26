---
name: PDF generation
description: Why Puppeteer/Chrome fails in production and how pdfkit replaced it
---

## Rule
Use `pdfkit` for all server-side PDF generation. Never use Puppeteer/Chrome in production.

## Why
Two Chrome options both fail in the production container:
- **Bundled Puppeteer Chrome (v147)**: missing 20+ shared libs (`libglib-2.0.so.0`, `libX11`, `libgtk`, etc.) — exits immediately with code 127.
- **System Chromium (v138, Nix)**: is a bash wrapper script that sources the Nix profile before launching the real binary. Takes 60–120+ seconds to start; silently exceeds Puppeteer's launch timeout and hangs indefinitely.

`ldd` on the bundled binary shows all the missing libs. `file` on the Nix chromium path confirms it's a bash script.

## How to apply
- `generateChecklistPdf.ts` uses pdfkit directly — no `launchBrowser`, no temp files, no CDP.
- `launchBrowser.ts` still exists for any future browser needs (e.g. screenshots) but should not be used for PDF generation.
- pdfkit accepts raw `Buffer` objects for images (no need to convert to base64).
- Collect the PDF stream: `doc.on("data", chunk => chunks.push(chunk))` + `await new Promise(resolve => doc.on("end", resolve))`.
