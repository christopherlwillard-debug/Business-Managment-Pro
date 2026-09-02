---
name: PDFKit footer margins
description: Prevent recursive page creation when drawing fixed-position footers with PDFKit.
---

Fixed-position footer text drawn below a PDFKit page's configured bottom margin can trigger automatic pagination. When this runs from a `pageAdded` handler, it can recursively create pages until the process overflows.

**Why:** PDFKit's text wrapper honors page margins even when explicit coordinates are provided, so footer text near the physical page edge may be treated as overflowing content.

**How to apply:** Save the current bottom margin, temporarily set it to zero while drawing the footer, restore it immediately afterward, and restore the document's prior `y` position.