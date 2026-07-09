/**
 * Returns the indexes of CSV rows whose customerType is blank or does not
 * match any existing type name (case-insensitive, trimmed). These rows will
 * be imported with customer_type_id = null ("Uncategorized").
 */
export function findUntypedRows(
  rows: { customerType?: string }[],
  typeNames: string[]
): number[] {
  const known = new Set(typeNames.map(n => n.toLowerCase()));
  const untyped: number[] = [];
  rows.forEach((row, i) => {
    const name = row.customerType?.trim();
    if (!name || !known.has(name.toLowerCase())) untyped.push(i);
  });
  return untyped;
}
