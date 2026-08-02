/**
 * Action Registry — canonical source of all canvas context-menu action groups.
 *
 * Every context-menu target (section / component / column) has a dedicated
 * builder function that accepts a typed params object and returns
 * ContextMenuGroup[].  WebsiteEditor.tsx calls these builders; it never
 * hand-assembles menus inline.
 *
 * Applicability rules (locked state, clipboard presence, etc.) are evaluated
 * here, keeping WebsiteEditor.tsx free of menu-composition logic.
 */

import type { ContextMenuGroup, ContextMenuItem } from "./CanvasContextMenu";
import type { SiteComponent, ComponentType } from "./sections/ContentSection";
import type { InspectorTab } from "./inspectorFields";

// ─── Section Actions ──────────────────────────────────────────────────────────

export interface SectionActionParams {
  locked: boolean;
  enabled: boolean;
  hasCopiedSection: boolean;
  hasCopiedComponent: boolean;
  hasCopiedStyles: boolean;
  allPages: Array<{ id: string; name: string }>;
  currentPageId: string;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPasteBelow: () => void;
  onMismatchPaste: () => void;
  onToggleHide: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onDelete: () => void;
  onCopyStyles: () => void;
  onPasteStyles: () => void;
  onInspect: (tab?: InspectorTab) => void;
  onMoveToPage: (targetPageId: string) => void;
  onSaveToLibrary: () => void;
}

export function buildSectionActions(p: SectionActionParams): ContextMenuGroup[] {
  if (p.locked) {
    return [{ items: [{ id: "unlock", label: "Unlock Section", onClick: () => p.onUnlock() }] }];
  }

  const moveToItems: ContextMenuItem[] = p.allPages
    .filter(pg => pg.id !== p.currentPageId)
    .map(pg => ({ id: `move-to-${pg.id}`, label: pg.name, onClick: () => p.onMoveToPage(pg.id) }));

  const pasteOnClick = p.hasCopiedSection
    ? p.onPasteBelow
    : p.hasCopiedComponent
    ? p.onMismatchPaste
    : undefined;

  const mainItems: ContextMenuItem[] = [
    { id: "add-above", label: "Add Section Above", onClick: p.onAddAbove },
    { id: "add-below", label: "Add Section Below", onClick: p.onAddBelow },
    { id: "duplicate", label: "Duplicate", shortcut: "Ctrl+D", onClick: p.onDuplicate },
    { id: "copy", label: "Copy", shortcut: "Ctrl+C", onClick: p.onCopy },
    {
      id: "paste",
      label: "Paste Below",
      shortcut: "Ctrl+V",
      disabled: !p.hasCopiedSection && !p.hasCopiedComponent,
      onClick: pasteOnClick,
    },
    { id: "toggle-hide", label: p.enabled ? "Hide" : "Show", onClick: p.onToggleHide },
    { id: "toggle-lock", label: "Lock", onClick: p.onLock },
    { id: "delete", label: "Delete", shortcut: "Del", danger: true, onClick: p.onDelete },
    ...(moveToItems.length > 0
      ? [{ id: "move-to", label: "Move To Page…", children: moveToItems } as ContextMenuItem]
      : []),
  ];

  const styleItems: ContextMenuItem[] = [
    { id: "copy-styles", label: "Copy Styles", onClick: p.onCopyStyles },
    { id: "paste-styles", label: "Paste Styles", disabled: !p.hasCopiedStyles, onClick: p.onPasteStyles },
  ];

  return [
    { items: mainItems },
    { items: styleItems },
    {
      items: [
        {
          id: "inspect",
          label: "Inspect…",
          children: [
            { id: "inspect-content", label: "Content", onClick: () => p.onInspect("content") },
            { id: "inspect-style",   label: "Style",   onClick: () => p.onInspect("style") },
            { id: "inspect-layout",  label: "Layout",  onClick: () => p.onInspect("layout") },
          ],
        },
        { id: "save-to-library", label: "Save to Library…", onClick: () => p.onSaveToLibrary() },
      ],
    },
  ];
}

