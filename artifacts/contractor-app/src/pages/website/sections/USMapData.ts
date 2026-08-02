/**
 * Simplified US state SVG path data.
 * ViewBox: "0 0 960 600"
 * Projection: Albers Equal-Area Conic (approximate), contiguous states + AK/HI insets.
 * Paths use simplified polygonal approximations — not pixel-perfect but geographically recognizable.
 * lx/ly = label anchor (approximate centroid of each state shape).
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
  // ── Pacific ──────────────────────────────────────────────────────────────
  { code:"WA", name:"Washington",       region:"Pacific",
    d:"M115,52 L237,67 L248,108 L200,117 L184,122 L108,115Z",             lx:178, ly:85  },
  { code:"OR", name:"Oregon",           region:"Pacific",
    d:"M108,115 L200,117 L248,108 L258,148 L260,200 L108,195Z",           lx:178, ly:158 },
  { code:"CA", name:"California",       region:"Pacific",
    d:"M108,195 L205,202 L242,252 L262,308 L250,382 L222,453 L193,500 L158,512 L120,510 L88,480 L75,415 L77,332 L93,263Z", lx:158, ly:375 },

  // ── Mountain ─────────────────────────────────────────────────────────────
  { code:"ID", name:"Idaho",            region:"Mountain",
    d:"M242,52 L248,108 L258,148 L260,200 L268,230 L318,232 L316,162 L306,65Z", lx:282, ly:152 },
  { code:"MT", name:"Montana",          region:"Mountain",
    d:"M252,42 L477,48 L467,162 L316,162 L306,65Z",                       lx:363, ly:100 },
  { code:"WY", name:"Wyoming",          region:"Mountain",
    d:"M296,162 L466,162 L465,260 L296,260Z",                             lx:381, ly:210 },
  { code:"NV", name:"Nevada",           region:"Mountain",
    d:"M185,150 L258,147 L306,225 L305,388 L208,386 L200,302Z",          lx:245, ly:272 },
  { code:"UT", name:"Utah",             region:"Mountain",
    d:"M208,228 L302,226 L302,388 L208,388Z",                             lx:254, ly:307 },
  { code:"CO", name:"Colorado",         region:"Mountain",
    d:"M300,260 L465,258 L464,358 L300,358Z",                             lx:382, ly:308 },
  { code:"AZ", name:"Arizona",          region:"Mountain",
    d:"M165,380 L302,382 L302,537 L228,537 L222,530 L167,475Z",          lx:230, ly:455 },
  { code:"NM", name:"New Mexico",       region:"Mountain",
    d:"M300,358 L464,358 L463,537 L392,537 L383,542 L297,535Z",          lx:382, ly:444 },

  // ── Great Plains ─────────────────────────────────────────────────────────
  { code:"ND", name:"North Dakota",     region:"Great Plains",
    d:"M461,42 L580,44 L580,130 L461,130Z",                               lx:520, ly:86  },
  { code:"SD", name:"South Dakota",     region:"Great Plains",
    d:"M461,130 L580,132 L580,226 L461,226Z",                             lx:520, ly:178 },
  { code:"NE", name:"Nebraska",         region:"Great Plains",
    d:"M461,226 L590,228 L588,293 L461,293Z",                             lx:524, ly:259 },
  { code:"KS", name:"Kansas",           region:"Great Plains",
    d:"M461,293 L588,295 L587,358 L461,358Z",                             lx:523, ly:326 },
  { code:"OK", name:"Oklahoma",         region:"Great Plains",
    d:"M297,358 L588,356 L587,420 L436,420 L436,392 L297,392Z",          lx:508, ly:390 },
  { code:"TX", name:"Texas",            region:"Great Plains",
    d:"M436,420 L588,418 L597,505 L602,558 L505,558 L443,532 L435,455Z", lx:522, ly:490 },

  // ── Midwest ───────────────────────────────────────────────────────────────
  { code:"MN", name:"Minnesota",        region:"Midwest",
    d:"M580,28 L680,30 L680,192 L580,192Z",                               lx:630, ly:110 },
  { code:"IA", name:"Iowa",             region:"Midwest",
    d:"M576,192 L678,190 L680,262 L576,262Z",                             lx:628, ly:226 },
  { code:"MO", name:"Missouri",         region:"Midwest",
    d:"M576,262 L680,260 L682,362 L636,366 L589,366 L574,333Z",          lx:628, ly:312 },
  { code:"AR", name:"Arkansas",         region:"Midwest",
    d:"M589,366 L668,364 L668,430 L589,432Z",                             lx:628, ly:397 },
  { code:"LA", name:"Louisiana",        region:"Midwest",
    d:"M576,432 L668,430 L672,510 L642,536 L596,526 L574,492Z",          lx:622, ly:478 },
  { code:"WI", name:"Wisconsin",        region:"Midwest",
    d:"M638,48 L720,48 L722,192 L638,192Z",                               lx:680, ly:120 },
  { code:"IL", name:"Illinois",         region:"Midwest",
    d:"M640,192 L700,192 L703,332 L642,337Z",                             lx:671, ly:262 },
  { code:"IN", name:"Indiana",          region:"Midwest",
    d:"M700,192 L757,192 L758,330 L703,332Z",                             lx:730, ly:260 },
  { code:"MI", name:"Michigan",         region:"Midwest",
    d:"M656,50 L780,50 L782,90 L656,90Z M700,90 L798,90 L808,183 L756,192 L700,192Z", lx:751, ly:143 },
  { code:"OH", name:"Ohio",             region:"Midwest",
    d:"M757,192 L840,186 L843,306 L758,310Z",                             lx:800, ly:248 },

  // ── South ─────────────────────────────────────────────────────────────────
  { code:"KY", name:"Kentucky",         region:"South",
    d:"M703,332 L849,348 L852,392 L796,398 L742,400 L704,396Z",          lx:778, ly:368 },
  { code:"TN", name:"Tennessee",        region:"South",
    d:"M672,392 L850,390 L850,430 L673,434Z",                             lx:760, ly:411 },
  { code:"MS", name:"Mississippi",      region:"South",
    d:"M645,432 L718,428 L722,534 L647,535Z",                             lx:684, ly:481 },
  { code:"AL", name:"Alabama",          region:"South",
    d:"M718,428 L778,422 L780,496 L748,502 L722,497Z",                   lx:750, ly:458 },
  { code:"GA", name:"Georgia",          region:"South",
    d:"M775,400 L838,397 L850,490 L820,510 L758,512 L748,460Z",          lx:802, ly:455 },
  { code:"FL", name:"Florida",          region:"South",
    d:"M742,510 L820,510 L855,532 L865,580 L826,594 L782,590 L752,567Z", lx:800, ly:558 },
  { code:"SC", name:"South Carolina",   region:"South",
    d:"M819,400 L876,388 L884,453 L828,460Z",                             lx:851, ly:425 },
  { code:"NC", name:"North Carolina",   region:"South",
    d:"M800,372 L894,357 L899,413 L862,418 L798,423Z",                   lx:849, ly:390 },

  // ── Mid-Atlantic ──────────────────────────────────────────────────────────
  { code:"VA", name:"Virginia",         region:"Mid-Atlantic",
    d:"M822,314 L896,303 L900,368 L843,376Z",                             lx:862, ly:338 },
  { code:"WV", name:"West Virginia",    region:"Mid-Atlantic",
    d:"M797,286 L847,276 L851,342 L798,350Z",                             lx:825, ly:313 },
  { code:"MD", name:"Maryland",         region:"Mid-Atlantic",
    d:"M856,308 L896,300 L899,334 L876,343 L857,334Z",                   lx:878, ly:320 },
  { code:"DE", name:"Delaware",         region:"Mid-Atlantic",
    d:"M878,295 L897,290 L899,335 L879,337Z",                             lx:888, ly:313 },
  { code:"PA", name:"Pennsylvania",     region:"Mid-Atlantic",
    d:"M839,226 L914,212 L920,295 L840,302Z",                             lx:879, ly:258 },
  { code:"NJ", name:"New Jersey",       region:"Mid-Atlantic",
    d:"M887,257 L912,251 L915,305 L889,308Z",                             lx:900, ly:278 },
  { code:"NY", name:"New York",         region:"Mid-Atlantic",
    d:"M836,178 L913,162 L918,253 L862,269 L838,256Z",                   lx:877, ly:215 },

  // ── New England ───────────────────────────────────────────────────────────
  { code:"CT", name:"Connecticut",      region:"New England",
    d:"M893,252 L920,248 L922,283 L895,288Z",                             lx:907, ly:267 },
  { code:"RI", name:"Rhode Island",     region:"New England",
    d:"M921,258 L936,254 L939,285 L924,288Z",                             lx:931, ly:272 },
  { code:"MA", name:"Massachusetts",    region:"New England",
    d:"M892,210 L946,210 L943,250 L893,252Z",                             lx:919, ly:228 },
  { code:"VT", name:"Vermont",          region:"New England",
    d:"M896,163 L917,158 L916,214 L896,217Z",                             lx:907, ly:187 },
  { code:"NH", name:"New Hampshire",    region:"New England",
    d:"M912,148 L935,148 L931,213 L912,213Z",                             lx:923, ly:180 },
  { code:"ME", name:"Maine",            region:"New England",
    d:"M917,55 L960,72 L954,172 L928,190 L912,158Z",                     lx:938, ly:128 },

  // ── Insets ────────────────────────────────────────────────────────────────
  { code:"AK", name:"Alaska",           region:"Pacific",
    d:"M118,480 L200,475 L238,520 L222,557 L177,567 L128,542Z",          lx:178, ly:522 },
  { code:"HI", name:"Hawaii",           region:"Pacific",
    d:"M252,545 L295,542 L292,568 L252,568Z",                             lx:273, ly:557 },
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
 * Migrate legacy freeform `areas` strings: any that match a US state name or code
 * are promoted to `selectedStates`; the rest stay in `areas`.
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
  if (names.length === 1) return `Proudly Serving ${names[0]}`;
  if (names.length === 2) return `Proudly Serving ${names[0]} & ${names[1]}`;
  const last = names.pop()!;
  return `Proudly Serving ${names.join(", ")} & ${last}`;
}
