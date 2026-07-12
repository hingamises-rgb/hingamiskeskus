// Broneerimise meilid: kinnitus, meeldetuletus (24h), kinnituskood.
// Tekstid Hopitude praeguste meilide põhjal (kasutaja saatis 9.-10.07.2026);
// tühistamine käib meilis oleva lingi kaudu (kuni 1h enne algust).
// NB: SMTP porte EI SAA lokaalselt testida — ainult live's (vt runbook).

import nodemailer from 'nodemailer';

const EMAIL_USER = import.meta.env.EMAIL_USER || process.env.EMAIL_USER || 'info@hingamiskeskus.ee';
const EMAIL_PASS = import.meta.env.EMAIL_PASS || process.env.EMAIL_PASS || '';
const SITE = 'https://www.hingamiskeskus.ee';

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  connectionTimeout: 8000,
});

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type Locale = 'et' | 'ru' | 'en';

const T: Record<Locale, any> = {
  et: {
    confirmSubject: (svc: string, date: string) => `Broneering kinnitatud: ${svc} ${date}`,
    hello: (name: string) => `Tere, ${name}!`,
    confirmed: (time: string, svc: string, room: string, date: string) =>
      `${time} ${svc}${room ? ' ' + room : ''}, mis toimub ${date} kell ${time.split(' - ')[0]} broneering on edukas.`,
    cancelInfo: 'Kui Sa ei saa mingil põhjusel tulla, siis osalemise saad tühistada alloleva nupu kaudu (kuni 1 tund enne algust).',
    cancelBtn: 'Tühista või vaata broneeringut',
    floatTips: 'Kui oled tulemas floatima, siis ole hea, tule 10–15 minutit varem kohale, et jõuaksid ennast pesta. Võimalusel võta kaasa plätud — kui unustad, siis meil on ka olemas. Meie poolt on käterätik ja hommikumantel. Soovi korral võib kanda ujumisriideid, aga see ei ole kohustuslik.',
    groupTips: 'Palun saabu vähemalt 10 minutit enne seansi algust. Võta kaasa mugavad riided, mis võimaldavad vabalt liikuda ja lõõgastuda.',
    bye: 'Kohtumiseni!',
    remindSubject: (svc: string) => `Meeldetuletus: homme on sinu ${svc}`,
    remind: (time: string, svc: string, room: string, date: string) =>
      `Tuletame meelde: ${date} kell ${time} ootab Sind ${svc}${room ? ' (' + room + ')' : ''}.`,
    codeSubject: 'Sinu kinnituskood',
    codeBody: (code: string) => `Sinu Hingamiskeskuse kinnituskood on: ${code}\n\nKood kehtib 15 minutit. Kui Sina seda ei küsinud, võid kirja tähelepanuta jätta — ilma koodita Sinu pakette kasutada ei saa.`,
    rentSubject: 'Saime sinu rendisoovi kätte',
    rentBody: (room: string, date: string, hours: string) =>
      `Saime kätte sinu soovi rentida: ${room}, ${date}, ${hours}. Ruumide rent toimub kokkuleppel — vaatame soovi üle ja anname vastuse hiljemalt järgmisel tööpäeval.`,
    cancelled: (svc: string, date: string, time: string) =>
      `Sinu broneering (${svc}, ${date} kell ${time}) on tühistatud. Kui maksid ette, jäi summa Sinu e-posti külge ettemaksuna — järgmisel broneerimisel saad seda kasutada.`,
    cancelledSubject: 'Broneering tühistatud',
  },
  ru: {
    confirmSubject: (svc: string, date: string) => `Бронь подтверждена: ${svc} ${date}`,
    hello: (name: string) => `Здравствуйте, ${name}!`,
    confirmed: (time: string, svc: string, room: string, date: string) =>
      `Ваша бронь подтверждена: ${svc}${room ? ' (' + room + ')' : ''}, ${date} в ${time.split(' - ')[0]} (${time}).`,
    cancelInfo: 'Если вы не сможете прийти, отменить участие можно по кнопке ниже (до 1 часа до начала).',
    cancelBtn: 'Отменить или посмотреть бронь',
    floatTips: 'Если вы идёте на флоатинг, приходите на 10–15 минут раньше, чтобы успеть принять душ. По возможности возьмите тапочки — если забудете, у нас есть. Полотенце и халат мы предоставим. Купальник по желанию.',
    groupTips: 'Пожалуйста, приходите за 10 минут до начала. Возьмите удобную одежду.',
    bye: 'До встречи!',
    remindSubject: (svc: string) => `Напоминание: завтра ваш сеанс — ${svc}`,
    remind: (time: string, svc: string, room: string, date: string) =>
      `Напоминаем: ${date} в ${time} вас ждёт ${svc}${room ? ' (' + room + ')' : ''}.`,
    codeSubject: 'Ваш код подтверждения',
    codeBody: (code: string) => `Ваш код подтверждения Hingamiskeskus: ${code}\n\nКод действует 15 минут. Если вы его не запрашивали, просто проигнорируйте письмо.`,
    rentSubject: 'Мы получили вашу заявку на аренду',
    rentBody: (room: string, date: string, hours: string) =>
      `Мы получили заявку на аренду: ${room}, ${date}, ${hours}. Аренда по договорённости — ответим не позднее следующего рабочего дня.`,
    cancelled: (svc: string, date: string, time: string) =>
      `Ваша бронь (${svc}, ${date} в ${time}) отменена. Если вы платили заранее, сумма осталась предоплатой на вашем e-mail.`,
    cancelledSubject: 'Бронь отменена',
  },
  en: {
    confirmSubject: (svc: string, date: string) => `Booking confirmed: ${svc} ${date}`,
    hello: (name: string) => `Hello, ${name}!`,
    confirmed: (time: string, svc: string, room: string, date: string) =>
      `Your booking is confirmed: ${svc}${room ? ' (' + room + ')' : ''}, ${date} at ${time.split(' - ')[0]} (${time}).`,
    cancelInfo: 'If you cannot make it, you can cancel via the button below (up to 1 hour before start).',
    cancelBtn: 'Cancel or view booking',
    floatTips: 'If you are coming to float, please arrive 10–15 minutes early to shower. Bring flip-flops if you can — if you forget, we have spares. Towel and bathrobe are provided. Swimwear is optional.',
    groupTips: 'Please arrive 10 minutes before the session. Bring comfortable clothes.',
    bye: 'See you soon!',
    remindSubject: (svc: string) => `Reminder: your ${svc} is tomorrow`,
    remind: (time: string, svc: string, room: string, date: string) =>
      `A friendly reminder: ${date} at ${time}, ${svc}${room ? ' (' + room + ')' : ''} is waiting for you.`,
    codeSubject: 'Your verification code',
    codeBody: (code: string) => `Your Hingamiskeskus verification code: ${code}\n\nThe code is valid for 15 minutes. If you did not request it, you can ignore this email.`,
    rentSubject: 'We received your rental request',
    rentBody: (room: string, date: string, hours: string) =>
      `We received your rental request: ${room}, ${date}, ${hours}. Rental is by agreement — we will reply by the next working day.`,
    cancelled: (svc: string, date: string, time: string) =>
      `Your booking (${svc}, ${date} at ${time}) has been cancelled. If you prepaid, the amount stays as credit on your email.`,
    cancelledSubject: 'Booking cancelled',
  },
};

