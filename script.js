/* script.js
 - Importa .xlsx/.csv via SheetJS
 - Constrói menu lateral com abas (locais)
 - Renderiza itens por local
 - Exibe todos os campos do item em um modal
 - Persiste import no localStorage (chave: inv_usinagem_xlsx_v1)
 - Ignora as abas: "materiais SAP (2)", "materiais SAP-ALTERADO", "PADRAO"
*/

const LS_KEY = 'inv_usinagem_xlsx_v1';
const EXCLUDE_NAMES = ['materiais sap (2)', 'materiais sap-alterado', 'padrao'];

const fileInput = document.getElementById('fileInput');
const btnImport = document.getElementById('btnImport');
const btnClear = document.getElementById('btnClear');
const locaisList = document.getElementById('locaisList');
const mainList = document.getElementById('mainList');
const titleHeader = document.getElementById('titleHeader');
const searchInput = document.getElementById('searchInput');
const btnShowAll = document.getElementById('btnShowAll');

const modal = document.getElementById('modalDetalhes');
const modalTitulo = document.getElementById('modalTitulo');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');

let inventory = {}; // {sheetName: [rowObjects,...]}
let activeSheet = null;

// Inicializar com dados salvos (se houver)
document.addEventListener('DOMContentLoaded', () => {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      inventory = JSON.parse(raw);
      renderMenu();
      renderAllCards();
      const first = Object.keys(inventory)[0];
      if (first) setActiveLocal(first);
    } catch (e) {
      console.warn('Erro ao carregar dados salvos:', e);
    }
  }
});

// Eventos
btnImport.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFile, false);

btnClear.addEventListener('click', () => {
  if (!confirm('Limpar dados salvos no navegador?')) return;
  localStorage.removeItem(LS_KEY);
  inventory = {};
  locaisList.innerHTML = '';
  mainList.innerHTML = '';
  titleHeader.textContent = 'Inventário — Selecione um local';
  alert('Dados removidos do LocalStorage.');
});

btnShowAll.addEventListener('click', () => {
  renderAllCards();
  titleHeader.textContent = 'Inventário — Todos os locais';
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { renderAllCards(); return; }
  renderAllCards(q);
});

// Handle file
function handleFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      // filtrar sheets que queremos ignorar (case-insensitive)
      const sheets = workbook.SheetNames.filter(n => !EXCLUDE_NAMES.includes(n.toLowerCase()));

      inventory = {};
      sheets.forEach(name => {
        const ws = workbook.Sheets[name];
        // tentar parse com header automático
        let json = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // se o resultado aparenta não ter cabeçalho (chaves como "Unnamed" ou col_0),
        // reprocessar com header:1 e detectar estrutura
        if (!json || json.length === 0 || hasUnnamedHeaders(json)) {
          const asArray = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (asArray.length > 0) {
            // determinar se primeira linha é cabeçalho textual
            const firstRow = asArray[0].map(c => String(c).trim());
            const isHeader = firstRow.some(cell => /nome|descri|descricao|desc|codigo|cod|sap|material|qtd/i.test(cell));
            if (isHeader) {
              const headers = asArray.shift().map(h => (h || '').toString());
              json = asArray.map(row => {
                const obj = {};
                for (let i = 0; i < headers.length; i++) {
                  obj[headers[i] || `col_${i}`] = row[i];
                }
                return obj;
              });
            } else {
              // sem cabeçalho claro -> se tiver exatamente 3 colunas, assumir: codigo, nome, quantidade
              const cols = asArray[0].length;
              if (cols === 3) {
                json = asArray.map(row => ({
                  codigo: row[0],
                  nome: row[1],
                  quantidade: row[2]
                }));
              } else {
                // criar keys col_0..col_n
                json = asArray.map(row => {
                  const obj = {};
                  row.forEach((v, i) => obj[`col_${i}`] = v);
                  return obj;
                });
              }
            }
          } else {
            json = [];
          }
        }
        // salvar
        inventory[name] = json;
      });

      // persistir
      localStorage.setItem(LS_KEY, JSON.stringify(inventory));
      renderMenu();
      renderAllCards();
      const first = Object.keys(inventory)[0];
      if (first) setActiveLocal(first);
      alert('Planilha importada com sucesso. ' + Object.keys(inventory).length + ' locais carregados.');
    } catch (err) {
      console.error('Erro ao processar planilha:', err);
      alert('Erro ao processar a planilha. Veja console para detalhes.');
    }
  };
  reader.onerror = (err) => {
    console.error('Erro ao ler arquivo', err);
    alert('Erro ao ler o arquivo. Veja console para detalhes.');
  };
  reader.readAsArrayBuffer(f);
}

// detecta chaves tipo "Unnamed" em objetos
function hasUnnamedHeaders(jsonArr) {
  if (!Array.isArray(jsonArr) || jsonArr.length === 0) return false;
  const sample = jsonArr[0];
  return Object.keys(sample).some(k => /unnamed|^col_|^f\d+$/i.test(k));
}

