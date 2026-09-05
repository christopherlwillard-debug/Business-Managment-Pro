export type MileageClassification = "business" | "personal";

export interface ParsedTrip {
  date: string;
  miles: number;
  startLocation: string;
  endLocation: string;
  classification: MileageClassification;
  notes: string;
}

export interface InvalidRow {
  rowIndex: number;
  rawData: string;
  reason: string;
}

export interface ParseResult {
  valid: ParsedTrip[];
  invalid: InvalidRow[];
}

export interface MileageImportProvider {
  parse(csvText: string): ParseResult;
  readonly sourceName: string;
  readonly sourceId: string;
}

function parseMileIQDate(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export class MileIQProvider implements MileageImportProvider {
  readonly sourceName = "MileIQ";
  readonly sourceId = "mileiq";

  parse(csvText: string): ParseResult {
    const lines = csvText.split(/\r?\n/);
    const valid: ParsedTrip[] = [];
    const invalid: InvalidRow[] = [];

    let inDetailedLog = false;
    let headerParsed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!inDetailedLog) {
        if (line.toUpperCase().startsWith("DETAILED LOG")) {
          inDetailedLog = true;
        }
        continue;
      }

      if (!headerParsed) {
        if (line.toUpperCase().startsWith("START_DATE")) {
          headerParsed = true;
        }
        continue;
      }

      if (!line) continue;

      const cols = parseCSVLine(line);
      if ((cols[0] ?? "").trim().toLowerCase() === "totals") {
        break;
      }
      if (cols.length < 7) {
        if (cols.some(c => c.trim())) {
          invalid.push({ rowIndex: i + 1, rawData: line, reason: "Too few columns" });
        }
        continue;
      }

      const rawDate = cols[0] ?? "";
      const rawCategory = (cols[2] ?? "").trim();
      const rawStart = (cols[3] ?? "").trim();
      const rawStop = (cols[4] ?? "").trim();
      const rawMiles = (cols[6] ?? "").trim();
      const rawPurpose = (cols[12] ?? "").trim();
      const rawNotes = (cols[13] ?? "").trim();

      const date = parseMileIQDate(rawDate);
      if (!date) {
        invalid.push({ rowIndex: i + 1, rawData: line, reason: "Invalid or missing date" });
        continue;
      }

      const miles = parseFloat(rawMiles);
      if (isNaN(miles) || miles <= 0) {
        invalid.push({ rowIndex: i + 1, rawData: line, reason: "Invalid or missing mileage" });
        continue;
      }

      const classification: MileageClassification =
        rawCategory.toLowerCase() === "personal" ? "personal" : "business";

      const notesParts: string[] = [];
      if (rawPurpose && rawPurpose.toLowerCase() !== rawCategory.toLowerCase()) {
        notesParts.push(rawPurpose);
      }
      if (rawNotes) notesParts.push(rawNotes);
      const notes = notesParts.join(" — ");

      valid.push({ date, miles, startLocation: rawStart, endLocation: rawStop, classification, notes });
    }

    return { valid, invalid };
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function computeFileHash(text: string): Promise<string> {
  if (typeof crypto?.subtle?.digest === "function") {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
