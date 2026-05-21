import { useState, useMemo } from "react";
import {
  useCreateEstimate,
  Job, CreateEstimateRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  X, ChevronLeft, ChevronRight, Wand2, AlertTriangle, Info,
  ChevronDown, ChevronUp, Check, Plus, Minus,
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
    const hrLo = isRelocate ? 70 : 60, hrMid = isRelocate ? 85 : 75, hrHi = isRelocate ? 100 : 95;
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
    if (wins > 0) add({ trade: "Windows", description: "Window remove & replace — supply & install", qty: wins, unit: "EACH", lowCost: 325, midCost: 475, highCost: 700, category: "Subcontractor", tips: ["Double-pane Low-E is KY energy code standard", "Confirm exterior caulk & flashing tape included", "Measure rough opening — don't just order existing size", "Lead paint: pre-1978 homes require RRP certified contractor"], riskNote: wins > 0 ? "Pre-1978 homes may have lead paint at window frames — EPA RRP rules apply" : undefined });
    if (doors > 0) add({ trade: "Doors", description: "Door remove & replace — pre-hung install", qty: doors, unit: "EACH", lowCost: 300, midCost: 450, highCost: 700, category: "Labor", tips: ["Pre-hung units are faster and recommended", "Confirm door swing direction with client", "Exterior: weatherstrip + threshold included?"] });
    if (answers.headers) add({ trade: "Headers", description: "New structural header framing", qty: wins + doors, unit: "EACH", lowCost: 350, midCost: 600, highCost: 950, category: "Labor", tips: ["Verify load path — may need engineer in KY for load-bearing", "LVL headers are stronger than dimensional lumber", "Temporary support required during header work"], riskNote: "Structural header work on load-bearing walls may require engineered drawings in KY" });
    if (answers.int_trim) add({ trade: "Interior Trim", description: "Casing, stool, apron — supply & install", qty: (wins * 14) + (doors * 10), unit: "LF", lowCost: 4.50, midCost: 7, highCost: 10, category: "Labor", tips: ["Match existing trim profile (colonial, craftsman, etc.)", "Confirm stain vs. paint grade wood"] });
    add({ trade: "Caulk & Paint", description: "Caulk, touch-up paint — exterior & interior", qty: wins + doors, unit: "EACH", lowCost: 30, midCost: 60, highCost: 100, category: "Labor", tips: [] });
  }

  else if (jobType === "full_remodel") {
    const sf = Math.max(n(answers, "sqft", 1000), 1);
    const wetRooms = n(answers, "wet_rooms", 2);
    const isGut = answers.scope === "full_gut";
    add({ trade: "Demo", description: `${isGut ? "Full gut — all rooms to studs" : "Selective demo — targeted areas"}`, qty: sf, unit: "SF", lowCost: isGut ? 2.50 : 1.25, midCost: isGut ? 3.75 : 2, highCost: isGut ? 5 : 3, category: "Labor", tips: ["Hazmat survey first if pre-1980", "Dumpster size: 20-30 yard for full gut"], riskNote: isGut ? "Full gut — test for asbestos and lead paint before demo if home is pre-1980" : undefined });
    if (answers.structural) add({ trade: "Structural / Framing", description: "Structural changes — remove walls, new openings", qty: 1, unit: "LOT", lowCost: 2500, midCost: 5000, highCost: 10000, category: "Subcontractor", tips: ["Engineering drawings required in KY for load-bearing work", "Confirm temporary shoring plan"], riskNote: "Structural changes require permit + engineered drawings in most KY jurisdictions" });
    add({ trade: "Plumbing", description: `Plumbing rough-in — ${wetRooms} wet room${wetRooms !== 1 ? "s" : ""}`, qty: wetRooms, unit: "LOT", lowCost: 1500, midCost: 2800, highCost: 5000, category: "Subcontractor", tips: ["Permit required for new rough-in", "Confirm all fixture rough-in heights are set before drywall"] });
    add({ trade: "Electrical", description: "Electrical rough-in & panel work", qty: sf, unit: "SF", lowCost: 3, midCost: 4.50, highCost: 7, category: "Subcontractor", tips: ["Permit required", "Confirm panel capacity — older homes often need upgrade", "AFCI breakers required for bedrooms in KY"] });
    add({ trade: "Insulation", description: "Batt insulation — walls & ceiling", qty: sf, unit: "SF", lowCost: 1.25, midCost: 1.75, highCost: 2.50, category: "Labor", tips: ["R-15 for walls, R-38 for ceilings in KY climate", "Vapor barrier on cold side in KY is debated — confirm with inspector"] });
    add({ trade: "Drywall", description: "Hang & finish drywall", qty: sf * 2, unit: "SF", lowCost: 2.50, midCost: 3.50, highCost: 4.50, category: "Labor", tips: ["Level-4 finish for painted walls", "Moisture-resistant in all wet areas"] });
    const flooring = String(answers.flooring ?? "lvp");
    const flLo = flooring === "tile" ? 7 : flooring === "carpet" ? 2.50 : 3;
    const flMid = flooring === "tile" ? 11 : flooring === "carpet" ? 3.75 : 4.50;
    const flHi = flooring === "tile" ? 16 : flooring === "carpet" ? 5.50 : 6;
    add({ trade: "Flooring", description: `Flooring — ${flooring === "lvp" ? "LVP throughout" : flooring === "carpet" ? "carpet + LVP mix" : "tile"}`, qty: sf, unit: "SF", lowCost: flLo, midCost: flMid, highCost: flHi, category: "Subcontractor", tips: ["Subfloor must be flat to 3/16\" in 10 ft for LVP", "Include transitions and stair nose in quote"] });
    add({ trade: "Paint", description: "Interior paint — all rooms", qty: sf * 1.75, unit: "SF", lowCost: 1.25, midCost: 1.80, highCost: 2.50, category: "Labor", tips: ["Two coats finish + primer on new drywall", "Confirm color selection before scheduling"] });
    add({ trade: "Trim & Doors", description: "Interior doors, baseboard, casing", qty: sf * 0.5, unit: "LF", lowCost: 5, midCost: 8, highCost: 12, category: "Labor", tips: ["Pre-hung doors save time", "MDF baseboard is cost-effective in KY market"] });
    add({ trade: "Cleanup", description: "Final punch, clean & haul", qty: 1, unit: "LOT", lowCost: 500, midCost: 900, highCost: 1500, category: "Labor", tips: [] });
  }

  else if (jobType === "addition") {
    const sf = Math.max(n(answers, "sqft", 400), 1);
    const wetRooms = n(answers, "wet_rooms", 1);
    const foundation = String(answers.foundation ?? "slab");
    const fndLo = foundation === "basement" ? 25 : foundation === "crawl" ? 10 : 6;
    const fndMid = foundation === "basement" ? 40 : foundation === "crawl" ? 16 : 10;
    const fndHi = foundation === "basement" ? 60 : foundation === "crawl" ? 25 : 15;
    add({ trade: "Foundation", description: `${foundation === "slab" ? "Concrete slab" : foundation === "crawl" ? "Crawl space foundation" : "Basement foundation"}`, qty: sf, unit: "SF", lowCost: fndLo, midCost: fndMid, highCost: fndHi, category: "Subcontractor", tips: ["Permit and inspection required", "Soil bearing test may be needed on soft ground", "Confirm waterproofing on basement or crawl walls"], riskNote: "Foundation work requires permit and typically two inspections in KY" });
    add({ trade: "Framing", description: "Wood framing — walls, floor, ceiling", qty: sf, unit: "SF", lowCost: 20, midCost: 30, highCost: 45, category: "Labor", tips: ["Header sizing for openings must meet KY code span tables", "Confirm shear wall requirements with engineer for 2-story"] });
    add({ trade: "Roofing", description: "Roof framing, sheathing, shingles", qty: sf * 1.15, unit: "SF", lowCost: 4, midCost: 6, highCost: 9, category: "Subcontractor", tips: ["Match existing roof pitch and shingle", "Ice-and-water shield required first 3 ft in KY", "30-yr architectural shingle is standard"] });
    add({ trade: "Windows & Doors", description: "Exterior windows & doors — supply & install", qty: Math.ceil(sf / 80), unit: "EACH", lowCost: 450, midCost: 650, highCost: 950, category: "Subcontractor", tips: ["Double-pane Low-E required for KY energy code", "Match existing exterior style/color"] });
    if (answers.mechanical) {
      add({ trade: "Electrical", description: "Electrical rough-in & panel extension", qty: sf, unit: "SF", lowCost: 4, midCost: 6, highCost: 9, category: "Subcontractor", tips: ["Confirm panel has capacity for addition", "Smoke & CO detector in new space required"] });
      if (wetRooms > 0) add({ trade: "Plumbing", description: `Plumbing rough-in — ${wetRooms} wet room${wetRooms !== 1 ? "s" : ""}`, qty: wetRooms, unit: "LOT", lowCost: 2000, midCost: 3500, highCost: 6000, category: "Subcontractor", tips: ["Confirm tie-in point to existing main line", "Permit required for new plumbing in KY"] });
    }
    add({ trade: "Insulation", description: "Insulation — walls, floor, ceiling", qty: sf, unit: "SF", lowCost: 1.50, midCost: 2, highCost: 3, category: "Labor", tips: ["R-15 walls, R-38 ceiling minimum in KY climate zone 4"] });
    add({ trade: "Drywall", description: "Hang & finish drywall", qty: sf * 2, unit: "SF", lowCost: 2.50, midCost: 3.50, highCost: 4.50, category: "Labor", tips: ["Level-4 finish for painted walls"] });
    add({ trade: "Flooring", description: "Flooring — supply & install", qty: sf, unit: "SF", lowCost: 3.50, midCost: 5.50, highCost: 8, category: "Subcontractor", tips: ["Confirm transition to existing floor in adjacent rooms"] });
    add({ trade: "Paint & Trim", description: "Interior paint, baseboard, trim", qty: sf * 2, unit: "SF", lowCost: 1.50, midCost: 2.25, highCost: 3.25, category: "Labor", tips: [] });
  }

  else {
    const hrs = Math.max(n(answers, "labor_hours", 40), 0);
    const mat = n(answers, "materials", 2000);
    if (hrs > 0) add({ trade: "Labor", description: "General construction labor", qty: hrs, unit: "HR", lowCost: 28, midCost: 42, highCost: 60, category: "Labor", tips: ["Confirm scope in writing before work begins", "Ask about overtime rates for evenings/weekends"] });
    if (mat > 0) add({ trade: "Materials", description: "Materials — allowance", qty: 1, unit: "LOT", lowCost: mat * 0.8, midCost: mat, highCost: mat * 1.3, category: "Material", tips: ["Track receipts — owner may want cost-plus billing"] });
  }

  return items;
}

