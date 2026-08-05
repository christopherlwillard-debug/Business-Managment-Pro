import { useState, useMemo } from "react";
import {
  useCreateEstimate, useUpdateJob, useGetSettings,
  Job, CreateEstimateRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  X, ChevronLeft, ChevronRight, Wand2, AlertTriangle, Info,
  ChevronDown, ChevronUp, Check, Plus, Minus, GripVertical,
  ClipboardCopy, ClipboardCheck, FileText, Mail,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalcDefaults {
  plumbing: { baseCharge: number; dropRate: number };
  flooring: { labor: Record<string, number>; full: Record<string, number>; minimumCharge: number };
  trim: { laborRate: number };
  siding: { laborRate: number };
  drywall: { laborRate: number };
  punchList: { halfDayPrice: number; fullDayPrice: number; helperDayRate: number };
}

const DEFAULT_CALC: CalcDefaults = {
  plumbing: { baseCharge: 1000, dropRate: 125 },
  flooring: {
    labor: { Carpet: 4.50, Laminate: 4.50, LVP: 4.50, Hardwood: 4.50, Tile: 6.00 },
    full:  { Carpet: 5.00, Laminate: 6.50, LVP: 7.00, Hardwood: 11.50, Tile: 13.50 },
    minimumCharge: 500,
  },
  trim:    { laborRate: 5.50 },
  siding:  { laborRate: 2.00 },
  drywall: { laborRate: 2.50 },
  punchList: { halfDayPrice: 500, fullDayPrice: 1000, helperDayRate: 275 },
};

function resolveCalcDefaults(raw: Record<string, unknown> | null | undefined): CalcDefaults {
  const d = DEFAULT_CALC;
  if (!raw) return d;
  const pl = (raw.plumbing ?? {}) as Record<string, number>;
  const fl = (raw.flooring ?? {}) as Record<string, unknown>;
  const tr = (raw.trim ?? {}) as Record<string, number>;
  const si = (raw.siding ?? {}) as Record<string, number>;
  const dr = (raw.drywall ?? {}) as Record<string, number>;
  const pu = (raw.punchList ?? {}) as Record<string, number>;
  return {
    plumbing: { baseCharge: pl.baseCharge ?? d.plumbing.baseCharge, dropRate: pl.dropRate ?? d.plumbing.dropRate },
    flooring: {
      labor: { ...d.flooring.labor, ...((fl.labor ?? {}) as Record<string, number>) },
      full:  { ...d.flooring.full,  ...((fl.full ?? {}) as Record<string, number>) },
      minimumCharge: (fl.minimumCharge as number) ?? d.flooring.minimumCharge,
    },
    trim:    { laborRate: tr.laborRate ?? d.trim.laborRate },
    siding:  { laborRate: si.laborRate ?? d.siding.laborRate },
    drywall: { laborRate: dr.laborRate ?? d.drywall.laborRate },
    punchList: {
      halfDayPrice:  pu.halfDayPrice  ?? d.punchList.halfDayPrice,
      fullDayPrice:  pu.fullDayPrice  ?? d.punchList.fullDayPrice,
      helperDayRate: pu.helperDayRate ?? d.punchList.helperDayRate,
    },
  };
}

interface Question {
  id: string;
  label: string;
  type: "number" | "select" | "boolean";
  options?: { value: string; label: string }[];
  unit?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  condition?: (answers: Answers) => boolean;
}

type Answers = Record<string, string | number | boolean>;

interface TradeItem {
  id: string;
  trade: string;
  description: string;
  qty: number;
  unit: string;
  lowCost: number;
  midCost: number;
  highCost: number;
  selectedCost: number;
  category: "Labor" | "Material" | "Subcontractor";
  tips: string[];
  riskNote?: string;
}

interface RiskFlag { level: "warn" | "info"; message: string }

interface PropertyData {
  address: string;
  yearBuilt: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  stories: number | null;
  propertyType: string | null;
  preLeadPaint: boolean;
  confidence: "high" | "medium" | "low";
  note: string;
}

// ─── Job Types ────────────────────────────────────────────────────────────────

const JOB_TYPES = [
  { id: "full_remodel",    label: "Full Remodel",            icon: "🏠", desc: "Full interior gut and renovation" },
  { id: "water_damage",    label: "Water Damage Restore",    icon: "💧", desc: "Leak, flood, or moisture — demo through finish" },
  { id: "fire_restoration",label: "Fire Restoration",        icon: "🔥", desc: "Smoke, soot, and structural fire repair" },
  { id: "kitchen",         label: "Kitchen Remodel",         icon: "🍳", desc: "Cabinets, countertops, flooring, plumbing" },
  { id: "bathroom",        label: "Bathroom Remodel",        icon: "🚿", desc: "Tile, fixtures, plumbing, vanity" },
  { id: "basement",        label: "Basement Finish",         icon: "⬇️", desc: "Frame, insulate, drywall, electrical, floor" },
  { id: "roofing",         label: "Roofing",                 icon: "🏚️", desc: "Full replace, recover, or repair" },
  { id: "siding",          label: "Siding",                  icon: "🏗️", desc: "Vinyl, fiber cement, or wood siding" },
  { id: "deck",            label: "Deck / Porch",            icon: "🪵", desc: "New deck or porch build-out" },
  { id: "windows_doors",   label: "Window/Door Replacement", icon: "🪟", desc: "Remove and replace windows and doors" },
  { id: "addition",        label: "Addition",                icon: "📐", desc: "New room or structure added to home" },
  { id: "ceiling_repair",  label: "Ceiling Repair",          icon: "🔨", desc: "Popcorn removal, cracks, skim coat" },
  { id: "plumbing",        label: "Plumbing Hookup",         icon: "🔧", desc: "Fixtures, rough-in, service connection" },
  { id: "manufactured_home",label: "Manufactured Home",      icon: "🏡", desc: "Uses your agreed-upon rates from Settings" },
  { id: "other",           label: "Other",                   icon: "⚒️", desc: "Custom or mixed-scope project" },
];

// ─── Scope Questions ──────────────────────────────────────────────────────────

const SCOPE_QUESTIONS: Record<string, Question[]> = {
  manufactured_home: [
    { id: "sqft",           label: "Floor area to work on (SF)",             type: "number", unit: "SF",   placeholder: "1000", defaultValue: 1000 },
    { id: "flooring_type",  label: "Flooring (supply + install)",            type: "select", options: [{ value: "LVP", label: "LVP / Vinyl Plank" }, { value: "Carpet", label: "Carpet" }, { value: "Laminate", label: "Laminate" }, { value: "Tile", label: "Tile" }, { value: "Hardwood", label: "Hardwood" }, { value: "none", label: "No flooring" }], defaultValue: "LVP" },
    { id: "plumbing_drops", label: "Plumbing hookups (sinks, toilets, etc.)", type: "number", unit: "drops", placeholder: "3", defaultValue: 3 },
    { id: "include_trim",   label: "Trim work included?",                   type: "boolean", defaultValue: true },
    { id: "trim_lf",        label: "Trim linear feet",                      type: "number", unit: "LF", placeholder: "200", defaultValue: 200, condition: (a) => a.include_trim === true },
    { id: "include_siding", label: "Exterior siding included?",             type: "boolean", defaultValue: false },
    { id: "siding_sf",      label: "Siding wall area (SF)",                 type: "number", unit: "SF", placeholder: "800", defaultValue: 800, condition: (a) => a.include_siding === true },
    { id: "include_drywall",label: "Drywall / wall panel work included?",   type: "boolean", defaultValue: false },
    { id: "drywall_sf",     label: "Drywall area (SF)",                     type: "number", unit: "SF", placeholder: "1000", defaultValue: 1000, condition: (a) => a.include_drywall === true },
  ],
  kitchen: [
    { id: "sqft",       label: "Kitchen floor area (SF)",         type: "number", unit: "SF",  placeholder: "120", defaultValue: 120 },
    { id: "scope",      label: "Scope of work",                   type: "select", options: [{ value: "full_gut", label: "Full gut & rebuild" }, { value: "cosmetic", label: "Cosmetic update (cabinets/counters/floor)" }], defaultValue: "full_gut" },
    { id: "cabinet_lf", label: "New cabinets — linear feet (0 = none)", type: "number", unit: "LF", placeholder: "20", defaultValue: 20 },
    { id: "countertop", label: "Countertop material",             type: "select", options: [{ value: "laminate", label: "Laminate" }, { value: "quartz", label: "Quartz" }, { value: "granite", label: "Granite" }, { value: "none", label: "None" }], defaultValue: "quartz" },
    { id: "flooring",   label: "Flooring type",                   type: "select", options: [{ value: "lvp", label: "LVP / Vinyl plank" }, { value: "tile", label: "Tile" }, { value: "hardwood", label: "Hardwood" }, { value: "existing", label: "Keep existing" }], defaultValue: "lvp" },
    { id: "plumbing",   label: "Plumbing work needed",            type: "select", options: [{ value: "none", label: "None" }, { value: "hookup", label: "Connect existing rough-in" }, { value: "relocate", label: "Relocate / new rough-in" }], defaultValue: "hookup" },
    { id: "electrical", label: "Electrical work needed",          type: "select", options: [{ value: "none", label: "None" }, { value: "outlets", label: "New outlets/GFCI only" }, { value: "circuits", label: "New circuits (circuits = count)" }], defaultValue: "outlets" },
  ],
  bathroom: [
    { id: "sqft",       label: "Bathroom floor area (SF)",        type: "number", unit: "SF",  placeholder: "60", defaultValue: 60 },
    { id: "scope",      label: "Scope of work",                   type: "select", options: [{ value: "full_gut", label: "Full gut & rebuild" }, { value: "cosmetic", label: "Cosmetic (fixtures/paint)" }], defaultValue: "full_gut" },
    { id: "shower_sf",  label: "Tile shower/tub surround (SF, 0 = prefab/none)", type: "number", unit: "SF", placeholder: "60", defaultValue: 60 },
    { id: "floor_type", label: "Floor type",                      type: "select", options: [{ value: "tile", label: "Tile" }, { value: "lvp", label: "LVP" }, { value: "existing", label: "Keep existing" }], defaultValue: "tile" },
    { id: "new_toilet", label: "New toilet?",                     type: "boolean", defaultValue: true },
    { id: "new_vanity", label: "New vanity?",                     type: "boolean", defaultValue: true },
  ],
  siding: [
    { id: "wall_sf",    label: "Wall surface area (SF)",          type: "number", unit: "SF",  placeholder: "1200", defaultValue: 1200 },
    { id: "type",       label: "Siding type",                     type: "select", options: [{ value: "vinyl", label: "Vinyl" }, { value: "fiber_cement", label: "Fiber cement (HardiePlank)" }, { value: "wood", label: "Wood / T1-11" }], defaultValue: "vinyl" },
    { id: "tearoff",    label: "Remove existing siding first?",   type: "boolean", defaultValue: true },
    { id: "trim",       label: "Trim & corner boards included?",  type: "boolean", defaultValue: true },
  ],
  ceiling_repair: [
    { id: "sqft",       label: "Ceiling area (SF)",               type: "number", unit: "SF",  placeholder: "400", defaultValue: 400 },
    { id: "popcorn",    label: "Remove popcorn / existing texture?", type: "boolean", defaultValue: true },
    { id: "cracks",     label: "Number of cracks to repair",      type: "number", unit: "cracks", placeholder: "4", defaultValue: 4 },
    { id: "repaint",    label: "Repaint ceiling after?",          type: "boolean", defaultValue: true },
  ],
  plumbing: [
    { id: "fixtures",   label: "Number of fixtures (sinks/toilets/etc.)", type: "number", unit: "each", placeholder: "3", defaultValue: 3 },
    { id: "scope",      label: "Type of work",                    type: "select", options: [{ value: "rough_in", label: "New rough-in" }, { value: "connect", label: "Connect to existing" }, { value: "relocate", label: "Relocate lines" }], defaultValue: "rough_in" },
    { id: "trench",     label: "Trenching needed?",               type: "boolean", defaultValue: false },
    { id: "trench_lf",  label: "Trench length (LF)",              type: "number", unit: "LF", placeholder: "40", defaultValue: 40, condition: (a) => a.trench === true },
  ],
  deck: [
    { id: "sqft",       label: "Deck area (SF)",                  type: "number", unit: "SF",  placeholder: "300", defaultValue: 300 },
    { id: "material",   label: "Decking material",                type: "select", options: [{ value: "pt_wood", label: "Pressure-treated wood" }, { value: "composite", label: "Composite (Trex/etc.)" }, { value: "cedar", label: "Cedar" }], defaultValue: "pt_wood" },
    { id: "railing_lf", label: "Railing length (LF, 0 = none)",  type: "number", unit: "LF", placeholder: "50", defaultValue: 50 },
    { id: "stairs",     label: "Number of stair flights",         type: "number", unit: "flights", placeholder: "1", defaultValue: 1 },
  ],
  windows_doors: [
    { id: "windows",    label: "Number of windows",               type: "number", unit: "windows", placeholder: "6", defaultValue: 6 },
    { id: "doors",      label: "Number of doors",                 type: "number", unit: "doors",   placeholder: "2", defaultValue: 2 },
    { id: "headers",    label: "New structural headers needed?",  type: "boolean", defaultValue: false },
    { id: "int_trim",   label: "Interior trim / casing included?", type: "boolean", defaultValue: true },
  ],
  full_remodel: [
    { id: "sqft",        label: "Total remodel area (SF)",        type: "number", unit: "SF",    placeholder: "1000", defaultValue: 1000 },
    { id: "scope_depth", label: "Scope / depth of work",          type: "select", options: [{ value: "cosmetic", label: "Cosmetic — paint, flooring, trim only" }, { value: "partial", label: "Partial — selective demo, drywall patches, update finishes" }, { value: "full_gut", label: "Full Gut — down to studs, full mechanical refresh" }, { value: "insurance", label: "Insurance Restoration — full gut with moisture/mold remediation" }], defaultValue: "full_gut" },
    { id: "wet_rooms",   label: "Number of wet rooms (kitchens + baths)", type: "number", unit: "rooms", placeholder: "2", defaultValue: 2, condition: (a) => a.scope_depth !== "cosmetic" },
    { id: "flooring",    label: "Flooring type",                  type: "select", options: [{ value: "lvp", label: "LVP throughout" }, { value: "carpet", label: "Carpet in bedrooms, LVP elsewhere" }, { value: "tile", label: "Tile" }], defaultValue: "lvp" },
    { id: "structural",  label: "Structural changes (walls moved)?", type: "boolean", defaultValue: false, condition: (a) => a.scope_depth === "full_gut" || a.scope_depth === "insurance" },
  ],
  water_damage: [
    { id: "sqft",        label: "Affected area (SF)",             type: "number", unit: "SF",    placeholder: "800",  defaultValue: 800 },
    { id: "severity",    label: "Damage severity",                type: "select", options: [{ value: "minor", label: "Minor — wet drywall, no structural damage" }, { value: "moderate", label: "Moderate — subfloor + drywall affected, mold possible" }, { value: "severe", label: "Severe — full gut, confirmed mold, structural damage" }], defaultValue: "moderate" },
    { id: "mold",        label: "Mold confirmed or suspected?",   type: "boolean", defaultValue: false },
    { id: "subfloor",    label: "Subfloor damaged?",              type: "boolean", defaultValue: false, condition: (a) => a.severity !== "minor" },
    { id: "wet_rooms",   label: "Number of wet rooms affected",   type: "number", unit: "rooms", placeholder: "1", defaultValue: 1 },
    { id: "flooring",    label: "Replacement flooring type",      type: "select", options: [{ value: "lvp", label: "LVP (recommended for moisture resistance)" }, { value: "carpet", label: "Carpet" }, { value: "tile", label: "Tile" }], defaultValue: "lvp" },
  ],
  fire_restoration: [
    { id: "sqft",        label: "Affected area (SF)",             type: "number", unit: "SF",    placeholder: "1200", defaultValue: 1200 },
    { id: "severity",    label: "Fire / smoke damage severity",   type: "select", options: [{ value: "smoke_only", label: "Smoke/Soot Only — no structural damage" }, { value: "partial", label: "Partial — some structural damage, localized burn" }, { value: "full_gut", label: "Full Gut — extensive structural damage" }], defaultValue: "partial" },
    { id: "structural",  label: "Structural members (joists, studs) damaged?", type: "boolean", defaultValue: false },
    { id: "wet_rooms",   label: "Number of wet rooms affected",   type: "number", unit: "rooms", placeholder: "1", defaultValue: 1 },
    { id: "flooring",    label: "Replacement flooring type",      type: "select", options: [{ value: "lvp", label: "LVP" }, { value: "carpet", label: "Carpet" }, { value: "tile", label: "Tile" }], defaultValue: "lvp" },
  ],
  basement: [
    { id: "sqft",        label: "Basement area to finish (SF)",   type: "number", unit: "SF",    placeholder: "800",  defaultValue: 800 },
    { id: "scope",       label: "Finish scope",                   type: "select", options: [{ value: "full_finish", label: "Full finish — livable space (drywall, floor, elec, paint)" }, { value: "partial", label: "Partial — framing & utilities only" }, { value: "framing_only", label: "Framing only" }], defaultValue: "full_finish" },
    { id: "bathroom",    label: "Basement bathroom included?",    type: "boolean", defaultValue: false },
    { id: "egress",      label: "Egress window needed?",         type: "boolean", defaultValue: false },
    { id: "bar_area",    label: "Wet bar / kitchenette?",         type: "boolean", defaultValue: false },
  ],
  roofing: [
    { id: "sqft",        label: "Roof area (SF, or house footprint × 1.3)", type: "number", unit: "SF", placeholder: "1500", defaultValue: 1500 },
    { id: "scope",       label: "Scope of work",                  type: "select", options: [{ value: "full_replace", label: "Full replacement — tear off existing shingles" }, { value: "recover", label: "Recover — install over existing (1 layer max)" }, { value: "repair", label: "Repair — patch damaged sections only" }], defaultValue: "full_replace" },
    { id: "stories",     label: "Number of stories",              type: "select", options: [{ value: "1", label: "1 story" }, { value: "2", label: "2 stories" }], defaultValue: "1" },
    { id: "decking",     label: "Replace damaged roof decking (OSB)?", type: "boolean", defaultValue: false },
    { id: "gutters",     label: "Replace gutters?",               type: "boolean", defaultValue: false },
    { id: "gutter_lf",  label: "Gutter length (LF)",             type: "number", unit: "LF", placeholder: "120", defaultValue: 120, condition: (a) => a.gutters === true },
  ],
  addition: [
    { id: "sqft",       label: "Addition area (SF)",              type: "number", unit: "SF",  placeholder: "400", defaultValue: 400 },
    { id: "foundation", label: "Foundation type",                 type: "select", options: [{ value: "slab", label: "Concrete slab" }, { value: "crawl", label: "Crawl space" }, { value: "basement", label: "Basement" }], defaultValue: "slab" },
    { id: "wet_rooms",  label: "Wet rooms included (bath/kitchen)?", type: "number", unit: "rooms", placeholder: "1", defaultValue: 1 },
    { id: "mechanical", label: "Full mechanical (HVAC + electric + plumbing)?", type: "boolean", defaultValue: true },
  ],
  other: [
    { id: "sqft",        label: "Estimated area (SF, 0 if N/A)",  type: "number", unit: "SF",  placeholder: "0", defaultValue: 0 },
    { id: "labor_hours", label: "Estimated labor hours",          type: "number", unit: "hrs", placeholder: "40", defaultValue: 40 },
    { id: "materials",   label: "Estimated materials budget ($)", type: "number", unit: "$",   placeholder: "2000", defaultValue: 2000 },
  ],
};

// ─── Trade Item Computations ──────────────────────────────────────────────────

function n(a: Answers, key: string, fallback = 0): number {
  const v = a[key];
  if (typeof v === "number") return v;
  const p = parseFloat(String(v ?? fallback));
  return isNaN(p) ? fallback : p;
}

function computeTrades(jobType: string, answers: Answers, calcDefaults?: CalcDefaults): TradeItem[] {
  const items: TradeItem[] = [];
  let counter = 0;
  const add = (t: Omit<TradeItem, "id" | "selectedCost">) => {
    items.push({ ...t, id: String(counter++), selectedCost: t.midCost });
  };

  if (jobType === "manufactured_home") {
    const cd = calcDefaults ?? DEFAULT_CALC;
    const sqft = Math.max(n(answers, "sqft", 1000), 1);
    const flType = String(answers.flooring_type ?? "LVP");
    const drops = n(answers, "plumbing_drops", 0);
    const trimLf = n(answers, "trim_lf", 0);
    const sidingSf = n(answers, "siding_sf", 0);
    const drywallSf = n(answers, "drywall_sf", 0);

    if (flType !== "none") {
      const rate = cd.flooring.full[flType] ?? cd.flooring.full["LVP"] ?? 7.00;
      const minCharge = cd.flooring.minimumCharge;
      const rawTotal = sqft * rate;
      const effectiveQty = rawTotal < minCharge ? Math.ceil(minCharge / rate) : sqft;
      add({
        trade: "Flooring",
        description: `${flType} flooring — supply & install`,
        qty: effectiveQty,
        unit: "SF",
        lowCost: rate,
        midCost: rate,
        highCost: rate,
        category: "Subcontractor",
        tips: ["Your agreed-upon rate from Settings", "Confirm subfloor is level and prepped before install", "Add 10% overage to material order"],
      });
    }

    if (drops > 0) {
      const plumbing = cd.plumbing;
      const extraDrops = Math.max(drops - 2, 0);
      const totalPlumbing = plumbing.baseCharge + extraDrops * plumbing.dropRate;
      add({
        trade: "Plumbing",
        description: `Plumbing hookup — ${drops} drop${drops !== 1 ? "s" : ""}`,
        qty: 1,
        unit: "LOT",
        lowCost: totalPlumbing,
        midCost: totalPlumbing,
        highCost: totalPlumbing,
        category: "Subcontractor",
        tips: [
          "Your agreed-upon rate from Settings",
          `Base charge covers first 2 drops; ${extraDrops > 0 ? `${extraDrops} extra drop${extraDrops !== 1 ? "s" : ""} at $${plumbing.dropRate}/drop` : "no extra drops"}`,
          "Get permit for rough-in work",
        ],
      });
    }

    if (answers.include_trim === true && trimLf > 0) {
      const rate = cd.trim.laborRate;
      add({
        trade: "Trim",
        description: "Baseboard, casing & interior trim — labor",
        qty: trimLf,
        unit: "LF",
        lowCost: rate,
        midCost: rate,
        highCost: rate,
        category: "Labor",
        tips: ["Your agreed-upon rate from Settings", "Confirm material is pre-purchased or include in separate line item", "Caulk all trim before paint"],
      });
    }

    if (answers.include_siding === true && sidingSf > 0) {
      const rate = cd.siding.laborRate;
      add({
        trade: "Siding",
        description: "Exterior siding — labor install",
        qty: sidingSf,
        unit: "SF",
        lowCost: rate,
        midCost: rate,
        highCost: rate,
        category: "Labor",
        tips: ["Your agreed-upon rate from Settings", "Confirm housewrap / vapor barrier is included", "Add material cost as a separate line if supplying"],
      });
    }

    if (answers.include_drywall === true && drywallSf > 0) {
      const rate = cd.drywall.laborRate;
      add({
        trade: "Drywall",
        description: "Drywall hang & finish — labor",
        qty: drywallSf,
        unit: "SF",
        lowCost: rate,
        midCost: rate,
        highCost: rate,
        category: "Labor",
        tips: ["Your agreed-upon rate from Settings", "Confirm tape, mud, and corner bead are included", "Sand before prime coat"],
      });
    }

    add({
      trade: "Cleanup",
      description: "Final cleanup & haul-off",
      qty: 1,
      unit: "LOT",
      lowCost: 200,
      midCost: 350,
      highCost: 550,
      category: "Labor",
      tips: [],
    });
  }

  else if (jobType === "kitchen") {
    const sf = Math.max(n(answers, "sqft", 120), 1);
    const cabLf = n(answers, "cabinet_lf", 0);
    const isGut = answers.scope === "full_gut";
    if (isGut) add({ trade: "Demo", description: "Kitchen demolition — gut & haul", qty: sf, unit: "SF", lowCost: 2, midCost: 2.50, highCost: 3.50, category: "Labor", tips: ["Ask if they include haul-away", "Confirm dumpster or trailer included"], riskNote: isGut ? "Full gut — confirm asbestos testing if home pre-1980" : undefined });
    if (answers.plumbing !== "none") add({ trade: "Plumbing", description: answers.plumbing === "relocate" ? "Plumbing rough-in & relocate" : "Plumbing hookup — connect existing rough-in", qty: 1, unit: "LOT", lowCost: 600, midCost: 1200, highCost: 2200, category: "Subcontractor", tips: ["Get permit if moving drain lines", "Confirm fixture count in quote"] });
    if (answers.electrical !== "none") add({ trade: "Electrical", description: answers.electrical === "circuits" ? "New circuits & panel work" : "GFCI outlets, under-cabinet lighting", qty: 1, unit: "LOT", lowCost: 400, midCost: 800, highCost: 1600, category: "Subcontractor", tips: ["KY requires permit for new circuits", "Ask if panel upgrade is needed"] });
    if (isGut) add({ trade: "Drywall", description: "Hang and finish drywall", qty: sf * 1.8, unit: "SF", lowCost: 2.75, midCost: 3.50, highCost: 4.50, category: "Labor", tips: ["Ask about texture match on patches", "Level-4 or level-5 finish for painted walls"] });
    if (cabLf > 0) add({ trade: "Cabinets", description: "Cabinet supply & install", qty: cabLf, unit: "LF", lowCost: 150, midCost: 250, highCost: 380, category: "Subcontractor", tips: ["Confirm upper + lower LF separately", "Ask about pull-out shelves, soft-close", "Semi-custom is 2-4 wk lead time in KY"] });
    const ctop = answers.countertop;
    if (ctop !== "none") {
      const lo = ctop === "laminate" ? 35 : ctop === "quartz" ? 80 : 95;
      const mid = ctop === "laminate" ? 55 : ctop === "quartz" ? 120 : 150;
      const hi = ctop === "laminate" ? 75 : ctop === "quartz" ? 165 : 220;
      add({ trade: "Countertops", description: `Countertop — ${ctop} supply & install`, qty: Math.max(cabLf, 12), unit: "LF", lowCost: lo, midCost: mid, highCost: hi, category: "Subcontractor", tips: ["Measure LF at 25\" depth for slab estimate", "Ask if backsplash is included", ctop === "quartz" ? "4–6 wk lead time common" : ""] });
    }
    if (answers.flooring !== "existing") {
      const type = answers.flooring;
      const lo = type === "tile" ? 7 : type === "hardwood" ? 7 : 3;
      const mid = type === "tile" ? 11 : type === "hardwood" ? 10 : 4.50;
      const hi = type === "tile" ? 16 : type === "hardwood" ? 14 : 6;
      add({ trade: "Flooring", description: `Flooring — ${type === "lvp" ? "LVP / vinyl plank" : type} install`, qty: sf, unit: "SF", lowCost: lo, midCost: mid, highCost: hi, category: "Subcontractor", tips: ["Confirm subfloor prep is included", "Ask about transitions/thresholds", "Add 10% material overage to SF quote"] });
    }
    add({ trade: "Paint", description: "Interior paint — walls, ceiling, trim", qty: sf * 1.5, unit: "SF", lowCost: 1.25, midCost: 1.80, highCost: 2.50, category: "Labor", tips: ["Confirm 2-coat finish", "Ask if primer coat is separate", "Pre-prime drywall before final paint"] });
    add({ trade: "Cleanup", description: "Final cleanup & haul-off", qty: 1, unit: "LOT", lowCost: 200, midCost: 350, highCost: 500, category: "Labor", tips: [] });
  }

  else if (jobType === "bathroom") {
    const sf = Math.max(n(answers, "sqft", 60), 1);
    const showerSf = n(answers, "shower_sf", 0);
    const isGut = answers.scope === "full_gut";
    if (isGut) add({ trade: "Demo", description: "Bathroom demolition — gut to studs", qty: sf, unit: "SF", lowCost: 3, midCost: 4, highCost: 5.50, category: "Labor", tips: ["Test for asbestos tile if pre-1980", "Confirm includes dumpster"], riskNote: "Full bath gut — check for hidden mold at shower walls" });
    add({ trade: "Plumbing", description: "Plumbing rough-in & fixture connections", qty: 1, unit: "LOT", lowCost: 500, midCost: 1000, highCost: 1800, category: "Subcontractor", tips: ["Get permit for rough-in work", "Confirm wax ring and supply lines included", "Ask about shower valve brand"] });
    add({ trade: "Electrical", description: "GFCI outlets, exhaust fan circuit", qty: 1, unit: "LOT", lowCost: 300, midCost: 550, highCost: 800, category: "Subcontractor", tips: ["KY code: GFCI within 6 ft of water", "Confirm exhaust fan vents to outside (not attic)"] });
    if (showerSf > 0) add({ trade: "Tile — Shower", description: "Tile shower / tub surround set & grout", qty: showerSf, unit: "SF", lowCost: 8, midCost: 12, highCost: 17, category: "Subcontractor", tips: ["Schluter/Kerdi waterproofing membrane strongly recommended", "Ask if they do the mud bed or use prefab pan", "Large-format tile adds cost"], riskNote: "Waterproofing membrane critical — cut-rate installs lead to callback rot issues" });
    if (answers.floor_type !== "existing") {
      const mid = answers.floor_type === "tile" ? 11 : 4.50;
      add({ trade: "Flooring", description: `Bathroom floor — ${answers.floor_type === "tile" ? "tile" : "LVP"} install`, qty: sf, unit: "SF", lowCost: mid * 0.7, midCost: mid, highCost: mid * 1.5, category: "Subcontractor", tips: ["Heated floor mats add $10-20/SF", "Non-slip tile recommended for bath floors"] });
    }
    if (isGut) add({ trade: "Drywall", description: "Cement board / moisture-resistant drywall", qty: sf * 2, unit: "SF", lowCost: 3, midCost: 4, highCost: 5, category: "Labor", tips: ["Use Hardiebacker or Schluter in wet areas", "Moisture-resistant drywall for non-wet walls"] });
    if (answers.new_vanity) add({ trade: "Vanity", description: "Vanity supply & install (includes top)", qty: 1, unit: "EACH", lowCost: 350, midCost: 600, highCost: 1200, category: "Labor", tips: ["Confirm includes faucet & P-trap", "Ask about medicine cabinet if needed"] });
    if (answers.new_toilet) add({ trade: "Toilet", description: "Toilet supply & install", qty: 1, unit: "EACH", lowCost: 250, midCost: 400, highCost: 650, category: "Labor", tips: ["Comfort height is preferred by most clients", "Elongated bowl vs. round — ask client"] });
    add({ trade: "Paint", description: "Bathroom paint — moisture-resistant paint", qty: 1, unit: "LOT", lowCost: 200, midCost: 375, highCost: 550, category: "Labor", tips: ["Use mold-resistant paint (Zinsser Perma-White, etc.)"] });
  }

  else if (jobType === "siding") {
    const sf = Math.max(n(answers, "wall_sf", 1200), 1);
    const type = String(answers.type ?? "vinyl");
    const loSid = type === "vinyl" ? 3.50 : type === "fiber_cement" ? 7 : 5;
    const midSid = type === "vinyl" ? 5.50 : type === "fiber_cement" ? 11 : 8;
    const hiSid = type === "vinyl" ? 8 : type === "fiber_cement" ? 16 : 12;
    if (answers.tearoff) add({ trade: "Tearoff", description: "Remove & haul existing siding", qty: sf, unit: "SF", lowCost: 0.50, midCost: 0.90, highCost: 1.50, category: "Labor", tips: ["Ask if multiple layers — adds cost", "Confirm dumpster included", "Check for asbestos siding on older homes"], riskNote: answers.tearoff ? "Older siding may contain asbestos — test before tearoff" : undefined });
    add({ trade: "Housewrap", description: "Install house wrap / vapor barrier", qty: sf, unit: "SF", lowCost: 0.25, midCost: 0.45, highCost: 0.70, category: "Labor", tips: ["Tyvek HomeWrap is KY standard", "Tape all seams — critical for air sealing"] });
    add({ trade: "Siding", description: `${type === "fiber_cement" ? "Fiber cement" : type === "vinyl" ? "Vinyl" : "Wood"} siding — supply & install`, qty: sf, unit: "SF", lowCost: loSid, midCost: midSid, highCost: hiSid, category: "Subcontractor", tips: ["Add 10% material waste factor", type === "fiber_cement" ? "HardiePlank: confirm factory-primed vs. unprimed" : "", "Ask about J-channel and soffit detail"], riskNote: type === "fiber_cement" ? "Fiber cement must be back-primed at all cuts before install" : undefined });
    if (answers.trim) add({ trade: "Trim & Corners", description: "Corner posts, J-channel, trim boards", qty: Math.sqrt(sf) * 4, unit: "LF", lowCost: 4, midCost: 6.50, highCost: 9, category: "Labor", tips: ["Match trim color to siding spec", "Caulk all penetrations before paint"] });
    add({ trade: "Cleanup", description: "Final cleanup & haul-off", qty: 1, unit: "LOT", lowCost: 200, midCost: 400, highCost: 650, category: "Labor", tips: [] });
  }

  else if (jobType === "ceiling_repair") {
    const sf = Math.max(n(answers, "sqft", 400), 1);
    const cracks = n(answers, "cracks", 0);
    if (answers.popcorn) add({ trade: "Scraping", description: "Popcorn / acoustic texture removal", qty: sf, unit: "SF", lowCost: 1, midCost: 1.50, highCost: 2.25, category: "Labor", tips: ["Wet scrape method protects drywall face", "Asbestos test recommended if pre-1978 home", "Protect floors — messy process"], riskNote: "Pre-1978 ceilings may have asbestos in texture — test first" });
    if (cracks > 0) add({ trade: "Crack Repair", description: `Crack repair & skim coat (${cracks} crack${cracks !== 1 ? "s" : ""})`, qty: cracks, unit: "EACH", lowCost: 75, midCost: 150, highCost: 275, category: "Labor", tips: ["Hairline cracks: mesh tape + two coats joint compound", "Structural cracks: look for cause before patching", "Wide cracks (>1/4\") need investigation"] });
    if (!answers.popcorn && sf > 0) add({ trade: "Skim Coat", description: "Full ceiling skim coat / level-4 finish", qty: sf, unit: "SF", lowCost: 1.50, midCost: 2.25, highCost: 3.25, category: "Labor", tips: ["Level-4 finish needed for flat/eggshell paint", "Two thin coats — sand between each", "Prime before final paint"] });
    if (answers.repaint) add({ trade: "Paint", description: "Ceiling paint — flat finish", qty: sf, unit: "SF", lowCost: 0.65, midCost: 1, highCost: 1.50, category: "Labor", tips: ["Flat white is standard ceiling finish in KY", "Two coats required on new drywall/skim", "Roll before brush on edges"] });
    add({ trade: "Cleanup", description: "Dust cleanup & disposal", qty: 1, unit: "LOT", lowCost: 100, midCost: 200, highCost: 350, category: "Labor", tips: [] });
  }

  else if (jobType === "plumbing") {
    const fixtures = Math.max(n(answers, "fixtures", 3), 1);
    const isRoughIn = answers.scope === "rough_in";
    const isRelocate = answers.scope === "relocate";
    add({ trade: "Plumbing Labor", description: isRoughIn ? "Plumbing rough-in per fixture" : "Fixture connection & hookup", qty: fixtures, unit: "EACH", lowCost: isRoughIn ? 400 : 150, midCost: isRoughIn ? 600 : 250, highCost: isRoughIn ? 900 : 400, category: "Subcontractor", tips: ["Get permit for rough-in work", "Confirm inspection fee included", "Ask about pressure test before drywall close-in"], riskNote: isRoughIn ? "Permit required for new rough-in in KY — factor into timeline" : undefined });
    if (isRelocate || isRoughIn) add({ trade: "Materials", description: "PEX/PVC supply & drain materials", qty: fixtures, unit: "EACH", lowCost: 100, midCost: 175, highCost: 300, category: "Material", tips: ["PEX is standard in KY new construction", "Confirm all fittings/valves included"] });
    if (answers.trench) {
      const lf = n(answers, "trench_lf", 40);
      add({ trade: "Trenching", description: "Trench dig & backfill for utility line", qty: lf, unit: "LF", lowCost: 18, midCost: 32, highCost: 55, category: "Labor", tips: ["Call 811 before any digging — required by KY law", "Rocky soil adds significant cost", "Confirm depth to frost line (varies 12-18\" in KY)"], riskNote: "Call 811 (Dig Safe) before trenching — mandatory in Kentucky" });
    }
  }

  else if (jobType === "deck") {
    const sf = Math.max(n(answers, "sqft", 300), 1);
    const material = String(answers.material ?? "pt_wood");
    const railingLf = n(answers, "railing_lf", 0);
    const stairs = n(answers, "stairs", 0);
    const footings = Math.ceil(sf / 64) + 2;
    add({ trade: "Footings", description: "Concrete pier footings (post holes)", qty: footings, unit: "EACH", lowCost: 175, midCost: 300, highCost: 450, category: "Labor", tips: ["KY frost depth: dig 12–18\" minimum", "Tube forms (Sonotube) are standard", "Confirm local code on footing diameter"] });
    add({ trade: "Framing", description: "Ledger, joists, beams, posts", qty: sf, unit: "SF", lowCost: 6, midCost: 9, highCost: 13, category: "Labor", tips: ["Ledger must lag into rim joist — use structural screws", "Joist hanger on every joist at ledger", "PT lumber — use #2 or better"], riskNote: "Ledger attachment to house is the most common failure point — use proper flashing" });
    const dkLo = material === "composite" ? 7 : material === "cedar" ? 5 : 3;
    const dkMid = material === "composite" ? 10 : material === "cedar" ? 7.50 : 4.50;
    const dkHi = material === "composite" ? 14 : material === "cedar" ? 11 : 6.50;
    add({ trade: "Decking", description: `${material === "composite" ? "Composite" : material === "cedar" ? "Cedar" : "PT wood"} decking — supply & install`, qty: sf, unit: "SF", lowCost: dkLo, midCost: dkMid, highCost: dkHi, category: "Labor", tips: [material === "composite" ? "Hidden fasteners add labor — include in quote" : "Face-screw PT is standard KY practice", "Add 10% waste to material order"] });
    if (railingLf > 0) add({ trade: "Railing", description: "Deck railing system — supply & install", qty: railingLf, unit: "LF", lowCost: 50, midCost: 85, highCost: 130, category: "Labor", tips: ["KY code: 36\" min rail height; 42\" if deck > 30\" AFF", "Balusters max 4\" on center", "Composite rail + aluminum balusters is popular"] });
    if (stairs > 0) add({ trade: "Stairs", description: "Deck stairs — framing & treads", qty: stairs, unit: "FLIGHT", lowCost: 450, midCost: 750, highCost: 1100, category: "Labor", tips: ["Confirm tread material matches deck", "7-3/4\" max riser height (KY code)", "Ask if handrail is included"] });
    add({ trade: "Cleanup", description: "Site cleanup & scrap haul", qty: 1, unit: "LOT", lowCost: 150, midCost: 275, highCost: 400, category: "Labor", tips: [] });
  }

  else if (jobType === "windows_doors") {
    const wins = n(answers, "windows", 0);
    const doors = n(answers, "doors", 0);
    if (wins > 0) add({ trade: "Window Install", description: "Window remove & replace", qty: wins, unit: "EACH", lowCost: 250, midCost: 425, highCost: 650, category: "Labor", tips: ["Confirm unit price includes labor only (client-supplied) or supply+install", "Flash all windows before reinstalling trim", "Ask about low-E coating spec"], riskNote: wins > 0 ? "Pre-1978 homes: EPA RRP lead paint rules apply to window work" : undefined });
    if (doors > 0) add({ trade: "Door Install", description: "Door remove & replace (per door)", qty: doors, unit: "EACH", lowCost: 150, midCost: 275, highCost: 450, category: "Labor", tips: ["Pre-hung vs. slab — pre-hung adds $80-150 labor", "Confirm hardware in scope", "Weatherstripping on exterior doors"] });
    if (answers.headers) add({ trade: "Structural Headers", description: "Header install / structural framing", qty: Math.max(wins + doors, 1), unit: "EACH", lowCost: 350, midCost: 600, highCost: 950, category: "Labor", tips: ["Engineered LVL beam is KY standard for load-bearing openings", "Confirm with structural engineer if removing load-bearing wall", "Permit required for structural work in most KY jurisdictions"], riskNote: "Structural header work requires building permit in most KY counties" });
    if (answers.int_trim) add({ trade: "Interior Trim", description: "Casing, sill, apron install", qty: wins + doors, unit: "EACH", lowCost: 75, midCost: 125, highCost: 200, category: "Labor", tips: ["Match existing profile if possible", "Paint-grade MDF casing is standard in KY spec homes", "Ask if caulk + paint included"] });
    add({ trade: "Caulk & Seal", description: "Interior/exterior caulk & seal", qty: 1, unit: "LOT", lowCost: 150, midCost: 250, highCost: 400, category: "Labor", tips: ["Use paintable silicone for exterior", "Backer rod for gaps > 1/2\""] });
  }

  else if (jobType === "full_remodel") {
    const sf = Math.max(n(answers, "sqft", 1000), 1);
    const wetRooms = n(answers, "wet_rooms", 0);
    const depth = String(answers.scope_depth ?? "full_gut");
    const isGut = depth === "full_gut" || depth === "insurance";
    const isPartial = depth === "partial";
    const isCosmetic = depth === "cosmetic";

    // ── Demo ────────────────────────────────────────────────────────────────────
    if (!isCosmetic) {
      add({ trade: "Demo", description: isGut ? "Full interior demo — gut to studs" : "Selective demo — cabinets, flooring, fixtures only", qty: sf, unit: "SF", lowCost: isGut ? 3 : 1.25, midCost: isGut ? 4.50 : 2, highCost: isGut ? 7 : 3.50, category: "Labor", tips: ["Asbestos / lead-paint test on pre-1978 homes before demo", "Stage dumpster close to access point", "Confirm haul-away included"], riskNote: isGut ? "Full gut — asbestos & lead testing strongly recommended on older homes" : undefined });
      add({ trade: "Dumpster", description: "Roll-off dumpster rental", qty: isGut ? 2 : 1, unit: "EACH", lowCost: 350, midCost: 550, highCost: 800, category: "Labor", tips: ["20-yard is standard for full-gut remodel", "Confirm allowed duration (usually 7–14 days)", "Driveway protection boards recommended"] });
    }

    // ── Insurance / water / mold extras ─────────────────────────────────────────
    if (depth === "insurance") {
      add({ trade: "Moisture Mitigation", description: "Industrial drying equipment & dehumidifiers", qty: sf, unit: "SF", lowCost: 1, midCost: 2, highCost: 3.50, category: "Subcontractor", tips: ["Requires certified water-damage remediation contractor", "Document with moisture readings before and after", "Insurance adjuster approval often required before starting"] });
      add({ trade: "Mold Remediation", description: "Mold testing, treatment & encapsulation", qty: sf, unit: "SF", lowCost: 3, midCost: 5, highCost: 9, category: "Subcontractor", tips: ["Licensed mold remediation contractor required", "Third-party clearance test after remediation", "Document with photos for insurance claim"] });
    }

    // ── Structural ───────────────────────────────────────────────────────────────
    if (answers.structural) add({ trade: "Structural", description: "Wall removal / structural modifications", qty: 1, unit: "LOT", lowCost: 3500, midCost: 7000, highCost: 15000, category: "Labor", tips: ["Engineering stamp required for beam sizing in KY", "Permit required — allow 2–6 weeks", "Temporary shoring critical during header install"], riskNote: "Structural work requires permit and engineer sign-off in Kentucky" });

    // ── Rough mechanical ─────────────────────────────────────────────────────────
    if (isGut && wetRooms > 0) add({ trade: "Rough Plumbing", description: "Plumbing rough-in for wet rooms", qty: wetRooms, unit: "ROOM", lowCost: 2500, midCost: 4000, highCost: 7500, category: "Subcontractor", tips: ["Permit required — factor 2–4 weeks for KY inspection", "Rough-in inspection before drywall close-in", "Confirm PEX spec and fixture count"] });
    if (isGut) add({ trade: "Rough Electrical", description: "New electrical rough-in", qty: sf, unit: "SF", lowCost: 4, midCost: 6.50, highCost: 10, category: "Subcontractor", tips: ["KY requires permit for new circuits", "AFCI breakers required in all habitable rooms (2023 NEC)", "Check panel capacity before starting"] });

    // ── Insulation + drywall ──────────────────────────────────────────────────────
    if (isGut) add({ trade: "Insulation", description: "Wall & ceiling insulation", qty: sf, unit: "SF", lowCost: 1.50, midCost: 2.50, highCost: 4, category: "Labor", tips: ["R-15 walls / R-38 ceiling is KY energy code minimum", "Spray foam at rim joists adds $500–800", "Confirm vapor barrier in crawl space"] });
    if (!isCosmetic) add({ trade: "Drywall", description: isGut ? "Hang, tape, finish drywall" : "Drywall patches — tape, mud, sand", qty: sf * (isGut ? 2.8 : 0.6), unit: "SF", lowCost: 2.50, midCost: 3.75, highCost: 5, category: "Labor", tips: ["Level-4 finish for smooth painted walls", "Ask about texture matching in partial renovations", "Sand between coats — no shortcuts on finish quality"] });

    // ── Flooring ─────────────────────────────────────────────────────────────────
    if (isGut && wetRooms > 0) add({ trade: "Subfloor Repair", description: "Subfloor leveling & damaged panel replacement", qty: sf * 0.20, unit: "SF", lowCost: 4, midCost: 6.50, highCost: 10, category: "Labor", tips: ["Check deflection spec — 3/4\" T&G OSB minimum", "Self-leveler in wet rooms before tile", "Screw (don't nail) panels to eliminate squeaks"] });
    const flType = answers.flooring;
    const flLo = flType === "tile" ? 7 : flType === "carpet" ? 2.50 : 3;
    const flMid = flType === "tile" ? 11 : flType === "carpet" ? 4 : 4.50;
    const flHi = flType === "tile" ? 16 : flType === "carpet" ? 6 : 6.50;
    add({ trade: "Flooring", description: `Flooring — ${flType === "lvp" ? "LVP throughout" : flType === "carpet" ? "Carpet in bedrooms, LVP elsewhere" : "Tile"}`, qty: sf, unit: "SF", lowCost: flLo, midCost: flMid, highCost: flHi, category: "Subcontractor", tips: ["Confirm subfloor prep in scope", "Add 10% waste allowance", "Transitions at doorways — confirm included"] });

    // ── Finishes ──────────────────────────────────────────────────────────────────
    add({ trade: "Paint", description: "Interior paint — walls, ceilings, trim", qty: sf * 1.8, unit: "SF", lowCost: 1.25, midCost: 1.80, highCost: 2.50, category: "Labor", tips: ["2 coats + primer on new drywall", "Caulk all trim/casings before final coat", "Cabinet paint is a separate scope — confirm with client"] });
    add({ trade: "Trim & Doors", description: "Baseboard, door casing, interior doors", qty: sf, unit: "SF", lowCost: 2, midCost: 3.25, highCost: 5, category: "Labor", tips: ["Pre-hung hollow-core is KY standard residential", "Paint-grade MDF casing is most economical", "Confirm door hardware allowance with client"] });
    add({ trade: "Cleanup", description: "Final punch & haul-off", qty: 1, unit: "LOT", lowCost: 400, midCost: 750, highCost: 1400, category: "Labor", tips: ["Walk-through punch list before final payment", "Document photo record at completion"] });
  }

  else if (jobType === "water_damage") {
    const sf = Math.max(n(answers, "sqft", 800), 1);
    const severity = String(answers.severity ?? "moderate");
    const hasMold = answers.mold === true;
    const subfloorDamaged = answers.subfloor === true || severity === "severe";
    const wetRooms = n(answers, "wet_rooms", 1);
    const flType = String(answers.flooring ?? "lvp");
    const isFullGut = severity === "severe";

    add({ trade: "Demo", description: isFullGut ? "Full demo — gut affected rooms to studs" : "Demo — remove damaged drywall, flooring, trim", qty: sf, unit: "SF", lowCost: isFullGut ? 3 : 1.50, midCost: isFullGut ? 4.50 : 2.25, highCost: isFullGut ? 7 : 3.50, category: "Labor", tips: ["Cut drywall 12–18\" above flood line minimum", "Document all damage with photos before demo", "Asbestos test if pre-1978 home"], riskNote: "Thoroughly document all damage with photos and moisture readings — critical for insurance claims" });
    add({ trade: "Dumpster", description: "Roll-off dumpster — debris removal", qty: isFullGut ? 2 : 1, unit: "EACH", lowCost: 350, midCost: 500, highCost: 750, category: "Labor", tips: ["Separate non-salvageable materials for adjuster review", "Keep itemized debris log for claim documentation"] });
    add({ trade: "Moisture Mitigation", description: "Industrial drying — air movers, dehumidifiers", qty: sf, unit: "SF", lowCost: 1, midCost: 1.75, highCost: 3.50, category: "Subcontractor", tips: ["Certified water-damage contractor (IICRC) recommended", "Minimum 3 days drying time — verify with moisture meter", "Insurance adjuster approval often required before proceeding", "Keep equipment logs for claim"], riskNote: "Do not close in walls until moisture readings reach acceptable levels — trapped moisture causes mold" });
    if (hasMold || severity !== "minor") add({ trade: "Mold Remediation", description: "Mold inspection, treatment & clearance test", qty: sf, unit: "SF", lowCost: hasMold ? 3 : 1, midCost: hasMold ? 5 : 2, highCost: hasMold ? 9 : 3, category: "Subcontractor", tips: ["Licensed mold contractor required", "Third-party clearance air test after remediation", "Encapsulate framing if mold is present on wood", "Photograph all mold areas for insurance"], riskNote: hasMold ? "Confirmed mold — licensed remediator required. Do not disturb without proper containment." : undefined });
    if (subfloorDamaged) add({ trade: "Subfloor Repair", description: "Remove & replace damaged subfloor panels", qty: sf * (severity === "severe" ? 0.60 : 0.30), unit: "SF", lowCost: 4.50, midCost: 7, highCost: 11, category: "Labor", tips: ["Replace full sheets — don't patch subfloor", "3/4\" T&G OSB is KY residential standard", "Use construction adhesive + screws (no nails)", "Self-leveler if floor has low spots"] });
    if (severity !== "minor") add({ trade: "Insulation", description: "Replace wet/damaged insulation", qty: sf, unit: "SF", lowCost: 1.25, midCost: 2, highCost: 3.50, category: "Labor", tips: ["Wet batt insulation must be discarded — cannot dry in place", "Closed-cell spray foam at rim joists if budget allows", "R-15 wall / R-38 ceiling minimum (KY code)"] });
    add({ trade: "Drywall", description: "Hang, tape, and finish replacement drywall", qty: sf * (isFullGut ? 2.8 : 1.6), unit: "SF", lowCost: 2.50, midCost: 3.75, highCost: 5.25, category: "Labor", tips: ["Moisture-resistant drywall in wet rooms", "Allow full cure before painting", "Level-4 finish for painted surfaces"] });
    if (wetRooms > 0 && isFullGut) add({ trade: "Plumbing Reconnect", description: "Reconnect plumbing fixtures in wet rooms", qty: wetRooms, unit: "ROOM", lowCost: 600, midCost: 1200, highCost: 2500, category: "Subcontractor", tips: ["Replace supply lines and shut-off valves while walls are open", "Check P-traps, wax rings, and supply connections", "Pressure test before closing walls"] });
    const flLo = flType === "tile" ? 7 : flType === "carpet" ? 2.50 : 3;
    const flMid = flType === "tile" ? 11 : flType === "carpet" ? 3.75 : 4.50;
    const flHi = flType === "tile" ? 16 : flType === "carpet" ? 5.50 : 6.50;
    add({ trade: "Flooring", description: `Replacement flooring — ${flType === "lvp" ? "LVP (moisture resistant)" : flType === "carpet" ? "Carpet" : "Tile"}`, qty: sf, unit: "SF", lowCost: flLo, midCost: flMid, highCost: flHi, category: "Subcontractor", tips: [flType === "lvp" ? "LVP is the best choice after water damage — waterproof core" : "", "Add 10% waste factor to material order", "Acclimate flooring 48 hrs before install"] });
    add({ trade: "Paint", description: "Interior paint — primer + 2 finish coats", qty: sf * 1.8, unit: "SF", lowCost: 1.25, midCost: 1.80, highCost: 2.50, category: "Labor", tips: ["Oil-based primer sealer on all repaired drywall before finish paint", "Mold-resistant paint (Zinsser Perma-White) in wet rooms", "2 finish coats minimum"] });
    add({ trade: "Trim & Doors", description: "Replace baseboard, casing, interior doors", qty: sf, unit: "SF", lowCost: 1.75, midCost: 3, highCost: 4.50, category: "Labor", tips: ["Check door frames for square — water damage warps frames", "Caulk all trim before paint", "Match existing profiles if available"] });
    add({ trade: "Cleanup", description: "Final punch, haul-off, and job-site cleaning", qty: 1, unit: "LOT", lowCost: 300, midCost: 600, highCost: 1000, category: "Labor", tips: ["Final moisture readings and documentation for insurance closeout", "Photo record at completion"] });
  }

  else if (jobType === "fire_restoration") {
    const sf = Math.max(n(answers, "sqft", 1200), 1);
    const severity = String(answers.severity ?? "partial");
    const structuralDamage = answers.structural === true || severity === "full_gut";
    const wetRooms = n(answers, "wet_rooms", 1);
    const flType = String(answers.flooring ?? "lvp");
    const isFullGut = severity === "full_gut";

    add({ trade: "Demo", description: isFullGut ? "Full structural demo — gut to studs" : "Demo — remove burnt/smoke-damaged materials", qty: sf, unit: "SF", lowCost: isFullGut ? 4 : 2, midCost: isFullGut ? 6 : 3.50, highCost: isFullGut ? 9 : 5.50, category: "Labor", tips: ["Structural engineer evaluation before demo on severe fires", "Asbestos test required if pre-1978", "Document all damage thoroughly with photos before any removal"], riskNote: "Fire damage — structural evaluation required before starting demo on walls or ceilings with visible char" });
    add({ trade: "Dumpster", description: "Roll-off dumpster — fire debris removal", qty: isFullGut ? 3 : 2, unit: "EACH", lowCost: 350, midCost: 550, highCost: 850, category: "Labor", tips: ["Fire debris is heavy — confirm weight limits with hauler", "Keep adjuster-approved salvage list before discarding anything", "Separate content vs. structural debris for claim"] });
    add({ trade: "Soot & Smoke Remediation", description: "HEPA vacuuming, soda blasting, ozone treatment", qty: sf, unit: "SF", lowCost: 3, midCost: 5.50, highCost: 9, category: "Subcontractor", tips: ["IICRC-certified fire remediation contractor required", "Ozone treatment for smoke odor — must vacate during treatment", "Ductwork cleaning critical — smoke travels through HVAC", "Third-party air-quality clearance test after remediation"], riskNote: "Smoke odor — if HVAC was running during fire, ductwork must be professionally cleaned or replaced" });
    add({ trade: "HVAC Ductwork Cleaning", description: "Full duct cleaning and odor treatment", qty: 1, unit: "LOT", lowCost: 500, midCost: 1200, highCost: 2500, category: "Subcontractor", tips: ["Smoke travels through entire duct system", "Replace filters and any visibly damaged flex duct", "Consider full replacement if duct is lined with fiberglass"] });
    if (structuralDamage) add({ trade: "Structural Repair", description: "Sister or replace fire-damaged framing members", qty: sf * (isFullGut ? 0.80 : 0.30), unit: "SF", lowCost: 6, midCost: 10, highCost: 18, category: "Labor", tips: ["Engineer to specify repair vs. replace decision on each member", "Char depth test: >50% section loss = replace", "LVL or LSL sister members for load-bearing locations", "Permit required — structural repairs need inspection"], riskNote: "Char on structural members — engineer assessment required before covering with drywall" });
    add({ trade: "Insulation", description: "Replace smoke/heat-damaged insulation", qty: sf, unit: "SF", lowCost: 1.50, midCost: 2.50, highCost: 4, category: "Labor", tips: ["Insulation absorbs smoke odor — all must be replaced", "Closed-cell spray foam option eliminates vapor barrier separately", "R-15 wall / R-38 ceiling (KY energy code)"] });
    add({ trade: "Drywall", description: "Hang, tape, and finish new drywall", qty: sf * (isFullGut ? 2.8 : 2), unit: "SF", lowCost: 2.50, midCost: 3.75, highCost: 5.25, category: "Labor", tips: ["Oil-based primer sealer required on framing before drywall", "Level-4 finish for painted walls", "Moisture-resistant board in wet rooms"] });
    if (wetRooms > 0) add({ trade: "Plumbing Reconnect", description: "Reconnect plumbing fixtures, supply lines, valves", qty: wetRooms, unit: "ROOM", lowCost: 800, midCost: 1500, highCost: 3000, category: "Subcontractor", tips: ["Plastic supply lines melt at fire temps — replace all", "Replace all shut-off valves while walls are open", "Check water heater and pressure relief valve"] });
    add({ trade: "Electrical Rough-In", description: "Replace fire-damaged wiring and devices", qty: sf, unit: "SF", lowCost: 5, midCost: 8, highCost: 13, category: "Subcontractor", tips: ["All wiring in fire area must be replaced — heat compromises insulation", "AFCI breakers required in all living spaces (2023 NEC)", "Panel inspection required after fire", "Permit required — KY requires licensed electrician"], riskNote: "Electrical — all wiring in affected areas must be replaced; heat-damaged insulation is a fire risk" });
    const flLo = flType === "tile" ? 7 : flType === "carpet" ? 2.50 : 3;
    const flMid = flType === "tile" ? 11 : flType === "carpet" ? 3.75 : 4.50;
    const flHi = flType === "tile" ? 16 : flType === "carpet" ? 5.50 : 6.50;
    add({ trade: "Flooring", description: `Replacement flooring — ${flType === "lvp" ? "LVP" : flType === "carpet" ? "Carpet" : "Tile"}`, qty: sf, unit: "SF", lowCost: flLo, midCost: flMid, highCost: flHi, category: "Subcontractor", tips: ["Confirm subfloor structural integrity before install", "Add 10% waste factor", "Allow subfloor to off-gas before floating floor install"] });
    add({ trade: "Paint", description: "Primer sealer + 2 finish coats — all surfaces", qty: sf * 1.8, unit: "SF", lowCost: 1.50, midCost: 2.25, highCost: 3.25, category: "Labor", tips: ["Oil-based or shellac sealer primer required on ALL surfaces — seals smoke odor", "Two finish coats minimum after sealer", "Zinsser BIN shellac primer is the gold standard for smoke sealing"] });
    add({ trade: "Trim & Doors", description: "Replace baseboard, casing, and interior doors", qty: sf, unit: "SF", lowCost: 2, midCost: 3.25, highCost: 5, category: "Labor", tips: ["Replace all trim and doors in affected area — smoke odor impossible to eliminate from wood", "Caulk all trim before final paint", "Confirm hardware allowance with client"] });
    add({ trade: "Cleanup", description: "Final cleaning, haul-off, and air-quality documentation", qty: 1, unit: "LOT", lowCost: 500, midCost: 1000, highCost: 2000, category: "Labor", tips: ["Professional cleaning with HEPA equipment after all trades complete", "Air quality clearance test recommended before client occupancy", "Photo record at completion for insurance closeout"] });
  }

  else if (jobType === "basement") {
    const sf = Math.max(n(answers, "sqft", 800), 1);
    const scope = String(answers.scope ?? "full_finish");
    const hasBath = answers.bathroom === true;
    const hasEgress = answers.egress === true;
    const hasBar = answers.bar_area === true;
    const isFull = scope === "full_finish";
    const hasWalls = scope !== "framing_only";

    add({ trade: "Framing", description: "Steel stud or PT wood framing — walls & soffits", qty: sf, unit: "SF", lowCost: 2.50, midCost: 4, highCost: 6.50, category: "Labor", tips: ["PT (pressure-treated) bottom plate required where in contact with concrete", "Steel stud is preferred — no rot, no warping", "Code minimum 7' clear ceiling height in livable space", "Frame around mechanical equipment with access panels"] });
    if (hasEgress) add({ trade: "Egress Window", description: "Egress window cut & install (per bedroom)", qty: 1, unit: "EACH", lowCost: 1800, midCost: 2800, highCost: 4500, category: "Subcontractor", tips: ["KY code: minimum 5.7 SF net clear opening for egress", "Concrete saw cut + window well required for below-grade install", "Permit required — egress is a life-safety item", "Waterproof window well cover recommended"], riskNote: "Egress window required if adding a basement bedroom — non-negotiable life safety code requirement in KY" });
    add({ trade: "Insulation", description: "Wall & rim joist insulation", qty: sf, unit: "SF", lowCost: 1.50, midCost: 2.50, highCost: 4.50, category: "Labor", tips: ["Closed-cell spray foam on rim joists is highly recommended", "Rigid foam board on concrete walls before framing (thermal break)", "R-13 batts in stud cavities minimum", "Vapor barrier on floor under LVP"] });
    add({ trade: "Rough Electrical", description: "Circuits, outlets, lighting rough-in", qty: sf, unit: "SF", lowCost: 4, midCost: 6.50, highCost: 10, category: "Subcontractor", tips: ["KY requires permit for new circuits", "AFCI breakers for all habitable basement rooms", "Plan recessed can layout before drywall", "Include dedicated circuit for sump pump"] });
    if (hasBath) add({ trade: "Rough Plumbing", description: "Basement bathroom rough-in", qty: 1, unit: "LOT", lowCost: 2500, midCost: 4500, highCost: 8000, category: "Subcontractor", tips: ["May require breaking concrete slab for drain rough-in", "Sewage ejector pump if below main drain line", "Permit required — plan 2–4 weeks for KY inspection", "Confirm: toilet, vanity, shower/tub scope"], riskNote: "Basement bathroom may require concrete saw cut for drain rough-in — confirm early, significant cost impact" });
    if (hasBar) add({ trade: "Wet Bar Rough-In", description: "Bar sink plumbing rough-in", qty: 1, unit: "LOT", lowCost: 800, midCost: 1500, highCost: 2800, category: "Subcontractor", tips: ["May require concrete cut for drain", "Include dedicated 20A circuit for appliances", "Confirm countertop / cabinet scope"] });
    if (hasWalls) {
      add({ trade: "Drywall", description: "Hang, tape, and finish basement drywall", qty: sf * 2.2, unit: "SF", lowCost: 2.50, midCost: 3.50, highCost: 5, category: "Labor", tips: ["Moisture-resistant drywall on all basement walls", "Level-4 finish for painted surfaces", "No drywall against concrete — always frame first"] });
      add({ trade: "Flooring", description: "LVP flooring — moisture-resistant", qty: sf, unit: "SF", lowCost: 3, midCost: 4.50, highCost: 6.50, category: "Subcontractor", tips: ["LVP with attached pad is the best basement choice — fully waterproof", "No glue-down hardwood below grade", "Acclimate material 48 hrs before install"] });
    }
    if (isFull) {
      add({ trade: "Paint", description: "Basement paint — walls & ceilings", qty: sf * 1.8, unit: "SF", lowCost: 1, midCost: 1.75, highCost: 2.50, category: "Labor", tips: ["Moisture-resistant paint on all basement walls", "Seal concrete floors before LVP if using adhesive", "2 finish coats on drywall"] });
      add({ trade: "Trim & Doors", description: "Baseboard, casing, and doors", qty: sf, unit: "SF", lowCost: 1.75, midCost: 3, highCost: 4.50, category: "Labor", tips: ["PVC baseboard recommended in basement — no rot or mold risk", "Caulk all trim before paint", "Pre-hung doors — confirm swing direction before ordering"] });
      if (hasBath) add({ trade: "Bathroom Finish", description: "Vanity, toilet, fixtures & tile finish", qty: 1, unit: "LOT", lowCost: 2500, midCost: 4500, highCost: 9000, category: "Labor", tips: ["Schluter waterproofing in any tile shower", "Non-slip tile on floor", "Add grab bar blocking in walls during framing"] });
    }
    add({ trade: "Cleanup", description: "Final cleanup & debris removal", qty: 1, unit: "LOT", lowCost: 200, midCost: 400, highCost: 700, category: "Labor", tips: ["Final inspection walk-through before client acceptance"] });
  }

  else if (jobType === "roofing") {
    const sf = Math.max(n(answers, "sqft", 1500), 1);
    const scope = String(answers.scope ?? "full_replace");
    const stories = String(answers.stories ?? "1");
    const storyMult = stories === "2" ? 1.25 : 1;
    const hasDeckingReplace = answers.decking === true;
    const hasGutters = answers.gutters === true;
    const gutterLf = n(answers, "gutter_lf", 120);
    const isRepair = scope === "repair";
    const isRecover = scope === "recover";

    if (scope === "full_replace") {
      add({ trade: "Tearoff", description: "Remove existing shingles — strip to decking", qty: sf, unit: "SF", lowCost: 1, midCost: 1.50, highCost: 2.25, category: "Labor", tips: ["Multiple layers? Add $0.35/SF per additional layer", "Dumpster or trailer for shingle disposal", "Protect landscaping & HVAC units before tearoff", "Inspect decking condition before loading new shingles"], riskNote: scope === "full_replace" ? "Inspect all decking after tearoff — don't load new shingles over soft spots" : undefined });
    }
    if (hasDeckingReplace) add({ trade: "Roof Decking Repair", description: "Replace damaged OSB / plywood sheathing", qty: sf * 0.15, unit: "SF", lowCost: 4, midCost: 6.50, highCost: 10, category: "Labor", tips: ["7/16\" or 1/2\" OSB is KY residential standard", "H-clips at unsupported edges", "Mark all damaged panels before tearoff for efficient workflow", "Factor in lead time if large area"] });
    if (!isRepair) {
      add({ trade: "Underlayment", description: "Synthetic underlayment or #30 felt", qty: sf, unit: "SF", lowCost: 0.35, midCost: 0.60, highCost: 0.90, category: "Labor", tips: ["Synthetic underlayment is far superior to felt in KY humidity", "Ice & water shield: first 3' from eave + all valleys (KY code)", "Overlap rows per manufacturer spec — typically 6\""] });
    }
    const shingLo = isRepair ? 5 : isRecover ? 3.50 : 4;
    const shingMid = isRepair ? 8 : isRecover ? 5.50 : 6;
    const shingHi = isRepair ? 14 : isRecover ? 8.50 : 10;
    const shingMult = storyMult;
    add({ trade: "Shingles", description: isRepair ? "Shingle repair / patch — match existing" : isRecover ? "Recover — new shingles over existing layer" : "30-year architectural shingles — supply & install", qty: sf, unit: "SF", lowCost: shingLo * shingMult, midCost: shingMid * shingMult, highCost: shingHi * shingMult, category: "Subcontractor", tips: ["30-year architectural (laminated) is KY residential standard", "Starter strip at eaves and rakes — do not skip", "Nail 6 nails per shingle in high-wind zones", stories === "2" ? "2-story: steeper pitch access adds 20–25% to labor" : ""] });
    if (!isRepair) {
      add({ trade: "Ridge, Hip & Flashing", description: "Ridge cap, hip shingles, step & counter flashing", qty: Math.sqrt(sf) * 6, unit: "LF", lowCost: 5, midCost: 9, highCost: 15, category: "Labor", tips: ["Pre-bent aluminum step flashing at all wall intersections", "Galvanized drip edge on all eaves and rakes", "Ridge cap — ventilated ridge cap (ridge vent) if attic venting needed"] });
    }
    add({ trade: "Ventilation", description: "Roof vents / soffit & ridge ventilation", qty: 1, unit: "LOT", lowCost: 300, midCost: 600, highCost: 1200, category: "Labor", tips: ["KY code: 1 SF net free vent area per 150 SF of attic floor", "Ridge vent + soffit vent is best system", "Power attic ventilators are secondary — prioritize passive venting"] });
    if (hasGutters) add({ trade: "Gutters", description: "Seamless aluminum gutters — supply & install", qty: gutterLf, unit: "LF", lowCost: 8, midCost: 14, highCost: 22, category: "Labor", tips: ["6\" K-style gutter for most KY homes", "Downspouts every 40 LF maximum", "Gutter guards add $4–12/LF — ask client", "Extend downspouts 4' from foundation minimum"] });
    add({ trade: "Cleanup", description: "Shingle cleanup — magnets, blow-off, haul", qty: 1, unit: "LOT", lowCost: 200, midCost: 400, highCost: 700, category: "Labor", tips: ["Magnetic sweeper for nail pickup — critical", "Walk entire perimeter twice", "Inspect driveway and landscaping for debris before leaving"] });
  }

  else if (jobType === "addition") {
    const sf = Math.max(n(answers, "sqft", 400), 1);
    const foundation = String(answers.foundation ?? "slab");
    const wetRooms = n(answers, "wet_rooms", 0);
    const hasMech = answers.mechanical === true;
    add({ trade: "Permit & Engineering", description: "Building permit + architectural/structural drawings", qty: 1, unit: "LOT", lowCost: 2500, midCost: 5000, highCost: 10000, category: "Subcontractor", tips: ["Budget 8–16 weeks for KY permit approval on additions", "Stamped structural drawings required", "Survey may be required to confirm setbacks"], riskNote: "Addition requires building permit in every KY jurisdiction — start permit process before breaking ground" });
    const fndLo = foundation === "basement" ? 35 : foundation === "crawl" ? 15 : 8;
    const fndMid = foundation === "basement" ? 55 : foundation === "crawl" ? 25 : 14;
    const fndHi = foundation === "basement" ? 80 : foundation === "crawl" ? 38 : 22;
    add({ trade: "Foundation", description: `${foundation === "slab" ? "Concrete slab" : foundation === "crawl" ? "Crawl space foundation" : "Basement excavation & walls"}`, qty: sf, unit: "SF", lowCost: fndLo, midCost: fndMid, highCost: fndHi, category: "Subcontractor", tips: ["KY frost line: 12–18\" — footings must go below", "Vapor barrier on slab critical in KY climate", foundation === "basement" ? "Waterproofing membrane required on below-grade walls" : ""] });
    add({ trade: "Framing", description: "Wall, floor, roof framing", qty: sf, unit: "SF", lowCost: 18, midCost: 28, highCost: 42, category: "Labor", tips: ["Engineered lumber (LVL/TJI) for long spans", "Tie into existing structure at proper shear points", "Inspect existing rim joist before tying in floor"] });
    add({ trade: "Roofing", description: "Roof framing, sheathing, shingles", qty: sf * 1.15, unit: "SF", lowCost: 5, midCost: 8, highCost: 13, category: "Subcontractor", tips: ["Match pitch to existing roof", "30-year architectural shingle is KY standard", "Flash at all wall/roof intersections"] });
    add({ trade: "Exterior Skin", description: "Windows, exterior doors, siding/wrap", qty: sf, unit: "SF", lowCost: 12, midCost: 20, highCost: 32, category: "Subcontractor", tips: ["Match siding to existing structure", "Window U-factor 0.30 or less for KY energy code", "Flash all windows per manufacturer spec"] });
    if (hasMech) {
      add({ trade: "HVAC", description: "HVAC ductwork extension or mini-split", qty: sf, unit: "SF", lowCost: 12, midCost: 20, highCost: 32, category: "Subcontractor", tips: ["Load calc required to size properly (Manual J)", "Mini-split easiest for additions", "KY requires HVAC permit"] });
      if (wetRooms > 0) add({ trade: "Plumbing", description: "Plumbing rough-in for addition wet rooms", qty: wetRooms, unit: "ROOM", lowCost: 3000, midCost: 5500, highCost: 10000, category: "Subcontractor", tips: ["Drain tie-in location is the most complex part", "May need to break slab for drain — budget extra", "Permit required"] });
      add({ trade: "Electrical", description: "Panel circuit additions + rough-in", qty: sf, unit: "SF", lowCost: 6, midCost: 10, highCost: 16, category: "Subcontractor", tips: ["Check panel capacity before starting", "AFCI/GFCI per 2023 NEC", "Permit required"] });
    }
    add({ trade: "Insulation + Drywall", description: "Insulation, drywall hang & finish", qty: sf * 2.5, unit: "SF", lowCost: 4, midCost: 6, highCost: 9, category: "Labor", tips: ["R-20 walls / R-49 ceiling for KY energy compliance", "Blower door test may be required", "Level-4 drywall finish for painted walls"] });
    add({ trade: "Flooring + Trim", description: "Flooring, base, doors, paint", qty: sf, unit: "SF", lowCost: 12, midCost: 20, highCost: 32, category: "Labor", tips: ["Match to existing home finishes unless full refresh", "Confirm transitions at doorways", "Final inspection before flooring"] });
  }

  else if (jobType === "other") {
    const hours = Math.max(n(answers, "labor_hours", 40), 1);
    const matBudget = n(answers, "materials", 2000);
    add({ trade: "Labor", description: "General labor — custom scope", qty: hours, unit: "HRS", lowCost: 45, midCost: 65, highCost: 90, category: "Labor", tips: ["Break scope into tasks for cleaner billing", "Document daily progress photos", "Get signed change orders for any scope creep"] });
    if (matBudget > 0) add({ trade: "Materials", description: "Materials / supply procurement", qty: 1, unit: "LOT", lowCost: matBudget * 0.85, midCost: matBudget, highCost: matBudget * 1.30, category: "Material", tips: ["Add 10–15% waste factor", "Confirm client approval before ordering special-order items", "Keep all receipts for T&M billing"] });
    add({ trade: "Cleanup", description: "Final cleanup & debris removal", qty: 1, unit: "LOT", lowCost: 150, midCost: 300, highCost: 500, category: "Labor", tips: [] });
  }

  return items;
}

// ─── Risk Flags ───────────────────────────────────────────────────────────────

function getRiskFlags(jobType: string, answers: Answers, yearBuilt?: number | null): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // Known year-built from property lookup — specific warnings
  if (yearBuilt !== null && yearBuilt !== undefined) {
    if (yearBuilt < 1978) {
      flags.push({ level: "warn", message: `Built in ${yearBuilt} — EPA RRP lead paint rules apply when disturbing painted surfaces. You must be RRP-certified or hire a certified subcontractor.` });
    }
    if (yearBuilt < 1980) {
      flags.push({ level: "warn", message: `Built in ${yearBuilt} — asbestos may be present in floor tiles, pipe wrap, insulation, and popcorn ceilings. Test before any demo (KY law requires testing before demolition of suspect materials).` });
    }
  } else {
    // Generic warnings when year unknown
    if (["kitchen", "bathroom", "full_remodel", "ceiling_repair", "siding", "water_damage", "fire_restoration"].includes(jobType)) {
      flags.push({ level: "info", message: "Pre-1980 home? Schedule asbestos inspection before demo — KY law requires testing before demolition of suspect materials." });
    }
    if (["windows_doors", "water_damage", "fire_restoration"].includes(jobType)) {
      flags.push({ level: "warn", message: "Pre-1978 home: EPA RRP lead paint rules apply. Must be RRP-certified or hire a certified sub for disturbing painted surfaces." });
    }
  }

  // Dig safe
  if (jobType === "plumbing" && answers.trench) {
    flags.push({ level: "warn", message: "Call 811 before any digging — Kentucky law requires contacting Dig Safe at least 2 business days before excavation." });
  }

  // Permit warnings
  if (["deck", "addition", "full_remodel", "basement", "roofing"].includes(jobType) || (jobType === "windows_doors" && answers.headers)) {
    flags.push({ level: "warn", message: "Permit likely required for this scope. Budget 2–8 weeks for KY permit approval. Do not start structural or rough-in work before permit is in hand." });
  }
  if (jobType === "basement" && answers.egress) {
    flags.push({ level: "warn", message: "Egress window is a life-safety requirement for any basement bedroom — non-negotiable in KY. Requires permit and inspection." });
  }

  // Ceiling popcorn
  if (jobType === "ceiling_repair" && answers.popcorn) {
    flags.push({ level: "warn", message: "Popcorn ceilings installed before 1978 may contain asbestos. Test before scraping — disturbing asbestos without proper controls is a KY EPA violation." });
  }

  // Water damage specific
  if (jobType === "water_damage") {
    flags.push({ level: "warn", message: "Do NOT close in walls or floors until moisture meter readings confirm materials are fully dry — trapped moisture leads to mold and callbacks." });
    if (answers.mold) flags.push({ level: "warn", message: "Confirmed mold: licensed mold remediation contractor required. Do not disturb mold without proper containment — IICRC S520 standard applies." });
    flags.push({ level: "info", message: "Document everything with photos and moisture readings before, during, and after — critical for insurance claims and liability protection." });
  }

  // Fire restoration specific
  if (jobType === "fire_restoration") {
    flags.push({ level: "warn", message: "Structural evaluation required before starting demo — char depth and load capacity must be confirmed by a structural engineer." });
    flags.push({ level: "warn", message: "All wiring in fire-affected areas must be replaced — heat compromises insulation even if wires look intact. Licensed electrician + permit required." });
    flags.push({ level: "info", message: "HVAC ductwork carries smoke throughout the house — full duct cleaning or replacement is required even in areas with no visible fire damage." });
  }

  // Full remodel scope-specific
  if (jobType === "full_remodel" && answers.structural) {
    flags.push({ level: "warn", message: "Structural work (wall removal): engineering stamp required for beam sizing in KY. Permit required — allow 2–6 weeks. Use temporary shoring before removing any load-bearing wall." });
  }
  if (jobType === "full_remodel" && answers.scope_depth === "insurance") {
    flags.push({ level: "warn", message: "Insurance restoration: get adjuster approval before starting work. Document all damage before any demo. Keep all receipts and daily labor logs for claim." });
  }

  return flags;
}

