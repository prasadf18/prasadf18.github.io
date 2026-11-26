// Solar System data.
// Planet orbits: JPL "Approximate Positions of the Planets" (E. M. Standish),
// Keplerian elements and rates for 1800 AD - 2050 AD, J2000 ecliptic.
// Columns: a (AU), e, I, L, long. perihelion, long. node (deg) and rates per Julian century.
// Physical data and IAU rotation poles from NASA planetary fact sheets / IAU WGCCRE.

export const PLANETS = [
  { key: 'mercury', name: 'Mercury', el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], rt: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    radius: 2439.7, flat: 0, rot: 1407.6, pole: [281.01, 61.42], color: '#b5a99b', atmo: null,
    facts: { 'Mass': '0.055 Earths', 'Day': '58.6 Earth days', 'Year': '88 days', 'Moons': '0' },
    note: 'The smallest planet, closest to the Sun. Days reach 430 C, nights fall to -180 C.' },
  { key: 'venus', name: 'Venus', el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], rt: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    radius: 6051.8, flat: 0, rot: -5832.5, pole: [272.76, 67.16], color: '#e8cf9a', atmo: { color: [1.0, 0.85, 0.55], k: 1.4 },
    facts: { 'Mass': '0.815 Earths', 'Day': '243 Earth days (retrograde)', 'Year': '225 days', 'Moons': '0' },
    note: 'Wrapped in sulfuric acid clouds over a crushing CO2 atmosphere, the hottest planet at about 465 C.' },
  { key: 'earth', name: 'Earth', el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], rt: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
    radius: 6371.0, flat: 0.00335, rot: 23.9345, pole: [0, 90], color: '#6fa8ff', atmo: { color: [0.35, 0.6, 1.0], k: 1.3 },
    facts: { 'Mass': '5.97 x 10^24 kg', 'Day': '23 h 56 min', 'Year': '365.25 days', 'Moons': '1' },
    note: 'Home. Shown with real coastlines and its actual orientation for the date on screen: the day side faces the Sun as it does right now.' },
  { key: 'mars', name: 'Mars', el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rt: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    radius: 3389.5, flat: 0.00589, rot: 24.6229, pole: [317.68, 52.89], color: '#e0784a', atmo: { color: [1.0, 0.6, 0.4], k: 0.45 },
    facts: { 'Mass': '0.107 Earths', 'Day': '24 h 37 min', 'Year': '687 days', 'Moons': '2' },
    note: 'A cold desert world with polar ice caps, the largest volcano in the solar system, and rovers on its surface.' },
  { key: 'jupiter', name: 'Jupiter', el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rt: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    radius: 71492, flat: 0.06487, rot: 9.925, pole: [268.06, 64.5], color: '#d9b38c', atmo: { color: [0.9, 0.8, 0.65], k: 0.5 },
    facts: { 'Mass': '318 Earths', 'Day': '9 h 56 min', 'Year': '11.86 years', 'Moons': '95+ known' },
    note: 'The largest planet. Its Great Red Spot is a storm wider than Earth that has raged for centuries.' },
  { key: 'saturn', name: 'Saturn', el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rt: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    radius: 60268, flat: 0.09796, rot: 10.656, pole: [40.59, 83.54], color: '#e6cf98', atmo: { color: [0.95, 0.85, 0.6], k: 0.45 }, rings: 'saturn',
    facts: { 'Mass': '95 Earths', 'Day': '10 h 39 min', 'Year': '29.4 years', 'Moons': '270+ known' },
    note: 'Its rings are mostly water ice, hundreds of thousands of km wide yet often only about 10 m thick.' },
  { key: 'uranus', name: 'Uranus', el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], rt: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    radius: 25559, flat: 0.02293, rot: -17.24, pole: [257.31, -15.18], color: '#a7e1e6', atmo: { color: [0.6, 0.9, 0.95], k: 0.6 }, rings: 'uranus',
    facts: { 'Mass': '14.5 Earths', 'Day': '17 h 14 min (retrograde)', 'Year': '84 years', 'Moons': '28+ known' },
    note: 'An ice giant tipped on its side, axis tilted 98 degrees, probably by an ancient collision.' },
  { key: 'neptune', name: 'Neptune', el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rt: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.0508653],
    radius: 24764, flat: 0.01708, rot: 16.11, pole: [299.36, 43.46], color: '#5b83f0', atmo: { color: [0.4, 0.6, 1.0], k: 0.6 },
    facts: { 'Mass': '17.1 Earths', 'Day': '16 h 7 min', 'Year': '164.8 years', 'Moons': '16+ known' },
    note: 'The windiest planet, with supersonic storms up to 2,000 km/h.' },
  { key: 'pluto', name: 'Pluto', dwarf: true, el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], rt: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
    radius: 1188.3, flat: 0, rot: -153.29, pole: [132.99, -6.16], color: '#d8c0a0', atmo: null,
    facts: { 'Class': 'Dwarf planet', 'Day': '6.4 Earth days', 'Year': '248 years', 'Moons': '5' },
    note: 'Dwarf planet in the Kuiper Belt. New Horizons revealed a heart-shaped nitrogen ice plain in 2015.' },
];

// Major moons: radius km, semi-major axis km, period days (negative = retrograde)
export const MOONS = [
  { key: 'moon', name: 'Moon', parent: 'earth', radius: 1737.4, a: 384400, P: 27.321661, note: 'Earth\'s only natural satellite, the only other world humans have walked on.' },
  { key: 'io', name: 'Io', parent: 'jupiter', radius: 1821.6, a: 421700, P: 1.769138, note: 'The most volcanically active body in the solar system.' },
  { key: 'europa', name: 'Europa', parent: 'jupiter', radius: 1560.8, a: 671034, P: 3.551181, note: 'An icy shell over a global salt water ocean.' },
  { key: 'ganymede', name: 'Ganymede', parent: 'jupiter', radius: 2634.1, a: 1070412, P: 7.154553, note: 'The largest moon in the solar system, bigger than Mercury.' },
  { key: 'callisto', name: 'Callisto', parent: 'jupiter', radius: 2410.3, a: 1882709, P: 16.689017, note: 'One of the most heavily cratered surfaces known.' },
  { key: 'titan', name: 'Titan', parent: 'saturn', radius: 2574.7, a: 1221870, P: 15.945, atmo: { color: [1.0, 0.65, 0.3], k: 1.5 }, note: 'A thick orange atmosphere, with lakes and seas of liquid methane.' },
  { key: 'triton', name: 'Triton', parent: 'neptune', radius: 1353.4, a: 354759, P: -5.876854, note: 'Orbits backwards, likely a captured Kuiper Belt object. Has nitrogen geysers.' },
  { key: 'charon', name: 'Charon', parent: 'pluto', radius: 606, a: 19591, P: 6.387221, note: 'So large relative to Pluto that the pair orbit a point between them.' },
];

export const SUN = { name: 'Sun', teff: 5772, radius: 695700, pole: [286.13, 63.87], rot: 609.12,
  facts: { 'Type': 'G2V yellow dwarf', 'Age': '4.6 billion years', 'Mass': '333,000 Earths', 'Surface': '5,772 K' },
  note: 'Our star. Holds 99.86 percent of the solar system\'s mass.' };