function wrap(bodyHtml: string): string {
  return `
  <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1d1e20;">
    <div style="background: #1f6d85; color: #fff; padding: 14px 20px; font-weight: bold; letter-spacing: 2px;">
      HINGAMISKESKUS
    </div>
    <div style="padding: 20px; background: #f3fcff; line-height: 1.55; font-size: 15px;">
      ${bodyHtml}
    </div>
    <div style="padding: 14px 20px; font-size: 12px; color: #5a6e76; border-top: 1px solid #d7e6ec;">
      Söle 14c, Tallinn · info@hingamiskeskus.ee · +372 5669 5898
    </div>
  </div>`;
}

async function send(to: string, subject: string, html: string) {
  await transporter.sendMail({
    from: `"Hingamiskeskus" <info@hingamiskeskus.ee>`,
    to,
    subject,
    html,
  });
}

export type BookingEmailData = {
  to: string;
  name: string;
  locale: Locale;
  serviceName: string;       // 'floating' | seansi nimi | ruumi nimi (rent)
  type: 'float' | 'group' | 'rent';
  roomName: string;
  dateHuman: string;         // nt 'teisipäev, 14. juuli'
  timeRange: string;         // nt '10:30 - 11:30'
  token: string;
};

export async function sendConfirmation(d: BookingEmailData) {
  const t = T[d.locale] || T.et;
  const link = `${SITE}/broneering/${d.token}`;
  const tips = d.type === 'float' ? t.floatTips : d.type === 'group' ? t.groupTips : '';
  const html = wrap(`
    <p><b>${esc(t.hello(d.name.split(' ')[0] || d.name))}</b></p>
    <p>${esc(t.confirmed(d.timeRange, d.serviceName, d.type === 'float' ? d.roomName : '', d.dateHuman))}</p>
    <p>${esc(t.cancelInfo)}</p>
    <p style="margin: 22px 0;">
      <a href="${link}" style="background:#1d1e20;color:#fff;text-decoration:none;padding:12px 22px;letter-spacing:1px;font-size:13px;">
        ${esc(t.cancelBtn).toUpperCase()}
      </a>
    </p>
    ${tips ? `<p>${esc(tips)}</p>` : ''}
    <p>${esc(t.bye)}<br>Hingamiskeskus</p>
  `);
  await send(d.to, t.confirmSubject(d.serviceName, d.dateHuman), html);
}

