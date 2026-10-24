import { type Patient, type PrintConfig, dayInPKT } from "@clearview/shared";
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function printPatient(
  p: Patient,
  config: PrintConfig,
  date = new Date().toISOString(),
  test = false,
) {
  const win = window.open("", "_blank", "width=850,height=950");
  if (!win) throw new Error("Allow popups to print patient details");
  const values: Record<string, string> = {
    name: p.name,
    age: p.age + (p.gender === "unspecified" ? "" : ` / ${p.gender}`),
    address: p.address,
    date: dayInPKT(date),
    patientNumber: p.patientNumber,
  };
  win.document.write(
    `<!doctype html><html><head><title>Patient details</title><style>@page{size:${config.width}mm ${config.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:${config.width}mm;height:${config.height}mm;font-family:Arial,sans-serif}.field{position:absolute;overflow-wrap:anywhere;line-height:1.15} @media print{button{display:none}}</style></head><body>${Object.entries(
      config.fields,
    )
      .map(
        ([k, f]) =>
          `<div class="field" style="left:${f.x}mm;top:${f.y}mm;width:${f.width}mm;font-size:${f.size}pt;font-weight:${config.bold ? "700" : "400"}">${escape(test ? "TEST " + values[k] : values[k])}</div>`,
      )
      .join(
        "",
      )}<button style="position:fixed;bottom:10px;left:10px" onclick="window.print()">Print · actual size, no browser headers or footers</button></body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}
