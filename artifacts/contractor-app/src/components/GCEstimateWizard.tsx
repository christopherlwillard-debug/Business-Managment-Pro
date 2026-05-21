import { useState, useMemo } from "react";
import {
  useCreateEstimate, useUpdateJob,
  Job, CreateEstimateRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  X, ChevronLeft, ChevronRight, Wand2, AlertTriangle, Info,
  ChevronDown, ChevronUp, Check, Plus, Minus, GripVertical,
  ClipboardCopy, ClipboardCheck, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Job Types ────────────────────────────────────────────────────────────────

const JOB_TYPES = [
  { id: "full_remodel",   label: "Full Remodel",           icon: "🏠", desc: "Full interior gut and renovation" },
  { id: "kitchen",        label: "Kitchen Remodel",         icon: "🍳", desc: "Kitchen cabinets, countertops, flooring" },
  { id: "bathroom",       label: "Bathroom Remodel",        icon: "🚿", desc: "Tile, fixtures, plumbing, vanity" },
  { id: "siding",         label: "Siding",                  icon: "🏗️", desc: "Vinyl, fiber cement, or wood siding" },
  { id: "ceiling_repair", label: "Ceiling Repair",          icon: "🔨", desc: "Popcorn removal, cracks, skim coat" },
  { id: "plumbing",       label: "Plumbing Hookup",         icon: "🔧", desc: "Fixtures, rough-in, service connection" },
  { id: "deck",           label: "Deck / Porch",            icon: "🪵", desc: "New deck or porch build-out" },
  { id: "windows_doors",  label: "Window/Door Replacement", icon: "🪟", desc: "Remove and replace windows and doors" },
  { id: "addition",       label: "Addition",                icon: "📐", desc: "New room or structure added to home" },
  { id: "other",          label: "Other",                   icon: "⚒️", desc: "Custom or mixed-scope project" },
];

// ─── Scope Questions ──────────────────────────────────────────────────────────

const SCOPE_QUESTIONS: Record<string, Question[]> = {
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
    { id: "sqft",       label: "Total remodel area (SF)",         type: "number", unit: "SF",  placeholder: "1000", defaultValue: 1000 },
    { id: "wet_rooms",  label: "Number of wet rooms (kitchens + baths)", type: "number", unit: "rooms", placeholder: "2", defaultValue: 2 },
    { id: "scope",      label: "Scope",                           type: "select", options: [{ value: "full_gut", label: "Full gut" }, { value: "partial", label: "Partial / selective demo" }], defaultValue: "full_gut" },
    { id: "flooring",   label: "Flooring type",                   type: "select", options: [{ value: "lvp", label: "LVP throughout" }, { value: "carpet", label: "Carpet in bedrooms, LVP elsewhere" }, { value: "tile", label: "Tile" }], defaultValue: "lvp" },
    { id: "structural", label: "Structural changes (walls moved)?", type: "boolean", defaultValue: false },
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

function computeTrades(jobType: string, answers: Answers): TradeItem[] {
  const items: TradeItem[] = [];
  let counter = 0;
  const add = (t: Omit<TradeItem, "id" | "selectedCost">) => {
    items.push({ ...t, id: String(counter++), selectedCost: t.midCost });
  };

  if (jobType === "kitchen") {
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
    const isGut = answers.scope === "full_gut";
    add({ trade: "Demo", description: isGut ? "Full interior demo — gut to studs" : "Selective demo — cabinets, flooring, fixtures", qty: sf, unit: "SF", lowCost: isGut ? 3 : 1.50, midCost: isGut ? 4.50 : 2.50, highCost: isGut ? 7 : 4, category: "Labor", tips: ["Asbestos / lead-based paint test recommended on pre-1978 homes", "Confirm haul-away included in price", "Stage dumpster close to access point"], riskNote: isGut ? "Full gut on older homes — asbestos & lead testing strongly recommended" : undefined });
    if (wetRooms > 0) add({ trade: "Rough Plumbing", description: "Plumbing rough-in for wet rooms", qty: wetRooms, unit: "ROOM", lowCost: 2500, midCost: 4000, highCost: 7500, category: "Subcontractor", tips: ["Permit required — factor 2–4 weeks for KY inspection", "Confirm PEX or copper spec", "Rough-in inspection before drywall close-in"] });
    add({ trade: "Rough Electrical", description: "New electrical rough-in", qty: sf, unit: "SF", lowCost: 4, midCost: 6.50, highCost: 10, category: "Subcontractor", tips: ["KY requires permit for new circuits", "Arc-fault breakers required in all habitable rooms (2023 NEC)", "Plan panel capacity before starting"] });
    if (answers.structural) add({ trade: "Structural", description: "Wall removal / structural modifications", qty: 1, unit: "LOT", lowCost: 3500, midCost: 7000, highCost: 15000, category: "Labor", tips: ["Engineering stamp required for beam sizing in KY", "Permit required — allow 2–6 weeks", "Temporary shoring critical during header install"], riskNote: "Structural work requires permit and engineer sign-off in Kentucky" });
    add({ trade: "Insulation", description: "Wall & ceiling insulation", qty: sf, unit: "SF", lowCost: 1.50, midCost: 2.50, highCost: 4, category: "Labor", tips: ["R-15 walls / R-38 ceiling is KY energy code minimum", "Spray foam at rim joists adds ~$500-800", "Confirm vapor barrier in crawl space"] });
    add({ trade: "Drywall", description: "Hang, tape, finish drywall", qty: sf * 2.8, unit: "SF", lowCost: 2.50, midCost: 3.75, highCost: 5, category: "Labor", tips: ["Level-4 finish for smooth walls (painted)", "Double-layer 5/8\" on shared walls for fire rating", "Ask about texture matching in partial renovations"] });
    const flType = answers.flooring;
    const flLo = flType === "tile" ? 7 : flType === "carpet" ? 2.50 : 3;
    const flMid = flType === "tile" ? 11 : flType === "carpet" ? 4 : 4.50;
    const flHi = flType === "tile" ? 16 : flType === "carpet" ? 6 : 6.50;
    add({ trade: "Flooring", description: `Flooring — ${flType === "lvp" ? "LVP throughout" : flType === "carpet" ? "Carpet + LVP" : "Tile"}`, qty: sf, unit: "SF", lowCost: flLo, midCost: flMid, highCost: flHi, category: "Subcontractor", tips: ["Confirm subfloor prep in scope", "Add 10% waste allowance to SF order", "Transitions at doorways — confirm included"] });
    add({ trade: "Paint", description: "Interior paint — all rooms", qty: sf * 1.8, unit: "SF", lowCost: 1.25, midCost: 1.80, highCost: 2.50, category: "Labor", tips: ["2 coats + primer on new drywall", "Cabinet paint is separate — confirm scope", "Caulk all trim/casings before final coat"] });
    add({ trade: "Trim & Doors", description: "Base, casing, interior doors", qty: sf, unit: "SF", lowCost: 2, midCost: 3.25, highCost: 5, category: "Labor", tips: ["Pre-hung hollow core is KY standard residential", "Paint-grade MDF casing is most economical", "Confirm door hardware allowance with client"] });
    add({ trade: "Cleanup", description: "Final punch & haul-off", qty: 1, unit: "LOT", lowCost: 500, midCost: 900, highCost: 1500, category: "Labor", tips: [] });
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

function getRiskFlags(jobType: string, answers: Answers): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (["kitchen", "bathroom", "full_remodel", "ceiling_repair", "siding"].includes(jobType)) {
    flags.push({ level: "info", message: "Pre-1980 home? Schedule asbestos inspection before demo — KY law requires testing before demolition of suspect materials." });
  }
  if (["windows_doors"].includes(jobType)) {
    flags.push({ level: "warn", message: "Pre-1978 home: EPA RRP lead paint rules apply. Willard must be RRP-certified or hire a certified sub." });
  }
  if (jobType === "plumbing" && answers.trench) {
    flags.push({ level: "warn", message: "Call 811 before any digging — Kentucky law requires contacting Dig Safe at least 2 business days before excavation." });
  }
  if (["deck", "addition", "full_remodel"].includes(jobType) || (jobType === "windows_doors" && answers.headers)) {
    flags.push({ level: "warn", message: "Permit required in most KY counties for this scope. Budget 2–8 weeks for permit approval. Do not start structural work before permit is in hand." });
  }
  if (jobType === "ceiling_repair" && answers.popcorn) {
    flags.push({ level: "warn", message: "Popcorn ceilings installed before 1978 may contain asbestos. Test before scraping — disturbing asbestos without proper controls is a KY EPA violation." });
  }
  return flags;
}

// ─── Phase Templates ──────────────────────────────────────────────────────────

const PHASE_TEMPLATES: Record<string, string[]> = {
  kitchen:       ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Drywall", "Cabinet Install", "Countertops", "Flooring", "Fixtures & Appliances", "Paint & Trim", "Final Punch"],
  bathroom:      ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Cement Board / Drywall", "Tile — Shower/Floor", "Vanity & Fixtures", "Paint", "Final Punch"],
  siding:        ["Tearoff & Disposal", "Housewrap", "Siding Install", "Trim & Corners", "Caulk & Seal", "Final Cleanup"],
  ceiling_repair:["Protect Floors & Furniture", "Popcorn Scrape", "Crack Repair", "Skim Coat & Sand", "Prime & Paint", "Final Cleanup"],
  plumbing:      ["Locate Tie-in Points", "Rough-in / Trench", "Inspection", "Fixtures Connect", "Pressure Test", "Cleanup"],
  deck:          ["Permit & Layout", "Footings & Posts", "Beam & Joist Framing", "Decking Install", "Railing & Stairs", "Seal / Stain", "Final Inspection"],
  windows_doors: ["Order & Lead Time", "Remove Old Units", "Framing / Headers", "Install New Units", "Insulate & Seal", "Interior Trim & Casing", "Caulk, Paint & Touch-up"],
  full_remodel:  ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Insulation", "Drywall Hang", "Drywall Finish", "Flooring", "Paint & Prime", "Cabinets & Fixtures", "Trim & Doors", "Final Punch"],
  addition:      ["Permit & Survey", "Foundation / Footings", "Framing", "Roofing", "Windows & Exterior Doors", "Rough MEP (Mech/Elec/Plumb)", "Inspections", "Insulation", "Drywall", "Flooring", "Paint & Trim", "Final Inspection"],
  other:         ["Scope & Materials Procurement", "Phase 1 Work", "Phase 2 Work", "Final Punch & Cleanup"],
};

// ─── KY Permit Requirements ───────────────────────────────────────────────────

interface PermitItem { label: string; required: boolean }

const KY_PERMITS: Record<string, PermitItem[]> = {
  kitchen: [
    { label: "Building permit — required for full gut or any structural change", required: true },
    { label: "Plumbing permit — required if relocating or adding new rough-in", required: true },
    { label: "Electrical permit — required for new circuits or panel work", required: true },
    { label: "No permit needed for cosmetic-only updates (swap fixtures, paint)", required: false },
  ],
  bathroom: [
    { label: "Building permit — required for full gut remodel", required: true },
    { label: "Plumbing permit — required for any rough-in or fixture relocation", required: true },
    { label: "Electrical permit — required for GFCI and exhaust fan circuits", required: true },
  ],
  siding: [
    { label: "Building permit — required in most KY counties for re-siding", required: true },
    { label: "HOA architectural review — if community has HOA", required: false },
  ],
  ceiling_repair: [
    { label: "No permit typically required for cosmetic ceiling repair", required: false },
    { label: "Asbestos abatement permit — required if pre-1978 and positive test", required: true },
  ],
  plumbing: [
    { label: "Plumbing permit — required for any rough-in or line relocation in KY", required: true },
    { label: "Licensed KY plumber must pull permit and pass inspection", required: true },
    { label: "811 Dig-Safe notification — required before any trenching", required: true },
  ],
  deck: [
    { label: "Building permit — required in most KY counties for new decks", required: true },
    { label: "Zoning setback compliance — verify property lines with county", required: true },
    { label: "Final inspection after completion — required before use", required: true },
    { label: "HOA approval — if community has HOA", required: false },
  ],
  windows_doors: [
    { label: "Building permit — required if adding or enlarging structural headers", required: true },
    { label: "No permit needed for like-for-like replacement in most KY counties", required: false },
    { label: "EPA RRP lead-paint certification — required if pre-1978 home", required: true },
  ],
  full_remodel: [
    { label: "Building permit — required", required: true },
    { label: "Plumbing permit — required", required: true },
    { label: "Electrical permit — required", required: true },
    { label: "HVAC permit — required if scope includes mechanical work", required: true },
  ],
  addition: [
    { label: "Building permit — required", required: true },
    { label: "Zoning variance — may be required depending on setbacks", required: true },
    { label: "Plumbing permit", required: true },
    { label: "Electrical permit", required: true },
    { label: "HVAC permit", required: true },
    { label: "Certificate of Occupancy — issued after final inspections", required: true },
  ],
  other: [
    { label: "Verify permit requirements with your local KY county building office", required: false },
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

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [jobType, setJobType] = useState<string>("");
  const [answers, setAnswers] = useState<Answers>({});
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [phasesEditable, setPhasesEditable] = useState<string[]>([]);
  const [savePhasesToJob, setSavePhasesToJob] = useState(true);
  const [newPhaseInput, setNewPhaseInput] = useState("");
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null);
  const [markup, setMarkup] = useState(String(DEFAULT_MARKUP));
  const [contingency, setContingency] = useState(String(DEFAULT_CONTINGENCY));
  const [estimateTitle, setEstimateTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
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
  const riskFlags = useMemo(() => jobType ? getRiskFlags(jobType, answers) : [], [jobType, answers]);

  function initAnswers(jt: string) {
    const qs = SCOPE_QUESTIONS[jt] ?? [];
    const init: Answers = {};
    for (const q of qs) {
      if (q.defaultValue !== undefined) init[q.id] = q.defaultValue;
    }
    setAnswers(init);
  }

  function selectJobType(jt: string) {
    setJobType(jt);
    initAnswers(jt);
    const label = JOB_TYPES.find(x => x.id === jt)?.label ?? jt;
    setEstimateTitle(`${job.title} — ${label}`);
    setPhasesEditable(PHASE_TEMPLATES[jt] ?? []);
    setStep(2);
  }

  function setAnswer(id: string, val: string | number | boolean) {
    setAnswers(prev => ({ ...prev, [id]: val }));
  }

  function goToTrades() {
    const computed = computeTrades(jobType, answers);
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
      await createEstimate.mutateAsync(req);
      qc.invalidateQueries({ queryKey: ["/api/estimates"] });

      if (savePhasesToJob && phasesEditable.length > 0) {
        await updateJob.mutateAsync({
          id: job.id,
          data: { phases: phasesEditable.map(name => ({ name, completed: false })) },
        });
        qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      }

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
      <div className="relative w-full max-w-2xl bg-white rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden h-full md:max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0 bg-amber-500">
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
        <div className="px-5 py-2 border-b border-gray-100 bg-amber-50 flex-shrink-0">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            {step === 1 && "Step 1 of 6 — Choose Job Type"}
            {step === 2 && "Step 2 of 6 — Scope Questions"}
            {step === 3 && "Step 3 of 6 — Trade Breakdown & KY Cost Ranges"}
            {step === 4 && "Step 4 of 6 — Project Phases"}
            {step === 5 && "Step 5 of 6 — KY Permits & Bid Requests"}
            {step === 6 && "Step 6 of 6 — Review & Create Estimate"}
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Job Type ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-5">
              <p className="text-sm text-gray-500 mb-4">What type of job is this? Select the category that best fits.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {JOB_TYPES.map(jt => (
                  <button
                    key={jt.id}
                    onClick={() => selectJobType(jt.id)}
                    className="flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
                  >
                    <span className="text-2xl">{jt.icon}</span>
                    <span className="font-semibold text-gray-900 text-sm leading-tight">{jt.label}</span>
                    <span className="text-[11px] text-gray-400 leading-tight">{jt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Scope Questions ──────────────────────────────── */}
          {step === 2 && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">Answer these questions to generate accurate KY cost estimates for each trade.</p>
              {questions.map(q => (
                <div key={q.id}>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">{q.label}</label>
                  {q.type === "number" && (
                    <input
                      type="number"
                      value={String(answers[q.id] ?? q.defaultValue ?? "")}
                      onChange={e => setAnswer(q.id, parseFloat(e.target.value) || 0)}
                      placeholder={q.placeholder}
                      min={0}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  )}
                  {q.type === "select" && (
                    <select
                      value={String(answers[q.id] ?? q.defaultValue ?? "")}
                      onChange={e => setAnswer(q.id, e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                              : "bg-white border-gray-200 text-gray-700 hover:border-amber-300"
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
                    <div key={i} className={`flex gap-2.5 px-3.5 py-2.5 rounded-xl text-sm ${rf.level === "warn" ? "bg-red-50 border border-red-200 text-red-800" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
                      {rf.level === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span className="text-xs font-medium leading-relaxed">{rf.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400">Select Low / Mid / High for each trade, or type a custom amount. Quantities are editable.</p>

              {/* Trade items */}
              <div className="space-y-3">
                {trades.map(t => {
                  const isCustom = t.selectedCost !== t.lowCost && t.selectedCost !== t.midCost && t.selectedCost !== t.highCost;
                  const tipsOpen = expandedTipId === t.id;
                  return (
                    <div key={t.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                      <div className="px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{t.trade}</p>
                            <input
                              value={t.description}
                              onChange={e => setTrades(prev => prev.map(x => x.id === t.id ? { ...x, description: e.target.value } : x))}
                              className="text-xs text-gray-500 w-full bg-transparent focus:outline-none focus:ring-0 border-0 p-0"
                              placeholder="Description…"
                            />
                          </div>
                          <button onClick={() => removeTrade(t.id)} className="text-gray-300 hover:text-red-400 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Qty row */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-[11px] text-gray-400 font-semibold uppercase">Qty</span>
                          <button onClick={() => adjustQty(t.id, -1)} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600"><Minus className="w-2.5 h-2.5" /></button>
                          <input
                            type="number" min="0" step="any"
                            value={t.qty}
                            onChange={e => setQtyDirect(t.id, parseFloat(e.target.value) || 0)}
                            className="w-16 text-center text-xs border border-gray-200 rounded-lg py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <button onClick={() => adjustQty(t.id, 1)} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600"><Plus className="w-2.5 h-2.5" /></button>
                          <span className="text-xs text-gray-400">{t.unit}</span>
                          <span className="ml-auto text-sm font-bold text-amber-600">
                            {formatCurrency(t.qty * t.selectedCost)}
                          </span>
                        </div>

                        {/* Cost range buttons */}
                        <div className="flex gap-1.5 flex-wrap">
                          {[
                            { label: `Low  ${formatCurrency(t.lowCost)}`, val: t.lowCost, cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" },
                            { label: `Mid  ${formatCurrency(t.midCost)}`, val: t.midCost, cls: "border-amber-300 text-amber-700 hover:bg-amber-50" },
                            { label: `High  ${formatCurrency(t.highCost)}`, val: t.highCost, cls: "border-red-300 text-red-700 hover:bg-red-50" },
                          ].map(({ label, val, cls }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setTradeCost(t.id, val)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                                t.selectedCost === val && !isCustom
                                  ? "bg-gray-800 border-gray-800 text-white"
                                  : cls
                              }`}
                            >
                              {t.selectedCost === val && !isCustom && <Check className="w-2.5 h-2.5" />}
                              {label}
                              <span className="text-[10px] opacity-60">/{t.unit}</span>
                            </button>
                          ))}
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-400">Custom $</span>
                            <input
                              type="number" min="0" step="any"
                              value={isCustom ? t.selectedCost : ""}
                              onChange={e => setCustomCost(t.id, e.target.value)}
                              placeholder="—"
                              className={`w-16 text-xs text-right border rounded-lg py-1 px-2 focus:outline-none focus:ring-1 focus:ring-amber-400 ${isCustom ? "border-amber-400 bg-amber-50" : "border-gray-200"}`}
                            />
                          </div>
                        </div>

                        {/* Tips toggle */}
                        {t.tips.filter(Boolean).length > 0 && (
                          <button
                            onClick={() => setExpandedTipId(tipsOpen ? null : t.id)}
                            className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            {tipsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            What to ask / watch for
                          </button>
                        )}
                        {tipsOpen && (
                          <ul className="mt-1.5 space-y-1 pl-3">
                            {t.tips.filter(Boolean).map((tip, i) => (
                              <li key={i} className="text-[11px] text-gray-600 flex gap-1.5">
                                <span className="text-blue-400 flex-shrink-0">•</span>
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Trade
                </button>
              </div>

              {/* Running subtotal */}
              <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-white border-t border-gray-100">
                <div className="flex justify-between text-sm font-bold text-gray-900">
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
                <p className="text-sm font-semibold text-gray-800 mb-1">Project Phases</p>
                <p className="text-xs text-gray-500">These phases will be saved to the job so you can check them off as work progresses. Add, remove, or reorder to match your plan.</p>
              </div>

              <div className="space-y-2">
                {phasesEditable.map((phase, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <input
                      value={phase}
                      onChange={e => setPhasesEditable(prev => prev.map((p, j) => j === i ? e.target.value : p))}
                      className="flex-1 text-sm text-gray-800 bg-transparent focus:outline-none focus:ring-0 border-0 p-0 min-w-0"
                      placeholder="Phase name…"
                    />
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => movePhaseUp(i)}
                        disabled={i === 0}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => movePhaseDown(i)}
                        disabled={i === phasesEditable.length - 1}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removePhase(i)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
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
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                className="text-xs text-blue-500 hover:text-blue-700 font-semibold"
              >
                Reset to suggested phases
              </button>

              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <strong>Tip:</strong> These phases are saved directly to the job. After the estimate is created, open the Phases panel on the job card to check off phases as work progresses.
              </div>
            </div>
          )}

          {/* ── Step 5: KY Permits & Bid Requests ───────────────────── */}
          {step === 5 && (
            <div className="p-5 space-y-6">

              {/* Permit checklist */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <p className="text-sm font-bold text-gray-800">Kentucky Permit Checklist</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Typical requirements for a <span className="font-semibold">{JOB_TYPES.find(j => j.id === jobType)?.label ?? jobType}</span> in KY. Always verify with your local county building office — requirements vary by jurisdiction.
                </p>
                <div className="space-y-2">
                  {(KY_PERMITS[jobType] ?? KY_PERMITS.other).map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-xs border ${
                        item.required
                          ? "bg-red-50 border-red-200 text-red-800"
                          : "bg-gray-50 border-gray-200 text-gray-600"
                      }`}
                    >
                      <span className={`flex-shrink-0 mt-0.5 font-bold ${item.required ? "text-red-500" : "text-gray-400"}`}>
                        {item.required ? "⚠" : "•"}
                      </span>
                      <span className="leading-relaxed">{item.label}</span>
                      {item.required && (
                        <span className="ml-auto flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
                          Required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Subcontractor bid requests */}
              {trades.filter(t => t.category === "Subcontractor" && t.qty > 0).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ClipboardCopy className="w-4 h-4 text-blue-600" />
                    <p className="text-sm font-bold text-gray-800">Subcontractor Bid Requests</p>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Copy a pre-filled email template for each sub trade. Paste into Gmail, Messages, or email.
                  </p>

                  {/* City input */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">City / Town</label>
                    <input
                      value={projectCity}
                      onChange={e => setProjectCity(e.target.value)}
                      placeholder="e.g. Lexington"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Used to personalise the bid request emails</p>
                  </div>

                  <div className="space-y-3">
                    {trades.filter(t => t.category === "Subcontractor" && t.qty > 0).map(t => {
                      const copied = copiedTradeId === t.id;
                      const jobLabel = JOB_TYPES.find(j => j.id === jobType)?.label ?? jobType;
                      return (
                        <div key={t.id} className="rounded-xl border border-blue-100 bg-blue-50 overflow-hidden">
                          <div className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm">{t.trade}</p>
                              <p className="text-xs text-gray-500 truncate">{t.description}</p>
                              <p className="text-[11px] text-blue-600 mt-0.5">
                                {t.qty} {t.unit} · {formatCurrency(t.qty * t.selectedCost)}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                const text = generateBidRequest(t, jobLabel, projectCity);
                                navigator.clipboard.writeText(text).then(() => {
                                  setCopiedTradeId(t.id);
                                  setTimeout(() => setCopiedTradeId(null), 2500);
                                });
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                                copied
                                  ? "bg-emerald-500 text-white"
                                  : "bg-blue-600 text-white hover:bg-blue-700"
                              }`}
                            >
                              {copied
                                ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</>
                                : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy Bid Request</>
                              }
                            </button>
                          </div>
                          {/* Preview of template */}
                          <div className="px-3.5 pb-2.5">
                            <pre className="text-[10px] text-gray-500 bg-white border border-blue-100 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed font-sans overflow-hidden max-h-28">
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
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-500">
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
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Estimate Title</label>
                <input
                  value={estimateTitle}
                  onChange={e => setEstimateTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="e.g. Johnson Kitchen Remodel — GC Estimate"
                />
              </div>

              {/* Markup & Contingency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Markup %</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={markup}
                    onChange={e => setMarkup(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Typical GC: 15–25%</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Contingency %</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={contingency}
                    onChange={e => setContingency(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Typical: 5–15%</p>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Running Total</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal ({trades.filter(t => t.qty > 0).length} trades)</span>
                  <span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                {parseFloat(markup) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Markup ({markup}%)</span>
                    <span className="text-emerald-600 font-medium">+ {formatCurrency(markupAmt)}</span>
                  </div>
                )}
                {parseFloat(contingency) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Contingency ({contingency}%)</span>
                    <span className="text-blue-600 font-medium">+ {formatCurrency(contingencyAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>Grand Total</span>
                  <span className="text-amber-600">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes / Scope Language</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Exclusions, payment terms, scope clarifications…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
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
                    <span className="text-xs font-bold text-gray-700">
                      Save {phasesEditable.length} phases to job for step-by-step tracking
                    </span>
                  </label>
                  {savePhasesToJob && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                      <ol className="space-y-1">
                        {phasesEditable.map((phase, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-blue-800">
                            <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
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
                    <div key={i} className="flex gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {rf.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Line item summary */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Line Items</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">Trade</th>
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-gray-400 uppercase">Qty</th>
                        <th className="text-right px-2 py-2 text-[10px] font-bold text-gray-400 uppercase">Unit $</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-gray-400 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {trades.filter(t => t.qty > 0 && t.selectedCost > 0).map(t => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-800 truncate max-w-[140px]">{t.trade}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{t.qty} {t.unit}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{formatCurrency(t.selectedCost)}</td>
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
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-white flex-shrink-0">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4 | 5 | 6)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          )}

          {step === 1 && (
            <p className="text-xs text-gray-400">Select a job type to continue</p>
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
