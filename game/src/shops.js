// The shopfront deck: every name painted over a storefront in Marisol Bay, with the type treatment
// it is painted in. Nothing here echoes a real chain or another game: these are the kind of names a
// warm, half-forgotten seaside town puts over its doors.
//
// Each entry is a name plus a look. `face` picks a font stack, `weight` and `tracking` set the cut,
// `case` decides the caps, and `fascia` decides how the sign is built into the wall:
//
//   band     a painted band right across the shopfront
//   panel    an inset board, shorter than the frontage
//   outline  the name drawn as an outline straight onto the wall
//   blade    a narrow vertical sign hung beside the door
//
// The pool is walked in shuffled order per block, so no block ever shows the same name twice.

export const FONTS = {
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  grotesk: '"Trebuchet MS", "Segoe UI", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", Courier, monospace',
  slab: 'Rockwell, "Courier New", Georgia, serif',
  condensed: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif',
};

/** Seven type treatments, cycled so neighbouring shops never share one. */
export const TREATMENTS = [
  { face: 'sans', weight: 900, tracking: 0.06, upper: true, ink: '#fff6e6', panel: '#12333c', fascia: 'band', windows: '#3f6a76' },
  { face: 'serif', weight: 600, tracking: 0.14, upper: true, ink: '#ffe9c6', panel: '#6d2f28', fascia: 'panel', windows: '#5d7f83' },
  { face: 'condensed', weight: 800, tracking: 0.2, upper: true, ink: '#f4f0e2', panel: '#25404a', fascia: 'band', windows: '#446c74' },
  { face: 'mono', weight: 700, tracking: 0.1, upper: true, ink: '#ffdf9c', panel: '#2c2a3c', fascia: 'outline', windows: '#4b6172' },
  { face: 'slab', weight: 700, tracking: 0.04, upper: false, ink: '#fff3dc', panel: '#1f4f45', fascia: 'panel', windows: '#3d6a67' },
  { face: 'grotesk', weight: 600, tracking: 0.24, upper: true, ink: '#fdf3e0', panel: '#7a3d2a', fascia: 'blade', windows: '#557a83' },
  { face: 'serif', weight: 500, tracking: 0.02, upper: false, ink: '#ffeecd', panel: '#233c56', fascia: 'band', windows: '#456f80' },
];

/** Fifty-six doors, all of them different. */
export const SHOP_NAMES = [
  'CAFÉ AZUL',
  'Del Sol',
  'PALMAS',
  'La Marina',
  'CASA NORTE',
  'EL FARO',
  'BODEGA',
  'Cantina',
  'ZAPATOS',
  'PANADERÍA',
  'FARMACIA',
  'Licores',
  'RELOJES',
  'Flores',
  'MERCADO',
  'SODA',
  'PESCADO',
  'Taller',
  'CINE ROJO',
  'Teatro',
  'GALERÍA',
  'Perfumes',
  'LIBRERÍA',
  'Heladería',
  'JUGUETERÍA',
  'Barbería',
  'LAVANDERÍA',
  'Ferretería',
  'ÓPTICA',
  'Joyería',
  'Pastelería',
  'Taquería',
  'CERVEZA FRÍA',
  'Ron y Hielo',
  'MALECÓN 9',
  'La Palapa',
  'CASA VERDE',
  'Villa Coral',
  'HOTEL SOLANA',
  'Posada del Mar',
  'HOSTAL BRISA',
  'Suites Arena',
  'MOTEL LUNA',
  'Bar Nácar',
  'CLUB TIBURÓN',
  'Salsa y Son',
  'LA CUEVA',
  'El Tambor',
  'PULPERÍA',
  'Cafetín',
  'COCTELERÍA',
  'Azotea',
  'Lonchería',
  'Dulcería',
  'SOMBREROS',
  'Botánica',
];

/** Rooftop boards and the words the distant skyline carries. */
export const ROOF_WORDS = [
  'MARISOL', 'BAY HOTEL', 'DEL SOL', 'CASA NORTE', 'SOLANA', 'EL FARO',
  'MALECÓN', 'CORAL', 'ARENA', 'PUERTO', 'LA PALMA', 'TIBURÓN',
  'AZOTEA', 'NÁCAR', 'BRISA', 'CANTINA',
];

/** The treatment for shop `index`: an even spread, so one style never dominates a block. */
export function treatmentFor(index) {
  return TREATMENTS[index % TREATMENTS.length];
}
