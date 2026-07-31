import { db } from './firebase-init.js';
import { doc, getDoc, getDocs, collection, updateDoc, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

  const TARGET = new Date('2027-07-24T08:00:00+02:00').getTime();

  const T = {
    fr: {
      pubKicker: 'Save the date', pubMsg: "Nous nous marions ! Les détails du programme sont réservés à nos invités. Si vous avez reçu une invitation, ouvrez le lien personnalisé qui l'accompagne pour découvrir la journée.",
      envInvite: 'Vous êtes convié·e au mariage de', envHint: 'Touchez pour ouvrir votre faire-part',
      heroKicker: 'Nous nous marions', heroPlace: 'Lognes, France', heroFusion: 'Un mariage franco-chinois',
      cdD: 'jours', cdH: 'heures', cdM: 'min', cdS: 'sec', cdPassed: 'Le grand jour est arrivé !',
      storyKicker: 'Notre histoire', storyTitle: 'Deux cultures, une histoire',
      storyP1: "Nos chemins se sont croisés entre Paris et Shanghai, entre un café en terrasse et une tasse de thé. De cette rencontre est née une évidence, faite de tendresse, de rires et de deux familles qui n'attendaient qu'à se réunir.",
      storyP2: "Aujourd'hui, nous unissons nos vies — et nos traditions. Nous serions honorés de vous compter parmi nous pour célébrer ce jour. (Texte à personnaliser.)",
      progKicker: 'Le déroulé', progTitle: 'La journée', progSub: "Le programme ci-dessous correspond aux moments auxquels vous êtes convié·e.",
      infoKicker: 'Sur place', infoTitle: 'Informations pratiques', mapBtn: 'Voir sur la carte',
      hotelKicker: 'Où dormir', hotelTitle: 'Hébergement & transport',
      hotelIntro: "Quelques suggestions autour de Lognes et Marne-la-Vallée pour prolonger la fête sereinement. (Exemples à ajuster.)",
      shuttle: "Une navette pourra être organisée entre la mairie de Lognes et le Domaine de la Pointe selon le nombre d'invités — précisez-le dans votre RSVP.",
      rsvpKicker: 'Répondez-nous', rsvpTitle: 'Confirmez votre présence',
      rsvpIntro: "Merci de répondre avant le 1er juin 2027. Cochez uniquement les moments auxquels vous participerez.",
      fName: 'Votre nom', fNamePh: 'Nom et prénom', fAdults: "Nombre d'adultes", fChildren: "Nombre d'enfants", fPresence: 'Je serai présent·e à :',
      fDiet: 'Allergies / régime', fDietPh: 'Ex : végétarien, sans gluten…', fMsg: 'Un petit mot', fMsgPh: 'Un message pour les mariés…',
      fSubmit: 'Envoyer ma réponse', thankTitle: 'Merci du fond du cœur',
      demoNote: "(Démonstration — aucun envoi réel n'est effectué. À connecter à votre outil de suivi.)",
      editBtn: 'Modifier ma réponse',
      giftKicker: 'Liste de mariage', giftTitle: 'Votre présence, notre plus beau cadeau',
      giftText: "Si vous souhaitez nous gâter, une boîte sera prévue sur place le jour J pour recueillir vos petits mots et cadeaux. Votre présence reste le plus précieux des présents.",
      dressKicker: 'Tenue', dressTitle: 'Dress code',
      dressText: "Tenue habillée et élégante souhaitée. Par respect des traditions de nos deux familles, merci d'éviter le rouge et le blanc/ivoire (réservés aux mariés) ainsi que le noir intégral. Une touche de couleur est la bienvenue !",
      galKicker: 'Souvenirs', galTitle: 'Galerie', galHint: 'Déposez ici vos plus belles photos.',
      contactTitle: 'Une question ?', contactText: "N'hésitez pas à nous écrire pour toute question sur la journée, le transport ou l'hébergement.",
      langBtn: '中文',
      avoid: [ { hex: '#B03A2E', label: 'Rouge' }, { hex: '#FBF6EC', label: 'Blanc / ivoire' }, { hex: '#1a1a1a', label: 'Noir intégral' } ],
      confirmPrefix: 'Nous avons hâte de vous retrouver pour : ',
      confirmNone: "C'est noté. Nous avons bien reçu votre réponse.",
      navFull: [ ['Histoire','#histoire'], ['Programme','#programme'], ['Infos','#infos'], ['Séjour','#hebergement'], ['RSVP','#rsvp'], ['Cadeaux','#cadeau'], ['Galerie','#galerie'], ['Contact','#contact'] ],
    },
    zh: {
      pubKicker: '敬请留意', pubMsg: '我们要结婚啦！婚礼行程详情仅向受邀嘉宾开放。若您已收到邀请，请打开随附的专属链接，查看当天的完整安排。',
      envInvite: '诚邀您出席我们的婚礼', envHint: '轻触开启您的请柬',
      heroKicker: '我们结婚啦', heroPlace: '法国 · 洛涅', heroFusion: '中 · 法 喜结良缘',
      cdD: '天', cdH: '时', cdM: '分', cdS: '秒', cdPassed: '大喜之日到啦！',
      storyKicker: '我们的故事', storyTitle: '两种文化，一段情缘',
      storyP1: '我们的缘分在巴黎与上海之间悄然开启——一杯露天咖啡，一盏清茶。自那一刻起，温柔、欢笑与两个家庭的期盼，让一切变得水到渠成。',
      storyP2: '今天，我们携手共度余生，也将两种传统融为一体。诚挚期盼您的到来，与我们共同见证这美好的一天。（内容可自定义。）',
      progKicker: '当日流程', progTitle: '婚礼当天', progSub: '以下行程为您受邀参加的环节。',
      infoKicker: '场地信息', infoTitle: '实用信息', mapBtn: '查看地图',
      hotelKicker: '住宿', hotelTitle: '住宿与交通',
      hotelIntro: '为您推荐洛涅及马恩拉瓦莱周边的几处住宿，方便您安心欢聚。（示例，可调整。）',
      shuttle: '我们将视人数在洛涅市政厅与拉普安特庄园之间安排接驳车，请在回执中注明您的需求。',
      rsvpKicker: '恳请回复', rsvpTitle: '确认出席',
      rsvpIntro: '烦请于 2027 年 6 月 1 日前回复。请仅勾选您将参加的环节。',
      fName: '您的姓名', fNamePh: '姓名', fAdults: '成人人数', fChildren: '儿童人数', fPresence: '我将出席：',
      fDiet: '过敏 / 饮食', fDietPh: '如：素食、无麸质…', fMsg: '留言', fMsgPh: '给新人的祝福…',
      fSubmit: '提交回复', thankTitle: '衷心感谢',
      demoNote: '（演示 — 不会实际发送，请连接您的统计工具。）',
      editBtn: '修改回复',
      giftKicker: '婚礼礼单', giftTitle: '您的到来便是最好的礼物',
      giftText: '若您愿意送上心意，当天现场将备有礼盒，收纳您的祝福与礼物。您的到来，已是最珍贵的礼物。',
      dressKicker: '着装', dressTitle: '着装建议',
      dressText: '恳请着正式、优雅的服装。为尊重两个家庭的传统，敬请避免红色与白色/象牙色（新人专属）以及全黑装扮。欢迎点缀亮丽色彩！',
      galKicker: '回忆', galTitle: '相册', galHint: '在此上传您最美的照片。',
      contactTitle: '有疑问吗？', contactText: '关于当天行程、交通或住宿的任何问题，欢迎随时与我们联系。',
      langBtn: 'FR',
      avoid: [ { hex: '#B03A2E', label: '红色' }, { hex: '#FBF6EC', label: '白/象牙色' }, { hex: '#1a1a1a', label: '全黑' } ],
      confirmPrefix: '期待与您相聚于：',
      confirmNone: '已收到您的回复，谢谢！',
      navFull: [ ['故事','#histoire'], ['流程','#programme'], ['信息','#infos'], ['住宿','#hebergement'], ['回执','#rsvp'], ['礼物','#cadeau'], ['相册','#galerie'], ['联系','#contact'] ],
    },
  };

  const HOTELS = {
    fr: [
      { tag: '4 km', name: 'Hôtel Marne-la-Vallée', desc: "Confort moderne à quelques minutes du Domaine, idéal pour la nuit du samedi. (Exemple.)" },
      { tag: '6 km', name: 'Ibis Noisy-le-Grand', desc: "Option pratique et économique, bien desservie par le RER A. (Exemple.)" },
      { tag: '8 km', name: "Maison d'hôtes de charme", desc: "Pour un séjour plus intimiste, à réserver tôt. (Exemple.)" },
    ],
    zh: [
      { tag: '4 公里', name: '马恩拉瓦莱酒店', desc: '现代舒适，距庄园仅数分钟，适合周六过夜。（示例。）' },
      { tag: '6 公里', name: '宜必思 Noisy-le-Grand', desc: '实惠便捷，RER A 线交通便利。（示例。）' },
      { tag: '8 公里', name: '精品民宿', desc: '更为私密的住宿选择，建议尽早预订。（示例。）' },
    ],
  };

  const PLACES = {
    fr: [
      { zh: '证婚', name: 'Mairie de Lognes', addr: "Place de l'Hôtel de Ville, 77185 Lognes", map: 'https://www.google.com/maps/search/?api=1&query=Mairie+de+Lognes' },
      { zh: '喜宴', name: 'Domaine de la Pointe', addr: "Adresse à préciser — région de Lognes", map: 'https://www.google.com/maps/search/?api=1&query=Domaine+de+la+Pointe' },
    ],
    zh: [
      { zh: '证婚', name: '洛涅市政厅', addr: '市政厅广场，77185 洛涅', map: 'https://www.google.com/maps/search/?api=1&query=Mairie+de+Lognes' },
      { zh: '喜宴', name: '拉普安特庄园', addr: '地址待定 — 洛涅地区', map: 'https://www.google.com/maps/search/?api=1&query=Domaine+de+la+Pointe' },
    ],
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

  // ---- Text / language ----
  function applyText() {
    const L = T[state.lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (L[key] !== undefined) el.textContent = L[key];
    });
    document.getElementById('lang-btn').textContent = L.langBtn;
    document.getElementById('lang-btn-teaser').textContent = L.langBtn;
    document.getElementById('r-name').placeholder = L.fNamePh;
    document.getElementById('r-diet').placeholder = L.fDietPh;
    document.getElementById('r-msg').placeholder = L.fMsgPh;
  }

  function renderNav() {
    const L = T[state.lang];
    const navlinks = document.getElementById('navlinks');
    const mobileLinks = document.getElementById('mobile-menu-links');
    navlinks.innerHTML = '';
    mobileLinks.innerHTML = '';
    L.navFull.forEach(([label, href]) => {
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

  function renderProgramme() {
    const list = document.getElementById('prog-list');
    list.innerHTML = '';
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
  }

  function renderRsvpEvents() {
    const wrap = document.getElementById('rsvp-events');
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
        renderRsvpEvents();
      });
      wrap.appendChild(btn);
    });
  }

  function renderPlaces() {
    const L = T[state.lang];
    const grid = document.getElementById('places-grid');
    grid.innerHTML = '';
    PLACES[state.lang].forEach(pl => {
      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `
        <div class="cal place-zh">${pl.zh}</div>
        <h3 class="place-name">${pl.name}</h3>
        <p class="place-addr">${pl.addr}</p>
        <a href="${pl.map}" target="_blank" rel="noopener" class="place-map-btn">${L.mapBtn}</a>`;
      grid.appendChild(card);
    });
  }

  function renderHotels() {
    const grid = document.getElementById('hotels-grid');
    grid.innerHTML = '';
    HOTELS[state.lang].forEach(h => {
      const card = document.createElement('div');
      card.className = 'hotel-card';
      card.innerHTML = `
        <div class="hotel-tag">${h.tag}</div>
        <h3 class="hotel-name">${h.name}</h3>
        <p class="hotel-desc">${h.desc}</p>`;
      grid.appendChild(card);
    });
  }

  function renderAvoidColors() {
    const L = T[state.lang];
    const wrap = document.getElementById('avoid-colors');
    wrap.innerHTML = '';
    L.avoid.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'avoid-chip';
      chip.innerHTML = `<span class="avoid-swatch" style="background:${c.hex}"></span>${c.label}`;
      wrap.appendChild(chip);
    });
  }

  function renderConfirmLine() {
    const L = T[state.lang];
    const chosen = visibleEvents().filter(e => state.rsvp.events[e.id]).map(e => e.title);
    document.getElementById('rsvp-confirm-line').textContent =
      chosen.length ? (L.confirmPrefix + chosen.join(' · ')) : L.confirmNone;
  }

  function renderRsvpFormState() {
    document.getElementById('rsvp-form').hidden = state.submitted;
    document.getElementById('rsvp-thanks').hidden = !state.submitted;
  }

  // ---- Countdown ----
  function tick() {
    let diff = TARGET - Date.now();
    const L = T[state.lang];
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
  document.getElementById('lang-btn-teaser').addEventListener('click', toggleLang);

  // ---- RSVP form ----
  const rsvpForm = document.getElementById('rsvp-form');
  document.getElementById('r-name').addEventListener('input', e => state.rsvp.name = e.target.value);
  document.getElementById('r-adults').addEventListener('input', e => state.rsvp.adults = e.target.value);
  document.getElementById('r-children').addEventListener('input', e => state.rsvp.children = e.target.value);
  document.getElementById('r-diet').addEventListener('input', e => state.rsvp.diet = e.target.value);
  document.getElementById('r-msg').addEventListener('input', e => state.rsvp.message = e.target.value);
  rsvpForm.addEventListener('submit', e => {
    e.preventDefault();
    state.submitted = true;
    renderConfirmLine();
    renderRsvpFormState();
  });
  document.getElementById('rsvp-edit-btn').addEventListener('click', () => {
    state.submitted = false;
    state.rsvp = { name: '', adults: 1, children: 0, events: {}, diet: '', message: '' };
    document.getElementById('r-name').value = '';
    document.getElementById('r-adults').value = 1;
    document.getElementById('r-children').value = 0;
    document.getElementById('r-diet').value = '';
    document.getElementById('r-msg').value = '';
    renderRsvpEvents();
    renderRsvpFormState();
  });

  async function renderBlocks() {
    const snap = await getDocs(
      query(collection(db, 'blocks'), where('visible', '==', true), orderBy('order'))
    );
    const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const section = document.getElementById('blocks-section');
    const list = document.getElementById('blocks-list');
    if (!blocks.length) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = '';
    blocks.forEach(block => {
      const item = document.createElement('div');
      item.className = 'block-item';
      const lang = state.lang;
      const titleFr = escapeHtml(block.title_fr || '');
      const titleZh = escapeHtml(block.title_zh || '');
      const titleHtml = (titleFr || titleZh) ? `
        <div class="block-title">
          ${titleFr}
          ${titleZh ? `<span class="block-title-zh">${titleZh}</span>` : ''}
        </div>` : '';
      if (block.type === 'text') {
        const contentFr = escapeHtml(block.content_fr || '');
        const contentZh = escapeHtml(block.content_zh || '');
        item.innerHTML = `
          ${titleHtml}
          ${contentFr ? `<p class="block-content">${contentFr}</p>` : ''}
          ${contentZh ? `<p class="block-content-zh">${contentZh}</p>` : ''}`;
      } else if (block.type === 'image') {
        const alt = lang === 'zh' ? (block.alt_zh || block.alt_fr || '') : (block.alt_fr || '');
        const caption = lang === 'zh' ? block.caption_zh : block.caption_fr;
        item.innerHTML = titleHtml;
        const img = document.createElement('img');
        img.className = 'block-image';
        img.loading = 'lazy';
        img.src = block.image_url || '';
        img.alt = alt;
        item.appendChild(img);
        if (caption) {
          const cap = document.createElement('p');
          cap.className = `block-caption${lang === 'zh' ? ' block-caption-zh' : ''}`;
          cap.textContent = escapeHtml(caption);
          item.appendChild(cap);
        }
      }
      list.appendChild(item);
    });
  }

  function fullRender() {
    applyText();
    renderNav();
    renderProgramme();
    renderBlocks().catch(err => console.error('renderBlocks failed:', err));
    renderRsvpEvents();
    renderPlaces();
    renderHotels();
    renderAvoidColors();
    renderConfirmLine();
    renderRsvpFormState();
    renderCountdown();
    renderAccessView();
  }

  async function init() {
    showLoading(true);
    await loadGuestData();
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
