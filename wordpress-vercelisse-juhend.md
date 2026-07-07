# WordPress kodulehe kolimine Vercelisse (Astro abil)

## Mis see juhend on?

See juhend on mõeldud Claude Code'ile, kes aitab kolida olemasolevat WordPress kodulehte Vercelisse, kasutades Astro staatilist lehegeneraatorit. Juhend põhineb reaalsel kogemusel, kus sama protsess tehti Hostinger/Zyro → Vercel kolimisega.

---

## Eeltingimused — mis peab olema enne alustamist

### 1. GitHub konto
- Loo konto: https://github.com
- Loo uus repo (nt `minu-koduleht`)
- Repo võib olla private
- Kasutajal peab olema git seadistatud arvutis (`git config --global user.name` ja `user.email`)

### 2. Vercel konto
- Loo konto: https://vercel.com (saab GitHubiga sisse logida)
- Free tier on piisav enamiku kodulehtede jaoks
- Ühenda Vercel oma GitHub repoga — iga push main harusse teeb automaatse deploy

### 3. Node.js
- Vajalik versioon: 18+ (soovitavalt 22 LTS)
- Paigalda nvm kaudu: https://github.com/nvm-sh/nvm
- `nvm install 22 && nvm use 22`

### 4. Ligipääs praegusele WordPress lehele
- WordPress admin paneeli ligipääs (wp-admin)
- Või vähemalt lehele ligipääs (tekst, pildid, struktuur)
- FTP/failihalduri ligipääs on boonus (meedia failide allalaadimiseks)

---

## Samm-sammuline protsess

### SAMM 1: Uue Astro projekti loomine

```bash
npm create astro@latest minu-koduleht
cd minu-koduleht
```

Valikud:
- Template: Empty
- TypeScript: No (või Yes, vastavalt eelistusele)
- Install dependencies: Yes

### SAMM 2: Projekti struktuur

```
minu-koduleht/
├── public/
│   └── images/          ← siia tulevad kõik pildid
├── src/
│   ├── layouts/
│   │   └── Layout.astro  ← üldine HTML skelett (head, body, fondid, globaalsed stiilid)
│   └── pages/
│       ├── index.astro    ← avaleht
│       ├── teenus1.astro  ← iga leht on eraldi .astro fail
│       └── kontakt.astro
├── astro.config.mjs
└── package.json
```

### SAMM 3: WordPress sisu kopeerimine

**Tekst:**
- Ava iga WordPress leht wp-adminis või avalikul lehel
- Kopeeri tekst, pealkirjad, nimekirjad
- Kontrolli alati originaallehelt — ära leiuta ega arva

**Pildid:**
- Lae pildid alla WordPress meediateegist (wp-content/uploads/) või
- Kasuta brauseris "Save image as" igalt lehelt
- Salvesta `public/images/` kausta
- Nimeta selgelt: `teenus-floating.jpg`, `terapeut-mari.jpg` jne

**Struktuur:**
- Vaata WordPress menüüd — millised lehed on olemas
- Iga leht = üks .astro fail `src/pages/` kaustas
- URL tuleneb failinimest: `floating.astro` → `/floating`

### SAMM 4: Layout.astro — globaalne mall

```astro
---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<!doctype html>
<html lang="et">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="/images/logo.svg" />
  <title>{title}</title>
  <meta name="description" content="Kodulehe kirjeldus siia" />
  <!-- Google Fonts või muud fondid siia -->
</head>
<body>
  <slot />
</body>
</html>

<style is:global>
  /* Globaalsed stiilid: fondid, värvid, reset */
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: sans-serif;
    color: #1d1e20;
    background: #fff;
    line-height: 1.6;
  }
  a { color: inherit; text-decoration: none; }
  img { max-width: 100%; height: auto; display: block; }
  button { font-family: inherit; cursor: pointer; border: none; background: none; }
</style>
```

### SAMM 5: Iga lehe ehitamine

Iga .astro fail sisaldab:
1. Layout import ja kasutamine
2. HTML struktuur (header, sisu sektsioonid, footer)
3. Scoped CSS `<style>` blokis

```astro
---
import Layout from '../layouts/Layout.astro';
---

<Layout title="Lehe pealkiri SEO jaoks">

<!-- HEADER -->
<header class="header">
  <!-- logo, menüü, ostukorv -->
</header>

<!-- SISU -->
<section class="hero">
  <h1>Pealkiri</h1>
  <p>Tekst originaallehelt</p>
</section>

<!-- FOOTER -->
<footer class="footer">
  <!-- kontakt, lahtiolekuajad, sotsiaalmeedia -->
</footer>

</Layout>

<style>
  /* Selle lehe stiilid — Astro scopeerib automaatselt */
  .hero { padding: 32px 24px; }
</style>
```

### SAMM 6: Disaini kopeerimine

**OLULINE REEGEL: uus leht peab välja nägema TÄPSELT nagu originaal!**

- Kasuta brauseri DevToolsi (F12) et näha originaali värve, fonte, suurusi
- Kopeeri värvid, fondid, vahekaugused täpselt
- Mobile-first lähenemine (enamik liiklust tuleb telefonist)
- border-radius, padding, margin — kõik peab klappima

**Levinud stiilimustrid:**
- `border-radius: 10px` — nupud ja pildid
- `clip-path: inset(0 round 10px)` — piltidel kui border-radius tekitab artefakte
- `max-width: 800px; margin: 0 auto;` — teksti sektsioonidel
- `padding: 32px 24px;` — mobiilil sektsioonide padding

