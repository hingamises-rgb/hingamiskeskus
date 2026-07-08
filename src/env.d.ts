/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminUser?: string;
  }
}

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly SESSION_SECRET: string;
  readonly PAYSERA_SIGN_PASSWORD: string;
  readonly SMAILY_API_USER: string;
  readonly SMAILY_API_KEY: string;
}
