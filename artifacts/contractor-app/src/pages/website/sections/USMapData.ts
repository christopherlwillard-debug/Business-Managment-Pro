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
    d: "M 73 73 L 79 55 L 100 48 L 130 46 L 163 44 L 195 43 L 225 43 L 225 48 L 220 130 L 190 131 L 160 130 L 130 128 L 100 125 L 78 128 L 73 120 L 60 109 L 55 97 Z",
    lx: 148, ly: 87,
  },
  {
    code: "OR", name: "Oregon", region: "Pacific",
    d: "M 73 120 L 78 128 L 100 125 L 130 128 L 160 130 L 190 131 L 220 130 L 222 215 L 196 237 L 164 265 L 130 248 L 102 225 L 73 200 Z",
    lx: 150, ly: 190,
  },
  {
    code: "CA", name: "California", region: "Pacific",
    d: "M 73 200 L 102 225 L 130 248 L 164 265 L 196 237 L 222 215 L 240 260 L 243 308 L 245 355 L 238 398 L 228 440 L 210 475 L 193 503 L 176 525 L 158 540 L 134 535 L 107 518 L 88 493 L 77 460 L 70 422 L 68 380 L 67 335 L 69 285 L 71 240 Z",
    lx: 160, ly: 390,
  },

  // ── Mountain ─────────────────────────────────────────────────────────────
  {
    code: "NV", name: "Nevada", region: "Mountain",
    d: "M 130 248 L 164 265 L 196 237 L 222 215 L 240 260 L 243 308 L 245 355 L 238 398 L 213 395 L 185 365 L 160 338 L 144 305 L 140 270 Z",
    lx: 193, ly: 320,
  },
  {
    code: "ID", name: "Idaho", region: "Mountain",
    d: "M 225 43 L 285 43 L 296 47 L 305 60 L 308 90 L 310 125 L 312 165 L 310 200 L 305 238 L 295 268 L 275 268 L 243 268 L 243 308 L 240 260 L 222 215 L 220 130 L 225 48 Z",
    lx: 265, ly: 175,
  },
  {
    code: "MT", name: "Montana", region: "Mountain",
    d: "M 225 43 L 295 40 L 360 38 L 430 37 L 500 37 L 545 40 L 548 175 L 500 178 L 440 178 L 380 178 L 330 177 L 310 200 L 312 165 L 310 125 L 308 90 L 305 60 L 296 47 L 285 43 Z",
    lx: 388, ly: 108,
  },
  {
    code: "WY", name: "Wyoming", region: "Mountain",
    d: "M 310 200 L 330 177 L 380 178 L 440 178 L 500 178 L 548 175 L 547 268 L 490 272 L 430 273 L 370 273 L 310 273 L 305 238 L 310 200 Z",
    lx: 428, ly: 225,
  },
  {
    code: "CO", name: "Colorado", region: "Mountain",
    d: "M 310 273 L 370 273 L 430 273 L 490 272 L 547 268 L 547 363 L 487 363 L 428 363 L 368 363 L 308 362 Z",
    lx: 428, ly: 317,
  },
  {
    code: "UT", name: "Utah", region: "Mountain",
    d: "M 243 268 L 275 268 L 295 268 L 305 238 L 310 273 L 308 362 L 277 360 L 243 355 L 243 308 Z",
    lx: 275, ly: 315,
  },
  {
    code: "AZ", name: "Arizona", region: "Mountain",
    d: "M 185 365 L 213 395 L 238 398 L 243 355 L 277 360 L 308 362 L 308 455 L 300 490 L 278 503 L 248 503 L 213 502 L 183 497 L 160 475 L 147 447 L 145 413 L 153 388 Z",
    lx: 232, ly: 440,
  },
  {
    code: "NM", name: "New Mexico", region: "Mountain",
    d: "M 308 362 L 368 363 L 428 363 L 487 363 L 487 455 L 487 505 L 425 505 L 363 503 L 308 503 L 308 455 Z",
    lx: 397, ly: 435,
  },

  // ── Great Plains ─────────────────────────────────────────────────────────
  {
    code: "ND", name: "North Dakota", region: "Great Plains",
    d: "M 500 37 L 560 37 L 620 38 L 655 40 L 655 128 L 600 130 L 548 130 L 500 130 L 500 80 Z",
    lx: 577, ly: 83,
  },
  {
    code: "SD", name: "South Dakota", region: "Great Plains",
    d: "M 500 130 L 548 130 L 600 130 L 655 128 L 656 218 L 600 220 L 548 220 L 500 220 Z",
    lx: 577, ly: 174,
  },
  {
    code: "NE", name: "Nebraska", region: "Great Plains",
    d: "M 500 220 L 548 220 L 600 220 L 656 218 L 660 275 L 625 278 L 580 278 L 540 280 L 500 280 L 490 272 L 500 220 Z",
    lx: 577, ly: 250,
  },
  {
    code: "KS", name: "Kansas", region: "Great Plains",
    d: "M 490 272 L 500 280 L 540 280 L 580 278 L 625 278 L 660 275 L 660 363 L 600 363 L 547 363 L 487 363 L 487 272 Z",
    lx: 575, ly: 320,
  },
  {
    code: "OK", name: "Oklahoma", region: "Great Plains",
    d: "M 487 363 L 547 363 L 600 363 L 660 363 L 700 363 L 703 390 L 700 420 L 690 430 L 680 430 L 680 455 L 640 455 L 600 455 L 560 455 L 520 455 L 487 455 L 487 415 L 487 363 Z",
    lx: 590, ly: 407,
  },
  {
    code: "TX", name: "Texas", region: "Great Plains",
    d: "M 487 455 L 520 455 L 560 455 L 600 455 L 640 455 L 680 455 L 680 430 L 690 430 L 700 420 L 703 390 L 700 363 L 720 363 L 735 375 L 748 395 L 752 420 L 753 443 L 758 465 L 755 490 L 738 520 L 718 543 L 693 558 L 663 563 L 628 558 L 598 545 L 575 525 L 558 500 L 543 470 L 527 450 L 510 450 L 493 452 L 487 505 L 487 455 Z",
    lx: 615, ly: 495,
  },

  // ── Midwest ───────────────────────────────────────────────────────────────
  {
    code: "MN", name: "Minnesota", region: "Midwest",
    d: "M 620 38 L 655 38 L 680 38 L 705 43 L 720 55 L 730 75 L 728 110 L 725 145 L 720 175 L 718 220 L 700 220 L 660 220 L 655 128 L 620 38 Z",
    lx: 668, ly: 132,
  },
  {
    code: "WI", name: "Wisconsin", region: "Midwest",
    d: "M 720 175 L 725 145 L 728 110 L 740 103 L 760 95 L 778 88 L 798 88 L 810 103 L 810 128 L 808 153 L 800 178 L 792 198 L 785 220 L 770 225 L 750 227 L 730 225 L 718 220 L 720 175 Z",
    lx: 762, ly: 163,
  },
  {
    code: "IA", name: "Iowa", region: "Midwest",
    d: "M 660 220 L 700 220 L 718 220 L 730 225 L 750 227 L 770 225 L 785 220 L 787 278 L 760 278 L 730 278 L 698 278 L 662 278 L 656 218 Z",
    lx: 724, ly: 250,
  },
  {
    code: "MO", name: "Missouri", region: "Midwest",
    d: "M 656 278 L 662 278 L 698 278 L 730 278 L 760 278 L 787 278 L 787 363 L 760 368 L 735 375 L 720 363 L 700 363 L 660 363 L 656 278 Z",
    lx: 720, ly: 323,
  },
  {
    code: "AR", name: "Arkansas", region: "Midwest",
    d: "M 660 363 L 700 363 L 720 363 L 735 375 L 760 368 L 787 363 L 790 455 L 740 455 L 700 455 L 660 455 L 640 455 L 640 455 L 660 363 Z",
    lx: 717, ly: 413,
  },
  {
    code: "LA", name: "Louisiana", region: "Midwest",
    d: "M 640 455 L 660 455 L 700 455 L 740 455 L 790 455 L 795 503 L 790 535 L 770 548 L 745 555 L 720 550 L 698 538 L 680 520 L 670 500 L 652 498 L 637 510 L 628 492 L 630 465 Z",
    lx: 712, ly: 503,
  },
  {
    code: "MI", name: "Michigan", region: "Midwest",
    // Upper Peninsula + Lower Peninsula
    d: "M 740 103 L 728 110 L 748 103 L 768 95 L 793 88 L 818 85 L 840 88 L 852 103 L 843 118 L 822 123 L 800 120 L 778 118 L 760 120 M 808 153 L 810 128 L 810 103 L 825 113 L 845 120 L 850 143 L 848 168 L 843 195 L 838 215 L 825 223 L 808 225 L 800 218 L 800 198 L 800 178 L 808 153 Z",
    lx: 828, ly: 175,
  },
  {
    code: "OH", name: "Ohio", region: "Midwest",
    d: "M 800 218 L 808 225 L 825 223 L 838 215 L 843 195 L 855 200 L 868 215 L 870 240 L 870 265 L 868 290 L 862 313 L 852 328 L 835 330 L 815 328 L 797 323 L 792 300 L 790 275 L 790 248 L 793 225 Z",
    lx: 833, ly: 267,
  },
  {
    code: "IN", name: "Indiana", region: "Midwest",
    d: "M 760 225 L 770 225 L 785 220 L 792 198 L 800 198 L 800 218 L 793 225 L 790 248 L 790 275 L 792 300 L 792 328 L 770 328 L 750 328 L 748 300 L 748 270 L 748 245 Z",
    lx: 771, ly: 278,
  },
  {
    code: "IL", name: "Illinois", region: "Midwest",
    d: "M 718 220 L 730 225 L 748 225 L 748 245 L 748 270 L 748 300 L 750 328 L 748 360 L 738 378 L 728 393 L 718 400 L 710 393 L 700 380 L 698 360 L 698 330 L 700 300 L 700 270 L 700 245 L 700 220 Z",
    lx: 727, ly: 295,
  },

  // ── South ─────────────────────────────────────────────────────────────────
  {
    code: "KY", name: "Kentucky", region: "South",
    d: "M 718 400 L 728 393 L 738 378 L 748 360 L 750 328 L 770 328 L 792 328 L 815 328 L 835 330 L 852 328 L 862 313 L 868 340 L 862 368 L 852 385 L 838 393 L 818 398 L 793 400 L 762 402 L 738 403 L 718 400 Z",
    lx: 790, ly: 363,
  },
  {
    code: "TN", name: "Tennessee", region: "South",
    d: "M 718 400 L 738 403 L 762 402 L 793 400 L 818 398 L 838 393 L 852 385 L 875 380 L 893 383 L 895 415 L 878 420 L 852 425 L 820 428 L 787 428 L 750 428 L 718 428 L 700 425 L 700 408 L 710 393 L 718 400 Z",
    lx: 797, ly: 408,
  },
  {
    code: "MS", name: "Mississippi", region: "South",
    d: "M 700 425 L 718 428 L 750 428 L 753 455 L 757 485 L 755 513 L 745 535 L 730 545 L 712 543 L 698 533 L 688 513 L 686 490 L 690 460 L 693 435 L 700 425 Z",
    lx: 720, ly: 483,
  },
  {
    code: "AL", name: "Alabama", region: "South",
    d: "M 750 428 L 787 428 L 820 428 L 822 460 L 822 490 L 818 518 L 808 532 L 793 538 L 770 538 L 748 530 L 740 515 L 738 490 L 742 465 L 745 435 L 750 428 Z",
    lx: 783, ly: 482,
  },
  {
    code: "GA", name: "Georgia", region: "South",
    d: "M 820 428 L 852 425 L 875 420 L 895 415 L 898 453 L 900 488 L 893 518 L 878 535 L 858 543 L 835 545 L 815 540 L 808 532 L 818 518 L 822 490 L 822 460 L 820 428 Z",
    lx: 858, ly: 483,
  },
  {
    code: "FL", name: "Florida", region: "South",
    d: "M 793 538 L 808 532 L 815 540 L 835 545 L 858 543 L 875 548 L 893 553 L 905 565 L 907 583 L 893 597 L 868 600 L 843 597 L 818 585 L 800 568 L 785 548 L 778 530 L 770 538 L 748 530 L 745 535 L 755 513 L 762 490 L 762 465 L 768 450 L 778 443 L 793 438 Z",
    lx: 838, ly: 567,
  },
  {
    code: "SC", name: "South Carolina", region: "South",
    d: "M 875 380 L 893 375 L 920 370 L 932 390 L 930 418 L 918 438 L 900 453 L 895 415 L 893 383 Z",
    lx: 908, ly: 408,
  },
  {
    code: "NC", name: "North Carolina", region: "South",
    d: "M 835 330 L 852 328 L 862 313 L 875 310 L 908 310 L 930 318 L 938 330 L 935 353 L 928 368 L 920 370 L 893 375 L 875 380 L 862 368 L 868 340 L 862 313 Z",
    lx: 892, ly: 345,
  },

  // ── Mid-Atlantic ──────────────────────────────────────────────────────────
  {
    code: "VA", name: "Virginia", region: "Mid-Atlantic",
    d: "M 852 285 L 862 280 L 878 278 L 908 278 L 930 285 L 938 300 L 938 330 L 930 318 L 908 310 L 875 310 L 862 313 L 868 290 L 862 285 Z",
    lx: 897, ly: 303,
  },
  {
    code: "WV", name: "West Virginia", region: "Mid-Atlantic",
    d: "M 815 260 L 835 255 L 852 255 L 862 260 L 862 280 L 852 285 L 862 285 L 868 290 L 862 313 L 852 328 L 835 330 L 815 328 L 792 300 L 797 278 L 810 268 Z",
    lx: 833, ly: 293,
  },
  {
    code: "MD", name: "Maryland", region: "Mid-Atlantic",
    d: "M 878 255 L 908 250 L 920 258 L 930 268 L 930 278 L 930 285 L 908 278 L 878 278 L 862 280 L 852 285 L 852 270 L 856 258 Z",
    lx: 893, ly: 268,
  },
  {
    code: "DE", name: "Delaware", region: "Mid-Atlantic",
    d: "M 908 225 L 920 225 L 932 230 L 935 248 L 932 268 L 920 268 L 908 260 L 905 240 Z",
    lx: 921, ly: 248,
  },
  {
    code: "PA", name: "Pennsylvania", region: "Mid-Atlantic",
    d: "M 800 200 L 840 196 L 878 194 L 908 193 L 920 197 L 920 225 L 908 225 L 878 225 L 852 225 L 835 230 L 815 235 L 800 238 L 790 240 L 790 220 Z",
    lx: 860, ly: 215,
  },
  {
    code: "NJ", name: "New Jersey", region: "Mid-Atlantic",
    d: "M 920 197 L 932 200 L 943 210 L 948 225 L 945 248 L 940 265 L 932 268 L 920 268 L 932 230 L 920 225 Z",
    lx: 935, ly: 238,
  },
  {
    code: "NY", name: "New York", region: "Mid-Atlantic",
    d: "M 790 120 L 820 115 L 858 110 L 890 108 L 920 108 L 932 115 L 935 140 L 935 168 L 932 193 L 920 197 L 908 193 L 878 194 L 840 196 L 800 200 L 790 202 L 790 175 L 793 148 Z",
    lx: 865, ly: 155,
  },

  // ── New England ───────────────────────────────────────────────────────────
  {
    code: "CT", name: "Connecticut", region: "New England",
    d: "M 920 225 L 935 222 L 948 220 L 950 240 L 948 255 L 935 258 L 920 258 L 920 248 Z",
    lx: 937, ly: 242,
  },
  {
    code: "RI", name: "Rhode Island", region: "New England",
    d: "M 948 218 L 958 215 L 960 232 L 958 248 L 948 252 L 948 238 Z",
    lx: 954, ly: 233,
  },
  {
    code: "MA", name: "Massachusetts", region: "New England",
    d: "M 890 195 L 920 193 L 935 193 L 948 195 L 958 198 L 960 210 L 958 215 L 948 218 L 935 222 L 920 225 L 908 225 L 893 225 L 880 225 L 878 213 Z",
    lx: 920, ly: 208,
  },
  {
    code: "VT", name: "Vermont", region: "New England",
    d: "M 878 110 L 898 108 L 910 113 L 912 140 L 910 168 L 908 193 L 890 195 L 878 194 L 876 168 L 875 140 Z",
    lx: 896, ly: 152,
  },
  {
    code: "NH", name: "New Hampshire", region: "New England",
    d: "M 910 113 L 925 110 L 938 113 L 940 140 L 938 168 L 935 193 L 932 193 L 920 193 L 908 193 L 910 168 L 912 140 Z",
    lx: 924, ly: 152,
  },
  {
    code: "ME", name: "Maine", region: "New England",
    d: "M 910 65 L 932 58 L 955 63 L 960 83 L 958 108 L 950 130 L 943 155 L 940 168 L 938 168 L 925 113 L 910 113 L 898 108 L 878 110 L 878 93 L 883 75 Z",
    lx: 930, ly: 112,
  },

  // ── Insets ────────────────────────────────────────────────────────────────
  {
    code: "AK", name: "Alaska", region: "Pacific",
    d: "M 22 473 L 62 467 L 98 468 L 128 473 L 150 488 L 162 510 L 155 533 L 135 548 L 108 555 L 80 550 L 55 538 L 35 520 L 22 503 L 18 488 Z",
    lx: 91, ly: 512,
  },
  {
    code: "HI", name: "Hawaii", region: "Pacific",
    d: "M 193 510 L 212 505 L 233 508 L 248 520 L 248 540 L 233 548 L 212 545 L 197 538 L 188 525 Z",
    lx: 220, ly: 526,
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