// ─── Risk Flags ───────────────────────────────────────────────────────────────

function getRiskFlags(jobType: string, answers: Answers): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const sq = n(answers, "sqft", 0);
  if ((jobType === "kitchen" || jobType === "bathroom" || jobType === "full_remodel") && answers.scope === "full_gut") flags.push({ level: "warn", message: "Full gut: schedule asbestos & lead test on pre-1980 homes before demo day." });
  if (jobType === "siding" && answers.tearoff) flags.push({ level: "warn", message: "Siding tearoff on older homes: test for asbestos cement siding before removal." });
  if (jobType === "plumbing" && answers.trench) flags.push({ level: "warn", message: "Trenching required: call 811 (Dig Safe) at least 3 business days before digging — required by KY law." });
  if (jobType === "deck") flags.push({ level: "info", message: "Deck permit required in most KY counties. Factor in 2-4 week permit lead time." });
  if (jobType === "windows_doors" && n(answers, "windows", 0) > 0) flags.push({ level: "info", message: "Pre-1978 homes: EPA RRP lead paint rules apply to window work. Certified contractor required." });
  if (jobType === "windows_doors" && answers.headers) flags.push({ level: "warn", message: "Structural headers: load-bearing wall changes require permit and may need engineered drawings in KY." });
  if (jobType === "addition") flags.push({ level: "warn", message: "Additions require building permit, multiple inspections, and sometimes a survey. Budget 4-8 weeks for permit." });
  if (jobType === "full_remodel" && answers.structural) flags.push({ level: "warn", message: "Structural changes require permit + likely engineered drawings. Get engineer review before bidding hard price." });
  if (jobType === "ceiling_repair" && answers.popcorn) flags.push({ level: "warn", message: "Popcorn ceiling removal: if home built before 1978, test for asbestos in texture — abatement can be $3-10/SF." });
  if (sq > 2000 && (jobType === "full_remodel" || jobType === "addition")) flags.push({ level: "info", message: `Large scope (${sq.toLocaleString()} SF): consider splitting estimate by trade for easier client review and subcontractor bidding.` });
  return flags;
}

