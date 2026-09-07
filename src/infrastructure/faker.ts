import type { Faker } from '@faker-js/faker';
import type { TextProvider } from '../domain/generators';
import type { Locale } from '../domain/types';

export async function loadTextProvider(locales: Locale[]): Promise<TextProvider> {
  const instances = new Map<Locale, Faker>();
  await Promise.all(
    [...new Set(locales)].map(async (locale) => {
      const module = await {
        pl: () => import('@faker-js/faker/locale/pl'),
        da: () => import('@faker-js/faker/locale/da'),
        de: () => import('@faker-js/faker/locale/de'),
        en_GB: () => import('@faker-js/faker/locale/en_GB'),
        en_US: () => import('@faker-js/faker/locale/en_US'),
      }[locale]();
      instances.set(locale, module.faker);
    }),
  );
  const get = (locale: Locale, seed: number) => {
    const faker = instances.get(locale);
    if (!faker) throw new Error(`Locale not loaded: ${locale}`);
    faker.seed(seed);
    faker.setDefaultRefDate('2026-01-01T00:00:00.000Z');
    return faker;
  };
  return {
    firstName: (locale, seed, sex) => get(locale, seed).person.firstName(sex),
    lastName: (locale, seed) => get(locale, seed).person.lastName(),
    company: (locale, seed) => get(locale, seed).company.name(),
    address: (locale, seed) => {
      const faker = get(locale, seed);
      return {
        streetName: faker.location.street(),
        houseNumber: String(faker.number.int({ min: 1, max: 200 })),
        postalCode: faker.location.zipCode(),
        city: faker.location.city(),
        country: { pl: 'PL', da: 'DK', de: 'DE', en_GB: 'GB', en_US: 'US' }[locale],
        provenance: 'synthetic',
        geographicConsistency: 'not-verified',
        registryVerified: false,
      };
    },
  };
}
