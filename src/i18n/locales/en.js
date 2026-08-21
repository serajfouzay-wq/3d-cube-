export default {
  meta: { name: 'English' },

  brand: {
    division: 'FRONTIER SYSTEMS',
    tagline: 'Stellar Catalog',
    claim: 'Five worlds. One expedition.',
  },

  nav: { menu: 'Menu', close: 'Close', login: 'Access', catalog: 'Catalog', archive: 'Archive', contact: 'Contact' },

  hud: {
    catalog: 'STELLAR CATALOG',
    worlds: 'WORLDS',
    type: 'Type',
    typeValue: 'Immersive',
    year: 'Year',
    status: 'Status',
    statusValue: 'Surveying',
    dragHint: 'Drag to rotate the system',
    scanHint: 'Hold a world to scan',
    selected: 'Selected',
    mute: 'Mute audio',
    unmute: 'Unmute audio',
    language: 'LANGUAGE',
  },

  panel: {
    back: 'Return to system',
    dossier: 'DOSSIER',
    class: 'Classification',
    period: 'Orbital period',
    gravity: 'Surface gravity',
    moons: 'Satellites',
    temp: 'Mean temperature',
    diameter: 'Diameter',
    scan: 'HOLD TO SCAN',
    scanning: 'SCANNING…',
    locked: 'DATA ENCRYPTED',
    unlocked: 'SURVEY COMPLETE',
    launch: 'Begin expedition',
  },

  cta: { ready: 'READY TO<br>DEPART?', enter: 'REQUEST ACCESS' },

  units: { days: '{value} d', gravity: '{value} g', kelvin: '{value} K', km: '{value} km' },

  loader: {
    boot: 'INITIALISING',
    stars: 'SEEDING STARFIELD',
    worlds: 'GENERATING SURFACES',
    audio: 'CALIBRATING AUDIO',
    done: 'ENTER',
  },

  classes: {
    terra: 'Terrestrial · Volcanic',
    ocean: 'Pelagic · Class II',
    gas: 'Gas Giant · Ringed',
    machine: 'Artificial · Dormant',
    ice: 'Cryogenic · Luminous',
  },

  worlds: {
    velthara: {
      epithet: 'The Ember Cradle',
      brief: 'A young crust that has not finished cooling. Storms of ash draw slow spirals across a continent that rebuilds itself every few centuries.',
    },
    kyonis: {
      epithet: 'Ocean of Glass',
      brief: 'One unbroken sea under a windless sky. The surface is so still it mirrors the ring of moons overhead with almost no distortion.',
    },
    orrinvael: {
      epithet: 'The Fractured Ring',
      brief: 'A giant wearing the debris of a moon it pulled apart. The bands rotate at odds with each other, tearing storms open and closed.',
    },
    sable: {
      epithet: 'The Silent Machine',
      brief: 'Not a planet — a shell. Something built this and left it running. The lights on the night side still move in patterns.',
    },
    nuur: {
      epithet: 'The Last Light',
      brief: 'Frozen almost to the core, yet it glows. The ice carries its own light outward long after the star has set.',
    },
  },
};
