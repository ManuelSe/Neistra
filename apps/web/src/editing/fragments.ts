import type { FragmentName } from "../api/types";

export const FRAGMENTS: { name: FragmentName; label: string; symbol: string }[] = [
  { name: "methyl", label: "Methyl", symbol: "CH₃" },
  { name: "ethyl", label: "Ethyl", symbol: "C₂H₅" },
  { name: "hydroxyl", label: "Hydroxyl", symbol: "OH" },
  { name: "amino", label: "Amino", symbol: "NH₂" },
  { name: "carboxylic_acid", label: "Carboxylic acid", symbol: "COOH" },
  { name: "phenyl", label: "Phenyl", symbol: "C₆H₅" },
  { name: "cyclopropyl", label: "Cyclopropyl", symbol: "C₃H₅" },
  { name: "cyclobutyl", label: "Cyclobutyl", symbol: "C₄H₇" },
  { name: "cyclopentyl", label: "Cyclopentyl", symbol: "C₅H₉" },
  { name: "cyclohexyl", label: "Cyclohexyl", symbol: "C₆H₁₁" },
  { name: "methoxy", label: "Methoxy", symbol: "OCH₃" },
];