// ─── Phase Templates ──────────────────────────────────────────────────────────

const PHASE_TEMPLATES: Record<string, string[]> = {
  kitchen:       ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Drywall", "Cabinets", "Countertops", "Flooring", "Paint", "Fixtures & Trim", "Final Punch"],
  bathroom:      ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Cement Board / Moisture Drywall", "Tile (Shower + Floor)", "Vanity & Toilet", "Paint & Accessories", "Final Punch"],
  siding:        ["Tearoff & Disposal", "House Wrap Install", "Siding Install", "Trim & Corners", "Caulk & Touch-up", "Final Walkthrough"],
  ceiling_repair:["Protect Floors & Furniture", "Popcorn Scrape", "Crack Repair", "Skim Coat & Sand", "Prime & Paint", "Final Cleanup"],
  plumbing:      ["Locate Tie-in Points", "Rough-in / Trench", "Inspection", "Fixtures Connect", "Pressure Test", "Cleanup"],
  deck:          ["Permit & Layout", "Footings & Posts", "Beam & Joist Framing", "Decking Install", "Railing & Stairs", "Seal / Stain", "Final Inspection"],
  windows_doors: ["Order & Lead Time", "Remove Old Units", "Framing / Headers", "Install New Units", "Insulate & Seal", "Interior Trim & Casing", "Caulk, Paint & Touch-up"],
  full_remodel:  ["Demo & Haul", "Rough Plumbing", "Rough Electrical", "Insulation", "Drywall Hang", "Drywall Finish", "Flooring", "Paint & Prime", "Cabinets & Fixtures", "Trim & Doors", "Final Punch"],
  addition:      ["Permit & Survey", "Foundation / Footings", "Framing", "Roofing", "Windows & Exterior Doors", "Rough MEP (Mech/Elec/Plumb)", "Inspections", "Insulation", "Drywall", "Flooring", "Paint & Trim", "Final Inspection"],
  other:         ["Scope & Materials Procurement", "Phase 1 Work", "Phase 2 Work", "Final Punch & Cleanup"],
};

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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [jobType, setJobType] = useState<string>("");
  const [answers, setAnswers] = useState<Answers>({});
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null);
  const [markup, setMarkup] = useState(String(DEFAULT_MARKUP));
  const [contingency, setContingency] = useState(String(DEFAULT_CONTINGENCY));
  const [estimateTitle, setEstimateTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const questions = (jobType ? SCOPE_QUESTIONS[jobType] ?? [] : []).filter(q => !q.condition || q.condition(answers));
  const riskFlags = useMemo(() => jobType ? getRiskFlags(jobType, answers) : [], [jobType, answers]);
  const phases = jobType ? PHASE_TEMPLATES[jobType] ?? [] : [];

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

  const subtotal = trades.reduce((s, t) => s + t.qty * t.selectedCost, 0);
  const markupAmt = subtotal * (parseFloat(markup) / 100 || 0);
  const afterMarkup = subtotal + markupAmt;
  const contingencyAmt = afterMarkup * (parseFloat(contingency) / 100 || 0);
  const grandTotal = afterMarkup + contingencyAmt;

  const phasesNote = phases.length ? `\n\nPHASES:\n${phases.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "";

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
      toast({ title: "Estimate created", description: `${estimateTitle} saved as draft.` });
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
            {([1, 2, 3, 4] as const).map(s => (
              <div key={s} className={`w-6 h-1.5 rounded-full transition-colors ${s <= step ? "bg-white" : "bg-amber-300/50"}`} />
            ))}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-amber-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step label */}
        <div className="px-5 py-2 border-b border-gray-100 bg-amber-50 flex-shrink-0">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            {step === 1 && "Step 1 of 4 — Choose Job Type"}
            {step === 2 && "Step 2 of 4 — Scope Questions"}
            {step === 3 && "Step 3 of 4 — Trade Breakdown & KY Cost Ranges"}
            {step === 4 && "Step 4 of 4 — Review & Create Estimate"}
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

          {/* ── Step 4: Review & Create ──────────────────────────────── */}
          {step === 4 && (
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

              {/* Phase Template */}
              {phases.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Project Phases (saved to estimate notes)</p>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                    <ol className="space-y-1">
                      {phases.map((phase, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-blue-800">
                          <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                          {phase}
                        </li>
                      ))}
                    </ol>
                  </div>
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
              onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
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
              Review & Finalize <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 4 && (
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
