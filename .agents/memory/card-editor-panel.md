---
name: Card Editor Panel Architecture
description: Why the WebsiteEditor card editor uses selectedCardData state instead of a render-time lookup
---

## Rule
Capture the `CardComponent` object into `selectedCardData` state at click-time inside `onSelectCard`. Render `CardItemEditorPanel` as a standalone panel div that returns early before `<InspectorPanel>` is reached.

## Why
The old approach (`specialContent = <CardItemEditorPanel card={foundCard} />` where `foundCard = items.find(c => c.id === selectedCardState.cardId)`) was unreliable. The lookup ran inside the inspector IIFE at render time, but closure staleness or in-session unsaved cards caused `foundCard` to come back null — even though the card was visually selected on the canvas. Injecting into InspectorPanel via props also went through two layers of state (InspectorPanel's tab state, collapsed state) that could silently suppress the panel.

## How to Apply
- `selectedCardData: CardComponent | null` state (WebsiteEditor.tsx, near selectedCardState)
- `onSelectCard` callback: read `s.content.items` (or `s.content.cards` for faq) synchronously at click time, store result in `setSelectedCardData(cardData)`
- Inspector IIFE: `if (selectedCardData && selectedCardState?.sectionId === sec.id)` → return the standalone panel div; never reaches `<InspectorPanel>`
- `onChange` callback inside the panel always calls `setSelectedCardData(updatedCard)` to keep state fresh
- Clear `selectedCardData` everywhere `setSelectedCardState(null)` is called (Escape handler, selectSectionAndScroll, deselect)
- deposit section still uses `specialContent` → `InspectorPanel` (unaffected, different pattern)
