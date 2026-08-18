import ExcelJS from "exceljs";

for (const path of process.argv.slice(2)) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  console.log("=".repeat(70));
  console.log(path.split("/").pop(), "— sheets:", wb.worksheets.map((w) => w.name).join(", "));

  for (const ws of wb.worksheets) {
    console.log(`\n[${ws.name}] ${ws.rowCount} rows × ${ws.columnCount} cols`);
    const header = ws.getRow(1).values;
    const headers = Array.isArray(header) ? header.slice(1) : [];
    headers.forEach((h, i) => console.log(`  ${String(i + 1).padStart(3)}. ${String(h ?? "").trim()}`));

    for (const r of [2, 3]) {
      const row = ws.getRow(r).values;
      if (!Array.isArray(row) || row.length < 2) continue;
      const cells = row.slice(1).map((v) => {
        if (v && typeof v === "object") return v.text ?? v.result ?? JSON.stringify(v);
        return v;
      });
      console.log(`  sample r${r}:`, JSON.stringify(cells).slice(0, 900));
    }
  }
}