// menu lateral
function renderMenu() {
  locaisList.innerHTML = '';
  const keys = Object.keys(inventory);
  if (keys.length === 0) {
    locaisList.innerHTML = '<div style="color:var(--muted);font-size:0.95rem">Nenhum local carregado. Importe uma planilha (.xlsx)</div>';
    return;
  }
  keys.forEach((nome) => {
    const btn = document.createElement('button');
    btn.className = 'local-btn';
    btn.textContent = nome;
    btn.onclick = () => {
      setActiveLocal(nome);
    };
    locaisList.appendChild(btn);
  });
}

// define local ativo
function setActiveLocal(nome) {
  activeSheet = nome;
  document.querySelectorAll('.local-btn').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('.local-btn')).find(b => b.textContent === nome);
  if (btn) btn.classList.add('active');

  titleHeader.textContent = `Inventário — ${nome}`;
  renderSheet(nome);
}

// render todos os cards (ou filtrados)
function renderAllCards(filter = '') {
  mainList.innerHTML = '';
  const keys = Object.keys(inventory);
  if (keys.length === 0) {
    mainList.innerHTML = '<div style="color:var(--muted)">Nenhum dado carregado.</div>';
    return;
  }
  keys.forEach(k => {
    const arr = inventory[k] || [];
    const filtered = filter ? arr.filter(row => rowMatchesFilter(row, filter)) : arr;
    if (filtered.length === 0) return;
    const card = createCard(k, filtered);
    mainList.appendChild(card);
  });
}

// render uma sheet específica
function renderSheet(nome) {
  mainList.innerHTML = '';
  const arr = inventory[nome] || [];
  if (!arr || arr.length === 0) {
    mainList.innerHTML = '<div style="color:var(--muted)">Nenhum item neste local.</div>';
    return;
  }
  const card = createCard(nome, arr);
  mainList.appendChild(card);
}

// cria card
function createCard(title, rows) {
  const sec = document.createElement('section');
  sec.className = 'card';
  sec.innerHTML = `<h3>${escapeHtml(title)} <small style="color:var(--muted);font-size:0.85rem">(${rows.length})</small></h3>`;
  const ul = document.createElement('ul');
  ul.className = 'lista';
  rows.forEach((r, idx) => {
    const li = document.createElement('li');
    li.className = 'item';
    const displayName = guessDisplayName(r) || `Item ${idx + 1}`;
    const qtd = findValueByKey(r, ['quantidade','qtd','quant','qty','amount','quantidade_total','col_2']) || '';
    const localGuess = findValueByKey(r, ['local','loc','armazen','location','col_3']) || '';
    li.innerHTML = `
      <div>
        <div class="nome">${escapeHtml(String(displayName))}</div>
        <div class="meta">${escapeHtml(String(localGuess))} • Qtd: ${escapeHtml(String(qtd))}</div>
      </div>
    `;
    li.onclick = () => openDetalhes(title, r);
    ul.appendChild(li);
  });
  sec.appendChild(ul);
  return sec;
}

// modal com todos os campos da linha
function openDetalhes(sheetName, row) {
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  modalTitulo.textContent = `${sheetName} — Detalhes do item`;
  modalBody.innerHTML = '';
  // ordena chaves para mostrar codigo/nome/quantidade primeiro se existirem
  const keys = Object.keys(row);
  const preferred = ['codigo','cod','sap','nome','description','descricao','desc','quantidade','qtd','quant'];
  const sortedKeys = keys.slice().sort((a,b) => {
    const ai = preferred.findIndex(p => a.toLowerCase().includes(p));
    const bi = preferred.findIndex(p => b.toLowerCase().includes(p));
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  sortedKeys.forEach(k => {
    const v = row[k];
    const rowDiv = document.createElement('div');
    rowDiv.className = 'det-row';
    const kEl = document.createElement('div');
    kEl.className = 'k';
    kEl.textContent = k;
    const vEl = document.createElement('div');
    vEl.className = 'v';
    vEl.textContent = (v === undefined || v === null) ? '' : String(v);
    rowDiv.appendChild(kEl);
    rowDiv.appendChild(vEl);
    modalBody.appendChild(rowDiv);
  });
}

// fechar modal
closeModal.addEventListener('click', () => { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); });
modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); } });

// helpers

function findValueByKey(obj, keys) {
  const lowerKeys = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = k; return acc; }, {});
  for (const kk of keys) {
    const lk = kk.toLowerCase();
    if (lowerKeys[lk]) return obj[lowerKeys[lk]];
  }
  // tentativa por includes
  for (const k of Object.keys(obj)) {
    const kl = k.toLowerCase();
    for (const kk of keys) {
      if (kl.includes(kk)) return obj[k];
    }
  }
  // se não encontrou e valor numérico existe em colunas típicas, retornar
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if ((keys.some(kk => kk.includes('quant')) || keys.includes('col_2')) && typeof v === 'number') return v;
  }
  return null;
}

function guessDisplayName(row) {
  const prefer = ['nome','description','descricao','desc','material','produto','descricao do material','cod','codigo','sap','descr'];
  for (const p of prefer) {
    const v = findValueByKey(row, [p]);
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  // qualquer campo textual não vazio
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function rowMatchesFilter(row, q) {
  const texto = Object.values(row).map(v => String(v || '').toLowerCase()).join(' ');
  return texto.includes(q);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
  });
}
