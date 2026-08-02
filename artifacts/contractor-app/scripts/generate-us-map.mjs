/**
 * Codegen script: generates USMapData.ts from real us-atlas TopoJSON.
 * Run: node artifacts/contractor-app/scripts/generate-us-map.mjs
 *
 * Uses D3's Albers USA projection at 960×600 — same as every real D3 US map.
 */

import { feature } from "topojson-client";
import { geoAlbersUsa, geoPath, geoCentroid } from "d3-geo";
import { createRequire } from "module";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// us-atlas ships the TopoJSON; 10m = high-quality simplified outlines
const topology = require("us-atlas/states-10m.json");

// Extract GeoJSON first so we can fitSize the projection to exactly 960×600
const statesGeoForFit = feature(topology, topology.objects.states);

// geoAlbersUsa().fitSize() adjusts scale+translate so the whole map fits
// within the requested canvas — AK/HI insets are kept inside the bounds.
const projection = geoAlbersUsa().fitSize([960, 600], statesGeoForFit);
const pathGen = geoPath(projection);

// FIPS numeric code → USPS 2-letter code
const FIPS_TO_CODE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA",
  "08":"CO","09":"CT","10":"DE","12":"FL","13":"GA",
  "15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO",
  "30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ",
  "35":"NM","36":"NY","37":"NC","38":"ND","39":"OH",
  "40":"OK","41":"OR","42":"PA","44":"RI","45":"SC",
  "46":"SD","47":"TN","48":"TX","49":"UT","50":"VT",
  "51":"VA","53":"WA","54":"WV","55":"WI","56":"WY",
};

// Full state name for each USPS code
const CODE_TO_NAME = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
  HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
  KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",
  MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",
  MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
  NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",
  OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
  VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
};

// Region for each code (preserved from original file)
const CODE_TO_REGION = {
  WA:"Pacific",OR:"Pacific",CA:"Pacific",AK:"Pacific",HI:"Pacific",
  MT:"Mountain",ID:"Mountain",WY:"Mountain",NV:"Mountain",UT:"Mountain",
  CO:"Mountain",AZ:"Mountain",NM:"Mountain",
  ND:"Great Plains",SD:"Great Plains",NE:"Great Plains",KS:"Great Plains",
  OK:"Great Plains",TX:"Great Plains",
  MN:"Midwest",WI:"Midwest",MI:"Midwest",IA:"Midwest",IL:"Midwest",
  IN:"Midwest",OH:"Midwest",MO:"Midwest",AR:"Midwest",LA:"Midwest",
  KY:"South",TN:"South",MS:"South",AL:"South",GA:"South",
  FL:"South",SC:"South",NC:"South",
  NY:"Mid-Atlantic",PA:"Mid-Atlantic",NJ:"Mid-Atlantic",DE:"Mid-Atlantic",
  MD:"Mid-Atlantic",WV:"Mid-Atlantic",VA:"Mid-Atlantic",
  ME:"New England",VT:"New England",NH:"New England",
  MA:"New England",RI:"New England",CT:"New England",
};

// Build a map of USPS code → SVG path + centroid
const results = {};

for (const feat of statesGeoForFit.features) {
  // FIPS id may be a number or zero-padded string
  const fips = String(feat.id).padStart(2, "0");
  const code = FIPS_TO_CODE[fips];
  if (!code) {
    console.warn(`Unknown FIPS: ${feat.id}`);
    continue;
  }

  const d = pathGen(feat);
  if (!d) {
    console.warn(`No path generated for ${code}`);
    continue;
  }

  // Round coordinates to 1 decimal place to keep the file readable
  const dRounded = d.replace(/(\d+\.\d{2,})/g, m => String(Math.round(parseFloat(m) * 10) / 10));

  const centroid = geoCentroid(feat);
  const projected = projection(centroid);
  let lx = 0, ly = 0;
  if (projected) {
    lx = Math.round(projected[0]);
    ly = Math.round(projected[1]);
  }

  results[code] = { code, name: CODE_TO_NAME[code], d: dRounded, lx, ly, region: CODE_TO_REGION[code] ?? "Other" };
}

// Order by region then code, matching original file order
const REGION_ORDER = ["Pacific","Mountain","Great Plains","Midwest","South","Mid-Atlantic","New England"];
const sorted = Object.values(results).sort((a, b) => {
  const ri = REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region);
  if (ri !== 0) return ri;
  return a.code.localeCompare(b.code);
});

// Generate TypeScript source
const stateLines = sorted.map(s => {
  return `  {
    code: "${s.code}", name: "${s.name}", region: "${s.region}",
    d: "${s.d}",
    lx: ${s.lx}, ly: ${s.ly},
  }`;
});

