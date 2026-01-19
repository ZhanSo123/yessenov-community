const escapeValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  return `"${stringValue.replace(/"/g, "\"\"")}"`;
};

export const toCsv = (headers: string[], rows: Array<Array<unknown>>) => {
  const lines = [
    headers.map(escapeValue).join(","),
    ...rows.map((row) => row.map(escapeValue).join(",")),
  ];
  return lines.join("\n");
};