export async function sendReminder(d: BookingEmailData) {
  const t = T[d.locale] || T.et;
  const link = `${SITE}/broneering/${d.token}`;
  const tips = d.type === 'float' ? t.floatTips : d.type === 'group' ? t.groupTips : '';
  const html = wrap(`
    <p><b>${esc(t.hello(d.name.split(' ')[0] || d.name))}</b></p>
    <p>${esc(t.remind(d.timeRange.split(' - ')[0], d.serviceName, d.type === 'float' ? d.roomName : '', d.dateHuman))}</p>
    ${tips ? `<p>${esc(tips)}</p>` : ''}
    <p>${esc(t.cancelInfo)}</p>
    <p style="margin: 22px 0;">
      <a href="${link}" style="background:#1d1e20;color:#fff;text-decoration:none;padding:12px 22px;letter-spacing:1px;font-size:13px;">
        ${esc(t.cancelBtn).toUpperCase()}
      </a>
    </p>
    <p>${esc(t.bye)}<br>Hingamiskeskus</p>
  `);
  await send(d.to, t.remindSubject(d.serviceName), html);
}

export async function sendCode(to: string, code: string, locale: Locale) {
  const t = T[locale] || T.et;
  const html = wrap(`<p style="white-space:pre-wrap">${esc(t.codeBody(code))}</p>`);
  await send(to, t.codeSubject, html);
}

export async function sendRentReceived(to: string, locale: Locale, roomName: string, dateHuman: string, hours: string) {
  const t = T[locale] || T.et;
  const html = wrap(`<p>${esc(t.rentBody(roomName, dateHuman, hours))}</p><p>${esc(t.bye)}<br>Hingamiskeskus</p>`);
  await send(to, t.rentSubject, html);
  // teavitus ka keskusele
  await send('info@hingamiskeskus.ee', `Uus rendisoov: ${roomName} ${dateHuman} ${hours} (${to})`,
    wrap(`<p>Uus rendisoov kliendilt <b>${esc(to)}</b>: ${esc(roomName)}, ${esc(dateHuman)}, ${esc(hours)}.</p><p>Kinnita või lükka tagasi admin-paneelis: <a href="${SITE}/admin/broneerimine">${SITE}/admin/broneerimine</a></p>`));
}

export async function sendRentDecision(
  to: string, locale: Locale, roomName: string, dateHuman: string, hours: string, approved: boolean,
) {
  const texts: Record<Locale, [string, string]> = {
    et: approved
      ? ['Rendisoov kinnitatud', `Sinu rendisoov on kinnitatud: ${roomName}, ${dateHuman}, ${hours}. Kohtumiseni!`]
      : ['Rendisoovi ei saanud kinnitada', `Kahjuks ei saanud me sinu rendisoovi (${roomName}, ${dateHuman}, ${hours}) kinnitada. Kui soovid teist aega, võta ühendust: info@hingamiskeskus.ee või +372 5669 5898.`],
    ru: approved
      ? ['Заявка на аренду подтверждена', `Ваша аренда подтверждена: ${roomName}, ${dateHuman}, ${hours}. До встречи!`]
      : ['Заявка на аренду отклонена', `К сожалению, мы не смогли подтвердить вашу аренду (${roomName}, ${dateHuman}, ${hours}). Напишите нам: info@hingamiskeskus.ee или +372 5669 5898.`],
    en: approved
      ? ['Rental request approved', `Your rental is confirmed: ${roomName}, ${dateHuman}, ${hours}. See you soon!`]
      : ['Rental request declined', `Unfortunately we could not approve your rental request (${roomName}, ${dateHuman}, ${hours}). Contact us: info@hingamiskeskus.ee or +372 5669 5898.`],
  };
  const [subject, body] = texts[locale] || texts.et;
  await send(to, subject, wrap(`<p>${esc(body)}</p>`));
}

export async function sendCancelled(d: BookingEmailData) {
  const t = T[d.locale] || T.et;
  const html = wrap(`<p>${esc(t.cancelled(d.serviceName, d.dateHuman, d.timeRange.split(' - ')[0]))}</p>`);
  await send(d.to, t.cancelledSubject, html);
}

/** Kuupäev inimloetavaks lokaadi järgi (Tallinna ajas). */
export function humanDate(dateStr: string, locale: Locale): string {
  const loc = locale === 'et' ? 'et-EE' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(loc, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Tallinn',
  });
}
