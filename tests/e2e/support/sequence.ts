// Observed-coordinate navigation fixture, not complete protein chemistry.
export function sequenceFixture(count = 4, chains = 2): Buffer {
  let atom = 0;
  const lines: string[] = [];
  for (let chain = 0; chain < chains; chain++) {
    for (let index = 0; index < count; index++) {
      const number = count === 4 ? [10, 10, 24, 3][index] : index % 9999 + 1;
      const insertion = count === 4 && index === 1 || index >= 9999 ? "A" : " ";
      const x = index % 100 * 3, y = Math.floor(index / 100) * 3 + chain * 12;
      for (const [name, element, offset] of [["N", "N", -1], ["CA", "C", 0], ["C", "C", 1]] as const) {
        lines.push(`ATOM  ${String(++atom).padStart(5)} ${name.padStart(4)} GLY ${String.fromCharCode(65 + chain)}${String(number).padStart(4)}${insertion}   ${(x + offset).toFixed(3).padStart(8)}${y.toFixed(3).padStart(8)}${"0.000".padStart(8)}  1.00 20.00          ${element.padStart(2)}`);
      }
    }
    lines.push("TER");
  }
  lines.push("END"); return Buffer.from(lines.join("\n") + "\n");
}
