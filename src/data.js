// ============================================================
//  ESCADRE ASTRALE — données de jeu (v5 : raid lead invisible, raids de 10)
// ============================================================
const DATA = (() => {
  // ---------- 9 classes, une race par classe ----------
  // look : style (race, couleurs, équipement) et spécialisation visuelle (arme, posture, attaques) — voir chars.js
  const CLASSES = {
    gardien:    { name: 'Gardien',    race: 'Humain',             role: 'tank', range: 'melee',  color: '#ffd166', hp: 120000, dps: 620,  look: { style: 'gardien',     spec: 'gardien' },    spells: ['provoc', 'kick', 'egide'],      blurb: 'Chevalier de la force. Lame d’énergie, bouclier de lumière.' },
    titan:      { name: 'Titan',      race: 'Géant',              role: 'tank', range: 'melee',  color: '#e04a3a', hp: 140000, dps: 560,  look: { style: 'titan', spec: 'titan' }, spells: ['provoc', 'seisme', 'carapace'], blurb: 'Colosse en carapace. Marteau-bouclier, ramasse les adds.' },
    medic:      { name: 'Médic',      race: 'Droïde',             role: 'heal', range: 'ranged', color: '#6fe58f', hp: 72000,  dps: 240, hps: 2550, look: { style: 'medic', spec: 'medic' }, spells: ['nuee', 'purge'],     blurb: 'Droïde de soins. Drones et nuées de nanites.' },
    seraphe:    { name: 'Séraphe',    race: 'Alien mystique',     role: 'heal', range: 'ranged', color: '#b98cff', hp: 70000,  dps: 240, hps: 2350, look: { style: 'seraphe', spec: 'seraphe' },     spells: ['prisme', 'rez'],     blurb: 'Être de lumière. Boucliers et résurrection.' },
    maree:      { name: 'Marée',      race: 'Amphibien',          role: 'heal', range: 'ranged', color: '#3fd6d0', hp: 74000,  dps: 240, hps: 2450, look: { style: 'maree', spec: 'maree' }, spells: ['vague', 'purge', 'rez'], blurb: 'Soigneur des marées. Vagues de soin au sol.' },
    lameombre:  { name: 'Lame-ombre', race: 'Reptilien',          role: 'dps',  range: 'melee',  color: '#c6f24a', hp: 78000,  dps: 1550, look: { style: 'lameombre', spec: 'lameombre' },      spells: ['kick', 'pas'],             blurb: 'Duelliste à deux sabres. Bondit sur sa cible.' },
    fracasseur: { name: 'Fracasseur', race: 'Félin',              role: 'dps',  range: 'melee',  color: '#6f7dff', hp: 84000,  dps: 1600, look: { style: 'fracasseur', spec: 'fracasseur' },       spells: ['tourbillon', 'cri'],       blurb: 'Lame immense à deux mains. Ravage les groupes d’adds.' },
    spectre:    { name: 'Spectre',    race: 'Cyborg',             role: 'dps',  range: 'ranged', color: '#9cc3e6', hp: 74000,  dps: 1520, look: { style: 'spectre', spec: 'spectre' },  spells: ['kick', 'tir'],             blurb: 'Tireur d’élite. Interrompt de loin.' },
    bricoleur:  { name: 'Bricoleur',  race: 'Petit ingénieur',    role: 'dps',  range: 'ranged', color: '#ff9f43', hp: 76000,  dps: 1400, look: { style: 'bricoleur', spec: 'bricoleur' }, spells: ['tourelle', 'dome'],        blurb: 'Canon, tourelles, dôme de protection.' },
  };
  const CLASS_ORDER = ['gardien', 'titan', 'medic', 'seraphe', 'maree', 'lameombre', 'fracasseur', 'spectre', 'bricoleur'];

  // ---------- sorts de la barre ----------
  // classes : qui le porte. Chaque porteur vivant = une charge, avec sa propre recharge.
  // target : enemy | ally | dead | self | ground | none
  // desc : ce que fait le sort ; how : comment le lancer (bulle d'explication, voir ui.js)
  const SPELLS = {
    provoc:     { name: 'Provocation', icon: 'taunt', classes: ['gardien', 'titan'], target: 'enemy', cd: 8,
                  desc: 'Un tank prend l’ennemi ciblé (boss ou add). C’est comme ça qu’on change de tank.',
                  how: 'Touche l’ennemi à prendre, puis le sort : le tank libre le plus proche le provoque. Sans cible, il reprend le boss au tank qui a le plus de cumuls. Seuls les boss et les Gardiens du Vide se provoquent.' },
    kick:       { name: 'Interruption', icon: 'kick', classes: ['gardien', 'lameombre', 'spectre'], target: 'enemy', cd: 12, range: { gardien: 9, lameombre: 9, spectre: 40 },
                  desc: 'Coupe une incantation. Gardien et Lame-ombre doivent être au contact ; le Spectre interrompt de loin.',
                  how: 'Touche le sort quand une barre d’incantation interruptible apparaît sous le boss. Il coupe l’ennemi ciblé, sinon l’incantation qui finit le plus tôt.' },
    egide:      { name: 'Égide', icon: 'shield', classes: ['gardien'], target: 'self', cd: 40, dur: 8, dr: 0.6,
                  desc: 'Le Gardien subit 60 % de dégâts en moins pendant 8 s. À lancer avant un gros coup.',
                  how: 'Touche le sort : le Gardien sélectionné le lance, sinon celui qui tanke.' },
    carapace:   { name: 'Carapace', icon: 'wall', classes: ['titan'], target: 'self', cd: 45, dur: 10, dr: 0.45,
                  desc: 'Le Titan subit 45 % de dégâts en moins pendant 10 s. À lancer avant un gros coup.',
                  how: 'Touche le sort : le Titan sélectionné le lance, sinon celui qui tanke.' },
    seisme:     { name: 'Séisme', icon: 'quake', classes: ['titan'], target: 'self', cd: 25, r: 9, stun: 3, dmg: 15000,
                  desc: 'Le Titan frappe le sol : les adds à 9 m sont étourdis 3 s, interrompus et viennent sur lui.',
                  how: 'Amène d’abord le Titan au milieu des adds, puis touche le sort. Il faut au moins un add à 9 m de lui.' },
    nuee:       { name: 'Nuée', icon: 'swarm', classes: ['medic'], target: 'none', cd: 90, pct: 0.045, dur: 6,
                  desc: 'Tout le raid récupère 4,5 % de ses PV par seconde pendant 6 s.',
                  how: 'Touche le sort, sans cible : tout le raid est soigné, où qu’il soit. À garder pour un gros dégât de raid.' },
    purge:      { name: 'Purge', icon: 'purge', classes: ['medic', 'maree'], target: 'ally', cd: 8,
                  desc: 'Retire un effet néfaste. Vise la sélection, sinon le plus ancien effet du raid.',
                  how: 'Sélectionne l’allié touché (pastille sur son cadre), puis le sort. Sans sélection, il retire l’effet le plus ancien du raid.' },
    prisme:     { name: 'Prisme', icon: 'prism', classes: ['seraphe'], target: 'ally', cd: 12, absorb: 0.35, dur: 10,
                  desc: 'Bouclier de 35 % des PV max pendant 10 s. Vise la sélection, sinon le tank actif.',
                  how: 'Sélectionne l’allié à protéger, puis le sort. Sans sélection, il va sur le tank qui a le boss.' },
    rez:        { name: 'Relève', icon: 'rez', classes: ['seraphe', 'maree'], target: 'dead', cd: 150, hp: 0.4,
                  desc: 'Relève un mort à 40 % de PV, sur place. Vise le mort sélectionné, sinon tank puis soigneur.',
                  how: 'Touche le cadre du mort, puis le sort. Sans sélection : un tank d’abord, puis un soigneur, puis un DPS.' },
    vague:      { name: 'Marée haute', icon: 'wave', classes: ['maree'], target: 'ground', cd: 20, r: 7, pct: 0.22, hot: 0.03, dur: 5,
                  desc: 'Soigne de 22 % les alliés à 7 m du point choisi, puis 3 %/s pendant 5 s.',
                  how: 'Touche le sort, puis le sol au milieu du groupe à soigner.' },
    pas:        { name: 'Pas de l’ombre', icon: 'dash', classes: ['lameombre'], target: 'enemy', cd: 20, dmg: 40000,
                  desc: 'La Lame-ombre bondit sur l’ennemi ciblé et frappe fort. Idéal pour un add.',
                  how: 'Touche l’ennemi visé, puis le sort. Sans cible, elle bondit sur le boss. Elle reste là où elle a atterri.' },
    tourbillon: { name: 'Tourbillon', icon: 'whirl', classes: ['fracasseur'], target: 'self', cd: 25, dur: 4, r: 7, dps: 7000,
                  desc: 'Le Fracasseur tournoie 4 s et frappe tous les ennemis à 7 m.',
                  how: 'Amène le Fracasseur au milieu des adds, puis touche le sort. C’est le Fracasseur sélectionné qui tournoie, sinon le plus proche de l’ennemi ciblé.' },
    cri:        { name: 'Cri de guerre', icon: 'shout', classes: ['fracasseur'], target: 'none', cd: 120, dur: 12, mult: 1.25,
                  desc: '+25 % de dégâts pour tout le raid pendant 12 s. Garde-le pour une phase de course.',
                  how: 'Touche le sort, sans cible : tout le raid en profite.' },
    tir:        { name: 'Tir de précision', icon: 'snipe', classes: ['spectre'], target: 'enemy', cd: 25, dmg: 55000,
                  desc: 'Gros tir sur l’ennemi ciblé, de n’importe où.',
                  how: 'Touche l’ennemi visé (un orbe, un add…), puis le sort. Sans cible, il tire sur le boss.' },
    tourelle:   { name: 'Tourelle', icon: 'turret', classes: ['bricoleur'], target: 'ground', cd: 40, dur: 15, dps: 2400, range: 22,
                  desc: 'Pose une tourelle 15 s qui tire sur les adds en priorité, sinon le boss.',
                  how: 'Touche le sort, puis le sol à l’endroit voulu. Elle tire à 22 m.' },
    dome:       { name: 'Dôme', icon: 'dome', classes: ['bricoleur'], target: 'ground', cd: 90, dur: 8, r: 6.5, dr: 0.35,
                  desc: 'Un dôme de 6,5 m réduit de 35 % les dégâts subis dedans pendant 8 s.',
                  how: 'Touche le sort, puis le sol au milieu du groupe à protéger. Il faut que les persos soient dedans.' },
  };

  // ---------- vivier : 2 raideurs par classe ----------
  const POOL = [
    ['kaelith', 'Kaelith', 'gardien'], ['ferro', 'Ferro', 'gardien'],
    ['brakka', 'Brakka', 'titan'], ['torvan', 'Torvan', 'titan'],
    ['nym4', 'Nym-4', 'medic'], ['oro9', 'Oro-9', 'medic'],
    ['iriel', 'Iriel', 'seraphe'], ['lys', 'Lys', 'seraphe'],
    ['somna', 'Somna', 'maree'], ['veyra', 'Veyra', 'maree'],
    ['vex', 'Vex', 'lameombre'], ['mordekk', 'Mordekk', 'lameombre'],
    ['rhun', 'Rhun', 'fracasseur'], ['tarn', 'Tarn', 'fracasseur'],
    ['ashka', 'Ashka', 'spectre'], ['senn', 'Senn', 'spectre'],
    ['kiro', 'Kiro', 'bricoleur'], ['quill', 'Quill', 'bricoleur'],
  ].map(([id, name, cls]) => ({ id, name, cls }));

  // ---------- Boss ----------
  // Chaque capacité : kind, first, every, + paramètres. h/m = surcharges Héroïque / Mythique ; only = 'nhm'.
  // call : ce que le raid lead doit faire (sert aux couleurs des minuteurs et au journal).
  const BOSSES = [
    {
      id: 'vorr', name: 'Vorr', title: 'la Sentinelle brisée', model: 'vorr', hp: 2.2e6, enrage: 300, color: '#ffb35a', rad: 3.4,
      lore: 'Le premier gardien de la Citadelle veille sur la Forge effondrée. Son armure de basalte s’effrite sur un cœur de magma, et chaque coup de son marteau fend la roche jusqu’à la lave.',
      focus: 'Changer de tank au bon moment, garder le raid derrière Vorr, le sortir de ses flaques, esquiver les fissures, puis tenir dans une arène qui rétrécit.',
      phases: [
        { to: 0.45, name: 'Gardien', abilities: {
          coup: { kind: 'buster', name: 'Coup broyeur', first: 8, every: 12, cast: 1.5, dmg: 15000, stack: 'Écrasé', mult: 1.5, stackDur: 22, call: 'taunt',
            desc: 'Gros coup sur le tank actif. Chaque cumul d’Écrasé augmente le suivant de 50 %. Provocation avec l’autre tank à 2 ou 3 cumuls, et Égide ou Carapace avant un coup chargé.' },
          frontal: { kind: 'frontal', name: 'Frappe circulaire', first: 14, every: 17, cast: 2, dmg: 30000, angle: 35, range: 14, call: 'pos',
            desc: 'Cône devant Vorr, vers son tank. Personne d’autre que les tanks devant lui.' },
          onde: { kind: 'raidcast', name: 'Onde sismique', first: 18, every: 20, cast: 2, dmg: 12500, call: 'heal', m: { dmg: 12000 },
            desc: 'Dégâts sur tout le raid. Garde tout le monde à portée des soigneurs (16 m).' },
          corrosion: { kind: 'dots', name: 'Corrosion', first: 26, every: 28, count: 2, dps: 3500, dur: 14, call: 'dispel', h: { count: 3 }, m: { count: 3, dur: 10, explode: { r: 6, dmg: 12000 } },
            desc: 'Effet néfaste qui ronge sa cible tant qu’il n’est pas purgé. Sélectionne la cible puis Purge.' },
          flaque: { kind: 'pool', name: 'Flaque de scories', first: 32, every: 36, r: 4.5, dur: 30, call: 'tank',
            desc: 'Une flaque se forme sous Vorr. Tant qu’il y reste, ses dégâts grimpent de 8 % toutes les 3 s. Déplace son tank à 8-10 m.' },
          fissures: { kind: 'fissures', name: 'Fissures de magma', first: 12, every: 24, count: 2, width: 2.8, len: 24, arm: 2.8, dur: 1.5, dps: 16000, call: 'move', h: { count: 3, arm: 2.5 }, m: { count: 3, arm: 2.2 },
            desc: 'Vorr frappe le sol : des fissures filent vers plusieurs persos, puis entrent en éruption. Décale sur le côté ceux qui sont sur une ligne avant l’éruption.' },
        } },
        { to: 0, name: 'Effondrement', dmgMult: 1.2, collapse: 13.5, abilities: {
          coup: { inherit: true }, frontal: { inherit: true }, corrosion: { inherit: true }, flaque: { inherit: true },
          onde: { inherit: true, every: 17 }, fissures: { inherit: true, first: 8, every: 18 },
        } },
      ],
    },
    {
      id: 'jumelles', name: 'Séla et Néria', title: 'les Jumelles astrales', model: 'twins', hp: 2.3e6, enrage: 330, color: '#ffd76a', twins: true, rad: 2.6,
      lore: 'Le soleil et la lune de Vael-Kor, liées par un serment que même la mort n’a pas rompu. Leur vie est commune.',
      focus: 'Un tank par jumelle, loin l’une de l’autre ; interrompre Séla ; ne jamais rester entre elles.',
      link: { dist: 14, h: { dist: 16 }, m: { dist: 18 } },
      phases: [
        { to: 0.4, name: 'Dualité', abilities: {
          brulure: { kind: 'meleeStack', name: 'Brûlure et Givre', body: -1, every: 6, stack: 'Astre', mult: 0.12, stackDur: 30, call: 'taunt',
            desc: 'Chaque jumelle marque son tank (+12 % de dégâts subis par cumul). Vers 5 cumuls, échange avec deux Provocations.' },
          eruption: { kind: 'raidcast', name: 'Éruption solaire', body: 0, first: 16, every: 26, cast: 3, dmg: 11000, interruptible: true, call: 'kick',
            desc: 'Séla incante une explosion sur tout le raid. Interruption.' },
          pluie: { kind: 'zones', name: 'Pluie d’étoiles', first: 10, every: 22, count: 3, r: 3.5, arm: 3, dur: 7, dps: 9000, call: 'move', h: { count: 4, arm: 2.5 }, m: { count: 5, arm: 2 },
            desc: 'Des impacts s’arment sous plusieurs persos : sors-les des cercles.' },
          rayon: { kind: 'beam', name: 'Rayon jumeau', first: 24, every: 30, warn: 2.5, dur: 6, dps: 9000, width: 1.4, call: 'pos', h: { dps: 12000 },
            desc: 'Un rayon relie les deux jumelles. Personne entre elles.' },
          maree: { kind: 'raidcast', name: 'Marée lunaire', body: 1, first: 12, every: 22, cast: 2, dmg: 9000, call: 'heal', h: { dmg: 10000 },
            desc: 'Néria inonde le raid de lumière froide. Dégâts de groupe à soigner.' },
        } },
        { to: 0, name: 'Fusion', dmgMult: 1.15, abilities: {
          brulure: { inherit: true }, pluie: { inherit: true },
          eruption: { inherit: true, every: 20 }, rayon: { inherit: true, every: 24 }, maree: { inherit: true, every: 18 },
        } },
      ],
    },
    {
      id: 'nyxar', name: 'Archonte Nyxar', title: 'Gardien du Noyau', model: 'nyxar', hp: 2.2e6, enrage: 360, color: '#c46bff', rad: 3.4,
      lore: 'Forgé pour garder le cœur stellaire de la Citadelle, l’Archonte obéit désormais au Néant qui ronge son Noyau.',
      focus: 'Changements de tank, interruptions, écartement des marqués, adds à tuer, soak final.',
      phases: [
        { to: 0.6, name: 'Noyau', abilities: {
          fendoir: { kind: 'buster', name: 'Fendoir gravitique', first: 6, every: 11, cast: 1.5, dmg: 14000, stack: 'Fracture', mult: 1.5, stackDur: 25, call: 'taunt',
            desc: 'Gros coup sur le tank, cumule Fracture (+50 % au suivant). Change de tank à 2-3 cumuls.' },
          chant: { kind: 'raidcast', name: 'Chant du Néant', first: 18, every: 30, cast: 3.5, dmg: 15000, dot: 1800, dotDur: 6, interruptible: true, call: 'kick', h: { cast: 3, every: 26 }, m: { cast: 2.2, every: 22 },
            desc: 'Incantation interruptible. Sinon : dégâts lourds sur le raid puis un écho qui brûle 6 s.' },
          marques: { kind: 'marks', name: 'Marques néantes', first: 30, every: 38, count: 2, r: 6.5, time: 6, dmg: 17000, call: 'spread', h: { count: 3, every: 34 }, m: { count: 4, every: 32, time: 5 },
            desc: 'Des persos marqués explosent après 6 s et touchent tous les alliés à moins de 6,5 m. Écarte les marqués.' },
        } },
        { to: 0.3, name: 'Échos', invuln: 5, abilities: {
          echos: { kind: 'adds', type: 'echo', name: 'Échos du Vide', first: 0, every: 55, count: 3, hp: 60000, call: 'focus', h: { count: 4, every: 60 }, m: { count: 4, every: 55 },
            desc: 'Des Échos protègent Nyxar (−50 % de dégâts) et lancent des Éclats. Ordre d’attaque sur eux ; ceux qui survivent explosent en phase 3.' },
          fendoir: { inherit: true, first: 8 },
          puits: { kind: 'zones', name: 'Puits gravitique', first: 14, every: 30, count: 3, r: 3.5, arm: 3, dur: 7, dps: 9000, call: 'move', h: { count: 4, arm: 2.5 }, m: { count: 5, arm: 2 },
            desc: 'Des puits s’ouvrent sous plusieurs persos et s’arment vite. Sors-les.' },
          chant: { inherit: true, first: 20 },
          marques: { inherit: true, first: 26, every: 30 },
        } },
        { to: 0, name: 'Effondrement', invuln: 4, aura: 160, ramp: 9, abilities: {
          fendoir: { inherit: true, first: 6 },
          convergence: { kind: 'soak', name: 'Convergence', first: 10, every: 24, dmg: 120000, r: 4.5, time: 7, need: 4, call: 'stack',
            desc: 'Cercle doré derrière le boss : les dégâts sont partagés entre les persos dedans. Au moins 4, hors tanks.' },
          chant: { inherit: true, first: 20, every: 24 },
          marques: { inherit: true, first: 18, every: 24, only: 'hm' },
        } },
      ],
    },
    {
      id: 'azhal', name: 'Azhal', title: 'le Cœur du Néant', model: 'azhal', hp: 2.25e6, enrage: 390, color: '#7a5cff', rad: 3.6,
      lore: 'Ce qui dévorait le Noyau depuis trois siècles. Une faim qui a pris forme, et qui a enfin trouvé sa proie.',
      focus: 'Abattre les orbes, tanker les gardiens, ressortir le raid de la singularité, puis tout à la fois.',
      phases: [
        { to: 0.7, name: 'Éveil', abilities: {
          griffe: { kind: 'buster', name: 'Griffe du Néant', first: 7, every: 11, cast: 1.5, dmg: 15000, stack: 'Lacération', mult: 1.5, stackDur: 24, call: 'taunt',
            desc: 'Gros coup sur le tank, cumule Lacération. Change de tank à 2-3 cumuls.' },
          orbes: { kind: 'adds', type: 'orb', name: 'Orbes vides', first: 14, every: 34, count: 3, hp: 26000, explode: 16000, call: 'focus', h: { count: 4 }, m: { count: 5 },
            desc: 'Des orbes dérivent vers le raid et explosent au contact. Ordre d’attaque, Tir ou Tourelle avant qu’ils arrivent.' },
          tenebres: { kind: 'dots', name: 'Ténèbres rampantes', first: 22, every: 25, count: 2, dps: 2500, dur: 12, explode: { r: 5, dmg: 10000 }, call: 'dispel', h: { count: 3 }, m: { count: 4, dur: 11 },
            desc: 'Effet néfaste. S’il expire sans être purgé, il explose sur les alliés à 5 m.' },
          hurlement: { kind: 'raidcast', name: 'Hurlement du Néant', first: 28, every: 30, cast: 2.5, dmg: 8000, call: 'heal',
            desc: 'Dégâts sur tout le raid.' },
        } },
        { to: 0.4, name: 'Singularité', invuln: 4, center: true, shieldWhileAdds: 0.3, abilities: {
          gardiens: { kind: 'adds', type: 'guardian', name: 'Gardiens du Vide', first: 0, every: 999, count: 2, hp: 160000, melee: 1300, call: 'tank', m: { count: 3 },
            desc: 'Des colosses qui frappent un soigneur. Provocation ou Séisme pour les faire tanker. Tant qu’ils vivent, Azhal ne subit que 30 % des dégâts. Leur Fléau s’interrompt.' },
          singularite: { kind: 'pulse', name: 'Singularité', first: 6, every: 13, h: { every: 12 }, m: { every: 12 }, pull: 4, r: 4.2, dps: 7000, call: 'move',
            desc: 'Azhal aspire le raid de 4 m vers lui. Le cœur broie : ressors les persos aspirés.' },
          meteores: { kind: 'zones', name: 'Pluie de météores', first: 12, every: 22, count: 3, r: 3.5, arm: 3, dur: 6, dps: 9000, call: 'move', h: { count: 4, arm: 2.5 }, m: { count: 4, arm: 2 },
            desc: 'Impacts sous plusieurs persos.' },
          eclipse: { kind: 'eclipse', name: 'Éclipse', first: 20, every: 40, dur: 8, dps: 1200, only: 'hm', call: 'cd',
            desc: 'Soins réduits de moitié pendant 8 s et dégâts continus. Nuée ou Dôme.' },
        } },
        { to: 0, name: 'Dévoreur', invuln: 4, aura: 150, ramp: 6, m: { ramp: 3 }, abilities: {
          griffe: { inherit: true, first: 6 },
          convergence: { kind: 'soak', name: 'Convergence du Néant', first: 12, every: 26, dmg: 110000, r: 4.5, time: 7, need: 4, call: 'stack', m: { dmg: 100000 },
            desc: 'Cercle à partager : au moins 4 persos hors tanks, idéalement plus.' },
          tenebres: { inherit: true, first: 18 },
          hurlement: { inherit: true, first: 24, every: 26 },
          orbes: { inherit: true, first: 30, every: 45, only: 'm' },
        } },
      ],
    },
  ];

  // Tous les modes en 10 joueurs. La durée d'un essai grandit avec la difficulté.
  const DIFFS = {
    normal:   { key: 'normal',   name: 'Normal',   size: 10, hpMult: 0.62, dmgMult: 0.9,  enrageMult: 1.0,  addMult: 0.7,  loot: 3, lootPow: 0.05, hints: true },
    heroique: { key: 'heroique', name: 'Héroïque', size: 10, hpMult: 0.95, dmgMult: 1.1,  enrageMult: 1.35, addMult: 0.95, loot: 4, lootPow: 0.08, hints: false },
    mythique: { key: 'mythique', name: 'Mythique', size: 10, hpMult: 1.2,  dmgMult: 1.2,  enrageMult: 1.6,  addMult: 1.1,  loot: 5, lootPow: 0.1,  hints: false },
  };

  const LOOT = {
    vorr: [
      { id: 'v1', name: 'Gantelets de scories', slot: 'Mains', for: 'tank' }, { id: 'v2', name: 'Fragment de Vorr', slot: 'Relique', for: 'all' },
      { id: 'v3', name: 'Lame de roche-étoile', slot: 'Arme', for: 'melee' }, { id: 'v4', name: 'Canon sismique', slot: 'Arme', for: 'ranged' },
      { id: 'v5', name: 'Bure de veilleur', slot: 'Torse', for: 'heal' }, { id: 'v6', name: 'Sceau du premier gardien', slot: 'Doigt', for: 'all' },
    ],
    jumelles: [
      { id: 'j1', name: 'Couronne solaire', slot: 'Tête', for: 'heal' }, { id: 'j2', name: 'Diadème lunaire', slot: 'Tête', for: 'dps' },
      { id: 'j3', name: 'Égide des Jumelles', slot: 'Bouclier', for: 'tank' }, { id: 'j4', name: 'Serment d’éclipse', slot: 'Relique', for: 'all' },
      { id: 'j5', name: 'Arc des deux astres', slot: 'Arme', for: 'ranged' }, { id: 'j6', name: 'Sabres crépusculaires', slot: 'Arme', for: 'melee' },
    ],
    nyxar: [
      { id: 'n1', name: 'Noyau fracturé de Nyxar', slot: 'Relique', for: 'all' }, { id: 'n2', name: 'Spallières de l’Archonte', slot: 'Épaules', for: 'tank' },
      { id: 'n3', name: 'Gantelets de la Singularité', slot: 'Mains', for: 'ranged' }, { id: 'n4', name: 'Lame-phase du Gardien', slot: 'Arme', for: 'melee' },
      { id: 'n5', name: 'Sceptre de l’Aube noire', slot: 'Arme', for: 'heal' }, { id: 'n6', name: 'Manteau du Vide stellaire', slot: 'Dos', for: 'support' },
    ],
    azhal: [
      { id: 'a1', name: 'Œil d’Azhal', slot: 'Relique', for: 'all' }, { id: 'a2', name: 'Carapace dévorante', slot: 'Torse', for: 'tank' },
      { id: 'a3', name: 'Cœur d’étoile morte', slot: 'Relique', for: 'heal' }, { id: 'a4', name: 'Faux du Néant', slot: 'Arme', for: 'melee' },
      { id: 'a5', name: 'Fusil d’horizon', slot: 'Arme', for: 'ranged' }, { id: 'a6', name: 'Anneau de la Faim', slot: 'Doigt', for: 'all' },
    ],
  };

  // ---------- apparences provisoires (anciens modèles, utilisés par le rendu et le banc d'essai) ----------
  const VSPECS = {
    gardien: { cls: 'gardien', role: 'tank', range: 'melee' },
    titan: { cls: 'titan', role: 'tank', range: 'melee' }, medic: { cls: 'medic', role: 'heal', range: 'ranged' }, seraphe: { cls: 'seraphe', role: 'heal', range: 'ranged' },
    maree: { cls: 'maree', role: 'heal', range: 'ranged' }, lameombre: { cls: 'lameombre', role: 'dps', range: 'melee' }, fracasseur: { cls: 'fracasseur', role: 'dps', range: 'melee' },
    spectre: { cls: 'spectre', role: 'dps', range: 'ranged' }, bricoleur: { cls: 'bricoleur', role: 'dps', range: 'ranged' },
    rempart: { cls: 'sentinelle', role: 'tank', range: 'melee' }, briseligne: { cls: 'sentinelle', role: 'dps', range: 'melee' },
    gardienflux: { cls: 'ascete', role: 'tank', range: 'melee' }, harmonie: { cls: 'ascete', role: 'heal', range: 'ranged' },
    nanochir: { cls: 'medic', role: 'heal', range: 'ranged' }, toxine: { cls: 'medic', role: 'dps', range: 'ranged' },
    aube: { cls: 'oracle', role: 'heal', range: 'ranged' }, supernova: { cls: 'oracle', role: 'dps', range: 'ranged' },
    precision: { cls: 'franctireur', role: 'dps', range: 'ranged' }, demolition: { cls: 'franctireur', role: 'dps', range: 'ranged' },
    ombre: { cls: 'lame', role: 'dps', range: 'melee' }, duel: { cls: 'lame', role: 'dps', range: 'melee' },
  };

  return { CLASSES, CLASS_ORDER, SPELLS, POOL, BOSSES, DIFFS, LOOT, VSPECS };
})();
if (typeof module !== 'undefined') module.exports = DATA;
