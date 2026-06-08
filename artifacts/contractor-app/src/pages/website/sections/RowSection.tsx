import React, { useState, useId } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, Trash2, Copy, LayoutGrid, ClipboardPaste } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import {
  renderSiteComponent, CONTENT_COMPONENT_TYPES, defaultPropsForType,
  type SiteComponent, type ComponentType,
} from "./ContentSection";
import { EditableWrapper } from "../EditableWrapper";
import { useToast } from "@/hooks/use-toast";

export interface RowColumn {
  id: string;
  widthRatio: number;
  components: SiteComponent[];
}

export interface RowSectionData {
  columns: RowColumn[];
  gap?: number;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
  verticalAlign?: "start" | "center" | "end" | "stretch";
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultRowSectionData(): RowSectionData {
  return {
    columns: [
      { id: uid(), widthRatio: 1, components: [] },
      { id: uid(), widthRatio: 1, components: [] },
    ],
    gap: 24,
    maxWidth: "lg",
    verticalAlign: "start",
  };
}

export const ROW_RATIO_PRESETS: Record<number, Array<{ label: string; ratios: number[] }>> = {
  1: [{ label: "Full", ratios: [1] }],
  2: [
    { label: "50/50", ratios: [1, 1] },
    { label: "66/33", ratios: [2, 1] },
    { label: "33/66", ratios: [1, 2] },
    { label: "75/25", ratios: [3, 1] },
    { label: "25/75", ratios: [1, 3] },
  ],
  3: [
    { label: "Equal", ratios: [1, 1, 1] },
    { label: "Wide L", ratios: [2, 1, 1] },
    { label: "Wide M", ratios: [1, 2, 1] },
    { label: "Wide R", ratios: [1, 1, 2] },
  ],
  4: [
    { label: "Equal", ratios: [1, 1, 1, 1] },
    { label: "Wide 1", ratios: [2, 1, 1, 1] },
    { label: "Wide 2", ratios: [1, 2, 1, 1] },
    { label: "Wide 3", ratios: [1, 1, 2, 1] },
  ],
};

const MAX_WIDTH_CLASS: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-none",
};

const ALIGN_CLASS: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

function gridTemplate(columns: RowColumn[]): string {
  return columns.map(c => `${Math.max(1, c.widthRatio)}fr`).join(" ");
}

