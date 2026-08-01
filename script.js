import { db } from './firebase-init.js';
import { doc, getDoc, getDocs, collection, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
      fName: 'Votre nom', fNamePh: 'Nom et prénom', fAdults: "Nombre d'adultes", fChildren: "Nombre d'enfants", fPresence: 'Je serai présent·e à :',
      fDiet: 'Allergies / régime', fDietPh: 'Ex : végétarien, sans gluten…', fMsg: 'Un petit mot', fMsgPh: 'Un message pour les mariés…',
      fSubmit: 'Envoyer ma réponse', thankTitle: 'Merci du fond du cœur',
      demoNote: "(Démonstration — aucun envoi réel n'est effectué. À connecter à votre outil de suivi.)",
      editBtn: 'Modifier ma réponse',
      langBtn: '中文',
      confirmPrefix: 'Nous avons hâte de vous retrouver pour : ',
      confirmNone: "C'est noté. Nous avons bien reçu votre réponse.",
    },
    zh: {
      cdD: '天', cdH: '时', cdM: '分', cdS: '秒', cdPassed: '大喜之日到啦！',
      fName: '您的姓名', fNamePh: '姓名', fAdults: '成人人数', fChildren: '儿童人数', fPresence: '我将出席：',
      fDiet: '过敏 / 饮食', fDietPh: '如：素食、无麸质…', fMsg: '留言', fMsgPh: '给新人的祝福…',
      fSubmit: '提交回复', thankTitle: '衷心感谢',
      demoNote: '（演示 — 不会实际发送，请连接您的统计工具。）',
      editBtn: '修改回复',
      langBtn: 'FR',
      confirmPrefix: '期待与您相聚于：',
      confirmNone: '已收到您的回复，谢谢！',
    },
  };

  // Localized field getter for block content: bf(block, 'kicker', lang) -> block.kicker_fr / block.kicker_zh, cross-language fallback
  function bf(block, key, lang) {
    const fr = block[`${key}_fr`], zh = block[`${key}_zh`];
    return (lang === 'zh' ? (zh || fr) : (fr || zh)) || '';
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
    dataReady: false,
    guestToken: null,
    rawEvents: [],
    assignedEventIds: [],
    rsvp: { name: '', adults: 1, children: 0, events: {}, diet: '', message: '' },
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
      const eventsSnap = await getDocs(collection(db, 'events'));
      state.access = 'guest';
      state.guestToken = token;
      state.assignedEventIds = guest.assignedEvents || [];
      state.rawEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (guest.rsvp && guest.rsvp.status === 'confirmed') {
        state.submitted = true;
        state.rsvp = {
          name: guest.rsvp.name || '',
          adults: guest.rsvp.adults ?? 1,
          children: guest.rsvp.children ?? 0,
          diet: guest.rsvp.diet || '',
          message: guest.rsvp.message || '',
          events: guest.rsvp.confirmedEvents || {},
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
      try { sessionStorage.setItem('sr_env_opened', '1'); } catch (e) {}
      state.env = 'done';
      renderEnvelope();
      syncScroll();
    }, 2500);
  });

  function renderEnvelope() {
    envOverlay.classList.toggle('env-sealed', state.env === 'sealed');
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
    if (!el) return;
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
      item.innerHTML = `${titleHtml}${content ? `<p class="block-content">${escapeHtml(content)}</p>` : ''}`;
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
      <p class="teaser-msg">${escapeHtml(bf(block, 'message', lang))}</p>
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
      <svg class="hero-peony" viewBox="-56 -56 112 112" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(45)"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(90)"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(135)"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(180)"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(225)"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(270)"/>
        <path d="M0 0 C-9 -17 -9 -33 0 -45 C9 -33 9 -17 0 0Z" transform="rotate(315)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(22.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(67.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(112.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(157.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(202.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(247.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(292.5)"/>
        <path d="M0 0 C-6 -11 -6 -21 0 -28 C6 -21 6 -11 0 0Z" transform="rotate(337.5)"/>
        <circle r="5"/>
      </svg>
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
        <p class="section-text">${escapeHtml(bf(block, 'p1', lang))}</p>
        <p class="section-text">${escapeHtml(bf(block, 'p2', lang))}</p>
      </div>`;
    return section;
  }

  function buildProgrammeBlock(block, lang) {
    const section = document.createElement('section');
    section.id = 'programme';
    section.className = 'section section-bordeaux';
    section.innerHTML = `
      <div class="prog-xi cal">囍</div>
      <div class="section-inner section-narrow" style="margin-bottom:56px">
        <div class="kicker kicker-light">${escapeHtml(bf(block, 'kicker', lang))}</div>
        <h2 class="section-title section-title-light">${escapeHtml(bf(block, 'title', lang))}</h2>
        <div class="divider" style="margin-top:22px"><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg><span class="divider-diamond divider-diamond-blue2"><span class="divider-diamond-inner"></span></span><svg width="76" height="10" viewBox="0 0 76 10" fill="none" stroke="#C1993F" stroke-width="1" stroke-linecap="round" style="transform:scaleX(-1)"><path d="M2 5 Q14 -2 26 5 T50 5 T74 5"></path><path d="M2 5 Q14 12 26 5 T50 5 T74 5" opacity=".55"></path></svg></div>
        <p class="section-sub">${escapeHtml(bf(block, 'subtitle', lang))}</p>
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
          <p class="prog-desc">${ev.desc}</p>
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
    (block.places || []).forEach(p => {
      const name = lang === 'zh' ? (p.name_zh || p.name_fr) : (p.name_fr || p.name_zh);
      const addr = lang === 'zh' ? (p.addr_zh || p.addr_fr) : (p.addr_fr || p.addr_zh);
      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `
        <div class="cal place-zh">${escapeHtml(p.zh || '')}</div>
        <h3 class="place-name">${escapeHtml(name || '')}</h3>
        <p class="place-addr">${escapeHtml(addr || '')}</p>
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
        <p class="section-text-narrow">${escapeHtml(bf(block, 'intro', lang))}</p>
      </div>
      <div class="hotels-grid" id="hotels-grid"></div>
      <div class="shuttle-box">
        <div class="cal shuttle-glyph">车</div>
        <p>${escapeHtml(bf(block, 'shuttle', lang))}</p>
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
    section.className = 'section section-bordeaux-radial';
    section.innerHTML = `
      <div class="rsvp-xi cal">囍</div>
      <div class="section-inner section-form">
        <div class="section-inner section-narrow" style="margin-bottom:40px">
          <div class="kicker kicker-light">${escapeHtml(bf(block, 'kicker', lang))}</div>
          <h2 class="section-title section-title-light">${escapeHtml(bf(block, 'title', lang))}</h2>
          <p class="section-sub">${escapeHtml(bf(block, 'intro', lang))}</p>
        </div>

        <form id="rsvp-form" class="rsvp-form">
          <label class="field">
            <span class="field-label">${escapeHtml(L.fName)}</span>
            <input id="r-name" type="text" required placeholder="${escapeHtml(L.fNamePh)}" value="${escapeHtml(state.rsvp.name)}">
          </label>
          <div class="field field-row">
            <label class="field">
              <span class="field-label">${escapeHtml(L.fAdults)}</span>
              <input id="r-adults" type="number" min="1" max="12" value="${escapeHtml(String(state.rsvp.adults))}">
            </label>
            <label class="field">
              <span class="field-label">${escapeHtml(L.fChildren)}</span>
              <input id="r-children" type="number" min="0" max="12" value="${escapeHtml(String(state.rsvp.children))}">
            </label>
          </div>
          <div class="field">
            <span class="field-label">${escapeHtml(L.fPresence)}</span>
            <div id="rsvp-events" class="rsvp-events"></div>
          </div>
          <label class="field">
            <span class="field-label">${escapeHtml(L.fDiet)}</span>
            <input id="r-diet" type="text" placeholder="${escapeHtml(L.fDietPh)}" value="${escapeHtml(state.rsvp.diet)}">
          </label>
          <label class="field">
            <span class="field-label">${escapeHtml(L.fMsg)}</span>
            <textarea id="r-msg" rows="3" placeholder="${escapeHtml(L.fMsgPh)}">${escapeHtml(state.rsvp.message)}</textarea>
          </label>
          <button type="submit" class="btn-submit">${escapeHtml(L.fSubmit)}</button>
        </form>

        <div id="rsvp-thanks" class="rsvp-thanks" hidden>
          <div class="cal rsvp-thanks-glyph">囍</div>
          <h3 class="rsvp-thanks-title">${escapeHtml(L.thankTitle)}</h3>
          <p id="rsvp-confirm-line" class="rsvp-confirm-line"></p>
          <p class="rsvp-demo-note">${escapeHtml(L.demoNote)}</p>
          <button id="rsvp-edit-btn" class="btn-outline">${escapeHtml(L.editBtn)}</button>
        </div>
      </div>`;

    section.querySelector('#r-name').addEventListener('input', e => state.rsvp.name = e.target.value);
    section.querySelector('#r-adults').addEventListener('input', e => state.rsvp.adults = e.target.value);
    section.querySelector('#r-children').addEventListener('input', e => state.rsvp.children = e.target.value);
    section.querySelector('#r-diet').addEventListener('input', e => state.rsvp.diet = e.target.value);
    section.querySelector('#r-msg').addEventListener('input', e => state.rsvp.message = e.target.value);
    section.querySelector('#rsvp-form').addEventListener('submit', e => {
      e.preventDefault();
      state.submitted = true;
      renderConfirmLine();
      renderRsvpFormState();
    });
    section.querySelector('#rsvp-edit-btn').addEventListener('click', () => {
      state.submitted = false;
      state.rsvp = { name: '', adults: 1, children: 0, events: {}, diet: '', message: '' };
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
          <p class="card-text">${escapeHtml(bf(block, 'text', lang))}</p>
        </div>
      </div>`;
    return section;
  }

  function buildDressBlock(block, lang) {
    const section = document.createElement('section');
    section.className = 'section section-cream';
    section.innerHTML = `
      <div class="cadeau-grid">
        <div id="dresscode" class="card-dresscode">
          <div class="cal card-glyph card-glyph-gold">衣</div>
          <div class="kicker kicker-light">${escapeHtml(bf(block, 'kicker', lang))}</div>
          <h3 class="card-title card-title-light">${escapeHtml(bf(block, 'title', lang))}</h3>
          <p class="card-text card-text-light">${escapeHtml(bf(block, 'text', lang))}</p>
          <div id="avoid-colors" class="avoid-colors"></div>
        </div>
      </div>`;
    const wrap = section.querySelector('#avoid-colors');
    (block.avoidColors || []).forEach(c => {
      const label = lang === 'zh' ? (c.label_zh || c.label_fr) : (c.label_fr || c.label_zh);
      const chip = document.createElement('span');
      chip.className = 'avoid-chip';
      chip.innerHTML = `<span class="avoid-swatch" style="background:${escapeHtml(c.hex || '')}"></span>${escapeHtml(label || '')}`;
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
        <p class="section-text-narrow">${escapeHtml(bf(block, 'hint', lang))}</p>
      </div>
      <div class="gallery-grid">
        <div class="gallery-slot" aria-label="Photo 1"></div>
        <div class="gallery-slot" aria-label="Photo 2"></div>
        <div class="gallery-slot" aria-label="Photo 3"></div>
        <div class="gallery-slot" aria-label="Photo 4"></div>
        <div class="gallery-slot" aria-label="Photo 5"></div>
        <div class="gallery-slot" aria-label="Photo 6"></div>
      </div>`;
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
        <p class="footer-text">${escapeHtml(bf(block, 'text', lang))}</p>
        <div class="footer-contacts">
          <a href="mailto:sophie.ruiyuan@example.com" class="footer-email">✉︎ sophie.ruiyuan@example.com</a>
          <span class="footer-phone">☎ +33 6 00 00 00 00</span>
        </div>
        <div class="footer-rule"></div>
        <div class="footer-names">Sophie <span class="amp">&amp;</span> Ruiyuan</div>
        <div class="footer-date">24 · 07 · 2027 — LOGNES</div>
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

    let opened = false;
    try { opened = sessionStorage.getItem('sr_env_opened') === '1'; } catch (e) {}
    state.env = opened ? 'done' : 'sealed';
    revealEnvelope();
    renderEnvelope();
    syncScroll();
    fullRender();
    tick();
    setInterval(tick, 1000);
  }

  init();
