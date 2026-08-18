import { db } from './firebase-init.js';
import { doc, getDoc, getDocs, updateDoc, collection, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { emailjsConfig } from './emailjs-config.js';
import { sanitizeHtml } from './admin/richtext.js';

if (window.emailjs && emailjsConfig.publicKey && !emailjsConfig.publicKey.startsWith('REPLACE_ME')) {
  window.emailjs.init({ publicKey: emailjsConfig.publicKey });
}

function sendRsvpEmails(rsvp) {
  if (!window.emailjs || !emailjsConfig.publicKey || emailjsConfig.publicKey.startsWith('REPLACE_ME')) return;
  const statusLabel = rsvp.status === 'declined' ? 'Décline' : 'Confirme';
  const eventsLabel = Object.keys(rsvp.confirmedEvents || {}).filter(id => rsvp.confirmedEvents[id]).length
    ? visibleEvents().filter(e => rsvp.confirmedEvents[e.id]).map(e => e.title).join(', ')
    : 'Aucun';
  const common = {
    guest_name: rsvp.name,
    status: statusLabel,
    email: rsvp.email,
    phone: rsvp.phone,
    adults: rsvp.adults,
    children: rsvp.children,
    diet: rsvp.diet || '—',
    message: rsvp.message || '—',
    events: eventsLabel,
  };
  window.emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, { ...common, to_email: emailjsConfig.adminEmail })
    .catch(err => console.error('Admin notif email failed', err));
  if (rsvp.email) {
    window.emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, { ...common, to_email: rsvp.email })
      .catch(err => console.error('Guest confirmation email failed', err));
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

  const TARGET = new Date('2027-07-24T08:00:00+02:00').getTime();

  const T = {
    fr: {
      cdD: 'jours', cdH: 'heures', cdM: 'min', cdS: 'sec', cdPassed: 'Le grand jour est arrivé !',
      fName: 'Votre nom', fNamePh: 'Nom et prénom', fEmail: 'Email', fEmailPh: 'vous@email.com',
      fPhone: 'Téléphone', fPhonePh: '06 12 34 56 78',
      fPresenceQ: 'Serez-vous présent·e ?', yesLabel: 'Oui', noLabel: 'Non',
      fAdults: "Nombre d'adultes", fChildren: "Nombre d'enfants", fPresence: 'Je serai présent·e à :', maxWord: 'max',
      fExtraAdult: 'Adulte', fChildName: 'Enfant',
      fDiet: 'Allergies / régime', fDietPh: 'Ex : végétarien, sans gluten…', fMsg: 'Un petit mot', fMsgPh: 'Un message pour les mariés…',
      fSubmit: 'Envoyer ma réponse', thankTitle: 'Merci du fond du cœur',
      thankTitleDecline: "C'est noté",
      editBtn: 'Modifier ma réponse',
      langBtn: '中文',
      confirmPrefix: 'Nous avons hâte de vous retrouver pour : ',
      confirmNone: "C'est noté. Nous avons bien reçu votre réponse.",
      confirmDecline: 'Nous sommes tristes de ne pas vous voir, merci de nous avoir prévenus.',
      submitError: "Erreur d'envoi, réessayez.",
      presenceRequiredError: 'Merci de préciser si vous serez présent·e.',
      eventsRequiredError: 'Sélectionnez au moins un événement.',
    },
    zh: {
      cdD: '天', cdH: '时', cdM: '分', cdS: '秒', cdPassed: '大喜之日到啦！',
      fName: '您的姓名', fNamePh: '姓名', fEmail: '邮箱', fEmailPh: 'vous@email.com',
      fPhone: '电话', fPhonePh: '06 12 34 56 78',
      fPresenceQ: '您是否出席？', yesLabel: '是', noLabel: '否',
      fAdults: '成人人数', fChildren: '儿童人数', fPresence: '我将出席：', maxWord: '最多',
      fExtraAdult: '成人', fChildName: '儿童',
      fDiet: '过敏 / 饮食', fDietPh: '如：素食、无麸质…', fMsg: '留言', fMsgPh: '给新人的祝福…',
      fSubmit: '提交回复', thankTitle: '衷心感谢',
      thankTitleDecline: '已收到',
      editBtn: '修改回复',
      langBtn: 'FR',
      confirmPrefix: '期待与您相聚于：',
      confirmNone: '已收到您的回复，谢谢！',
      confirmDecline: '很遗憾不能与您相聚，感谢您的告知。',
      submitError: '发送失败，请重试。',
      presenceRequiredError: '请告知我们您是否会出席。',
      eventsRequiredError: '请至少选择一个活动。',
    },
  };

  // Localized field getter for block content: bf(block, 'kicker', lang) -> block.kicker_fr / block.kicker_zh, cross-language fallback
  function bf(block, key, lang) {
    const fr = block[`${key}_fr`], zh = block[`${key}_zh`];
    return (lang === 'zh' ? (zh || fr) : (fr || zh)) || '';
  }

  function buildInviteIntro(lang, maxAdults, maxChildren, childrenEnabled) {
    if (lang === 'zh') {
      let s = `您受邀最多携${maxAdults}位成人`;
      if (childrenEnabled && maxChildren > 0) s += `及${maxChildren}位儿童`;
      return s + '出席。';
    }
    const adultWord = maxAdults > 1 ? 'adultes' : 'adulte';
    let s = `Vous êtes invité(s) pour ${maxAdults} ${adultWord}`;
    if (childrenEnabled && maxChildren > 0) {
      const childWord = maxChildren > 1 ? 'enfants' : 'enfant';
      s += ` et ${maxChildren} ${childWord}`;
    }
    return s + ' maximum.';
  }

  // Block types that get a nav link, mapped to the DOM id their builder assigns.
  // hero/teaser are excluded (hero = top of page, teaser = public-only, no #site nav).
  const TYPE_TO_ANCHOR = {
    story: 'histoire', programme: 'programme', infos: 'infos',
    hebergement: 'hebergement', rsvp: 'rsvp', gift: 'cadeau',
    dress: 'dresscode', gallery: 'galerie', contact: 'contact',
  };

  const state = {
    lang: 'fr',
    access: 'public',
    env: 'sealed',
    menuOpen: false,
    submitted: false,
    isPreview: false,
    dataReady: false,
    guestToken: null,
    rawEvents: [],
    assignedEventIds: [],
    maxAdults: 1,
    maxChildren: 0,
    childrenAllowed: true,
    rsvp: { name: '', email: '', phone: '', adults: 1, children: 0, extraAdults: [], childNames: [], presence: null, events: {}, diet: '', message: '' },
    submitting: false,
    cd: { d: 0, h: 0, m: 0, s: 0, passed: false },
  };

  function localizeEvent(raw, lang) {
    return {
      id: raw.id,
      zh: raw.zh,
      time: lang === 'zh' ? raw.time_zh : raw.time_fr,
      title: lang === 'zh' ? raw.title_zh : raw.title_fr,
      place: lang === 'zh' ? raw.place_zh : raw.place_fr,
      desc: lang === 'zh' ? raw.desc_zh : raw.desc_fr,
    };
  }

  function visibleEvents() {
    return state.rawEvents
      .filter(e => state.assignedEventIds.includes(e.id))
      .sort((a, b) => a.order - b.order)
      .map(e => localizeEvent(e, state.lang));
  }

  async function loadGuestData() {
    let token = '';
    try { token = (new URLSearchParams(window.location.search).get('invite') || '').trim(); } catch (e) {}
    if (!token) { state.access = 'public'; return; }

    try {
      const guestSnap = await getDoc(doc(db, 'guests', token));
      if (!guestSnap.exists()) { state.access = 'public'; return; }
      const guest = guestSnap.data();
      const [eventsSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, 'events')),
        getDoc(doc(db, 'settings', 'general')).catch(() => null),
      ]);
      state.access = 'guest';
      state.isPreview = !!guest.isPreview;
      state.guestToken = token;
      state.assignedEventIds = guest.assignedEvents || [];
      state.rawEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      state.maxAdults = guest.maxAdults ?? 1;
      state.maxChildren = guest.maxChildren ?? 0;
      state.childrenAllowed = settingsSnap && settingsSnap.exists() && settingsSnap.data().childrenAllowed === false ? false : true;
      state.rsvp.email = guest.email || '';
      if (guest.rsvp && (guest.rsvp.status === 'confirmed' || guest.rsvp.status === 'declined')) {
        state.submitted = true;
        state.rsvp = {
          name: guest.rsvp.name || '',
          email: guest.rsvp.email || guest.email || '',
          phone: guest.rsvp.phone || '',
          adults: guest.rsvp.adults ?? 1,
          children: guest.rsvp.children ?? 0,
          extraAdults: guest.rsvp.extraAdultNames || [],
          childNames: guest.rsvp.childNames || [],
          diet: guest.rsvp.diet || '',
          message: guest.rsvp.message || '',
          events: guest.rsvp.confirmedEvents || {},
          presence: guest.rsvp.status === 'declined' ? 'no' : 'yes',
        };
      }
    } catch (e) {
      console.error('Guest lookup failed', e);
      state.access = 'public';
    }
  }

  // ---- Envelope ----
  const envOverlay = document.getElementById('envelope-overlay');
  envOverlay.addEventListener('click', () => {
    if (!state.dataReady || state.env !== 'sealed') return;
    state.env = 'opening';
    renderEnvelope();
    setTimeout(() => { state.env = 'closing'; renderEnvelope(); }, 1500);
    setTimeout(() => {
      state.env = 'done';
      renderEnvelope();
      syncScroll();
    }, 2300);
  });

  function renderEnvelope() {
    envOverlay.classList.toggle('env-sealed', state.env === 'sealed');
    envOverlay.classList.toggle('env-opening', state.env === 'opening' || state.env === 'closing' || state.env === 'done');
    envOverlay.classList.toggle('env-closing', state.env === 'closing' || state.env === 'done');
    envOverlay.style.display = state.env === 'done' ? 'none' : 'flex';
    envOverlay.style.cursor = state.env === 'sealed' ? 'pointer' : 'default';
  }

  function showLoading(show) {
    document.getElementById('loading-screen').hidden = !show;
  }

  function revealEnvelope() {
    document.getElementById('envelope-overlay').hidden = false;
  }

  function syncScroll() {
    document.body.style.overflow = state.env !== 'done' ? 'hidden' : '';
  }

  // ---- Chrome text (langBtn + nav) ----
  function applyText() {
    const L = T[state.lang];
    document.getElementById('lang-btn').textContent = L.langBtn;
  }

  function renderNav() {
    const lang = state.lang;
    const navlinks = document.getElementById('navlinks');
    const mobileLinks = document.getElementById('mobile-menu-links');
    navlinks.innerHTML = '';
    mobileLinks.innerHTML = '';
    (cachedBlocks || [])
      .filter(b => b.audience !== 'public' && TYPE_TO_ANCHOR[b.type])
      .forEach(b => {
        const label = bf(b, 'kicker', lang) || bf(b, 'title', lang);
        if (!label) return;
        const href = '#' + TYPE_TO_ANCHOR[b.type];
        const a = document.createElement('a');
        a.href = href; a.textContent = label;
        navlinks.appendChild(a);
        const a2 = document.createElement('a');
        a2.href = href; a2.textContent = label;
        a2.addEventListener('click', closeMenu);
        mobileLinks.appendChild(a2);
      });
  }

  function closeMenu() {
    state.menuOpen = false;
    document.getElementById('mobile-menu').hidden = true;
  }
  document.getElementById('burger-btn').addEventListener('click', () => {
    state.menuOpen = true;
    document.getElementById('mobile-menu').hidden = false;
  });
  document.getElementById('mobile-menu-close').addEventListener('click', closeMenu);
  document.getElementById('nav-brand-link').addEventListener('click', closeMenu);

  // ---- Countdown ----
  function tick() {
    let diff = TARGET - Date.now();
    if (diff <= 0) {
      state.cd = { d: 0, h: 0, m: 0, s: 0, passed: true };
    } else {
      const d = Math.floor(diff / 86400000); diff -= d * 86400000;
      const h = Math.floor(diff / 3600000); diff -= h * 3600000;
      const m = Math.floor(diff / 60000); diff -= m * 60000;
      const s = Math.floor(diff / 1000);
      state.cd = { d, h, m, s, passed: false };
    }
    renderCountdown();
  }

  function renderCountdown() {
    const L = T[state.lang];
    const cdEl = document.getElementById('countdown');
    const passedEl = document.getElementById('hero-cd-passed');
    if (!cdEl || !passedEl) return;
    if (state.cd.passed) {
      cdEl.hidden = true;
      passedEl.hidden = false;
      passedEl.textContent = L.cdPassed;
      return;
    }
    passedEl.hidden = true;
    cdEl.hidden = false;
    const units = [
      { v: state.cd.d, label: L.cdD },
      { v: state.cd.h, label: L.cdH },
      { v: state.cd.m, label: L.cdM },
      { v: state.cd.s, label: L.cdS },
    ];
    cdEl.innerHTML = units.map(u => `
      <div class="cd-unit">
        <div class="cd-unit-value">${u.v}</div>
        <div class="cd-unit-label">${u.label}</div>
      </div>`).join('');
  }

  // ---- Access view ----
  function renderAccessView() {
    const isPublic = state.access === 'public';
    document.getElementById('teaser').hidden = !isPublic;
    document.getElementById('site').hidden = isPublic;
  }

  // ---- Language toggle ----
  function toggleLang() {
    state.lang = state.lang === 'fr' ? 'zh' : 'fr';
    fullRender();
  }
  document.getElementById('lang-btn').addEventListener('click', toggleLang);

  // ---- RSVP helpers (called from buildRsvpBlock) ----
  function renderRsvpEventsInto(wrap) {
    wrap.innerHTML = '';
    visibleEvents().forEach(ev => {
      const sel = !!state.rsvp.events[ev.id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rsvp-event-btn' + (sel ? ' selected' : '');
      btn.innerHTML = `
        <span class="rsvp-event-check">${sel ? '✓' : ''}</span>
        <span><span class="rsvp-event-title">${ev.title}</span> <span class="rsvp-event-meta">· ${ev.time} · ${ev.place}</span></span>`;
      btn.addEventListener('click', () => {
        state.rsvp.events[ev.id] = !state.rsvp.events[ev.id];
        renderRsvpEventsInto(wrap);
      });
      wrap.appendChild(btn);
    });
  }

  function renderConfirmLine() {
    const L = T[state.lang];
    const el = document.getElementById('rsvp-confirm-line');
    const titleEl = document.getElementById('rsvp-thanks-title');
    if (!el) return;
    if (state.rsvp.declined) {
      el.textContent = L.confirmDecline;
      if (titleEl) titleEl.textContent = L.thankTitleDecline;
      return;
    }
    if (titleEl) titleEl.textContent = L.thankTitle;
    const chosen = visibleEvents().filter(e => state.rsvp.events[e.id]).map(e => e.title);
    el.textContent = chosen.length ? (L.confirmPrefix + chosen.join(' · ')) : L.confirmNone;
  }

  function renderRsvpFormState() {
    const form = document.getElementById('rsvp-form');
    const thanks = document.getElementById('rsvp-thanks');
    if (!form || !thanks) return;
    form.hidden = state.submitted;
    thanks.hidden = !state.submitted;
  }

  // ==================== Block type builders ====================

  function buildBlockItem(block, lang) {
    const item = document.createElement('div');
    item.className = 'block-item';
    const title = lang === 'zh'
      ? (block.title_zh || block.title_fr || '')
      : (block.title_fr || block.title_zh || '');
    const titleHtml = title ? `<div class="block-title">${escapeHtml(title)}</div>` : '';
    if (block.type === 'text') {
      const content = lang === 'zh'
        ? (block.content_zh || block.content_fr || '')
        : (block.content_fr || block.content_zh || '');
      item.innerHTML = `${titleHtml}${content ? `<div class="block-content rich-text">${sanitizeHtml(content)}</div>` : ''}`;
    } else if (block.type === 'image') {
      const alt = lang === 'zh' ? (block.alt_zh || block.alt_fr || '') : (block.alt_fr || block.alt_zh || '');
      const caption = lang === 'zh' ? (block.caption_zh || block.caption_fr || '') : (block.caption_fr || block.caption_zh || '');
      item.innerHTML = titleHtml;
      const img = document.createElement('img');
      img.className = 'block-image';
      img.loading = 'lazy';
      img.src = block.image_url || '';
      img.alt = alt;
      item.appendChild(img);
      if (caption) {
        const cap = document.createElement('p');
        cap.className = 'block-caption';
        cap.textContent = caption;
        item.appendChild(cap);
      }
    }
    return item;
  }

  function buildFreeformBlock(block, lang) {
    const section = document.createElement('section');
    section.className = 'section section-cream blocks-section';
    const list = document.createElement('div');
    list.className = 'blocks-list';
    list.appendChild(buildBlockItem(block, lang));
    section.appendChild(list);
    return section;
  }

  function buildTeaserBlock(block, lang) {
    const L = T[lang];
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="teaser-kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
      <h1 class="teaser-names">Sophie <span class="amp-italic">&amp;</span> Ruiyuan</h1>
      <div class="cal teaser-zh">苏菲 &amp; 瑞元</div>
      <div class="teaser-rule"></div>
      <div class="teaser-date">24 · 07 · 2027</div>
      <div class="teaser-msg rich-text">${sanitizeHtml(bf(block, 'message', lang))}</div>
      <button class="btn-outline" id="lang-btn-teaser">${escapeHtml(L.langBtn)}</button>`;
    wrap.querySelector('#lang-btn-teaser').addEventListener('click', toggleLang);
    return wrap;
  }

  function buildHeroBlock(block, lang) {
    const header = document.createElement('header');
    header.id = 'top';
    header.className = 'hero';
    header.innerHTML = `
      <div class="hero-xi cal">囍</div>
      <svg class="hero-rose" viewBox="-45 -45 90 90" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-3 -1 C-1 -6 5 -6 6 -1 C7 4 1 8 -3 5 C-10 2 -9 -8 -2 -12"/>
        <path d="M-13 -4 C-16 -15 -5 -23 6 -20 C18 -17 22 -4 16 5 C11 13 0 18 -9 14"/>
        <path d="M-24 2 C-29 -12 -18 -28 -2 -30"/>
        <path d="M4 -30 C20 -27 31 -13 29 3"/>
        <path d="M28 8 C25 23 11 33 -5 30"/>
        <path d="M-10 31 C-25 27 -33 12 -30 -4"/>
      </svg>
      <div class="hero-content">
        <div class="monogram">
          <div class="monogram-ring monogram-ring-1"></div>
          <div class="monogram-ring monogram-ring-2"></div>
          <div class="monogram-dot dot-top"></div>
          <div class="monogram-dot dot-bottom"></div>
          <div class="monogram-dot dot-left"></div>
          <div class="monogram-dot dot-right"></div>
          <div class="monogram-letters">S<span class="amp-sm">&amp;</span>R</div>
          <div class="cal monogram-xi">囍</div>
        </div>
        <div class="kicker hero-kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <div class="hero-names">
          <h1 class="hero-name">Sophie</h1>
          <span class="cal hero-amp">&amp;</span>
          <h1 class="hero-name">Ruiyuan</h1>
        </div>
        <div class="cal hero-zh">苏菲 &amp; 瑞元</div>
        <div class="hero-date-row">
          <span class="rule"></span>
          <span class="hero-date">24 JUILLET 2027</span>
          <span class="rule"></span>
        </div>
        <p class="hero-place">${escapeHtml(bf(block, 'place', lang))}</p>
        <div class="hero-fusion-row">
          <span class="rule rule-sm"></span>
          <span class="hero-fusion">${escapeHtml(bf(block, 'fusion', lang))}</span>
          <span class="rule rule-sm"></span>
        </div>
      </div>
      <div class="hero-cd-passed cal" id="hero-cd-passed" hidden></div>
      <div class="countdown" id="countdown"></div>`;
    return header;
  }

  function buildStoryBlock(block, lang) {
    const section = document.createElement('section');
    section.id = 'histoire';
    section.className = 'section section-cream section-toile';
    section.innerHTML = `
      <svg class="toile-bg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="toile" width="180" height="180" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="#2B4A8B" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M30 176 C55 146 40 116 70 100 C58 78 78 56 66 38"></path>
              <path d="M70 100 C86 94 96 104 90 118 C80 120 70 112 70 100Z"></path>
              <path d="M52 132 C40 124 40 110 52 104 C60 114 60 126 52 132Z"></path>
              <circle cx="66" cy="34" r="5"></circle>
              <path d="M66 34 L66 24 M66 34 L57 29 M66 34 L75 29 M66 34 L59 41 M66 34 L73 41"></path>
              <path d="M124 22 C144 47 132 76 154 92"></path>
              <path d="M154 92 C164 86 174 94 170 106 C160 108 154 100 154 92Z"></path>
              <circle cx="124" cy="18" r="4"></circle>
              <path d="M124 18 L124 10 M124 18 L117 14 M124 18 L131 14"></path>
              <path d="M104 148 q9 -9 18 0 q-9 -5 -18 0Z"></path>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#toile)"></rect>
      </svg>
      <div class="section-inner section-narrow">
        <div class="cal section-glyph">缘</div>
        <div class="kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <h2 class="section-title">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="divider"><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg><span class="divider-diamond divider-diamond-blue"><span class="divider-diamond-inner"></span></span><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round" style="transform:scaleX(-1)"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg></div>
        <div class="section-text rich-text">${sanitizeHtml(bf(block, 'p1', lang))}</div>
        <div class="section-text rich-text">${sanitizeHtml(bf(block, 'p2', lang))}</div>
      </div>`;
    return section;
  }

  function buildProgrammeBlock(block, lang) {
    const section = document.createElement('section');
    section.id = 'programme';
    section.className = block.bgColor === 'blue' ? 'section section-navy' : 'section section-bordeaux';
    section.innerHTML = `
      <div class="prog-xi cal">囍</div>
      <div class="section-inner section-narrow" style="margin-bottom:56px">
        <div class="kicker kicker-light">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <h2 class="section-title section-title-light">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="divider" style="margin-top:22px"><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg><span class="divider-diamond divider-diamond-blue2"><span class="divider-diamond-inner"></span></span><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round" style="transform:scaleX(-1)"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg></div>
        <div class="section-sub rich-text">${sanitizeHtml(bf(block, 'subtitle', lang))}</div>
      </div>
      <div class="prog-list" id="prog-list"></div>`;
    const list = section.querySelector('#prog-list');
    visibleEvents().forEach(ev => {
      const item = document.createElement('div');
      item.className = 'prog-item';
      item.innerHTML = `
        <div class="prog-time-col">
          <div class="prog-time">${ev.time}</div>
          <div class="cal prog-zh">${ev.zh}</div>
        </div>
        <div class="prog-body">
          <h3 class="prog-title">${ev.title}</h3>
          <div class="prog-place">${ev.place}</div>
          <div class="prog-desc rich-text">${sanitizeHtml(ev.desc)}</div>
        </div>`;
      list.appendChild(item);
    });
    return section;
  }

  function buildInfosBlock(block, lang) {
    const section = document.createElement('section');
    section.id = 'infos';
    section.className = 'section section-cream';
    section.innerHTML = `
      <div class="section-inner section-wide" style="margin-bottom:52px">
        <div class="kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <h2 class="section-title">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="divider" style="margin-top:24px"><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg><span class="divider-diamond divider-diamond-blue"><span class="divider-diamond-inner"></span></span><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round" style="transform:scaleX(-1)"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg></div>
      </div>
      <div class="places-grid" id="places-grid"></div>`;
    const mapBtnLabel = escapeHtml(bf(block, 'mapBtnLabel', lang));
    const grid = section.querySelector('#places-grid');
    (block.places || []).filter(p => {
      const ids = Array.isArray(p.eventIds) ? p.eventIds : [];
      return ids.length === 0 || ids.some(id => state.assignedEventIds.includes(id));
    }).forEach(p => {
      const name = lang === 'zh' ? (p.name_zh || p.name_fr) : (p.name_fr || p.name_zh);
      const addr = lang === 'zh' ? (p.addr_zh || p.addr_fr) : (p.addr_fr || p.addr_zh);
      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `
        <div class="cal place-zh">${escapeHtml(p.zh || '')}</div>
        <h3 class="place-name">${escapeHtml(name || '')}</h3>
        <p class="place-addr">${escapeHtml(addr || '')}</p>
        ${(() => { const note = lang === 'zh' ? (p.note_zh || p.note_fr) : (p.note_fr || p.note_zh); return note ? `<p class="place-note">${escapeHtml(note)}</p>` : ''; })()}
        <a href="${escapeHtml(p.mapUrl || '#')}" target="_blank" rel="noopener" class="place-map-btn">${mapBtnLabel}</a>`;
      grid.appendChild(card);
    });
    return section;
  }

  function buildHebergementBlock(block, lang) {
    const section = document.createElement('section');
    section.id = 'hebergement';
    section.className = 'section section-cream-grad';
    section.innerHTML = `
      <div class="section-inner section-wide" style="margin-bottom:20px">
        <div class="kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <h2 class="section-title">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="divider" style="margin:24px auto 4px"><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg><span class="divider-diamond divider-diamond-blue"><span class="divider-diamond-inner"></span></span><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round" style="transform:scaleX(-1)"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg></div>
        <div class="section-text-narrow rich-text">${sanitizeHtml(bf(block, 'intro', lang))}</div>
      </div>
      <div class="hotels-grid" id="hotels-grid"></div>
      <div class="shuttle-box${block.bgColor === 'blue' ? ' shuttle-box-navy' : ''}">
        <div class="cal shuttle-glyph">车</div>
        <div class="rich-text">${sanitizeHtml(bf(block, 'shuttle', lang))}</div>
      </div>`;
    const grid = section.querySelector('#hotels-grid');
    (block.hotels || []).forEach(h => {
      const tag = lang === 'zh' ? (h.tag_zh || h.tag_fr) : (h.tag_fr || h.tag_zh);
      const name = lang === 'zh' ? (h.name_zh || h.name_fr) : (h.name_fr || h.name_zh);
      const desc = lang === 'zh' ? (h.desc_zh || h.desc_fr) : (h.desc_fr || h.desc_zh);
      const card = document.createElement('div');
      card.className = 'hotel-card';
      card.innerHTML = `
        <div class="hotel-tag">${escapeHtml(tag || '')}</div>
        <h3 class="hotel-name">${escapeHtml(name || '')}</h3>
        <p class="hotel-desc">${escapeHtml(desc || '')}</p>`;
      grid.appendChild(card);
    });
    return section;
  }

  function buildRsvpBlock(block, lang) {
    const L = T[lang];
    const section = document.createElement('section');
    section.id = 'rsvp';
    section.className = block.bgColor === 'blue' ? 'section section-navy-radial' : 'section section-bordeaux-radial';
    section.innerHTML = `
      <div class="rsvp-xi cal">囍</div>
      <div class="section-inner section-form">
        <div class="section-inner section-narrow" style="margin-bottom:40px">
          <div class="kicker kicker-light">${escapeHtml(bf(block, 'kicker', lang))}</div>
          <h2 class="section-title section-title-light">${escapeHtml(bf(block, 'title', lang))}</h2>
          <div class="section-sub rich-text">${sanitizeHtml(bf(block, 'intro', lang))}</div>
        </div>

        <form id="rsvp-form" class="rsvp-form" novalidate>
          <label class="field">
            <span class="field-label">${escapeHtml(L.fName)} *</span>
            <input id="r-name" type="text" required placeholder="${escapeHtml(L.fNamePh)}" value="${escapeHtml(state.rsvp.name)}">
          </label>
          <label class="field">
            <span class="field-label">${escapeHtml(L.fEmail)} *</span>
            <input id="r-email" type="email" required placeholder="${escapeHtml(L.fEmailPh)}" value="${escapeHtml(state.rsvp.email)}">
          </label>
          <label class="field">
            <span class="field-label">${escapeHtml(L.fPhone)} *</span>
            <input id="r-phone" type="tel" required placeholder="${escapeHtml(L.fPhonePh)}" value="${escapeHtml(state.rsvp.phone)}">
          </label>

          <div class="field">
            <span class="field-label">${escapeHtml(L.fPresenceQ)} *</span>
            <div class="rsvp-toggle">
              <button type="button" class="rsvp-toggle-btn" data-val="yes">${escapeHtml(L.yesLabel)}</button>
              <button type="button" class="rsvp-toggle-btn" data-val="no">${escapeHtml(L.noLabel)}</button>
            </div>
          </div>

          <div id="rsvp-presence-yes" hidden>
            <p class="rsvp-invite-intro">${escapeHtml(buildInviteIntro(lang, state.maxAdults, state.maxChildren, state.childrenAllowed))}</p>
            <div class="field field-row">
              <label class="field">
                <span class="field-label">${escapeHtml(L.fAdults)} (${escapeHtml(L.maxWord)} ${state.maxAdults}) *</span>
                <input id="r-adults" type="number" min="1" max="${state.maxAdults}" value="${escapeHtml(String(Math.min(Number(state.rsvp.adults) || 1, state.maxAdults)))}">
              </label>
              ${state.childrenAllowed && state.maxChildren > 0 ? `
              <label class="field">
                <span class="field-label">${escapeHtml(L.fChildren)} (${escapeHtml(L.maxWord)} ${state.maxChildren}) *</span>
                <input id="r-children" type="number" min="0" max="${state.maxChildren}" value="${escapeHtml(String(Math.min(Number(state.rsvp.children) || 0, state.maxChildren)))}">
              </label>` : ''}
            </div>
            <div id="rsvp-extra-people"></div>
            <div class="field">
              <span class="field-label">${escapeHtml(L.fPresence)} *</span>
              <div id="rsvp-events" class="rsvp-events"></div>
            </div>
            <label class="field">
              <span class="field-label">${escapeHtml(L.fDiet)}</span>
              <input id="r-diet" type="text" placeholder="${escapeHtml(L.fDietPh)}" value="${escapeHtml(state.rsvp.diet)}">
            </label>
          </div>

          <label class="field">
            <span class="field-label">${escapeHtml(L.fMsg)} *</span>
            <textarea id="r-msg" rows="3" required placeholder="${escapeHtml(L.fMsgPh)}">${escapeHtml(state.rsvp.message)}</textarea>
          </label>
          <p id="rsvp-error" class="rsvp-error" hidden></p>
          <button type="submit" class="btn-submit">${escapeHtml(L.fSubmit)}</button>
        </form>

        <div id="rsvp-thanks" class="rsvp-thanks" hidden>
          <div class="cal rsvp-thanks-glyph">囍</div>
          <h3 id="rsvp-thanks-title" class="rsvp-thanks-title">${escapeHtml(L.thankTitle)}</h3>
          <p id="rsvp-confirm-line" class="rsvp-confirm-line"></p>
          <button id="rsvp-edit-btn" class="btn-outline">${escapeHtml(L.editBtn)}</button>
        </div>
      </div>`;

    const form = section.querySelector('#rsvp-form');
    const presenceYesEl = section.querySelector('#rsvp-presence-yes');
    const extraPeopleEl = section.querySelector('#rsvp-extra-people');
    const toggleBtns = section.querySelectorAll('.rsvp-toggle-btn');

    function renderExtraPeople() {
      const adults = Math.max(1, Math.min(Number(state.rsvp.adults) || 1, state.maxAdults));
      const children = state.childrenAllowed ? Math.max(0, Math.min(Number(state.rsvp.children) || 0, state.maxChildren)) : 0;
      state.rsvp.adults = adults;
      state.rsvp.children = children;
      const extraAdultsCount = Math.max(0, adults - 1);

      while (state.rsvp.extraAdults.length < extraAdultsCount) state.rsvp.extraAdults.push('');
      state.rsvp.extraAdults.length = extraAdultsCount;
      while (state.rsvp.childNames.length < children) state.rsvp.childNames.push('');
      state.rsvp.childNames.length = children;

      extraPeopleEl.innerHTML = '';
      state.rsvp.extraAdults.forEach((val, i) => {
        const label = document.createElement('label');
        label.className = 'field';
        label.innerHTML = `<span class="field-label">${escapeHtml(L.fExtraAdult)} ${i + 2} *</span><input type="text" required placeholder="${escapeHtml(L.fNamePh)}" value="${escapeHtml(val)}">`;
        label.querySelector('input').addEventListener('input', e => state.rsvp.extraAdults[i] = e.target.value);
        extraPeopleEl.appendChild(label);
      });
      if (state.childrenAllowed) {
        state.rsvp.childNames.forEach((val, i) => {
          const label = document.createElement('label');
          label.className = 'field';
          label.innerHTML = `<span class="field-label">${escapeHtml(L.fChildName)} ${i + 1} *</span><input type="text" required placeholder="${escapeHtml(L.fNamePh)}" value="${escapeHtml(val)}">`;
          label.querySelector('input').addEventListener('input', e => state.rsvp.childNames[i] = e.target.value);
          extraPeopleEl.appendChild(label);
        });
      }
    }

    function setPresence(val) {
      state.rsvp.presence = val;
      toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.val === val));
      presenceYesEl.hidden = val !== 'yes';
      if (val === 'yes') renderExtraPeople();
    }

    toggleBtns.forEach(b => b.addEventListener('click', () => setPresence(b.dataset.val)));
    if (state.rsvp.presence) setPresence(state.rsvp.presence);

    section.querySelector('#r-name').addEventListener('input', e => state.rsvp.name = e.target.value);
    section.querySelector('#r-email').addEventListener('input', e => state.rsvp.email = e.target.value);
    section.querySelector('#r-phone').addEventListener('input', e => state.rsvp.phone = e.target.value);
    section.querySelector('#r-adults').addEventListener('input', e => {
      const v = Math.max(1, Math.min(Number(e.target.value) || 1, state.maxAdults));
      e.target.value = v;
      state.rsvp.adults = v;
      renderExtraPeople();
    });
    const childrenInput = section.querySelector('#r-children');
    if (childrenInput) {
      childrenInput.addEventListener('input', e => {
        const v = Math.max(0, Math.min(Number(e.target.value) || 0, state.maxChildren));
        e.target.value = v;
        state.rsvp.children = v;
        renderExtraPeople();
      });
    }
    section.querySelector('#r-diet').addEventListener('input', e => state.rsvp.diet = e.target.value);
    section.querySelector('#r-msg').addEventListener('input', e => state.rsvp.message = e.target.value);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (state.submitting || !state.guestToken || state.isPreview) return;
      const submitBtn = section.querySelector('.btn-submit');
      const errEl = section.querySelector('#rsvp-error');
      errEl.hidden = true;

      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (!state.rsvp.presence) { errEl.textContent = L.presenceRequiredError; errEl.hidden = false; return; }
      if (state.rsvp.presence === 'yes' && !Object.values(state.rsvp.events).some(Boolean)) {
        errEl.textContent = L.eventsRequiredError; errEl.hidden = false; return;
      }

      state.submitting = true;
      submitBtn.disabled = true;
      try {
        const rsvp = state.rsvp.presence === 'no'
          ? { status: 'declined', name: state.rsvp.name, email: state.rsvp.email, phone: state.rsvp.phone, adults: 0, children: 0, extraAdultNames: [], childNames: [], diet: '', message: state.rsvp.message, confirmedEvents: {}, respondedAt: new Date().toISOString() }
          : { status: 'confirmed', name: state.rsvp.name, email: state.rsvp.email, phone: state.rsvp.phone, adults: Number(state.rsvp.adults) || 0, children: Number(state.rsvp.children) || 0, extraAdultNames: [...state.rsvp.extraAdults], childNames: [...state.rsvp.childNames], diet: state.rsvp.diet, message: state.rsvp.message, confirmedEvents: state.rsvp.events, respondedAt: new Date().toISOString() };
        await updateDoc(doc(db, 'guests', state.guestToken), { rsvp });
        sendRsvpEmails(rsvp);
        state.submitted = true;
        renderConfirmLine();
        renderRsvpFormState();
      } catch (err) {
        console.error('RSVP submit failed', err);
        errEl.textContent = T[state.lang].submitError;
        errEl.hidden = false;
      } finally {
        state.submitting = false;
        submitBtn.disabled = false;
      }
    });
    section.querySelector('#rsvp-edit-btn').addEventListener('click', () => {
      state.submitted = false;
      fullRender();
    });
    renderRsvpEventsInto(section.querySelector('#rsvp-events'));
    return section;
  }

  function buildGiftBlock(block, lang) {
    const section = document.createElement('section');
    section.className = 'section section-cream';
    section.innerHTML = `
      <div class="cadeau-grid">
        <div id="cadeau" class="card-cadeau">
          <div class="cal card-glyph">礼</div>
          <div class="kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
          <h3 class="card-title">${escapeHtml(bf(block, 'title', lang))}</h3>
          <div class="card-text rich-text">${sanitizeHtml(bf(block, 'text', lang))}</div>
        </div>
      </div>`;
    return section;
  }

  function buildDressBlock(block, lang) {
    const section = document.createElement('section');
    section.className = 'section section-cream';
    const cardClass = block.bgColor === 'blue' ? 'card-dresscode card-dresscode-navy' : 'card-dresscode';
    section.innerHTML = `
      <div class="cadeau-grid">
        <div id="dresscode" class="${cardClass}">
          <div class="cal card-glyph card-glyph-gold">衣</div>
          <div class="kicker kicker-light">${escapeHtml(bf(block, 'kicker', lang))}</div>
          <h3 class="card-title card-title-light">${escapeHtml(bf(block, 'title', lang))}</h3>
          <div class="card-text card-text-light rich-text">${sanitizeHtml(bf(block, 'text', lang))}</div>
          <div class="avoid-label">${lang === 'zh' ? '请勿穿着以下颜色' : 'Couleurs à éviter'}</div>
          <div id="avoid-colors" class="avoid-colors"></div>
        </div>
      </div>`;
    const wrap = section.querySelector('#avoid-colors');
    (block.avoidColors || []).forEach(c => {
      const label = lang === 'zh' ? (c.label_zh || c.label_fr) : (c.label_fr || c.label_zh);
      const chip = document.createElement('span');
      chip.className = 'avoid-chip';
      chip.innerHTML = `<span class="avoid-swatch" style="background:${escapeHtml(c.hex || '')}"></span><span class="avoid-chip-label">${escapeHtml(label || '')}</span>`;
      wrap.appendChild(chip);
    });
    return section;
  }

  function buildGalleryBlock(block, lang) {
    const section = document.createElement('section');
    section.id = 'galerie';
    section.className = 'section section-cream-grad2';
    section.innerHTML = `
      <div class="section-inner section-wide" style="margin-bottom:44px">
        <div class="kicker">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <h2 class="section-title">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="divider" style="margin-top:24px"><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg><span class="divider-diamond divider-diamond-blue"><span class="divider-diamond-inner"></span></span><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round" style="transform:scaleX(-1)"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg></div>
        <div class="section-text-narrow rich-text">${sanitizeHtml(bf(block, 'hint', lang))}</div>
      </div>
      <div class="gallery-grid" id="gallery-grid"></div>`;
    const galleryGrid = section.querySelector('#gallery-grid');
    const photos = block.photos || [];
    if (photos.length) {
      photos.forEach((p, i) => {
        const url = typeof p === 'string' ? p : p.url;
        const alt = (typeof p === 'object' && p.alt) ? p.alt : `Photo ${i + 1}`;
        if (!url) return;
        const slot = document.createElement('div');
        slot.className = 'gallery-slot';
        slot.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">`;
        galleryGrid.appendChild(slot);
      });
    } else {
      for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.className = 'gallery-slot';
        slot.setAttribute('aria-label', `Photo ${i + 1}`);
        galleryGrid.appendChild(slot);
      }
    }
    return section;
  }

  function buildContactBlock(block, lang) {
    const footer = document.createElement('footer');
    footer.id = 'contact';
    footer.className = 'footer';
    footer.innerHTML = `
      <div class="footer-xi cal">囍</div>
      <div class="footer-inner">
        <div class="footer-monogram">
          <div class="footer-monogram-ring footer-monogram-ring-1"></div>
          <div class="footer-monogram-ring footer-monogram-ring-2"></div>
          <div class="footer-monogram-letters">S<span class="amp-sm">&amp;</span>R</div>
          <div class="cal footer-monogram-xi">囍</div>
        </div>
        <h2 class="footer-title">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="footer-text rich-text">${sanitizeHtml(bf(block, 'text', lang))}</div>
        <div class="footer-contacts">
          ${block.email && !block.email.includes('example.com') ? `<a href="mailto:${escapeHtml(block.email)}" class="footer-email">✉︎ ${escapeHtml(block.email)}</a>` : ''}
          ${block.phone && !block.phone.includes('00 00 00') ? `<span class="footer-phone">☎ ${escapeHtml(block.phone)}</span>` : ''}
        </div>
        <div class="footer-rule"></div>
        <div class="footer-names">${escapeHtml(block.names || 'Sophie & Ruiyuan').replace(/&amp;/g, '<span class="amp">&amp;</span>')}</div>
        <div class="footer-date">${escapeHtml(block.dateLocation || '24 · 07 · 2027 — LOGNES')}</div>
      </div>`;
    return footer;
  }

  const BLOCK_BUILDERS = {
    text: buildFreeformBlock,
    image: buildFreeformBlock,
    teaser: buildTeaserBlock,
    hero: buildHeroBlock,
    story: buildStoryBlock,
    programme: buildProgrammeBlock,
    infos: buildInfosBlock,
    hebergement: buildHebergementBlock,
    rsvp: buildRsvpBlock,
    gift: buildGiftBlock,
    dress: buildDressBlock,
    gallery: buildGalleryBlock,
    contact: buildContactBlock,
  };

  let cachedBlocks = null;

  async function fetchBlocks() {
    const snap = await getDocs(
      query(collection(db, 'blocks'), where('visible', '==', true), orderBy('order'))
    );
    cachedBlocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  function renderDynamicBlocks() {
    const lang = state.lang;
    const inviteMount = document.getElementById('site-blocks');
    const publicMount = document.getElementById('teaser-blocks');
    inviteMount.innerHTML = '';
    publicMount.innerHTML = '';
    (cachedBlocks || []).forEach(block => {
      const builder = BLOCK_BUILDERS[block.type];
      if (!builder) return;
      const el = builder(block, lang);
      if (!el) return;
      (block.audience === 'public' ? publicMount : inviteMount).appendChild(el);
    });

    const heroBlock = (cachedBlocks || []).find(b => b.type === 'hero' && b.audience !== 'public');
    const envKicker = document.querySelector('.envelope-letter-kicker');
    const envHint = document.querySelector('.envelope-hint-text');
    if (envKicker) envKicker.textContent = heroBlock ? bf(heroBlock, 'envInvite', lang) : '';
    if (envHint) envHint.textContent = heroBlock ? bf(heroBlock, 'envHint', lang) : '';
  }

  function fullRender() {
    applyText();
    renderDynamicBlocks();
    renderNav();
    renderConfirmLine();
    renderRsvpFormState();
    renderCountdown();
    renderAccessView();
  }

  async function init() {
    showLoading(true);
    await Promise.all([
      loadGuestData(),
      fetchBlocks().catch(err => console.error('fetchBlocks failed:', err)),
    ]);
    state.dataReady = true;
    showLoading(false);

    state.env = 'sealed';
    revealEnvelope();
    renderEnvelope();
    syncScroll();
    fullRender();
    tick();
    setInterval(tick, 1000);
  }

  init();
