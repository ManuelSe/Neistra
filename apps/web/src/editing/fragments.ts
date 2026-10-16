import type { FragmentName } from "../api/types";

export const FRAGMENTS: { name: FragmentName; label: string; symbol: string }[] = [
  { name: "methyl", label: "Methyl", symbol: "CH₃" },
  { name: "ethyl", label: "Ethyl", symbol: "C₂H₅" },
  { name: "hydroxyl", label: "Hydroxyl", symbol: "OH" },
  { name: "amino", label: "Amino", symbol: "NH₂" },
  { name: "carboxylic_acid", label: "Carboxylic acid", symbol: "COOH" },
  { name: "phenyl", label: "Phenyl", symbol: "C₆H₅" },
];