const ts = `/**
 * US state SVG path data — generated from us-atlas TopoJSON (110m).
 * ViewBox: "0 0 960 600"
 * Projection: Albers USA — geoAlbersUsa().scale(1280).translate([480, 300])
 * DO NOT EDIT by hand — regenerate with:
 *   node artifacts/contractor-app/scripts/generate-us-map.mjs
 * lx/ly = projected centroid (label anchor inside the state boundary).
 */

export interface StateInfo {
  code: string;
  name: string;
  d: string;
  lx: number;
  ly: number;
  region: string;
}

export const US_STATES: StateInfo[] = [
${stateLines.join(",\n")}
];

/** USPS code → display name */
export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  US_STATES.map(s => [s.code, s.name])
);

/** Full name / common variations → USPS code (for migration from freeform text) */
export const STATE_NAME_TO_CODE: Record<string, string> = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR",
  "california":"CA","colorado":"CO","connecticut":"CT","delaware":"DE",
  "florida":"FL","georgia":"GA","hawaii":"HI","idaho":"ID",
  "illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS",
  "kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD",
  "massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS",
  "missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV",
  "new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY",
  "north carolina":"NC","north dakota":"ND","ohio":"OH","oklahoma":"OK",
  "oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC",
  "south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT",
  "vermont":"VT","virginia":"VA","washington":"WA","west virginia":"WV",
  "wisconsin":"WI","wyoming":"WY",
  // abbreviations
  "al":"AL","ak":"AK","az":"AZ","ar":"AR","ca":"CA","co":"CO","ct":"CT","de":"DE",
  "fl":"FL","ga":"GA","hi":"HI","id":"ID","il":"IL","in":"IN","ia":"IA","ks":"KS",
  "ky":"KY","la":"LA","me":"ME","md":"MD","ma":"MA","mi":"MI","mn":"MN","ms":"MS",
  "mo":"MO","mt":"MT","ne":"NE","nv":"NV","nh":"NH","nj":"NJ","nm":"NM","ny":"NY",
  "nc":"NC","nd":"ND","oh":"OH","ok":"OK","or":"OR","pa":"PA","ri":"RI","sc":"SC",
  "sd":"SD","tn":"TN","tx":"TX","ut":"UT","vt":"VT","va":"VA","wa":"WA","wv":"WV",
  "wi":"WI","wy":"WY",
};

/** Ordered regions for the inspector checklist */
export const REGIONS: Array<{ name: string; codes: string[] }> = [
  { name:"Pacific",        codes:["WA","OR","CA","AK","HI"] },
  { name:"Mountain",       codes:["MT","ID","WY","NV","UT","CO","AZ","NM"] },
  { name:"Great Plains",   codes:["ND","SD","NE","KS","OK","TX"] },
  { name:"Midwest",        codes:["MN","WI","MI","IA","IL","IN","OH","MO","AR","LA"] },
  { name:"South",          codes:["KY","TN","MS","AL","GA","FL","SC","NC"] },
  { name:"Mid-Atlantic",   codes:["NY","PA","NJ","DE","MD","WV","VA"] },
  { name:"New England",    codes:["ME","VT","NH","MA","RI","CT"] },
];

/**
 * Migrate legacy freeform \`areas\` strings: any that match a US state name or code
 * are promoted to \`selectedStates\`; the rest stay in \`areas\`.
 */
export function migrateAreas(areas: string[]): { selectedStates: string[]; areas: string[] } {
  const selectedStates: string[] = [];
  const remaining: string[] = [];
  for (const a of areas) {
    const key = a.trim().toLowerCase();
    const code = STATE_NAME_TO_CODE[key];
    if (code && !selectedStates.includes(code)) {
      selectedStates.push(code);
    } else {
      remaining.push(a);
    }
  }
  return { selectedStates, areas: remaining };
}

/** Generate an auto-caption from selected state codes. */
export function buildCaption(codes: string[]): string {
  if (codes.length === 0) return "";
  const names = codes
    .map(c => STATE_CODE_TO_NAME[c] ?? c)
    .sort((a, b) => a.localeCompare(b));
  if (names.length === 1) return \`Proudly Serving \${names[0]}\`;
  if (names.length === 2) return \`Proudly Serving \${names[0]} & \${names[1]}\`;
  const last = names.pop()!;
  return \`Proudly Serving \${names.join(", ")} & \${last}\`;
}
`;

const outPath = resolve(__dirname, "../src/pages/website/sections/USMapData.ts");
writeFileSync(outPath, ts, "utf8");
console.log(`✓ Wrote ${sorted.length} states to ${outPath}`);
console.log("States:", sorted.map(s => s.code).join(", "));