// ─── Phase Templates ──────────────────────────────────────────────────────────

const PHASE_TEMPLATES: Record<string, string[]> = {
  manufactured_home:  ["Site Prep & Delivery", "Plumbing Hookup", "Drywall / Wall Panels", "Flooring Install", "Trim & Doors", "Siding (if applicable)", "Paint & Touch-up", "Final Punch & Cleanup"],
  kitchen:            ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Drywall", "Cabinet Install", "Countertops", "Flooring", "Fixtures & Appliances", "Paint & Trim", "Final Punch"],
  bathroom:           ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Cement Board / Drywall", "Tile — Shower/Floor", "Vanity & Fixtures", "Paint", "Final Punch"],
  siding:             ["Tearoff & Disposal", "Housewrap", "Siding Install", "Trim & Corners", "Caulk & Seal", "Final Cleanup"],
  ceiling_repair:     ["Protect Floors & Furniture", "Popcorn Scrape", "Crack Repair", "Skim Coat & Sand", "Prime & Paint", "Final Cleanup"],
  plumbing:           ["Locate Tie-in Points", "Rough-in / Trench", "Inspection", "Fixtures Connect", "Pressure Test", "Cleanup"],
  deck:               ["Permit & Layout", "Footings & Posts", "Beam & Joist Framing", "Decking Install", "Railing & Stairs", "Seal / Stain", "Final Inspection"],
  windows_doors:      ["Order & Lead Time", "Remove Old Units", "Framing / Headers", "Install New Units", "Insulate & Seal", "Interior Trim & Casing", "Caulk, Paint & Touch-up"],
  full_remodel:       ["Demo & Haul", "Dumpster Set", "Rough Plumbing", "Rough Electrical", "Insulation", "Drywall Hang", "Drywall Finish", "Flooring", "Paint & Prime", "Trim & Doors", "Final Punch & Cleanup"],
  addition:           ["Permit & Survey", "Foundation / Footings", "Framing", "Roofing", "Windows & Exterior Doors", "Rough MEP (Mech/Elec/Plumb)", "Inspections", "Insulation", "Drywall", "Flooring", "Paint & Trim", "Final Inspection"],
  water_damage:       ["Document & Photograph Damage", "Demo — Remove Damaged Materials", "Dumpster & Haul-Off", "Moisture Mitigation (Drying Equipment)", "Mold Remediation (if needed)", "Subfloor Repair", "Insulation Replacement", "Drywall Hang & Finish", "Flooring Install", "Paint & Prime", "Trim & Doors", "Final Cleanup & Documentation"],
  fire_restoration:   ["Structural Engineer Evaluation", "Document & Photograph Damage", "Demo — Remove Damaged Materials", "Dumpster & Haul-Off", "Soot & Smoke Remediation", "HVAC Duct Cleaning", "Structural Repair (if needed)", "Insulation", "Rough Electrical", "Rough Plumbing (if needed)", "Drywall Hang & Finish", "Flooring", "Paint — Sealer + Finish Coats", "Trim & Doors", "Final Cleanup & Air-Quality Test"],
  basement:           ["Permit & Plan", "Egress Window (if needed)", "Framing — Walls & Soffits", "Rough Electrical", "Rough Plumbing (if bathroom)", "Insulation", "Drywall Hang", "Drywall Finish", "Flooring", "Paint", "Trim & Doors", "Bathroom Finish (if included)", "Final Punch & Inspection"],
  roofing:            ["Material Order & Staging", "Tearoff & Disposal", "Decking Repair (if needed)", "Underlayment & Ice Shield", "Shingle Install", "Ridge, Hip & Flashing", "Gutters (if included)", "Cleanup & Nail Sweep", "Final Inspection Walk"],
  other:              ["Scope & Materials Procurement", "Phase 1 Work", "Phase 2 Work", "Final Punch & Cleanup"],
};

