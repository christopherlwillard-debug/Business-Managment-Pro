export type InspectorTab = 'quick' | 'content' | 'style' | 'layout' | 'advanced';

export interface FieldDescriptor {
  id: string;
  label: string;
  tab: InspectorTab;
  styleSubSection?: 'backgrounds' | 'colors' | 'borders' | 'shadows' | 'typography';
  isCore?: boolean;
}

export const ALL_FIELDS: FieldDescriptor[] = [
  { id: 'bg-color',      label: 'Background Color',   tab: 'style',    styleSubSection: 'backgrounds', isCore: true },
  { id: 'padding',       label: 'Padding',            tab: 'layout',   isCore: true },
  { id: 'shadow',        label: 'Shadow',             tab: 'style',    styleSubSection: 'shadows',     isCore: true },
  { id: 'animation',     label: 'Animation',          tab: 'advanced', isCore: true },
  { id: 'visibility',    label: 'Visibility',         tab: 'advanced', isCore: true },
  { id: 'alignment',     label: 'Alignment',          tab: 'layout',   isCore: true },
  { id: 'width',         label: 'Width / Max Width',  tab: 'layout',   isCore: true },
  { id: 'text',          label: 'Text Content',       tab: 'content',  isCore: true },
  { id: 'bg-gradient',   label: 'Gradient Background',tab: 'style',    styleSubSection: 'backgrounds' },
  { id: 'bg-image',      label: 'Background Image',   tab: 'style',    styleSubSection: 'backgrounds' },
  { id: 'bg-overlay',    label: 'Background Overlay', tab: 'style',    styleSubSection: 'backgrounds' },
  { id: 'border-radius', label: 'Border Radius',      tab: 'style',    styleSubSection: 'borders' },
  { id: 'padding-top',   label: 'Padding Top',        tab: 'layout' },
  { id: 'padding-right', label: 'Padding Right',      tab: 'layout' },
  { id: 'padding-bottom',label: 'Padding Bottom',     tab: 'layout' },
  { id: 'padding-left',  label: 'Padding Left',       tab: 'layout' },
  { id: 'margin-top',    label: 'Margin Top',         tab: 'layout' },
  { id: 'margin-bottom', label: 'Margin Bottom',      tab: 'layout' },
  { id: 'min-height',    label: 'Min Height',         tab: 'layout' },
  { id: 'anchor-id',     label: 'Anchor ID',          tab: 'advanced' },
  { id: 'css-class',     label: 'CSS Class',          tab: 'advanced' },
  { id: 'custom-attrs',  label: 'Custom Attributes',  tab: 'advanced' },
  { id: 'hide-mobile',   label: 'Hide on Mobile',     tab: 'advanced' },
  { id: 'hide-tablet',   label: 'Hide on Tablet',     tab: 'advanced' },
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
