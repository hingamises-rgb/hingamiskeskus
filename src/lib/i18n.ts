// ET <-> RU staatiliste lehtede URL-vastavused (RU slugid vana saidi järgi).
// Toodete vasted tulevad DB-st (slug_ru), neid siin ei hoita.
export const RU_BY_ET: Record<string, string> = {
  '/': '/ru',
  '/teenused': '/ru/uslugi',
  '/vabastav-hingamine': '/ru/osoznannoe-dyhanie',
  '/floating': '/ru/floating',
  '/neurovizr': '/ru/neurovizr',
  '/soojas-vees-hingamine': '/ru/dyhanie-v-vode',
  '/aromatouch-kehahooldus': '/ru/aromatouch-uhod-za-telom',
  '/ruumide-rent': '/ru/arenda-pomeshenij',
  '/terapeudid': '/ru/nashi-terapevty',
  '/broneeri-aeg': '/ru/zabronirovat-vremya',
  '/e-pood': '/ru/onlajn-shop',
  '/hakka-liikmeks': '/ru/chlenstvo',
  '/kkk': '/ru/chavo',
};

export const ET_BY_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_BY_ET).map(([et, ru]) => [ru, et])
);