// ─── KY Permit & Code Intelligence ───────────────────────────────────────────

type PermitStatus = "likely_required" | "may_be_required" | "not_required";

interface PermitDetail {
  permitName: string;
  status: PermitStatus;
  requiredReason: string;
  whoPullsPermit: string;
  estimatedFeeLow: number;
  estimatedFeeHigh: number;
  approvalTime: string;
  requiredInspections: string[];
  buildingDepartmentNotes: string;
}

// Rich permit cards per job type. Designed so county-specific data can later
// override these Kentucky defaults without changing the UI.
const KY_PERMITS: Record<string, PermitDetail[]> = {
  manufactured_home: [
    { permitName: "Manufactured Home Installation Permit", status: "likely_required", requiredReason: "KY requires an installation permit for manufactured homes in most counties to ensure proper tie-downs, utility connections, and site compliance.", whoPullsPermit: "General Contractor or Installer", estimatedFeeLow: 100, estimatedFeeHigh: 350, approvalTime: "1–5 business days", requiredInspections: ["Site Preparation", "Foundation / Tie-Down", "Utility Connections", "Final Inspection"], buildingDepartmentNotes: "Contact your county judge-executive's office or local building department. Some rural KY counties handle MH permits through the county courthouse rather than a building department." },
    { permitName: "Plumbing Permit", status: "likely_required", requiredReason: "Required for connecting the home to water supply and drain systems.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 50, estimatedFeeHigh: 175, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Final Plumbing"], buildingDepartmentNotes: "KY requires a licensed plumber to pull and pass the plumbing permit. Confirm whether water/sewer is public utility or private well/septic." },
    { permitName: "Electrical Permit", status: "likely_required", requiredReason: "Required for connecting the home to utility power and any circuit additions.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 50, estimatedFeeHigh: 150, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Electrical", "Service Entrance", "Final Electrical"], buildingDepartmentNotes: "Utility company (LG&E, Owen Electric, etc.) must inspect service entrance connection before power is turned on." },
  ],
  kitchen: [
    { permitName: "Building Permit", status: "may_be_required", requiredReason: "Required for full gut remodels or any structural change (wall removal, new openings). Cosmetic-only work (cabinet swap, paint, new appliances) typically does not require a permit.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 75, estimatedFeeHigh: 300, approvalTime: "1–5 business days", requiredInspections: ["Framing (if structural)", "Insulation (if applicable)", "Drywall (if applicable)", "Final Inspection"], buildingDepartmentNotes: "Most cosmetic kitchen remodels do not require a building permit in KY. If you are removing or adding walls, relocating plumbing, or adding new circuits, a permit is required." },
    { permitName: "Plumbing Permit", status: "may_be_required", requiredReason: "Required if relocating the sink drain, adding new plumbing rough-in, or moving supply lines.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 50, estimatedFeeHigh: 200, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Final Plumbing"], buildingDepartmentNotes: "Simply swapping a faucet or dishwasher does not require a permit. Relocating the sink drain or adding a new water line does." },
    { permitName: "Electrical Permit", status: "may_be_required", requiredReason: "Required for adding new circuits, GFCI outlets, or under-cabinet lighting circuits.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 50, estimatedFeeHigh: 175, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Electrical", "Final Electrical"], buildingDepartmentNotes: "Replacing an existing outlet in-kind does not require a permit. Adding a new circuit or moving an outlet does. AFCI/GFCI protection is required per 2023 NEC." },
  ],
  bathroom: [
    { permitName: "Building Permit", status: "likely_required", requiredReason: "Full bathroom remodels involving drywall, subfloor, or structural changes require a building permit in most KY jurisdictions.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "1–5 business days", requiredInspections: ["Framing / Waterproofing", "Rough MEP", "Insulation (if applicable)", "Final Inspection"], buildingDepartmentNotes: "Cosmetic bathroom work (new toilet, vanity swap, paint) generally does not need a permit. Full gut remodels typically do." },
    { permitName: "Plumbing Permit", status: "likely_required", requiredReason: "Required for any rough-in work, drain relocation, or new fixture additions.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 50, estimatedFeeHigh: 200, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Final Plumbing"], buildingDepartmentNotes: "Swapping a toilet or faucet without disturbing rough-in usually does not require a permit. Rough-in inspection must pass before walls are closed." },
    { permitName: "Electrical Permit", status: "likely_required", requiredReason: "GFCI protection and exhaust fan circuits require a permit in most KY counties.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 50, estimatedFeeHigh: 150, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Electrical", "Final Electrical"], buildingDepartmentNotes: "KY code requires GFCI protection on all outlets within 6 ft of a water source. Exhaust fan must vent to the exterior — not into the attic." },
  ],
  siding: [
    { permitName: "Building Permit", status: "may_be_required", requiredReason: "Re-siding is required in many KY counties, especially if sheathing or housewrap is being replaced. Some rural counties do not require it for like-for-like replacement.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "1–5 business days", requiredInspections: ["Sheathing / Housewrap", "Final Inspection"], buildingDepartmentNotes: "Verify with your local county building office before starting. HOA approval may also be required if the property is in a community with deed restrictions." },
  ],
  ceiling_repair: [
    { permitName: "Building Permit", status: "not_required", requiredReason: "Cosmetic ceiling repair (popcorn scrape, crack repair, paint) does not require a permit in KY.", whoPullsPermit: "N/A", estimatedFeeLow: 0, estimatedFeeHigh: 0, approvalTime: "N/A", requiredInspections: [], buildingDepartmentNotes: "No permit required for cosmetic ceiling work. If asbestos is confirmed, a licensed abatement contractor must be used and abatement may require notification to the KY Division of Air Quality." },
    { permitName: "Asbestos Abatement Permit", status: "may_be_required", requiredReason: "Required if popcorn ceiling tests positive for asbestos in a home built before 1978.", whoPullsPermit: "Licensed Asbestos Abatement Contractor", estimatedFeeLow: 0, estimatedFeeHigh: 100, approvalTime: "3–10 business days", requiredInspections: ["Pre-Abatement Survey", "Clearance Air Test"], buildingDepartmentNotes: "KY EPA and the Division of Air Quality regulate asbestos abatement. A licensed contractor must perform testing and removal. Do not disturb suspect material before testing." },
  ],
  plumbing: [
    { permitName: "Plumbing Permit", status: "likely_required", requiredReason: "KY law requires a permit for any new plumbing rough-in, line relocation, or new fixture connection beyond simple like-for-like swap.", whoPullsPermit: "Licensed KY Plumber (required)", estimatedFeeLow: 50, estimatedFeeHigh: 250, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Pressure Test", "Final Plumbing"], buildingDepartmentNotes: "Only a Kentucky-licensed plumber may pull a plumbing permit. Rough-in inspection must pass before any walls or floors are closed in. 811 Dig-Safe notification is required by law before any trenching." },
  ],
  deck: [
    { permitName: "Building Permit", status: "likely_required", requiredReason: "New decks and porches require a building permit in most KY counties. The permit ensures footings meet frost depth requirements and that railings and ledger attachment meet code.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 100, estimatedFeeHigh: 350, approvalTime: "3–10 business days", requiredInspections: ["Footing / Pier Inspection (before concrete)", "Framing Inspection", "Final Inspection"], buildingDepartmentNotes: "KY frost depth is 12–18\". Footings must extend below frost line. Ledger attachment to the house is the most common code failure — use proper lag screws and flashing." },
    { permitName: "Zoning / Setback Review", status: "likely_required", requiredReason: "Most KY jurisdictions require that decks meet minimum setback distances from property lines before a building permit is issued.", whoPullsPermit: "Property Owner (part of permit application)", estimatedFeeLow: 0, estimatedFeeHigh: 75, approvalTime: "Included with building permit", requiredInspections: [], buildingDepartmentNotes: "Verify property lines with your county assessor or a survey before submitting permit application. Setback requirements vary by zoning district." },
  ],
  windows_doors: [
    { permitName: "Building Permit", status: "may_be_required", requiredReason: "Like-for-like window and door replacement typically does not require a permit in most KY counties. A permit IS required if you are enlarging or adding openings, or installing structural headers.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "1–5 business days", requiredInspections: ["Framing / Header (if structural)", "Final Inspection"], buildingDepartmentNotes: "Pre-1978 homes: EPA RRP (Renovation, Repair, and Painting) rules apply if painted surfaces are disturbed. You must be RRP-certified or hire a certified subcontractor." },
  ],
  full_remodel: [
    { permitName: "Building Permit", status: "likely_required", requiredReason: "Full gut remodels require a building permit in most KY counties. Cosmetic-only work (paint, flooring, trim) typically does not.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 150, estimatedFeeHigh: 600, approvalTime: "3–10 business days", requiredInspections: ["Framing", "Rough MEP", "Insulation", "Drywall (in some counties)", "Final Inspection"], buildingDepartmentNotes: "Permit fees are often calculated as a percentage of project value. Verify with your local building office. Inspections must be scheduled in order — do not close in walls before rough-in inspection passes." },
    { permitName: "Plumbing Permit", status: "likely_required", requiredReason: "Required for rough-in, fixture relocation, or new plumbing additions.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Final Plumbing"], buildingDepartmentNotes: "Rough-in inspection must pass before walls are closed. Replace supply lines and shut-off valves while walls are open." },
    { permitName: "Electrical Permit", status: "likely_required", requiredReason: "Required for new circuits, panel work, or rewiring.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 75, estimatedFeeHigh: 300, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Electrical", "Final Electrical"], buildingDepartmentNotes: "AFCI breakers required in all habitable rooms per 2023 NEC. Check panel capacity before adding circuits." },
    { permitName: "Mechanical / HVAC Permit", status: "may_be_required", requiredReason: "Required if HVAC equipment, ductwork, or mechanical systems are being replaced or extended.", whoPullsPermit: "Licensed HVAC Contractor", estimatedFeeLow: 50, estimatedFeeHigh: 200, approvalTime: "1–3 business days", requiredInspections: ["Rough Mechanical", "Final Mechanical"], buildingDepartmentNotes: "Not required for cosmetic remodels that do not touch HVAC. Manual J load calculation may be required for equipment replacements." },
  ],
  water_damage: [
    { permitName: "Building Permit", status: "may_be_required", requiredReason: "Like-for-like restoration typically does not require a permit. However, if drywall is being replaced throughout or structural changes are made, some KY counties require a permit.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 75, estimatedFeeHigh: 300, approvalTime: "1–5 business days", requiredInspections: ["Framing (if structural)", "Final Inspection"], buildingDepartmentNotes: "Verify with your local building office. Insurance companies often require a permit record for restoration claims. Document everything with photos for the adjuster." },
    { permitName: "Plumbing Permit", status: "may_be_required", requiredReason: "Required if water lines, drain lines, or supply connections are relocated or replaced.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 50, estimatedFeeHigh: 200, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Pressure Test"], buildingDepartmentNotes: "Replace supply lines and shut-off valves while walls are open — this is best practice regardless of permit requirements." },
    { permitName: "Electrical Permit", status: "may_be_required", requiredReason: "Required if wiring, outlets, or circuits were damaged by water and need replacement.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 50, estimatedFeeHigh: 175, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Electrical", "Final Electrical"], buildingDepartmentNotes: "Inspect all wiring in the affected area — moisture compromises wire insulation and junction boxes over time." },
  ],
  fire_restoration: [
    { permitName: "Building Permit", status: "likely_required", requiredReason: "Fire restoration involving structural repair, drywall replacement, or mechanical replacement requires a building permit in most KY counties.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 150, estimatedFeeHigh: 600, approvalTime: "3–10 business days", requiredInspections: ["Structural / Framing", "Rough MEP", "Insulation", "Final Inspection"], buildingDepartmentNotes: "A structural engineer evaluation is typically required before the building department will issue a permit for fire-damaged structures. The engineer must certify framing is sound before walls close in." },
    { permitName: "Electrical Permit", status: "likely_required", requiredReason: "All wiring in fire-affected areas must be replaced — heat compromises insulation even if wires appear undamaged. A permit is required.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 100, estimatedFeeHigh: 400, approvalTime: "1–3 business days", requiredInspections: ["Rough Electrical", "Panel Inspection", "Final Electrical"], buildingDepartmentNotes: "The panel must be inspected by a licensed electrician after a fire. Breakers and bus bars may be compromised by heat even with no visible damage." },
    { permitName: "Plumbing Permit", status: "may_be_required", requiredReason: "Required if plumbing rough-in or supply lines were damaged and need replacement.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Plumbing", "Final Plumbing"], buildingDepartmentNotes: "Plastic supply lines can melt or deform at fire temperatures even without direct flame exposure. Replace all supply lines in the affected area." },
    { permitName: "Mechanical / HVAC Permit", status: "likely_required", requiredReason: "HVAC ductwork and equipment must be inspected and often replaced after fire. Smoke travels through the entire duct system.", whoPullsPermit: "Licensed HVAC Contractor", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "1–3 business days", requiredInspections: ["Rough Mechanical", "Final Mechanical"], buildingDepartmentNotes: "Do not operate the HVAC system after a fire until it has been professionally cleaned and inspected. Running it distributes smoke and soot throughout the home." },
  ],
  basement: [
    { permitName: "Building Permit", status: "likely_required", requiredReason: "Finishing a basement — framing, insulation, drywall, and adding living space — requires a building permit in most KY jurisdictions.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 100, estimatedFeeHigh: 400, approvalTime: "3–10 business days", requiredInspections: ["Framing", "Rough MEP", "Insulation", "Egress Window (if applicable)", "Final Inspection"], buildingDepartmentNotes: "7-foot minimum ceiling height is required for habitable basement space in KY. If adding a bedroom, an egress window is a non-negotiable life-safety requirement." },
    { permitName: "Electrical Permit", status: "likely_required", requiredReason: "New circuits for outlets, lighting, and appliances require a permit.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "Same day – 3 business days", requiredInspections: ["Rough Electrical", "Final Electrical"], buildingDepartmentNotes: "AFCI breakers required in all habitable basement rooms per 2023 NEC. Include a dedicated circuit for the sump pump — this is best practice in KY." },
    { permitName: "Plumbing Permit", status: "may_be_required", requiredReason: "Required if adding a bathroom, wet bar, or any new plumbing rough-in.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 75, estimatedFeeHigh: 300, approvalTime: "1–3 business days", requiredInspections: ["Rough Plumbing", "Slab (if concrete is cut)", "Final Plumbing"], buildingDepartmentNotes: "If the drain is below the main sewer line, a sewage ejector pump is required. Concrete slab cutting may be needed for drain rough-in — confirm early, as this has significant cost impact." },
    { permitName: "Egress Window Permit", status: "may_be_required", requiredReason: "An egress window is a life-safety requirement for any basement bedroom in KY. The window installation and concrete cut requires a permit.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 50, estimatedFeeHigh: 150, approvalTime: "1–3 business days", requiredInspections: ["Egress Opening", "Window Installation"], buildingDepartmentNotes: "KY code: minimum 5.7 SF net clear opening, minimum 24\" height, minimum 20\" width. A window well must be large enough to allow full egress. This is non-negotiable for occupancy." },
  ],
  roofing: [
    { permitName: "Building Permit", status: "may_be_required", requiredReason: "Most rural KY counties do not require a permit for like-for-like shingle replacement. However, Jefferson County (Louisville), Fayette County (Lexington), and some others do require permits for full replacements.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "1–5 business days", requiredInspections: ["Decking (if replaced)", "Final Inspection"], buildingDepartmentNotes: "Always verify with your specific county building office before starting. Some counties require a permit for full tear-offs but not for repairs. A permit ensures the work meets current code if the home is sold." },
    { permitName: "Structural Permit", status: "may_be_required", requiredReason: "Required if roof framing, trusses, or rafters are being replaced or repaired.", whoPullsPermit: "General Contractor", estimatedFeeLow: 100, estimatedFeeHigh: 350, approvalTime: "3–10 business days", requiredInspections: ["Framing / Truss Inspection", "Final Structural"], buildingDepartmentNotes: "Structural repairs require an engineer's assessment if trusses or rafters show significant damage. Do not cover structural framing before inspection." },
  ],
  addition: [
    { permitName: "Building Permit", status: "likely_required", requiredReason: "All residential additions require a building permit in Kentucky. This is non-negotiable.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 300, estimatedFeeHigh: 1200, approvalTime: "2–8 weeks (plan review required)", requiredInspections: ["Foundation / Footing", "Framing", "Rough MEP", "Insulation", "Drywall (some counties)", "Final Inspection"], buildingDepartmentNotes: "Stamped architectural and structural drawings are required. Budget 8–16 weeks for permit approval. A land survey may be required to verify setbacks. Do not break ground before permit is in hand." },
    { permitName: "Zoning / Setback Variance", status: "may_be_required", requiredReason: "An addition that does not meet required setbacks from property lines requires a variance from the local Board of Zoning Adjustment.", whoPullsPermit: "Property Owner", estimatedFeeLow: 100, estimatedFeeHigh: 500, approvalTime: "4–12 weeks (board hearing)", requiredInspections: [], buildingDepartmentNotes: "Variance hearings require neighbor notification and a public meeting. Allow extra time if a variance is needed — this can delay your start date significantly." },
    { permitName: "Plumbing Permit", status: "likely_required", requiredReason: "Required for all new plumbing rough-in in the addition.", whoPullsPermit: "Licensed KY Plumber", estimatedFeeLow: 100, estimatedFeeHigh: 400, approvalTime: "1–3 business days", requiredInspections: ["Rough Plumbing", "Final Plumbing"], buildingDepartmentNotes: "Tie-in to existing drain system location is the most complex part — confirm before starting framing." },
    { permitName: "Electrical Permit", status: "likely_required", requiredReason: "Required for all new electrical rough-in.", whoPullsPermit: "Licensed KY Electrician", estimatedFeeLow: 100, estimatedFeeHigh: 400, approvalTime: "1–3 business days", requiredInspections: ["Rough Electrical", "Final Electrical"], buildingDepartmentNotes: "Check panel capacity before starting. AFCI and GFCI per 2023 NEC. The addition may require a panel upgrade." },
    { permitName: "Mechanical / HVAC Permit", status: "likely_required", requiredReason: "Required for extending or installing HVAC systems in the addition.", whoPullsPermit: "Licensed HVAC Contractor", estimatedFeeLow: 75, estimatedFeeHigh: 250, approvalTime: "1–3 business days", requiredInspections: ["Rough Mechanical", "Final Mechanical"], buildingDepartmentNotes: "A Manual J load calculation is required for sizing. A mini-split is the easiest solution for additions. Certificate of Occupancy issued after all inspections pass." },
  ],
  other: [
    { permitName: "Building Permit", status: "may_be_required", requiredReason: "Permit requirements vary based on the specific scope of work.", whoPullsPermit: "General Contractor or Property Owner", estimatedFeeLow: 50, estimatedFeeHigh: 300, approvalTime: "1–5 business days", requiredInspections: ["Varies by scope"], buildingDepartmentNotes: "Always verify permit requirements with your local Kentucky county building office before starting any work. Requirements vary significantly by jurisdiction." },
  ],
};

// ─── Code Reminders per Job Type ──────────────────────────────────────────────

const CODE_REMINDERS: Record<string, Array<{ icon: string; text: string }>> = {
  kitchen: [
    { icon: "⚡", text: "GFCI protection required on all countertop outlets within 6 ft of sink (2023 NEC)" },
    { icon: "⚡", text: "AFCI breakers required on all kitchen circuits (2023 NEC)" },
    { icon: "⚡", text: "Dedicated 20A circuit required for refrigerator, microwave, and dishwasher" },
    { icon: "🔥", text: "Hood vent must exhaust to exterior — recirculating hoods don't meet code for new installs in most KY jurisdictions" },
    { icon: "💡", text: "Under-cabinet lighting adds dedicated circuit — plan before drywall" },
  ],
  bathroom: [
    { icon: "⚡", text: "GFCI protection required on ALL outlets within 6 ft of water source" },
    { icon: "💨", text: "Exhaust fan required — must vent to exterior, not into the attic" },
    { icon: "🚿", text: "Waterproof membrane required behind shower tile (Schluter Kerdi or equivalent)" },
    { icon: "🔲", text: "Tempered glass required for shower enclosures and any glass within 24\" of tub/shower" },
    { icon: "♿", text: "Blocking in walls during framing strongly recommended for future grab bar installation" },
  ],
  full_remodel: [
    { icon: "🔊", text: "Smoke detectors required in every bedroom, outside each sleeping area, and on every floor (including basement)" },
    { icon: "💨", text: "Carbon monoxide detector required within 15 ft of sleeping areas if gas appliances or attached garage" },
    { icon: "⚡", text: "AFCI breakers required in all habitable rooms, hallways, and closets (2023 NEC)" },
    { icon: "⚡", text: "GFCI required in bathrooms, kitchen, garage, basement, laundry, and outdoor locations" },
    { icon: "🏠", text: "Egress window required in every basement bedroom — minimum 5.7 SF net clear opening" },
    { icon: "🌡️", text: "Energy code: R-20 walls, R-49 attic minimum for new insulation in KY climate zone 4" },
  ],
  water_damage: [
    { icon: "💧", text: "Do NOT close in walls or floors until moisture meter readings confirm materials are fully dry" },
    { icon: "🔬", text: "Third-party air quality clearance test recommended after mold remediation before occupancy" },
    { icon: "⚡", text: "Inspect all wiring in affected area — moisture compromises insulation over time" },
    { icon: "🚿", text: "Replace supply lines and shut-off valves while walls are open — best practice" },
  ],
  fire_restoration: [
    { icon: "🔥", text: "Structural engineer must certify framing before closing in walls — required by most KY building departments" },
    { icon: "⚡", text: "All wiring in fire areas must be replaced — heat compromises insulation even with no visible damage" },
    { icon: "🎛️", text: "Panel must be inspected by licensed electrician — breakers and bus bars may be damaged by heat" },
    { icon: "💨", text: "HVAC ductwork must be professionally cleaned or replaced — smoke permeates all ducts" },
    { icon: "🖌️", text: "Oil-based or shellac sealer primer required on ALL surfaces before finish paint — seals smoke odor permanently" },
    { icon: "🔊", text: "Smoke detectors must be updated to current code locations as part of restoration" },
  ],
  basement: [
    { icon: "🚪", text: "Egress window required for any basement bedroom — minimum 5.7 SF net clear opening (KY code)" },
    { icon: "📏", text: "Minimum 7-foot clear ceiling height required for habitable basement space" },
    { icon: "⚡", text: "AFCI breakers required in all habitable basement rooms (2023 NEC)" },
    { icon: "⚡", text: "Dedicated circuit for sump pump — do not share with other circuits" },
    { icon: "💧", text: "No glue-down hardwood or carpet below grade — LVP or tile only" },
    { icon: "🏠", text: "PT (pressure-treated) lumber required for all bottom plates in contact with concrete" },
  ],
  deck: [
    { icon: "🔧", text: "Ledger must be properly flashed and lag-bolted into rim joist — most common deck failure point" },
    { icon: "📏", text: "Guardrail height minimum: 36\" if deck is < 30\" above grade; 42\" if 30\" or higher (KY code)" },
    { icon: "📐", text: "Baluster spacing: 4\" maximum gap — a 4\" sphere must not pass through" },
    { icon: "🪜", text: "Stair rise: 7-3/4\" maximum; run: 10\" minimum (KY residential code)" },
    { icon: "🌊", text: "KY frost depth 12–18\" — footings must extend below frost line or deck will heave" },
    { icon: "🔩", text: "Use structural screws (not nails) for all joist hanger and ledger connections" },
  ],
  roofing: [
    { icon: "❄️", text: "Ice & water shield required: first 3 ft from eave edge and all valleys (KY climate)" },
    { icon: "🌪️", text: "Starter strip required at eaves and rakes — do not use cut-down shingles" },
    { icon: "💨", text: "Ridge vent + soffit vent is best system: 1 SF net free area per 150 SF of attic floor (KY code)" },
    { icon: "🔩", text: "6 nails per shingle in high-wind areas — 4-nail pattern is minimum only in low-wind zones" },
    { icon: "🧲", text: "Magnetic nail sweep required before leaving job site — nail liability is real" },
  ],
  siding: [
    { icon: "🏠", text: "House wrap required — Tyvek or equivalent; tape all seams for air sealing" },
    { icon: "🔧", text: "Fiber cement must be back-primed at all field cuts before installation" },
    { icon: "🔲", text: "Proper flashing required at all penetrations, windows, and doors before siding" },
    { icon: "☠️", text: "Older siding may contain asbestos — test before tearoff if pre-1980" },
  ],
  windows_doors: [
    { icon: "☠️", text: "Pre-1978 homes: EPA RRP rules apply — must be RRP-certified or use certified subcontractor" },
    { icon: "❄️", text: "Window U-factor 0.30 or less recommended for KY energy code compliance" },
    { icon: "🔧", text: "All windows must be flashed per manufacturer spec before trim and siding" },
    { icon: "🔊", text: "Smoke detectors may require repositioning if window or door openings are enlarged" },
  ],
  addition: [
    { icon: "📋", text: "Do not break ground before permit is in hand — inspections are required in sequence" },
    { icon: "🌊", text: "KY frost depth 12–18\" — footings must extend below frost line" },
    { icon: "❄️", text: "R-20 walls / R-49 ceiling required for new addition (KY energy code)" },
    { icon: "⚡", text: "Check panel capacity before starting — the addition may require a panel upgrade" },
    { icon: "🔊", text: "Smoke and CO detectors must be installed and interconnected throughout entire home" },
    { icon: "🏠", text: "Certificate of Occupancy required before using the new space — final inspection triggers this" },
  ],
  manufactured_home: [
    { icon: "🔧", text: "HUD label and data plate must be present and legible — verify before installation" },
    { icon: "🌊", text: "Tie-down anchors required per HUD installation standard — spacing and depth are specified" },
    { icon: "💧", text: "Verify public sewer connection OR confirm septic system capacity for the home's size" },
    { icon: "⚡", text: "Utility company must inspect service entrance before power is connected" },
  ],
  plumbing: [
    { icon: "📞", text: "Call 811 (Dig Safe) at least 2 business days before any trenching — required by KY law" },
    { icon: "🔧", text: "Rough-in inspection must pass before walls or floors are closed in" },
    { icon: "💧", text: "Pressure test required — most KY inspectors require 30-minute hold at 80 PSI" },
    { icon: "🔩", text: "PEX-A or PEX-B is KY standard for supply lines — confirm with inspector on your county" },
  ],
};

// ─── Bid Request Generator ────────────────────────────────────────────────────

function getReplyByDate(): string {
  const d = new Date();
  let added = 0;
  while (added < 5) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function generateGmailUrl(trade: TradeItem, jobTypeLabel: string, city: string, jobTitle: string): string {
  const subject = `Bid Request — ${trade.trade} for ${jobTitle || jobTypeLabel}`;
  const body = generateBidRequest(trade, jobTypeLabel, city);
  return `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function generateBidRequest(trade: TradeItem, jobTypeLabel: string, city: string): string {
  const replyBy = getReplyByDate();
  const cityLine = city.trim() ? `${city.trim()}, KY` : "Kentucky";
  return `Hi,

I'm bidding a ${jobTypeLabel} project in ${cityLine} and need a quote for the ${trade.trade} scope.

Scope: ${trade.description}
Quantity: ${trade.qty} ${trade.unit}

Please send your quote by ${replyBy}. Feel free to reply to this email or give me a call.

Thanks,
[Your name / company]`;
}

// ─── Wizard Component ─────────────────────────────────────────────────────────

const DEFAULT_MARKUP = 18;
const DEFAULT_CONTINGENCY = 10;

export function GCEstimateWizard({ job, onClose, onCreated }: {
  job: Job;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const createEstimate = useCreateEstimate();
  const updateJob = useUpdateJob();
  const { data: settingsData } = useGetSettings();
  const calcDefaults = resolveCalcDefaults(settingsData?.calculatorDefaults);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [jobType, setJobType] = useState<string>("");
  const [answers, setAnswers] = useState<Answers>({});
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [phasesEditable, setPhasesEditable] = useState<string[]>([]);
  const [savePhasesToJob, setSavePhasesToJob] = useState(true);
  const [expandedPermitIdx, setExpandedPermitIdx] = useState<number | null>(null);
  const [newPhaseInput, setNewPhaseInput] = useState("");
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null);
  const [markup, setMarkup] = useState(String(DEFAULT_MARKUP));
  const [contingency, setContingency] = useState(String(DEFAULT_CONTINGENCY));
  const [estimateTitle, setEstimateTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Property lookup
  const [lookupAddress, setLookupAddress] = useState<string>(job.address ?? "");
  const [propertyData, setPropertyData] = useState<PropertyData | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [projectCity, setProjectCity] = useState<string>(() => {
    if (job.city) return job.city;
    if (job.address) {
      const parts = job.address.split(",").map(p => p.trim());
      if (parts.length >= 2) return parts[1];
    }
    return "";
  });
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);

  const questions = (jobType ? SCOPE_QUESTIONS[jobType] ?? [] : []).filter(q => !q.condition || q.condition(answers));
  const riskFlags = useMemo(() => jobType ? getRiskFlags(jobType, answers, propertyData?.yearBuilt) : [], [jobType, answers, propertyData]);

  function initAnswers(jt: string, propData?: PropertyData | null) {
    const qs = SCOPE_QUESTIONS[jt] ?? [];
    const init: Answers = {};
    for (const q of qs) {
      if (q.defaultValue !== undefined) init[q.id] = q.defaultValue;
    }
    // Pre-fill from property lookup where applicable
    if (propData?.sqft) {
      const sf = propData.sqft;
      if (jt === "kitchen")         init.sqft    = Math.max(Math.round(sf / 8), 60);
      else if (jt === "siding")     init.wall_sf = Math.round(sf * 2.2);
      else if (jt === "roofing")    init.sqft    = Math.round(sf * 1.3);
      else if (!["deck", "windows_doors", "addition", "plumbing", "other"].includes(jt))
        init.sqft = sf;
    }
    if (propData?.stories && jt === "roofing") {
      init.stories = String(propData.stories);
    }
    setAnswers(init);
  }

  async function handlePropertyLookup() {
    const addr = lookupAddress.trim();
    if (!addr) return;
    setLookupLoading(true);
    setLookupError(null);
    setPropertyData(null);
    try {
      const res = await fetch("/api/property-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address: addr }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Lookup failed");
      }
      const data = await res.json() as PropertyData;
      setPropertyData(data);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Property lookup failed. Please try again.");
    } finally {
      setLookupLoading(false);
    }
  }

  function selectJobType(jt: string) {
    setJobType(jt);
    initAnswers(jt, propertyData);
    const label = JOB_TYPES.find(x => x.id === jt)?.label ?? jt;
    setEstimateTitle(`${job.title} — ${label}`);
    setPhasesEditable(PHASE_TEMPLATES[jt] ?? []);
    setExpandedPermitIdx(null);
    setStep(2);
  }

  function setAnswer(id: string, val: string | number | boolean) {
    setAnswers(prev => ({ ...prev, [id]: val }));
  }

  function goToTrades() {
    const computed = computeTrades(jobType, answers, calcDefaults);
    setTrades(computed);
    setStep(3);
  }

  function setTradeCost(id: string, cost: number) {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, selectedCost: cost } : t));
  }

  function adjustQty(id: string, delta: number) {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, qty: Math.max(0, t.qty + delta) } : t));
  }

  function setQtyDirect(id: string, val: number) {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, qty: Math.max(0, val) } : t));
  }

  function setCustomCost(id: string, val: string) {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) setTradeCost(id, parsed);
  }

  function removeTrade(id: string) {
    setTrades(prev => prev.filter(t => t.id !== id));
  }

  function addBlankTrade() {
    setTrades(prev => [...prev, {
      id: String(Date.now()),
      trade: "Other",
      description: "",
      qty: 1,
      unit: "LOT",
      lowCost: 0, midCost: 0, highCost: 0,
      selectedCost: 0,
      category: "Labor",
      tips: [],
    }]);
  }

  function movePhaseUp(i: number) {
    if (i === 0) return;
    setPhasesEditable(prev => {
      const a = [...prev];
      [a[i - 1], a[i]] = [a[i], a[i - 1]];
      return a;
    });
  }

  function movePhaseDown(i: number) {
    setPhasesEditable(prev => {
      if (i >= prev.length - 1) return prev;
      const a = [...prev];
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
      return a;
    });
  }

  function removePhase(i: number) {
    setPhasesEditable(prev => prev.filter((_, j) => j !== i));
  }

  function addPhase() {
    const t = newPhaseInput.trim();
    if (!t) return;
    setPhasesEditable(prev => [...prev, t]);
    setNewPhaseInput("");
  }

  const subtotal = trades.reduce((s, t) => s + t.qty * t.selectedCost, 0);
  const markupAmt = subtotal * (parseFloat(markup) / 100 || 0);
  const afterMarkup = subtotal + markupAmt;
  const contingencyAmt = afterMarkup * (parseFloat(contingency) / 100 || 0);
  const grandTotal = afterMarkup + contingencyAmt;

  const phasesNote = phasesEditable.length
    ? `\n\nPHASES:\n${phasesEditable.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
    : "";

  async function handleCreate() {
    if (!estimateTitle.trim()) return;
    setSaving(true);
    try {
      const req: CreateEstimateRequest & { jobId?: number } = {
        title: estimateTitle.trim(),
        jobId: job.id,
        clientId: job.clientId ?? undefined,
        businessLine: "general_contracting",
        jobType: JOB_TYPES.find(x => x.id === jobType)?.label ?? jobType,
        status: "draft",
        markupPercent: parseFloat(markup) || null,
        contingencyPercent: parseFloat(contingency) || null,
        notes: (notes || "") + phasesNote,
        lineItems: trades.filter(t => t.qty > 0 && t.selectedCost > 0).map(t => ({
          category: t.category,
          description: t.description || t.trade,
          quantity: t.qty,
          unit: t.unit,
          unitCost: t.selectedCost,
        })),
      };
      await createEstimate.mutateAsync(req as any);
      qc.invalidateQueries({ queryKey: ["/api/estimates"] });

      const permitItems = (KY_PERMITS[jobType] ?? KY_PERMITS.other);
      const permitChecklistData = permitItems.map((item) => ({
        label: item.permitName,
        checked: false,
      }));

      await updateJob.mutateAsync({
        id: job.id,
        data: {
          ...(savePhasesToJob && phasesEditable.length > 0
            ? { phases: phasesEditable.map(name => ({ name, completed: false })) }
            : {}),
          permitChecklist: permitChecklistData as any,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });

      const phasesMsg = savePhasesToJob && phasesEditable.length > 0 ? " Phases saved to job." : "";
      toast({ title: "Estimate created", description: `${estimateTitle} saved as draft.${phasesMsg}` });
      onCreated?.();
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to save estimate.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden h-full md:max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 bg-amber-500">
          <Wand2 className="w-5 h-5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-white text-base leading-tight">GC Smart Estimate Wizard</h2>
            <p className="text-amber-100 text-xs truncate">{job.title}</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1 mr-2">
            {([1, 2, 3, 4, 5, 6] as const).map(s => (
              <div key={s} className={`w-4 h-1.5 rounded-full transition-colors ${s <= step ? "bg-white" : "bg-amber-300/50"}`} />
            ))}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-amber-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step label */}
        <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-700 bg-amber-50 dark:bg-amber-950/40 flex-shrink-0">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            {step === 1 && "Step 1 of 6 — Choose Job Type"}
            {step === 2 && "Step 2 of 6 — Scope Questions"}
            {step === 3 && "Step 3 of 6 — Trade Breakdown & KY Cost Ranges"}
            {step === 4 && "Step 4 of 6 — Project Phases"}
            {step === 5 && "Step 5 of 6 — Permit & Code Intelligence"}
            {step === 6 && "Step 6 of 6 — Review & Create Estimate"}
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Job Type ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-5">

              {/* Property address lookup */}
              <div className="mb-5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-0.5">📍 Property Analysis <span className="text-xs font-normal text-gray-400 dark:text-gray-500">(optional)</span></p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Enter the job address to auto-fill square footage and flag pre-1978 lead paint / asbestos risk before you choose a job type.</p>
                <div className="flex gap-2">
                  <input
                    value={lookupAddress}
                    onChange={e => setLookupAddress(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handlePropertyLookup(); }}
                    placeholder="123 Main St, Lexington, KY 40502"
                    className="flex-1 px-3 py-2 border border-blue-200 dark:border-blue-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={handlePropertyLookup}
                    disabled={lookupLoading || !lookupAddress.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {lookupLoading ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
                {lookupError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{lookupError}</p>
                )}

                {/* Results card */}
                {propertyData && (
                  <div className="mt-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Year Built", value: propertyData.yearBuilt ? String(propertyData.yearBuilt) : "Unknown" },
                        { label: "Living SF", value: propertyData.sqft ? propertyData.sqft.toLocaleString() + " SF" : "Unknown" },
                        { label: "Beds / Baths", value: propertyData.beds ? `${propertyData.beds}bd / ${propertyData.baths}ba` : "Unknown" },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-blue-100 dark:border-blue-700 text-center">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{value}</p>
                        </div>
                      ))}
                    </div>

                    {propertyData.preLeadPaint && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700 dark:text-red-300 font-medium leading-relaxed">
                          Pre-1978 home — EPA RRP lead paint rules apply. Asbestos testing required before demo.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-snug flex-1">
                        AI estimate · {propertyData.confidence === "high" ? "High" : propertyData.confidence === "medium" ? "Medium" : "Low"} confidence — {propertyData.note}
                      </p>
                    </div>
                    {propertyData.sqft && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                        ✓ Square footage will be pre-filled in Step 2 when you pick a job type below.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">What type of job is this? Select the category that best fits.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {JOB_TYPES.map(jt => (
                  <button
                    key={jt.id}
                    onClick={() => selectJobType(jt.id)}
                    className="flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all text-left group"
                  >
                    <span className="text-2xl">{jt.icon}</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">{jt.label}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">{jt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Scope Questions ──────────────────────────────── */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Answer these questions to generate accurate KY cost estimates for each trade.</p>
              {questions.map(q => (
                <div key={q.id}>
                  <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{q.label}</label>
                  {q.type === "number" && (
                    <input
                      type="number"
                      value={String(answers[q.id] ?? q.defaultValue ?? "")}
                      onChange={e => setAnswer(q.id, parseFloat(e.target.value) || 0)}
                      placeholder={q.placeholder}
                      min={0}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  )}
                  {q.type === "select" && (
                    <select
                      value={String(answers[q.id] ?? q.defaultValue ?? "")}
                      onChange={e => setAnswer(q.id, e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {q.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {q.type === "boolean" && (
                    <div className="flex gap-2">
                      {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map(({ v, l }) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setAnswer(q.id, v)}
                          className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                            answers[q.id] === v
                              ? "bg-amber-500 border-amber-500 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-amber-300"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Step 3: Trade Breakdown ──────────────────────────────── */}
          {step === 3 && (
            <div className="p-5 space-y-4">

              {/* Risk Flags */}
              {riskFlags.length > 0 && (
                <div className="space-y-2">
                  {riskFlags.map((rf, i) => (
                    <div key={i} className={`flex gap-2.5 px-3.5 py-2.5 rounded-xl text-sm ${rf.level === "warn" ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300" : "bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300"}`}>
                      {rf.level === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span className="text-xs font-medium leading-relaxed">{rf.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500">Select Low / Mid / High for each trade, or type a custom amount. Quantities are editable.</p>

              {/* Trade items */}
              <div className="space-y-3">
                {trades.map(t => {
                  const isCustom = t.selectedCost !== t.lowCost && t.selectedCost !== t.midCost && t.selectedCost !== t.highCost;
                  const tipsOpen = expandedTipId === t.id;
                  return (
                    <div key={t.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                      <div className="px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t.trade}</p>
                            <input
                              value={t.description}
                              onChange={e => setTrades(prev => prev.map(x => x.id === t.id ? { ...x, description: e.target.value } : x))}
                              className="text-xs text-gray-500 dark:text-gray-400 w-full bg-transparent focus:outline-none focus:ring-0 border-0 p-0"
                              placeholder="Description…"
                            />
                          </div>
                          <button onClick={() => removeTrade(t.id)} className="text-gray-300 dark:text-gray-600 hover:text-red-400 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Qty row */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold uppercase">Qty</span>
                          <button onClick={() => adjustQty(t.id, -1)} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"><Minus className="w-2.5 h-2.5" /></button>
                          <input
                            type="number" min="0" step="any"
                            value={t.qty}
                            onChange={e => setQtyDirect(t.id, parseFloat(e.target.value) || 0)}
                            className="w-16 text-center text-xs border border-gray-200 dark:border-gray-600 rounded-lg py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <button onClick={() => adjustQty(t.id, 1)} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"><Plus className="w-2.5 h-2.5" /></button>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{t.unit}</span>
                          <span className="ml-auto text-sm font-bold text-amber-600">
                            {formatCurrency(t.qty * t.selectedCost)}
                          </span>
                        </div>

                        {/* Cost range buttons */}
                        <div className="flex gap-1.5 flex-wrap">
                          {[
                            { label: `Low  ${formatCurrency(t.lowCost)}`, val: t.lowCost, cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" },
                            { label: `Mid  ${formatCurrency(t.midCost)}`, val: t.midCost, cls: "border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20" },
                            { label: `High  ${formatCurrency(t.highCost)}`, val: t.highCost, cls: "border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" },
                          ].map(({ label, val, cls }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setTradeCost(t.id, val)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                                t.selectedCost === val && !isCustom
                                  ? "bg-gray-800 border-gray-800 text-white dark:bg-gray-200 dark:border-gray-200 dark:text-gray-900"
                                  : cls
                              }`}
                            >
                              {t.selectedCost === val && !isCustom && <Check className="w-2.5 h-2.5" />}
                              {label}
                              <span className="text-[10px] opacity-60">/{t.unit}</span>
                            </button>
                          ))}
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">Custom $</span>
                            <input
                              type="number" min="0" step="any"
                              value={isCustom ? t.selectedCost : ""}
                              onChange={e => setCustomCost(t.id, e.target.value)}
                              placeholder="—"
                              className={`w-16 text-xs text-right border rounded-lg py-1 px-2 focus:outline-none focus:ring-1 focus:ring-amber-400 ${isCustom ? "border-amber-400 bg-amber-50 dark:bg-amber-900/30" : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"}`}
                            />
                          </div>
                        </div>

                        {/* Tips toggle */}
                        {t.tips.filter(Boolean).length > 0 && (
                          <button
                            onClick={() => setExpandedTipId(tipsOpen ? null : t.id)}
                            className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold"
                          >
                            {tipsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            What to ask / watch for
                          </button>
                        )}
                        {tipsOpen && (
                          <ul className="mt-1.5 space-y-1 pl-3">
                            {t.tips.filter(Boolean).map((tip, i) => (
                              <li key={i} className="text-[11px] text-gray-600 dark:text-gray-400 flex gap-1.5">
                                <span className="text-blue-400 dark:text-blue-500 flex-shrink-0">•</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={addBlankTrade}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Trade
                </button>
              </div>

              {/* Running subtotal */}
              <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-gray-100">
                  <span>Subtotal (before markup)</span>
                  <span className="text-amber-600">{formatCurrency(subtotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Phase Template ───────────────────────────────── */}
          {step === 4 && (
            <div className="p-5 space-y-5">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Project Phases</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">These phases will be saved to the job so you can check them off as work progresses. Add, remove, or reorder to match your plan.</p>
              </div>

              <div className="space-y-2">
                {phasesEditable.map((phase, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <input
                      value={phase}
                      onChange={e => setPhasesEditable(prev => prev.map((p, j) => j === i ? e.target.value : p))}
                      className="flex-1 text-sm text-gray-800 dark:text-gray-200 bg-transparent focus:outline-none focus:ring-0 border-0 p-0 min-w-0"
                      placeholder="Phase name…"
                    />
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => movePhaseUp(i)}
                        disabled={i === 0}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => movePhaseDown(i)}
                        disabled={i === phasesEditable.length - 1}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removePhase(i)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add phase row */}
              <div className="flex gap-2">
                <input
                  value={newPhaseInput}
                  onChange={e => setNewPhaseInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addPhase()}
                  placeholder="Add a phase… (press Enter)"
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={addPhase}
                  disabled={!newPhaseInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              <button
                onClick={() => setPhasesEditable(PHASE_TEMPLATES[jobType] ?? [])}
                className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold"
              >
                Reset to suggested phases
              </button>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
                <strong>Tip:</strong> These phases are saved directly to the job. After the estimate is created, open the Phases panel on the job card to check off phases as work progresses.
              </div>
            </div>
          )}

          {/* ── Step 5: Permit & Code Intelligence ──────────────────── */}
          {step === 5 && (
            <div className="p-5 space-y-6">

              {/* Permit cards */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Permit & Code Intelligence</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Typical requirements for a <span className="font-semibold">{JOB_TYPES.find(j => j.id === jobType)?.label ?? jobType}</span> in Kentucky. Tap any card for details. Always verify with your local county building office.
                </p>
                <div className="space-y-2">
                  {(KY_PERMITS[jobType] ?? KY_PERMITS.other).map((permit, i) => {
                    const isOpen = expandedPermitIdx === i;
                    const statusCfg = {
                      likely_required: { label: "Likely Required", badgeCls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", borderCls: "border-red-200 dark:border-red-800", dotCls: "bg-red-500" },
                      may_be_required: { label: "May Be Required", badgeCls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", borderCls: "border-amber-200 dark:border-amber-800", dotCls: "bg-amber-500" },
                      not_required:    { label: "Typically Not Required", badgeCls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", borderCls: "border-gray-200 dark:border-gray-700", dotCls: "bg-emerald-500" },
                    }[permit.status];
                    return (
                      <div key={i} className={`rounded-xl border overflow-hidden ${statusCfg.borderCls}`}>
                        {/* Collapsed header */}
                        <button
                          type="button"
                          onClick={() => setExpandedPermitIdx(isOpen ? null : i)}
                          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusCfg.dotCls}`} />
                          <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">{permit.permitName}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${statusCfg.badgeCls}`}>{statusCfg.label}</span>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                        </button>

                        {/* Expanded detail */}
                        {isOpen && (
                          <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 space-y-3">
                            {/* Why */}
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Why This May Be Required</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{permit.requiredReason}</p>
                            </div>

                            {/* Who / Fee / Timeline grid */}
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { label: "Who Pulls It", value: permit.whoPullsPermit },
                                { label: "Est. KY Fee", value: permit.estimatedFeeLow === 0 && permit.estimatedFeeHigh === 0 ? "N/A" : `$${permit.estimatedFeeLow}–$${permit.estimatedFeeHigh}` },
                                { label: "Approval Time", value: permit.approvalTime },
                              ].map(({ label, value }) => (
                                <div key={label} className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-100 dark:border-gray-700">
                                  <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
                                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug font-medium">{value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Required inspections */}
                            {permit.requiredInspections.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">
                                  Required Inspections ({permit.requiredInspections.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {permit.requiredInspections.map((insp, j) => (
                                    <span key={j} className="flex items-center gap-1 text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 rounded-lg px-2 py-0.5 font-medium">
                                      <Check className="w-2.5 h-2.5 flex-shrink-0" />{insp}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Building dept notes */}
                            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                              <span className="font-bold">📋 Inspector Note: </span>{permit.buildingDepartmentNotes}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Code Intelligence */}
              {(CODE_REMINDERS[jobType] ?? []).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Code Considerations</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Common code requirements for this project type. Verify specifics with your inspector.
                  </p>
                  <div className="space-y-1.5">
                    {CODE_REMINDERS[jobType].map((reminder, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800">
                        <span className="text-base flex-shrink-0 leading-none mt-0.5">{reminder.icon}</span>
                        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{reminder.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Important notice */}
              <div className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">⚠️ Important Notice</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Permit requirements vary by municipality. Always verify specific requirements with your local building department before beginning work. This information is provided as a general Kentucky reference and does not constitute legal advice.
                </p>
              </div>

              {/* Subcontractor bid requests */}
              {trades.filter(t => t.category === "Subcontractor" && t.qty > 0).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ClipboardCopy className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Subcontractor Bid Requests</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Copy a pre-filled email template for each sub trade. Paste into Gmail, Messages, or email.
                  </p>

                  {/* City input */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">City / Town</label>
                    <input
                      value={projectCity}
                      onChange={e => setProjectCity(e.target.value)}
                      placeholder="e.g. Lexington"
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Used to personalise the bid request emails</p>
                  </div>

                  <div className="space-y-3">
                    {trades.filter(t => t.category === "Subcontractor" && t.qty > 0).map(t => {
                      const copied = copiedTradeId === t.id;
                      const jobLabel = JOB_TYPES.find(j => j.id === jobType)?.label ?? jobType;
                      return (
                        <div key={t.id} className="rounded-xl border border-blue-100 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 overflow-hidden">
                          <div className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t.trade}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t.description}</p>
                              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
                                {t.qty} {t.unit} · {formatCurrency(t.qty * t.selectedCost)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => {
                                  const text = generateBidRequest(t, jobLabel, projectCity);
                                  navigator.clipboard.writeText(text).then(() => {
                                    setCopiedTradeId(t.id);
                                    setTimeout(() => setCopiedTradeId(null), 2500);
                                  });
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  copied
                                    ? "bg-emerald-500 text-white"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                }`}
                              >
                                {copied
                                  ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</>
                                  : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy</>
                                }
                              </button>
                              <a
                                href={generateGmailUrl(t, jobLabel, projectCity, job.title ?? "")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-all"
                              >
                                <Mail className="w-3.5 h-3.5" /> Open in Gmail
                              </a>
                            </div>
                          </div>
                          {/* Preview of template */}
                          <div className="px-3.5 pb-2.5">
                            <pre className="text-[10px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed font-sans overflow-hidden max-h-28">
                              {generateBidRequest(t, JOB_TYPES.find(j => j.id === jobType)?.label ?? jobType, projectCity)}
                            </pre>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {trades.filter(t => t.category === "Subcontractor" && t.qty > 0).length === 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  No subcontractor trades in this estimate — bid request templates are not needed.
                </div>
              )}
            </div>
          )}

          {/* ── Step 6: Review & Create ──────────────────────────────── */}
          {step === 6 && (
            <div className="p-5 space-y-5">

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Estimate Title</label>
                <input
                  value={estimateTitle}
                  onChange={e => setEstimateTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="e.g. Johnson Kitchen Remodel — GC Estimate"
                />
              </div>

              {/* Markup & Contingency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Markup %</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={markup}
                    onChange={e => setMarkup(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Typical GC: 15–25%</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Contingency %</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={contingency}
                    onChange={e => setContingency(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Typical: 5–15%</p>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-2">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Running Total</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal ({trades.filter(t => t.qty > 0).length} trades)</span>
                  <span className="font-semibold dark:text-gray-100">{formatCurrency(subtotal)}</span>
                </div>
                {parseFloat(markup) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Markup ({markup}%)</span>
                    <span className="text-emerald-600 font-medium">+ {formatCurrency(markupAmt)}</span>
                  </div>
                )}
                {parseFloat(contingency) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Contingency ({contingency}%)</span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">+ {formatCurrency(contingencyAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span>Grand Total</span>
                  <span className="text-amber-600">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Notes / Scope Language</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Exclusions, payment terms, scope clarifications…"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              {/* Phase summary + opt-in */}
              {phasesEditable.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={savePhasesToJob}
                      onChange={e => setSavePhasesToJob(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-500"
                    />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      Save {phasesEditable.length} phases to job for step-by-step tracking
                    </span>
                  </label>
                  {savePhasesToJob && (
                    <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800 rounded-xl p-3.5">
                      <ol className="space-y-1">
                        {phasesEditable.map((phase, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-blue-800 dark:text-blue-300">
                            <span className="w-4 h-4 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                            {phase}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {/* Risk flags reminder */}
              {riskFlags.length > 0 && (
                <div className="space-y-2">
                  {riskFlags.filter(r => r.level === "warn").map((rf, i) => (
                    <div key={i} className="flex gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {rf.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Line item summary */}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Line Items</p>
                <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Trade</th>
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Qty</th>
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Unit $</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {trades.filter(t => t.qty > 0 && t.selectedCost > 0).map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px]">{t.trade}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500 dark:text-gray-400">{t.qty} {t.unit}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500 dark:text-gray-400">{formatCurrency(t.selectedCost)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-amber-600">{formatCurrency(t.qty * t.selectedCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          )}

          {step === 1 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Select a job type to continue</p>
          )}
          {step === 2 && (
            <button
              onClick={goToTrades}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm"
            >
              Build Estimate <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => setStep(4)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm"
            >
              Set Phases <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 4 && (
            <button
              onClick={() => setStep(5)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm"
            >
              Permits & Bids <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 5 && (
            <button
              onClick={() => setStep(6)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm"
            >
              Review & Finalize <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 6 && (
            <button
              onClick={handleCreate}
              disabled={saving || !estimateTitle.trim()}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : (
                <><Check className="w-4 h-4" /> Create Estimate</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
