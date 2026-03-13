const fs = require('fs');
let content = fs.readFileSync('src/core/game-simulator.js', 'utf8');

const replaceQB = `function generateQBStats(qb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;

  // Clutch Trait Bonus
  let clutchBonus = 1.0;
  if (qb.personality?.traits?.includes('Clutch') && Math.abs(teamScore - oppScore) <= 8) {
      clutchBonus = 1.05; // 5% boost in close games
  }

  // Performance variance: career game or dud
  const perfVar = rollPerformanceVariance(qb, U);
  const perfMult = perfVar.multiplier * clutchBonus;`;

const oldQB = `function generateQBStats(qb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = qb.ratings || {};
  const throwPower = ratings.throwPower || 70;
  const throwAccuracy = ratings.throwAccuracy || 70;
  const awareness = ratings.awareness || 70;

  // Performance variance: career game or dud
  const perfVar = rollPerformanceVariance(qb, U);
  const perfMult = perfVar.multiplier;`;

if (content.includes(oldQB)) {
   content = content.replace(oldQB, replaceQB);

   const oldRB = `function generateRBStats(rb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const awareness = ratings.awareness || 70;

  const perfVar = rollPerformanceVariance(rb, U);
  const perfMult = perfVar.multiplier;`;

   const newRB = `function generateRBStats(rb, teamScore, oppScore, defenseStrength, U, modifiers = {}, share = 1.0) {
  const ratings = rb.ratings || {};
  const speed = ratings.speed || 70;
  const trucking = ratings.trucking || 70;
  const awareness = ratings.awareness || 70;

  // Clutch Trait Bonus
  let clutchBonus = 1.0;
  if (rb.personality?.traits?.includes('Clutch') && Math.abs(teamScore - oppScore) <= 8) {
      clutchBonus = 1.05; // 5% boost in close games
  }

  const perfVar = rollPerformanceVariance(rb, U);
  const perfMult = perfVar.multiplier * clutchBonus;`;

   content = content.replace(oldRB, newRB);

   fs.writeFileSync('src/core/game-simulator.js', content);
   console.log('Added clutch trait to game-simulator.js pass/rush logic');
}
