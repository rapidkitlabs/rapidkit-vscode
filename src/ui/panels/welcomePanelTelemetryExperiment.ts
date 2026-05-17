export function hashSeedToNumber(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getIncidentPrimaryCtaExperimentVariant(seed: string): 'single' | 'multi' {
  return hashSeedToNumber(seed) % 2 === 0 ? 'single' : 'multi';
}
