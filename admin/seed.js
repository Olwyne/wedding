// admin/seed.js
import { db } from '../firebase-init.js';
import { doc, setDoc, getDocs, collection } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { initAuth } from './auth.js';

const SEED_EVENTS = [
  { id: 'the', order: 1, zh: '茶', time_fr: '8h00', time_zh: '8:00', title_fr: 'Cérémonie du thé', title_zh: '敬茶仪式', place_fr: 'Au domicile de la famille', place_zh: '于家中', desc_fr: "Un moment intime, réservé aux proches : la cérémonie du thé, geste de respect et de gratitude envers les familles.", desc_zh: '温馨私密的环节，仅限至亲：敬茶仪式，向双方长辈表达敬意与感恩。' },
  { id: 'resto', order: 2, zh: '宴', time_fr: '12h00', time_zh: '12:00', title_fr: 'Déjeuner chinois', title_zh: '中式午宴', place_fr: 'Restaurant (à confirmer)', place_zh: '餐厅（待定）', desc_fr: "Un déjeuner convivial autour d'un banquet chinois, pour prolonger la matinée en famille et amis proches.", desc_zh: '与至亲好友共享中式宴席，延续上午的温馨时光。' },
  { id: 'mairie', order: 3, zh: '证婚', time_fr: '16h00', time_zh: '16:00', title_fr: 'Mariage civil', title_zh: '公证结婚', place_fr: 'Mairie de Lognes', place_zh: '洛涅市政厅', desc_fr: "L'échange des consentements et des alliances, entouré de tous nos invités.", desc_zh: '在所有来宾的见证下，交换誓言与戒指。' },
  { id: 'soiree', order: 4, zh: '喜宴', time_fr: '19h00', time_zh: '19:00', title_fr: 'Soirée', title_zh: '晚宴派对', place_fr: 'Domaine de la Pointe', place_zh: '拉普安特庄园', desc_fr: "Dîner, discours et danse jusqu'au bout de la nuit pour célébrer ensemble.", desc_zh: '晚宴、致辞与舞会，欢庆至深夜。' },
];

function log(msg) {
  document.getElementById('seed-log').textContent += msg + '\n';
}

document.getElementById('seed-btn').addEventListener('click', async () => {
  for (const ev of SEED_EVENTS) {
    const { id, ...data } = ev;
    await setDoc(doc(db, 'events', id), data);
    log(`Créé : ${id}`);
  }
  const snap = await getDocs(collection(db, 'events'));
  log(`Total dans events : ${snap.size}`);
});

initAuth({ onSignedIn: () => {}, onSignedOut: () => {} });