// ─── Component Actions ────────────────────────────────────────────────────────

export interface ComponentActionParams {
  comp: SiteComponent;
  locked: boolean;
  hasCopiedComponent: boolean;
  hasCopiedSection: boolean;
  hasCopiedComponentStyle: boolean;
  allSections: Array<{ id: string; label: string }>;
  onEdit: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onMismatchPaste: () => void;
  onCopyComponentStyle: () => void;
  onPasteComponentStyle: () => void;
  onMoveToSection: (targetSectionId: string) => void;
  onToggleHide: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onDelete: () => void;
  onConvertTo: (type: ComponentType) => void;
  onInspect: (tab?: InspectorTab) => void;
  onReplaceImage?: () => void;
  onEditAltText?: () => void;
}

export function buildComponentActions(p: ComponentActionParams): ContextMenuGroup[] {
  if (p.locked) {
    return [{ items: [{ id: "unlock", label: "Unlock", onClick: () => p.onUnlock() }] }];
  }

  const textConvertTypes: ComponentType[] = ["heading", "paragraph", "button"];
  const convertToItems: ContextMenuItem[] = textConvertTypes
    .filter(t => t !== p.comp.type)
    .map(t => ({
      id: `convert-${t}`,
      label: t.charAt(0).toUpperCase() + t.slice(1),
      onClick: () => p.onConvertTo(t),
    }));

  const pasteOnClick = p.hasCopiedComponent
    ? p.onPaste
    : p.hasCopiedSection
    ? p.onMismatchPaste
    : undefined;

  const moveToItems: ContextMenuItem[] = p.allSections.map(s => ({
    id: `move-sec-${s.id}`,
    label: s.label,
    onClick: () => p.onMoveToSection(s.id),
  }));

  const mainItems: ContextMenuItem[] = [
    { id: "edit",       label: "Edit",      shortcut: "Enter",  onClick: p.onEdit },
    { id: "duplicate",  label: "Duplicate",                     onClick: p.onDuplicate },
    { id: "copy",       label: "Copy",      shortcut: "Ctrl+C", onClick: p.onCopy },
    {
      id: "paste",
      label: "Paste",
      shortcut: "Ctrl+V",
      disabled: !p.hasCopiedComponent && !p.hasCopiedSection,
      onClick: pasteOnClick,
    },
    { id: "toggle-hide",  label: p.comp.hidden ? "Show" : "Hide", onClick: p.onToggleHide },
    { id: "toggle-lock",  label: "Lock",    onClick: p.onLock },
    { id: "delete",       label: "Delete",  shortcut: "Del", danger: true, onClick: p.onDelete },
    ...(moveToItems.length > 0
      ? [{ id: "move-to-section", label: "Move To Section…", children: moveToItems } as ContextMenuItem]
      : []),
  ];

  const styleItems: ContextMenuItem[] = [
    { id: "copy-comp-style",  label: "Copy Styles",  onClick: p.onCopyComponentStyle },
    {
      id: "paste-comp-style",
      label: "Paste Styles",
      disabled: !p.hasCopiedComponentStyle,
      onClick: p.onPasteComponentStyle,
    },
  ];

  const imageItems: ContextMenuItem[] =
    p.comp.type === "image" && p.onReplaceImage
      ? [
          { id: "replace-image", label: "Replace Image…", onClick: p.onReplaceImage! },
          ...(p.onEditAltText ? [{ id: "edit-alt", label: "Edit Alt Text", onClick: p.onEditAltText! }] : []),
        ]
      : [];

  const convertGroup: ContextMenuGroup[] =
    convertToItems.length > 0
      ? [{ items: [{ id: "convert-to", label: "Convert To…", children: convertToItems }] }]
      : [];

  const imageGroup: ContextMenuGroup[] = imageItems.length > 0 ? [{ items: imageItems }] : [];

  return [
    { items: mainItems },
    { items: styleItems },
    ...imageGroup,
    ...convertGroup,
    {
      items: [{
        id: "inspect",
        label: "Inspect…",
        children: [
          { id: "inspect-content", label: "Content", onClick: () => p.onInspect("content") },
          { id: "inspect-style",   label: "Style",   onClick: () => p.onInspect("style") },
          { id: "inspect-layout",  label: "Layout",  onClick: () => p.onInspect("layout") },
        ],
      }],
    },
  ];
}

