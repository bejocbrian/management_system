export type CsvRow = Record<string, string>;

const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_');

/**
 * Parses a single CSV line respecting quoted fields (handles commas inside quotes).
 */
const parseLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        // escaped quote inside quoted field
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  cells.push(current.trim());
  return cells;
};

export const parseCsv = (raw: string): CsvRow[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseLine(lines[0]).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    return headers.reduce<CsvRow>((acc, header, index) => {
      acc[header] = cells[index] ?? '';
      return acc;
    }, {});
  });
};
