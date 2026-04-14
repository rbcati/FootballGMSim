import { generate } from 'facesjs';

const RACES = ['white', 'black', 'asian', 'brown'];

function hashSeed(value) {
  const text = String(value ?? 'seed');
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildFaceOptions(seed, role = 'player') {
  return {
    gender: (seed % 3 === 0 || role === 'staff') ? 'female' : 'male',
    race: RACES[seed % RACES.length],
  };
}

export function generateFaceConfig(seedInput, role = 'player') {
  const seed = hashSeed(seedInput);
  return generate(undefined, buildFaceOptions(seed, role));
}

export function ensureFaceConfig(entity, role = 'player') {
  if (!entity || typeof entity !== 'object') return entity;
  if (entity.face && typeof entity.face === 'object') return entity;
  return {
    ...entity,
    face: generateFaceConfig(entity.id ?? entity.name ?? Date.now(), role),
  };
}
