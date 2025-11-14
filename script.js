
const LS_KEY = 'inventario_usinagem';
let dadosPlanilha = {};      // { sheetName: [rowObj,...] }
let dadosOriginais = {};
let localAtual = null;

// DOM refs (mantidos os mesmos IDs do seu HTML)
const locaisList = document.getElementById('locaisList');
const mainList = document.getElementById('mainList');
const titleHeader = document.getElementById('titleHeader');
const searchInput = document.getElementById('searchInput');
const footerText = document.getElementById('footerText');

const modal = document.getElementById('modalDetalhes');
const modalTitulo = document.getElementById('modalTitulo');
const modalBody = document.getElementById('modalBody');
const btnSalvarModal = document.getElementById('btnSalvarModal');
const closeModal = document.getElementById('closeModal');

/* ================ UTILITIES ================ */
function safeString(v){ return (v === null || v === undefined) ? '' : String(v); }
function escapeHtml(s){ return safeString(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// Busca valor por várias chaves potenciais (case-insensitive, inclui heurística)
function findValueByKey(obj, keys){
  if(!obj || typeof obj !== 'object') return '';
  // Create map lowercase->realKey
  const map = {};
  Object.keys(obj).forEach(k => { map[k.trim().toLowerCase()] = k; });
  // direct matches
  for(const kk of keys){
    const lk = kk.trim().toLowerCase();
    if(map[lk]) return obj[map[lk]];
  }
  // inclusion heuristic
  for(const realKey of Object.keys(obj)){
    const rk = realKey.trim().toLowerCase();
    for(const kk of keys){
      if(rk.includes(kk.trim().toLowerCase())) return obj[realKey];
    }
  }
  return '';
}

// Tenta obter um nome amigável para exibição
function guessDisplayName(row){
  const prefer = ['descrição','descricao','nome','item','material','produto','description','descr'];
  for(const p of prefer){
    const v = findValueByKey(row, [p]);
    if(v !== '' && v !== null && v !== undefined) return v;
  }
  // fallback: first non-empty field
  for(const k of Object.keys(row)){
    const v = row[k];
    if(v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '(sem descrição)';
}

function debounce(fn, wait){ let t; return function(...a){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; }

/* ================ MODAL ================ */
function openModalEditar(sheetName, rowObj, rowIndex){
  modalTitulo.textContent = `${sheetName} — Editar item`;
  modalBody.innerHTML = '';
  // Order fields: prefer codigo/nome/quantidade first
  const keys = Object.keys(rowObj);
  const pref = ['codigo','cod','sap','nome','descrição','descricao','quantidade','qtd','quant'];
  keys.sort((a,b)=>{
    const ai = pref.findIndex(p => a.toLowerCase().includes(p));
    const bi = pref.findIndex(p => b.toLowerCase().includes(p));
    if(ai === -1 && bi === -1) return a.localeCompare(b);
    if(ai === -1) return 1;
    if(bi === -1) return -1;
    return ai - bi;
  });

  keys.forEach(k=>{
    const v = rowObj[k];
    const row = document.createElement('div');
    row.className = 'det-row';
    const kEl = document.createElement('div'); kEl.className = 'k'; kEl.textContent = k;
    const vEl = document.createElement('div'); vEl.className = 'v';
    const input = document.createElement('input'); input.type = 'text'; input.value = (v === undefined || v === null) ? '' : String(v);
    input.dataset.field = k;
    vEl.appendChild(input);
    row.appendChild(kEl); row.appendChild(vEl);
    modalBody.appendChild(row);
  });

  modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false');

  btnSalvarModal.onclick = () => {
    // aplicar valores no objeto
    modalBody.querySelectorAll('input').forEach(input=>{
      const field = input.dataset.field;
      dadosPlanilha[sheetName][rowIndex][field] = input.value;
    });
    try {
      salvarLocalStorage();
    } catch(e){
      console.warn('Erro salvando após edição:', e);
    }
    renderLocal(sheetName);
    modal.style.display = 'none'; modal.setAttribute('aria-hidden','true');
  };

  closeModal.onclick = () => { modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); };
  // click fora fecha
  window.addEventListener('click', function onWinClick(ev){
    if(ev.target === modal){ modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); window.removeEventListener('click', onWinClick); }
  });
}

/* ================ MENU DE LOCAIS ================ */
function criarMenuLocais(){
  locaisList.innerHTML = '';
  const names = Object.keys(dadosPlanilha);
  if(names.length === 0){
    locaisList.innerHTML = `<div style="color:var(--muted);font-size:0.95rem">Nenhum local carregado. Importe uma planilha (.xlsx)</div>`;
    return;
  }
  names.forEach(name=>{
    const btn = document.createElement('button');
    btn.className = 'local-btn';
    btn.textContent = `${name} (${(dadosPlanilha[name]||[]).length})`;
    btn.onclick = () => {
      document.querySelectorAll('.local-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localAtual = name;
      renderLocal(name);
    };
    locaisList.appendChild(btn);
  });
}

/* ================ RENDER LOCAL (CARRINHOS ESPECIAIS) ================ */
function renderLocal(local){
  titleHeader.textContent = `Inventário — ${local}`;
  mainList.innerHTML = '';

  const rows = dadosPlanilha[local] || [];
  if(rows.length === 0){
    mainList.innerHTML = '<div style="color:var(--muted)">Nenhum item neste local.</div>';
    return;
  }

  // Detecta se a aba é "CARRINHO 1", "CARRINHO 2" ou "CARRINHO 3" (case-insensitive)
  const sheetNameNormalized = String(local).trim().toUpperCase();
  const isCarr1or2 = /^CARRINHO\s*1$/i.test(sheetNameNormalized) || /^CARRINHO\s*2$/i.test(sheetNameNormalized);
  const isCarr3 = /^CARRINHO\s*3$/i.test(sheetNameNormalized);

  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<h3>${escapeHtml(local)} <small style="color:var(--muted);font-size:0.85rem">(${rows.length})</small></h3>`;
  const ul = document.createElement('ul'); ul.className = 'lista';

  rows.forEach((r, idx)=>{
    const li = document.createElement('li'); li.className = 'item';

    const display = escapeHtml(safeString(guessDisplayName(r)));
    const qtd = escapeHtml(safeString(findValueByKey(r, ['quantidade','qtd','quant','qty','contagem'])));

    // Extração robusta das colunas CARRINHO/GAVETA/FILEIRA/Nº DA FILEIRA
    const carrVal = findValueByKey(r, ['CARRINHO','carrinho']) || '';
    const gavVal = findValueByKey(r, ['GAVETA','gaveta']) || '';
    const fileVal = findValueByKey(r, ['FILEIRA','fileira']) || '';
    const nFileVal = findValueByKey(r, ['Nº DA FILEIRA','N DA FILEIRA','N DA FILEIRA','nº da fileira','n da fileira','num da fileira']) || '';

    // normalize carrinho number for logic (se possível)
    const carrinhoNum = (() => {
      const s = safeString(carrVal).replace(/\s/g,'');
      const num = Number(String(s).replace(/\D/g,'')); // keep digits
      return isNaN(num) ? null : num;
    })();

    let localFormatted = '';

    if(isCarr1or2 || carrinhoNum === 1 || carrinhoNum === 2){
      // Carrinho 1 e 2: têm FILEIRA (letra) e N° DA FILEIRA
      localFormatted = `Carrinho ${carrinhoNum || safeString(carrVal)} • Gaveta ${safeString(gavVal)} • Fileira ${safeString(fileVal)} • Nº ${safeString(nFileVal)}`;
    } else if (isCarr3 || carrinhoNum === 3){
      // Carrinho 3: não tem fileira textual
      localFormatted = `Carrinho 3 • Gaveta ${safeString(gavVal)} • Nº ${safeString(nFileVal)}`;
    } else {
      // Outros locais: tenta localizar campo 'local' etc.
      const fallback = findValueByKey(r, ['local','loc','armazen','armazenamento','local de armazenamento','location']);
      localFormatted = fallback ? safeString(fallback) : `Linha ${idx+1}`;
    }

    li.innerHTML = `
      <div>
        <div class="nome">${display}</div>
        <div class="meta">${escapeHtml(localFormatted)} • Qtd: ${qtd}</div>
      </div>
    `;
    li.onclick = () => openModalEditar(local, r, idx);
    ul.appendChild(li);
  });

  card.appendChild(ul);
  mainList.appendChild(card);
}

/* ================ RENDER ALL (botão Mostrar Todos) ================ */
function renderAll(filter=''){
  mainList.innerHTML = '';
  const q = safeString(filter).toLowerCase();
  const sheetNames = Object.keys(dadosPlanilha);
  if(sheetNames.length === 0){ mainList.innerHTML = '<div style="color:var(--muted)">Nenhum dado carregado.</div>'; return; }

  sheetNames.forEach(sn=>{
    const rows = dadosPlanilha[sn] || [];
    const filtered = q ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(q)) : rows;
    if(filtered.length === 0) return;
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>${escapeHtml(sn)} <small style="color:var(--muted);font-size:0.85rem">(${filtered.length})</small></h3>`;
    const ul = document.createElement('ul'); ul.className = 'lista';
    filtered.forEach((r, idx)=>{
      const li = document.createElement('li'); li.className = 'item';
      li.innerHTML = `<div><div class="nome">${escapeHtml(safeString(guessDisplayName(r)))}</div></div>`;
      li.onclick = () => openModalEditar(sn, r, idx);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    mainList.appendChild(card);
  });
}

/* ================ BUSCA ================ */
searchInput.addEventListener('input', debounce(()=>{
  const q = (searchInput.value || '').trim().toLowerCase();
  if(!localAtual) { renderAll(q); return; }
  if(!q){ renderLocal(localAtual); return; }
  // filtrar só localAtual
  const rows = dadosPlanilha[localAtual] || [];
  const filtered = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  mainList.innerHTML = '';
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = `<h3>${escapeHtml(localAtual)} — Resultado da busca (${filtered.length})</h3>`;
  const ul = document.createElement('ul'); ul.className = 'lista';
  filtered.forEach((r, idx)=>{
    const li = document.createElement('li'); li.className = 'item';
    li.innerHTML = `<div><div class="nome">${escapeHtml(safeString(guessDisplayName(r)))}</div></div>`;
    li.onclick = () => openModalEditar(localAtual, r, idx);
    ul.appendChild(li);
  });
  card.appendChild(ul);
  mainList.appendChild(card);
}, 250));

/* ================ IMPORT XLSX ================ */
document.getElementById('btnImport').addEventListener('click', ()=> document.getElementById('fileInput').click());

document.getElementById("fileInput").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const abasIgnoradas = [
    "materiais SAP (2)",
    "materiais SAP-ALTERADO",
    "PADRAO"
  ].map(a => a.trim().toUpperCase());

  const reader = new FileReader();
  reader.onload = evt => {
    const wb = XLSX.read(evt.target.result, { type: "binary" });

    dadosPlanilha = {};

    wb.SheetNames.forEach(sheetName => {
      const nomeAjustado = sheetName.trim().toUpperCase();
      if (abasIgnoradas.includes(nomeAjustado)) return; // IGNORA A ABA

      const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
      if (json.length > 0) {
        dadosPlanilha[sheetName] = json;
      }
    });

    dadosOriginais = structuredClone(dadosPlanilha);
    salvarLocalStorage();
    criarMenuLocais();
  };

  reader.readAsBinaryString(file);
};

/* ================ LOCALSTORAGE (compressão LZString) ================ */
function salvarLocalStorage(){
  try {
    const json = JSON.stringify(dadosPlanilha);
    if(typeof LZString !== 'undefined' && LZString.compress){
      const comp = LZString.compress(json);
      localStorage.setItem(LS_KEY, comp);
    } else {
      // fallback (pode estourar)
      localStorage.setItem(LS_KEY, json);
    }
  } catch(e){
    console.error('Erro salvar localStorage:', e);
    if(e && e.name === 'QuotaExceededError'){
      // tentativa alternativa: salvar mini-mapa com contagens
      try {
        const mini = {};
        Object.keys(dadosPlanilha).forEach(s => mini[s] = { length: (dadosPlanilha[s]||[]).length });
        const payload = (typeof LZString !== 'undefined') ? LZString.compress(JSON.stringify(mini)) : JSON.stringify(mini);
        localStorage.setItem(LS_KEY + '_mini', payload);
      } catch(_) {}
      alert('O tamanho dos dados excede o espaço local do navegador. Os dados foram carregados na sessão, mas não puderam ser salvos localmente.');
    } else {
      throw e;
    }
  }
}

function carregarLocalStorage(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return;
    if(typeof LZString !== 'undefined' && LZString.decompress){
      const dec = LZString.decompress(raw);
      if(dec){
        dadosPlanilha = JSON.parse(dec);
      } else {
        // fallback: tentar JSON.parse sem descompressão
        try { dadosPlanilha = JSON.parse(raw); } catch(err){ console.warn('Dados locais não puderam ser descomprimidos.'); }
      }
    } else {
      // fallback
      try { dadosPlanilha = JSON.parse(raw); } catch(err){ console.warn('Não foi possível parsear dados locais.'); }
    }
    criarMenuLocais();
    // seleciona primeira aba se houver
    const first = Object.keys(dadosPlanilha)[0];
    if(first){ localAtual = first; renderLocal(first); }
  } catch(e){
    console.error('Erro carregar localStorage:', e);
  }
}

/* ================ BOTÕES & TEMA & CLEAR ================ */
document.getElementById('btnClear').addEventListener('click', ()=>{
  if(!confirm('Remover dados salvos localmente e recarregar a página?')) return;
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_KEY + '_mini'); } catch(_) {}
  location.reload();
});

document.getElementById('btnToggleTheme').addEventListener('click', ()=>{
  document.body.classList.toggle('light-theme');
  const b = document.getElementById('btnToggleTheme');
  b.textContent = document.body.classList.contains('light-theme') ? '🌙 Modo Escuro' : '☀️ Modo Claro';
});

document.getElementById('btnShowAll') && document.getElementById('btnShowAll').addEventListener('click', ()=> renderAll());

/* ================ INICIALIZAÇÃO ================ */
carregarLocalStorage();

// fim do script.js
