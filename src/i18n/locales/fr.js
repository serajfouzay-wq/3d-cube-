export default {
  meta: { name: 'Français' },

  brand: {
    division: 'SYSTÈMES FRONTIÈRE',
    tagline: 'Catalogue stellaire',
    claim: 'Cinq mondes. Une expédition.',
  },

  nav: { menu: 'Menu', close: 'Fermer', login: 'Accès', catalog: 'Catalogue', archive: 'Archives', contact: 'Contact' },

  hud: {
    catalog: 'CATALOGUE STELLAIRE',
    worlds: 'MONDES',
    type: 'Type',
    typeValue: 'Immersif',
    year: 'Année',
    status: 'Statut',
    statusValue: 'Relevé en cours',
    dragHint: 'Faites glisser pour pivoter le système',
    scanHint: 'Maintenez un monde pour le scanner',
    selected: 'Sélectionné',
    mute: 'Couper le son',
    unmute: 'Activer le son',
    language: 'LANGUE',
  },

  panel: {
    back: 'Retour au système',
    dossier: 'DOSSIER',
    class: 'Classification',
    period: 'Période orbitale',
    gravity: 'Gravité de surface',
    moons: 'Satellites',
    temp: 'Température moyenne',
    diameter: 'Diamètre',
    scan: 'MAINTENIR POUR SCANNER',
    scanning: 'ANALYSE…',
    locked: 'DONNÉES CHIFFRÉES',
    unlocked: 'RELEVÉ TERMINÉ',
    launch: "Lancer l'expédition",
  },

  cta: { ready: 'PRÊT À<br>PARTIR ?', enter: "DEMANDER L'ACCÈS" },

  units: { days: '{value} j', gravity: '{value} g', kelvin: '{value} K', km: '{value} km' },

  loader: {
    boot: 'INITIALISATION',
    stars: 'SEMIS DU CHAMP D’ÉTOILES',
    worlds: 'GÉNÉRATION DES SURFACES',
    audio: 'CALIBRAGE AUDIO',
    done: 'ENTRER',
  },

  classes: {
    terra: 'Tellurique · Volcanique',
    ocean: 'Pélagique · Classe II',
    gas: 'Géante gazeuse · Annelée',
    machine: 'Artificiel · Dormant',
    ice: 'Cryogénique · Lumineux',
  },

  worlds: {
    velthara: {
      name: 'Velthara',
      epithet: 'Le Berceau de Braise',
      brief: "Une croûte jeune qui n'a pas fini de refroidir. Des tempêtes de cendre tracent de lentes spirales sur un continent qui se reconstruit tous les quelques siècles.",
    },
    kyonis: {
      name: 'Kyonis',
      epithet: 'Océan de Verre',
      brief: "Une mer ininterrompue sous un ciel sans vent. La surface est si calme qu'elle reflète l'anneau de lunes presque sans distorsion.",
    },
    orrinvael: {
      name: 'Orrin Vaël',
      epithet: "L'Anneau Brisé",
      brief: "Une géante parée des débris d'une lune qu'elle a disloquée. Les bandes tournent en sens contraire et déchirent les tempêtes.",
    },
    sable: {
      name: 'Sable IX',
      epithet: 'La Machine Silencieuse',
      brief: "Pas une planète — une coque. Quelque chose l'a construite puis abandonnée en marche. Les lumières de la face nocturne bougent encore.",
    },
    nuur: {
      name: 'Nuur',
      epithet: 'La Dernière Lumière',
      brief: "Gelée presque jusqu'au noyau, et pourtant elle brille. La glace diffuse sa propre lumière longtemps après le coucher de l'étoile.",
    },
  },
};