// ─── Column Actions (RowSection column target) ────────────────────────────────

export interface ColumnActionParams {
  isColumnHidden: boolean;
  isColumnLocked: boolean;
  hasCopiedComponent: boolean;
  hasCopiedColumn: boolean;
  hasCopiedColumnStyle: boolean;
  /** True when there is more than one column (delete/move-left/right are valid). */
  canDeleteColumn: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onAddComponent: (type: ComponentType) => void;
  onPasteComponent: () => void;
  onCopyColumn: () => void;
  onPasteColumn: () => void;
  onDuplicateColumn: () => void;
  onToggleHideColumn: () => void;
  onLockColumn: () => void;
  onUnlockColumn: () => void;
  onCopyColumnStyles: () => void;
  onPasteColumnStyles: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDeleteColumn: () => void;
  onInspect: (tab?: InspectorTab) => void;
}

export function buildColumnActions(p: ColumnActionParams): ContextMenuGroup[] {
  if (p.isColumnLocked) {
    return [{ items: [{ id: "unlock-col", label: "Unlock Column", onClick: () => p.onUnlockColumn() }] }];
  }

  const addTypes: ComponentType[] = ["heading", "paragraph", "image", "button", "divider", "icon"];
  const addItems: ContextMenuItem[] = addTypes.map(t => ({
    id: `add-${t}`,
    label: t.charAt(0).toUpperCase() + t.slice(1),
    onClick: () => p.onAddComponent(t),
  }));

  return [
    {
      items: [
        { id: "add-component", label: "Add Component…", children: addItems },
        {
          id: "paste-component",
          label: "Paste Component",
          shortcut: "Ctrl+V",
          disabled: !p.hasCopiedComponent,
          onClick: p.onPasteComponent,
        },
      ],
    },
    {
      items: [
        { id: "copy-col",      label: "Copy Column",      onClick: p.onCopyColumn },
        {
          id: "paste-col",
          label: "Paste Column",
          disabled: !p.hasCopiedColumn,
          onClick: p.onPasteColumn,
        },
        { id: "duplicate-col", label: "Duplicate Column", onClick: p.onDuplicateColumn },
      ],
    },
    {
      items: [
        { id: "toggle-hide-col", label: p.isColumnHidden ? "Show Column" : "Hide Column", onClick: p.onToggleHideColumn },
        { id: "lock-col",        label: "Lock Column",   onClick: p.onLockColumn },
        { id: "copy-col-style",  label: "Copy Styles",   onClick: p.onCopyColumnStyles },
        {
          id: "paste-col-style",
          label: "Paste Styles",
          disabled: !p.hasCopiedColumnStyle,
          onClick: p.onPasteColumnStyles,
        },
      ],
    },
    {
      items: [
        { id: "move-left",  label: "Move Left",  disabled: !p.canMoveLeft,  onClick: p.onMoveLeft },
        { id: "move-right", label: "Move Right", disabled: !p.canMoveRight, onClick: p.onMoveRight },
        {
          id: "delete-col",
          label: "Delete Column",
          danger: true,
          disabled: !p.canDeleteColumn,
          onClick: p.onDeleteColumn,
        },
      ],
    },
    {
      items: [{
        id: "inspect-col",
        label: "Inspect Column…",
        children: [
          { id: "inspect-col-content", label: "Content", onClick: () => p.onInspect("content") },
          { id: "inspect-col-style",   label: "Style",   onClick: () => p.onInspect("style") },
          { id: "inspect-col-layout",  label: "Layout",  onClick: () => p.onInspect("layout") },
        ],
      }],
    },
  ];
}
