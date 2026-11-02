export function performanceEnabled(value?: string): boolean;
export function performanceResult(actual: number, limit: number, options: {
  strict: boolean;
  inclusive?: boolean;
}): {
  actual: number;
  limit: number;
  inclusive: boolean;
  enforced: boolean;
  withinTarget: boolean;
};