function ComponentPicker({ onAdd, onClose }: { onAdd: (t: ComponentType) => void; onClose: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-2 z-50 w-64">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-gray-700">Add Component</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-0.5">
        {CONTENT_COMPONENT_TYPES.map(ct => (
          <button
            key={ct.type}
            type="button"
            onClick={() => { onAdd(ct.type); onClose(); }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors text-gray-700 group"
          >
            <span className="text-gray-400 group-hover:text-primary">{ct.icon}</span>
            {ct.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SortableCompItemProps {
  comp: SiteComponent;
  colId: string;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onToggleHide?: () => void;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string };
}

function SortableCompItem({ comp, colId, isSelected, onSelect, onDuplicate, onDelete, onCopy, onToggleHide, settings }: SortableCompItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: comp.id });
  const label = CONTENT_COMPONENT_TYPES.find(t => t.type === comp.type)?.label ?? comp.type;

  const dragHandle = (
    <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground p-1" onClick={e => e.stopPropagation()}>
      <GripVertical className="w-3 h-3" />
    </div>
  );

  const copyBtn = onCopy && (
    <button type="button" title="Copy component" onClick={e => { e.stopPropagation(); onCopy(); }}
      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
      <Copy className="w-3 h-3" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      onClick={e => { e.stopPropagation(); onSelect(); }}
    >
      <EditableWrapper
        id={`${colId}-${comp.id}`}
        label={label}
        isSelected={isSelected}
        isHidden={!!comp.hidden}
        onSelect={e => { e.stopPropagation(); onSelect(); }}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onToggleHide={onToggleHide}
        extraToolbar={<>{dragHandle}{copyBtn}</>}
      >
        <div className="px-2 py-2 pointer-events-none overflow-hidden max-h-28">
          {renderSiteComponent(comp, settings)}
        </div>
      </EditableWrapper>
    </div>
  );
}

interface RowSectionProps {
  content: RowSectionData;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string };
  isEditing?: boolean;
  onChange?: (content: RowSectionData) => void;
  blockStyle?: BlockStyle;
  selectedColumnId?: string | null;
  selectedComponentId?: string | null;
  onSelectRowComponent?: (columnId: string, componentId: string | null) => void;
  copiedComponent?: SiteComponent | null;
  onCopyComponent?: (comp: SiteComponent) => void;
  /** Called before any discrete mutation — push history snapshot */
  onBeforeAction?: () => void;
  /** Toggle component hidden state; called with colId and componentId */
  onToggleRowComponentHide?: (colId: string, compId: string) => void;
}

export function RowSection({
  content: data,
  settings,
  isEditing,
  onChange,
  blockStyle,
  selectedColumnId,
  selectedComponentId,
  onSelectRowComponent,
  copiedComponent,
  onCopyComponent,
  onBeforeAction,
  onToggleRowComponentHide,
}: RowSectionProps) {
  const { toast } = useToast();
  const [showPickerForCol, setShowPickerForCol] = useState<string | null>(null);
  const rawId = useId();
  const gridId = rawId.replace(/:/g, "g");
  const columns = data.columns ?? [];
  const gap = data.gap ?? 24;
  const mwClass = MAX_WIDTH_CLASS[data.maxWidth ?? "lg"] ?? "max-w-4xl";
  const alignClass = ALIGN_CLASS[data.verticalAlign ?? "start"] ?? "items-start";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function updateData(patch: Partial<RowSectionData>) {
    onChange?.({ ...data, ...patch });
  }

  function updateColumn(colId: string, comps: SiteComponent[]) {
    updateData({ columns: columns.map(c => c.id === colId ? { ...c, components: comps } : c) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    for (const col of columns) {
      const oldIdx = col.components.findIndex(c => c.id === active.id);
      if (oldIdx === -1) continue;
      const newIdx = col.components.findIndex(c => c.id === over.id);
      if (newIdx === -1) continue;
      onBeforeAction?.();
      updateColumn(col.id, arrayMove(col.components, oldIdx, newIdx));
      return;
    }
  }

  function addComponent(colId: string, type: ComponentType) {
    onBeforeAction?.();
    const newComp: SiteComponent = { id: uid(), type, props: defaultPropsForType(type) };
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    updateColumn(colId, [...col.components, newComp]);
    onSelectRowComponent?.(colId, newComp.id);
  }

  function duplicateComponent(colId: string, compId: string) {
    onBeforeAction?.();
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    const idx = col.components.findIndex(c => c.id === compId);
    if (idx === -1) return;
    const copy: SiteComponent = { ...col.components[idx], id: uid(), hidden: false };
    const next = [...col.components];
    next.splice(idx + 1, 0, copy);
    updateColumn(colId, next);
    onSelectRowComponent?.(colId, copy.id);
  }

  function deleteComponent(colId: string, compId: string) {
    onBeforeAction?.();
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    updateColumn(colId, col.components.filter(c => c.id !== compId));
    if (selectedComponentId === compId) onSelectRowComponent?.(colId, null);
  }

  function pasteComponent(colId: string) {
    if (!copiedComponent) return;
    onBeforeAction?.();
    const col = columns.find(c => c.id === colId);
    if (!col) return;
    const copy: SiteComponent = { ...copiedComponent, props: { ...copiedComponent.props }, id: uid(), hidden: false };
    const selectedIdx = col.components.findIndex(c => c.id === selectedComponentId);
    const insertIdx = selectedIdx >= 0 ? selectedIdx + 1 : col.components.length;
    const next = [...col.components];
    next.splice(insertIdx, 0, copy);
    updateColumn(colId, next);
    onSelectRowComponent?.(colId, copy.id);
    toast({ title: "Component pasted", duration: 2000 });
  }

  const cssTemplate = `@media (min-width: 768px) { [data-row-grid="${gridId}"] { grid-template-columns: ${gridTemplate(columns)}; } }`;

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={false}>
        <style dangerouslySetInnerHTML={{ __html: cssTemplate }} />
        <div className={`${mwClass} mx-auto`}>
          <div
            data-row-grid={gridId}
            className={`grid grid-cols-1 ${alignClass}`}
            style={{ gap: `${gap}px` }}
          >
            {columns.map(col => (
              <div key={col.id} className="min-w-0 space-y-6">
                {col.components.filter(c => !c.hidden).map(comp => (
                  <div key={comp.id}>{renderSiteComponent(comp, settings)}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-6" isEditing={true} defaultBg="#f1f5f9">
      <style dangerouslySetInnerHTML={{ __html: cssTemplate }} />
      <div onClick={e => e.stopPropagation()}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div
            data-row-grid={gridId}
            className={`grid grid-cols-1 ${alignClass}`}
            style={{ gap: `${gap}px` }}
          >
            {columns.map((col, idx) => {
              const isColActive = selectedColumnId === col.id;
              return (
                <div
                  key={col.id}
                  className={`rounded-lg border-2 transition-all p-2 min-h-[72px] bg-white ${
                    isColActive
                      ? "border-primary/60 shadow-sm"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => onSelectRowComponent?.(col.id, null)}
                >
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1 select-none">
                    <LayoutGrid className="w-2.5 h-2.5" />
                    Col {idx + 1}
                    <span className="ml-auto text-gray-300">{col.widthRatio}fr</span>
                  </div>

                  <SortableContext items={col.components.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {col.components.map(comp => (
                        <SortableCompItem
                          key={comp.id}
                          comp={comp}
                          colId={col.id}
                          isSelected={isColActive && selectedComponentId === comp.id}
                          onSelect={() => onSelectRowComponent?.(col.id, comp.id)}
                          onDuplicate={() => duplicateComponent(col.id, comp.id)}
                          onDelete={() => deleteComponent(col.id, comp.id)}
                          onCopy={onCopyComponent ? () => onCopyComponent(comp) : undefined}
                          onToggleHide={onToggleRowComponentHide ? () => onToggleRowComponentHide(col.id, comp.id) : undefined}
                          settings={settings}
                        />
                      ))}
                    </div>
                  </SortableContext>

                  {col.components.length === 0 && (
                    <p className="text-gray-400 text-[10px] text-center py-3 italic">Empty column</p>
                  )}

                  <div className="mt-1.5 space-y-1">
                    <div className="relative">
                      {showPickerForCol === col.id && (
                        <div className="absolute bottom-full left-0 mb-1 z-50">
                          <ComponentPicker
                            onAdd={type => addComponent(col.id, type)}
                            onClose={() => setShowPickerForCol(null)}
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setShowPickerForCol(showPickerForCol === col.id ? null : col.id);
                        }}
                        className="flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors w-full justify-center border border-dashed border-primary/30 rounded py-1 hover:border-primary/60"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    {copiedComponent && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); pasteComponent(col.id); }}
                        className="flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors w-full justify-center border border-dashed border-primary/20 rounded py-1 hover:border-primary/50 bg-primary/5"
                      >
                        <ClipboardPaste className="w-3 h-3" />
                        Paste {CONTENT_COMPONENT_TYPES.find(t => t.type === copiedComponent.type)?.label ?? copiedComponent.type}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DndContext>
      </div>
    </BlockStyleWrapper>
  );
}
