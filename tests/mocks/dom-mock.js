
global.window = {
  Utils: {
    rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    random: () => Math.random(),
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    gaussianClamped: () => 0.5,
  },
  Constants: {
    SIMULATION: { HOME_ADVANTAGE: 3 }
  },
  state: {
      league: {
          teams: [],
          schedule: { weeks: [] },
          week: 1,
          resultsByWeek: {}
      }
  },
  saveGame: () => {},
  setStatus: () => {},
  watchLiveGame: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

global.document = {
  body: {
    appendChild: () => {},
    contains: () => true,
    remove: () => {},
    innerHTML: ''
  },
  createElement: (tag) => {
    return {
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      appendChild: () => {},
      remove: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      textContent: '',
      innerHTML: '',
      setAttribute: () => {},
      removeAttribute: () => {},
      offsetParent: {},
      getContext: () => ({
          clearRect: () => {},
          fillRect: () => {},
          beginPath: () => {},
          arc: () => {},
          fill: () => {},
          stroke: () => {},
          moveTo: () => {},
          lineTo: () => {},
          scale: () => {},
          translate: () => {},
          rotate: () => {},
          restore: () => {},
          save: () => {},
      })
    };
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
};

global.HTMLElement = class {};
global.AudioContext = class {
    createGain() { return { gain: { value: 0 }, connect: () => {} }; }
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0 } }; }
    createBufferSource() { return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} }; }
    decodeAudioData() { return Promise.resolve({}); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
};

global.performance = {
    now: () => Date.now()
};

global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.getComputedStyle = () => ({ getPropertyValue: () => '' });

global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};
