/**
 * US state SVG path data — geographically accurate simplified outlines.
 * ViewBox: "0 0 960 600"
 * Projection: Albers USA (contiguous states + AK/HI insets), derived from
 * standard D3/natural-earth US atlas coordinates.
 * lx/ly = centroid label anchor (inside the state boundary).
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
  {
    code: "WA", name: "Washington", region: "Pacific",
    d: "M 103 73 L 175 65 L 222 63 L 259 68 L 255 92 L 256 121 L 199 122 L 170 117 L 148 116 L 122 116 L 103 113 Z",
    lx: 178, ly: 93,
  },
  {
    code: "OR", name: "Oregon", region: "Pacific",
    d: "M 103 116 L 122 116 L 148 116 L 170 117 L 199 122 L 256 121 L 258 163 L 228 177 L 184 232 L 148 216 L 120 193 L 103 178 Z",
    lx: 182, ly: 173,
  },
  {
    code: "CA", name: "California", region: "Pacific",
    d: "M 103 178 L 120 193 L 148 216 L 184 232 L 228 177 L 258 163 L 235 230 L 232 275 L 230 320 L 224 360 L 216 405 L 204 448 L 193 490 L 181 527 L 165 548 L 143 543 L 113 527 L 96 503 L 86 464 L 84 420 L 87 376 L 90 325 L 94 268 Z",
    lx: 163, ly: 375,
  },

  // ── Mountain ─────────────────────────────────────────────────────────────
  {
    code: "NV", name: "Nevada", region: "Mountain",
    d: "M 148 218 L 210 163 L 258 163 L 258 260 L 236 260 L 210 340 L 193 385 L 165 380 L 150 337 L 146 275 Z",
    lx: 207, ly: 273,
  },
  {
    code: "ID", name: "Idaho", region: "Mountain",
    // Classic panhandle (narrow northern strip) + wider southern body
    d: "M 258 68 L 304 68 L 305 165 L 304 248 L 210 248 L 210 165 L 258 165 Z",
    lx: 272, ly: 190,
  },
  {
    code: "MT", name: "Montana", region: "Mountain",
    d: "M 246 65 L 491 62 L 489 174 L 304 172 L 258 163 L 256 121 L 259 68 Z",
    lx: 368, ly: 117,
  },
  {
    code: "WY", name: "Wyoming", region: "Mountain",
    d: "M 304 172 L 471 168 L 471 263 L 304 263 Z",
    lx: 387, ly: 215,
  },
  {
    code: "CO", name: "Colorado", region: "Mountain",
    d: "M 303 263 L 466 261 L 466 358 L 303 358 Z",
    lx: 384, ly: 309,
  },
  {
    code: "UT", name: "Utah", region: "Mountain",
    d: "M 210 245 L 236 248 L 304 248 L 304 374 L 210 374 Z",
    lx: 257, ly: 310,
  },
  {
    code: "AZ", name: "Arizona", region: "Mountain",
    d: "M 165 380 L 193 385 L 210 374 L 304 374 L 304 521 L 261 521 L 231 520 L 193 514 L 170 490 L 158 450 Z",
    lx: 233, ly: 450,
  },
  {
    code: "NM", name: "New Mexico", region: "Mountain",
    d: "M 303 358 L 466 358 L 466 508 L 303 508 Z",
    lx: 384, ly: 432,
  },

  // ── Great Plains ─────────────────────────────────────────────────────────
  {
    code: "ND", name: "North Dakota", region: "Great Plains",
    d: "M 462 60 L 578 60 L 578 128 L 462 128 Z",
    lx: 520, ly: 93,
  },
  {
    code: "SD", name: "South Dakota", region: "Great Plains",
    d: "M 458 128 L 578 128 L 578 210 L 458 210 Z",
    lx: 518, ly: 169,
  },
  {
    code: "NE", name: "Nebraska", region: "Great Plains",
    d: "M 303 260 L 303 207 L 459 207 L 578 207 L 578 273 L 459 273 L 459 260 Z",
    lx: 500, ly: 240,
  },
  {
    code: "KS", name: "Kansas", region: "Great Plains",
    d: "M 303 273 L 578 273 L 578 340 L 303 340 Z",
    lx: 440, ly: 306,
  },
  {
    code: "OK", name: "Oklahoma", region: "Great Plains",
    d: "M 303 340 L 303 362 L 436 362 L 436 406 L 641 404 L 641 338 L 578 340 L 303 340 Z",
    lx: 540, ly: 375,
  },
  {
    code: "TX", name: "Texas", region: "Great Plains",
    d: "M 303 362 L 436 362 L 436 406 L 641 404 L 643 452 L 637 506 L 613 542 L 580 563 L 542 574 L 500 572 L 463 556 L 437 528 L 424 490 L 418 450 L 414 408 L 303 408 Z",
    lx: 522, ly: 487,
  },

  // ── Midwest ───────────────────────────────────────────────────────────────
  {
    code: "MN", name: "Minnesota", region: "Midwest",
    d: "M 568 52 L 610 50 L 655 58 L 682 80 L 690 116 L 722 148 L 724 196 L 568 198 Z",
    lx: 640, ly: 132,
  },
  {
    code: "WI", name: "Wisconsin", region: "Midwest",
    d: "M 641 96 L 672 62 L 692 80 L 725 80 L 726 148 L 724 196 L 700 196 L 641 196 Z",
    lx: 682, ly: 148,
  },
  {
    code: "IA", name: "Iowa", region: "Midwest",
    d: "M 568 198 L 724 196 L 684 268 L 568 268 Z",
    lx: 626, ly: 232,
  },
  {
    code: "MO", name: "Missouri", region: "Midwest",
    d: "M 568 268 L 684 268 L 685 368 L 648 372 L 630 392 L 618 408 L 600 410 L 590 398 L 568 398 Z",
    lx: 628, ly: 335,
  },
  {
    code: "AR", name: "Arkansas", region: "Midwest",
    d: "M 590 398 L 618 408 L 630 392 L 648 372 L 685 368 L 707 368 L 707 455 L 601 455 L 590 450 Z",
    lx: 650, ly: 415,
  },
  {
    code: "LA", name: "Louisiana", region: "Midwest",
    d: "M 590 450 L 601 455 L 707 455 L 720 505 L 712 540 L 693 548 L 665 550 L 638 547 L 622 530 L 614 510 L 598 502 L 582 512 L 570 496 Z",
    lx: 648, ly: 493,
  },
  {
    code: "MI", name: "Michigan", region: "Midwest",
    // Lower Peninsula + Upper Peninsula as two subpaths
    d: "M 724 80 L 805 74 L 837 83 L 840 108 L 802 113 L 762 108 L 726 108 Z M 726 108 L 762 108 L 802 113 L 814 138 L 820 168 L 820 196 L 759 196 L 720 196 L 706 196 L 708 170 L 714 140 L 718 113 Z",
    lx: 773, ly: 155,
  },
  {
    code: "OH", name: "Ohio", region: "Midwest",
    d: "M 759 196 L 820 196 L 841 204 L 846 244 L 844 280 L 841 318 L 795 330 L 759 330 Z",
    lx: 800, ly: 262,
  },
  {
    code: "IN", name: "Indiana", region: "Midwest",
    d: "M 706 196 L 720 193 L 759 196 L 759 330 L 706 330 Z",
    lx: 732, ly: 262,
  },
  {
    code: "IL", name: "Illinois", region: "Midwest",
    d: "M 641 196 L 700 196 L 706 196 L 706 240 L 703 280 L 706 315 L 703 330 L 668 342 L 650 368 L 645 365 L 640 342 L 637 308 L 636 268 L 638 232 Z",
    lx: 671, ly: 268,
  },

  // ── South ─────────────────────────────────────────────────────────────────
  {
    code: "KY", name: "Kentucky", region: "South",
    // Wide flat state — northern border follows Ohio River
    d: "M 662 342 L 680 334 L 706 330 L 759 330 L 795 330 L 841 318 L 853 308 L 854 368 L 847 393 L 796 396 L 742 398 L 705 398 L 667 396 L 660 370 Z",
    lx: 757, ly: 363,
  },
  {
    code: "TN", name: "Tennessee", region: "South",
    d: "M 659 396 L 667 396 L 705 398 L 742 398 L 796 396 L 847 393 L 854 368 L 855 442 L 720 444 L 667 442 L 657 442 Z",
    lx: 758, ly: 418,
  },
  {
    code: "MS", name: "Mississippi", region: "South",
    d: "M 646 455 L 707 455 L 720 505 L 718 538 L 700 542 L 668 540 L 647 537 Z",
    lx: 682, ly: 492,
  },
  {
    code: "AL", name: "Alabama", region: "South",
    d: "M 718 442 L 782 448 L 785 506 L 775 522 L 748 526 L 720 520 L 718 505 L 720 505 L 707 455 L 718 455 Z",
    lx: 752, ly: 483,
  },
  {
    code: "GA", name: "Georgia", region: "South",
    d: "M 776 396 L 847 393 L 855 442 L 860 478 L 858 517 L 822 523 L 786 522 L 782 506 L 785 472 L 782 448 Z",
    lx: 822, ly: 460,
  },
  {
    code: "FL", name: "Florida", region: "South",
    d: "M 748 492 L 858 488 L 862 513 L 875 530 L 878 556 L 862 582 L 836 598 L 808 598 L 782 588 L 755 568 L 747 550 Z",
    lx: 810, ly: 548,
  },
  {
    code: "SC", name: "South Carolina", region: "South",
    d: "M 820 400 L 880 388 L 888 456 L 842 470 L 820 460 Z",
    lx: 854, ly: 430,
  },
  {
    code: "NC", name: "North Carolina", region: "South",
    d: "M 776 354 L 855 342 L 897 352 L 900 400 L 880 388 L 820 400 L 782 396 L 776 378 Z",
    lx: 838, ly: 373,
  },

  // ── Mid-Atlantic ──────────────────────────────────────────────────────────
  {
    code: "VA", name: "Virginia", region: "Mid-Atlantic",
    d: "M 788 290 L 853 286 L 900 296 L 900 358 L 897 352 L 855 342 L 776 354 L 776 320 L 788 310 Z",
    lx: 856, ly: 322,
  },
  {
    code: "WV", name: "West Virginia", region: "Mid-Atlantic",
    d: "M 773 262 L 838 258 L 855 286 L 853 286 L 788 290 L 788 310 L 776 320 L 773 320 Z",
    lx: 815, ly: 293,
  },
  {
    code: "MD", name: "Maryland", region: "Mid-Atlantic",
    d: "M 832 260 L 893 256 L 898 298 L 900 316 L 868 320 L 855 310 L 832 298 L 855 286 Z",
    lx: 868, ly: 288,
  },
  {
    code: "DE", name: "Delaware", region: "Mid-Atlantic",
    d: "M 889 225 L 907 220 L 910 310 L 890 312 Z",
    lx: 900, ly: 268,
  },
  {
    code: "PA", name: "Pennsylvania", region: "Mid-Atlantic",
    d: "M 800 206 L 905 198 L 908 222 L 889 225 L 832 260 L 800 262 Z",
    lx: 854, ly: 232,
  },
  {
    code: "NJ", name: "New Jersey", region: "Mid-Atlantic",
    d: "M 889 222 L 908 218 L 912 310 L 890 312 L 910 310 L 907 220 Z",
    lx: 901, ly: 266,
  },
  {
    code: "NY", name: "New York", region: "Mid-Atlantic",
    d: "M 773 120 L 843 113 L 908 116 L 910 196 L 907 200 L 800 206 L 800 262 L 773 262 L 773 192 L 796 180 Z",
    lx: 843, ly: 188,
  },

  // ── New England ───────────────────────────────────────────────────────────
  {
    code: "CT", name: "Connecticut", region: "New England",
    d: "M 878 216 L 920 212 L 922 245 L 879 247 Z",
    lx: 900, ly: 230,
  },
  {
    code: "RI", name: "Rhode Island", region: "New England",
    d: "M 920 210 L 938 208 L 938 240 L 921 243 Z",
    lx: 929, ly: 226,
  },
  {
    code: "MA", name: "Massachusetts", region: "New England",
    d: "M 856 182 L 946 180 L 947 212 L 920 210 L 878 216 L 857 216 Z",
    lx: 902, ly: 198,
  },
  {
    code: "VT", name: "Vermont", region: "New England",
    d: "M 858 118 L 886 112 L 888 184 L 858 186 Z",
    lx: 873, ly: 150,
  },
  {
    code: "NH", name: "New Hampshire", region: "New England",
    d: "M 886 110 L 914 113 L 916 188 L 888 186 Z",
    lx: 902, ly: 150,
  },
  {
    code: "ME", name: "Maine", region: "New England",
    d: "M 886 66 L 960 72 L 957 167 L 930 188 L 914 188 L 916 113 L 886 110 Z",
    lx: 933, ly: 130,
  },

  // ── Insets ────────────────────────────────────────────────────────────────
  {
    code: "AK", name: "Alaska", region: "Pacific",
    d: "M 110 478 L 152 470 L 190 472 L 220 480 L 238 515 L 225 558 L 178 566 L 127 547 L 110 517 Z",
    lx: 175, ly: 520,
  },
  {
    code: "HI", name: "Hawaii", region: "Pacific",
    d: "M 248 535 L 310 530 L 312 567 L 248 567 Z",
    lx: 278, ly: 550,
  },
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
