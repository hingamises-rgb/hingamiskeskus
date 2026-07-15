// Staatiliste lehtede URL-vastavused keelte vahel (slugid vana saidi järgi).
// Toodete ja blogi vasted tulevad DB-st / failinimedest, neid siin ei hoita.
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

export const EN_BY_ET: Record<string, string> = {
  '/': '/en',
  '/teenused': '/en/services',
  '/vabastav-hingamine': '/en/breathwork',
  '/floating': '/en/floating',
  '/neurovizr': '/en/neurovizr',
  '/soojas-vees-hingamine': '/en/breathwork-in-water',
  '/aromatouch-kehahooldus': '/en/aromatouch-body-treatment',
  '/ruumide-rent': '/en/room-rental',
  '/terapeudid': '/en/our-therapists',
  '/broneeri-aeg': '/en/book-a-session',
  '/e-pood': '/en/shop',
  '/hakka-liikmeks': '/en/membership',
  '/kkk': '/en/faq',
};

export const ET_BY_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_BY_ET).map(([et, ru]) => [ru, et])
);

export const ET_BY_EN: Record<string, string> = Object.fromEntries(
  Object.entries(EN_BY_ET).map(([et, en]) => [en, et])
);
