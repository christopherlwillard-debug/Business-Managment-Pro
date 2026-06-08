export type InspectorTab = 'quick' | 'content' | 'style' | 'layout' | 'advanced';

export interface FieldDescriptor {
  id: string;
  label: string;
  tab: InspectorTab;
  styleSubSection?: 'backgrounds' | 'colors' | 'borders' | 'shadows' | 'typography';
  isCore?: boolean;
  defaultValue?: unknown;
}

export const ALL_FIELDS: FieldDescriptor[] = [
  // ── Core controls shown in Quick tab ──────────────────────────────────────
  { id: 'text',          label: 'Text Content',           tab: 'content',  isCore: true,  defaultValue: '' },
  { id: 'image',         label: 'Image',                  tab: 'content',  isCore: true,  defaultValue: '' },
  { id: 'link',          label: 'Link URL',               tab: 'content',  isCore: true,  defaultValue: '' },
  { id: 'bg-color',      label: 'Background Color',       tab: 'style',    isCore: true,  defaultValue: undefined, styleSubSection: 'backgrounds' },
  { id: 'padding',       label: 'Padding',                tab: 'layout',   isCore: true,  defaultValue: 0 },
  { id: 'alignment',     label: 'Alignment',              tab: 'layout',   isCore: true,  defaultValue: undefined },
  { id: 'width',         label: 'Width / Max Width',      tab: 'layout',   isCore: true,  defaultValue: undefined },
  { id: 'visibility',    label: 'Visibility',             tab: 'advanced', isCore: true,  defaultValue: true },

  // ── Style tab — Typography ────────────────────────────────────────────────
  { id: 'font-family',     label: 'Font Family',          tab: 'style', styleSubSection: 'typography', defaultValue: undefined },
  { id: 'font-size',       label: 'Font Size',            tab: 'style', styleSubSection: 'typography', defaultValue: undefined },
  { id: 'font-weight',     label: 'Font Weight',          tab: 'style', styleSubSection: 'typography', defaultValue: undefined },
  { id: 'line-height',     label: 'Line Height',          tab: 'style', styleSubSection: 'typography', defaultValue: undefined },
  { id: 'letter-spacing',  label: 'Letter Spacing',       tab: 'style', styleSubSection: 'typography', defaultValue: undefined },
  { id: 'text-transform',  label: 'Text Transform',       tab: 'style', styleSubSection: 'typography', defaultValue: 'none' },

  // ── Style tab — Colors ────────────────────────────────────────────────────
  { id: 'text-color',    label: 'Text Color',             tab: 'style', styleSubSection: 'colors',     defaultValue: undefined },
  { id: 'accent-color',  label: 'Accent / Button Color',  tab: 'style', styleSubSection: 'colors',     defaultValue: undefined },

  // ── Style tab — Backgrounds ───────────────────────────────────────────────
  { id: 'bg-gradient',   label: 'Gradient Background',    tab: 'style', styleSubSection: 'backgrounds', defaultValue: undefined },
  { id: 'bg-image',      label: 'Background Image',       tab: 'style', styleSubSection: 'backgrounds', defaultValue: undefined },
  { id: 'bg-overlay',    label: 'Background Overlay',     tab: 'style', styleSubSection: 'backgrounds', defaultValue: 0 },

  // ── Style tab — Borders ───────────────────────────────────────────────────
  { id: 'border-width',  label: 'Border Width',           tab: 'style', styleSubSection: 'borders', defaultValue: 0 },
  { id: 'border-style',  label: 'Border Style',           tab: 'style', styleSubSection: 'borders', defaultValue: 'none' },
  { id: 'border-color',  label: 'Border Color',           tab: 'style', styleSubSection: 'borders', defaultValue: undefined },
  { id: 'border-radius', label: 'Border Radius',          tab: 'style', styleSubSection: 'borders', defaultValue: 0 },

  // ── Style tab — Shadows ───────────────────────────────────────────────────
  { id: 'shadow',        label: 'Shadow',                 tab: 'style', styleSubSection: 'shadows', defaultValue: 'none' },

  // ── Layout tab ────────────────────────────────────────────────────────────
  { id: 'padding-top',    label: 'Padding Top',           tab: 'layout', defaultValue: 0 },
  { id: 'padding-right',  label: 'Padding Right',         tab: 'layout', defaultValue: 0 },
  { id: 'padding-bottom', label: 'Padding Bottom',        tab: 'layout', defaultValue: 0 },
  { id: 'padding-left',   label: 'Padding Left',          tab: 'layout', defaultValue: 0 },
  { id: 'margin-top',     label: 'Margin Top',            tab: 'layout', defaultValue: 0 },
  { id: 'margin-bottom',  label: 'Margin Bottom',         tab: 'layout', defaultValue: 0 },
  { id: 'min-height',     label: 'Min Height',            tab: 'layout', defaultValue: 0 },
  { id: 'max-width',      label: 'Max Width',             tab: 'layout', defaultValue: undefined },

  // ── Advanced tab ──────────────────────────────────────────────────────────
  { id: 'animation',     label: 'Animation',              tab: 'advanced', defaultValue: 'none' },
  { id: 'anchor-id',     label: 'Anchor ID',              tab: 'advanced', defaultValue: undefined },
  { id: 'css-class',     label: 'CSS Class',              tab: 'advanced', defaultValue: undefined },
  { id: 'custom-attrs',  label: 'Custom Attributes',      tab: 'advanced', defaultValue: undefined },
  { id: 'hide-mobile',   label: 'Hide on Mobile',         tab: 'advanced', defaultValue: false },
  { id: 'hide-tablet',   label: 'Hide on Tablet',         tab: 'advanced', defaultValue: false },
];

const PINS_KEY = 'inspector-pinned-v1';
const RECENT_KEY = 'inspector-recent-v1';

export function getPinnedFields(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]'); } catch { return []; }
}

export function togglePin(id: string): string[] {
  const pins = getPinnedFields();
  const next = pins.includes(id) ? pins.filter(p => p !== id) : [...pins, id];
  try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function getRecentFields(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

export function recordRecentField(id: string): void {
  const recent = getRecentFields().filter(r => r !== id);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent].slice(0, 10))); } catch {}
}

export function getFieldDefault(id: string): unknown {
  return ALL_FIELDS.find(f => f.id === id)?.defaultValue;
}