### SAMM 7: Header ja Footer

Header ja footer korduvad igal lehel. Praegu kopeeri need igale lehele (hiljem saab komponendiks teha).

**Header peab sisaldama:**
- Logo (link avalehele)
- Navigatsioon / hamburger menüü
- Ostukorvi ikoon (kui on e-pood)

**Footer peab sisaldama:**
- Aadress / asukoht
- Kontaktandmed
- Lahtiolekuajad
- Sotsiaalmeedia lingid
- Privaatsuspoliitika ja müügitingimuste lingid

### SAMM 8: Dev server ja testimine

```bash
npx astro dev
```

- Avab lehe aadressil http://localhost:4321
- HMR (Hot Module Reload) — muudatused näha kohe
- Testi ALATI mobiilivaates (Chrome DevTools → telefoni ikoon)
- Kontrolli iga leht eraldi

### SAMM 9: Git ja Vercel deploy

```bash
git init
git add .
git commit -m "Esmane koduleht Astros"
git remote add origin https://github.com/kasutaja/repo.git
git push -u origin main
```

Vercelis:
1. "Add New Project"
2. Vali oma GitHub repo
3. Framework Preset: Astro
4. Deploy — Vercel ehitab ja paneb üles automaatselt
5. Saad .vercel.app domeeni kohe

### SAMM 10: Domeeni ühendamine

1. Vercel Dashboard → Project → Settings → Domains
2. Lisa oma domeen (nt minuleht.ee)
3. Domeeni DNS-is lisa Vercel'i CNAME kirje:
   - `CNAME` → `cname.vercel-dns.com`
   - Või A kirje → `76.76.21.21`
4. SSL sertifikaat genereeritakse automaatselt

---

## Olulised reeglid Claude Code'ile

1. **Ära leiuta sisu** — kopeeri tekst, pildid ja struktuur originaallehelt täpselt nii nagu see on
2. **Kontrolli alati originaali** — enne igat lehte vaata originaalleht üle, WebFetch või brauseriga
3. **Disain peab klappima** — värvid, fondid, vahekaugused, üldine välimus peab olema identne
4. **Mobile-first** — enamik liiklust on telefonist, testi alati mobiilivaates
5. **Alt-tekstid piltidele** — iga pilt vajab kirjeldavat alt-teksti
6. **SEO** — iga leht vajab unikaalset title ja meta description
7. **H1/H2/H3 hierarhia** — iga lehel üks H1, alamjaotised H2, jne
8. **Ära tee rohelist CTA kasti** — broneerimis/kontakti nupud on lihtsad tumedad nupud valgel taustal
9. **Footer** — sama igal lehel, taustavärv peaks vastama originaalile
10. **Commit tihti** — iga lehe valmides tee git commit

---

## WordPress-spetsiifilised nipid

### Sisu eksportimine
- WordPress Tools → Export → All content (XML fail)
- Või kasuta WP REST API-t: `https://sinuleht.ee/wp-json/wp/v2/pages` ja `/posts`
- Pildid on tavaliselt: `https://sinuleht.ee/wp-content/uploads/2024/...`

### Blogipostitused
- Kui on palju postitusi, kasuta Astro Content Collections
- Või genereeri .astro failid skriptiga WP API-st

### Kontaktivormid
- WordPress Contact Form 7 / WPForms vormid tuleb HTML-is uuesti ehitada
- Vormi saatmiseks kasuta: Formspree.io, Netlify Forms, või mailto fallback
- Ära kasuta WordPress pluginaid — need ei tööta staatisel lehel

### WooCommerce (e-pood)
- Tooted tuleb käsitsi üle kanda või API-st lugeda
- Makselahendus: Stripe, Paysera vms eraldi integratsioon
- Ostukorv: JavaScripti põhine (localStorage)

### Mitmekeelsus
- WordPress WPML/Polylang → Astro keeleversioonid
- Struktuur: `/et/`, `/en/`, `/ru/` jne
- Iga keele jaoks eraldi lehed või dünaamiline routing

---

## Tüüpilised vead mida vältida

1. **Vale pilt** — kontrolli alati kas allalaetud pilt on õige, mitte mingi muu lehe pilt
2. **Piltide servaartefaktid** — kasuta `clip-path: inset(0 round 10px)` mitte `border-radius`
3. **Footer vale värviga** — kontrolli originaali footeri taustavärv
4. **Pealkirjad vasakule** — kui originaalis keskele, siis pane keskele
5. **Teksti suurus liiga väike** — mobiilil peaks põhitekst olema vähemalt 16-18px
6. **Puuduv hamburger menüü** — ära unusta mobiilset navigatsiooni
7. **Puuduvad meta tagid** — iga leht vajab title ja description

---

## Kiire kontrollnimekiri enne go-live

- [ ] Kõik lehed olemas ja sisu kontrollitud originaaliga
- [ ] Pildid optimeeritud (mitte 5MB fotod)
- [ ] Alt-tekstid kõikidel piltidel
- [ ] Mobile vaade testitud
- [ ] Lingid töötavad (sisemised ja välised)
- [ ] Kontaktivorm töötab
- [ ] Footer korrektne igal lehel
- [ ] SEO meta tagid igal lehel
- [ ] Favicon olemas
- [ ] 404 leht olemas
- [ ] DNS seadistatud
- [ ] SSL töötab (https)
- [ ] Vana leht redirect uuele (kui sama domeen)
