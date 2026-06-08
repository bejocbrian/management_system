export type CsvRow = Record<string, string>;

const normalizeHeader = (header: string) => header.trim().toLowerCase();

export const parseCsv = (raw: string): CsvRow[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',').map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    return headers.reduce<CsvRow>((acc, header, index) => {
      acc[header] = cells[index] ?? '';
      return acc;
    }, {});
  });
};
