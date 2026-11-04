/** Canonical configuration with legacy fallback; never log configured values. */
export function environmentValue(name, fallback, environment = process.env) {
  const canonical = `NEISTRA_${name}`;
  const legacy = `MOLWEAVE_${name}`;
  if (Object.hasOwn(environment, canonical)) {
    if (Object.hasOwn(environment, legacy) && environment[canonical] !== environment[legacy]) {
      console.warn(`${canonical} overrides conflicting ${legacy}`);
    }
    return environment[canonical];
  }
  return environment[legacy] ?? fallback;
}
