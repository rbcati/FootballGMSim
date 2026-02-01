import soundManager from '../sound-manager.js';
console.log('SoundManager loaded:', !!soundManager);
if (typeof soundManager.playCheer === 'function') console.log('playCheer exists');
else console.error('playCheer MISSING');
