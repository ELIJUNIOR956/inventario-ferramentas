/* script.js
 - Importa .xlsx/.csv via SheetJS
 - Constrói menu lateral com abas (locais)
 - Renderiza itens por local
 - Exibe todos os campos do item em um modal editável
 - Persiste import no localStorage (chave: inv_usinagem_xlsx_v1)
 - Implementa busca otimizada (Debounce)
 - Implementa Theme Toggling (Modo Claro/Escuro)
*/

const LS_KEY = 'inv_usinagem_xlsx_v1';
const LS_THEME_KEY = 'inv_theme_preference';
const EXCLUDE_NAMES = ['materiais sap (2)', 'materiais sap-alterado', 'padrao'];

// Referências DOM
const body = document.body;
const fileInput = document.getElementById('fileInput');
const btnImport = document.getElementById('btnImport');
const btnClear = document.getElementById('btnClear');
const locaisList = document.getElementById('locaisList');
const mainList = document.getElementById('mainList');
const titleHeader = document.getElementById('titleHeader');
const searchInput = document.getElementById('searchInput');
const btnShowAll = document.getElementById('btnShowAll');
const footerText = document.getElementById('footerText');
const btnToggleTheme = document.getElementById('btnToggleTheme');

const modal = document.getElementById('modalDetalhes');
const modalTitulo = document.getElementById('modalTitulo');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');
const btnSalvarModal = document.getElementById('btnSalvarModal');

// Estado Global
let inventory = {};
let activeSheet = null;

let activeRowIndex = -1;
let activeSheetName = '';

// -----------------------------------------------------------------------
// LÓGICA DE TEMA (MODO CLARO/ESCURO)
// -----------------------------------------------------------------------

function toggleTheme() {
  const isLight = body.classList.toggle('light-theme');
  
  if (isLight) {
    localStorage.setItem(LS_THEME_KEY, 'light');
    btnToggleTheme.textContent = '🌙 Modo Escuro';
  } else {
    localStorage.setItem(LS_THEME_KEY, 'dark');
    btnToggleTheme.textContent = '☀️ Modo Claro';
  }
}

// Evento do botão de tema
btnToggleTheme.addEventListener('click', toggleTheme);

// -----------------------------------------------------------------------
// Inicialização
// -----------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // 1. Aplicar tema salvo
  const savedTheme = localStorage.getItem(LS_THEME_KEY);
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

  // Se o tema estiver salvo como "light" OU se não houver tema salvo e o sistema preferir light, aplica.
  if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
    body.classList.add('light-theme');
    btnToggleTheme.textContent = '🌙 Modo Escuro';
  } else {
    body.classList.remove('light-theme');
    btnToggleTheme.textContent = '☀️ Modo Claro';
  }


  // 2. Carregar dados do inventário
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const savedData = JSON.parse(raw);
      inventory = savedData.data || {};

      if (savedData.sourceFile) {
        footerText.textContent = `Dados de: ${savedData.sourceFile} (salvos localmente)`;
      }

      renderMenu();
      renderAllCards();
      const first = Object.keys(inventory)[0];
      if (first) setActiveLocal(first);
    } catch (e) {
      console.warn('Erro ao carregar dados salvos:', e);
    }
  }
});

// -----------------------------------------------------------------------
// Eventos e Funções Principais
// -----------------------------------------------------------------------

// Eventos de I/O
btnImport.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFile, false);

btnClear.addEventListener('click', () => {
  if (!confirm('Limpar dados salvos no navegador?')) return;
  localStorage.removeItem(LS_KEY);
  inventory = {};
  locaisList.innerHTML = '';
  mainList.innerHTML = '';
  titleHeader.textContent = 'Inventário — Selecione um local';
  footerText.textContent = 'Inventário de Usinagem — Dados carregados do arquivo (.xlsx) e salvos localmente';
  alert('Dados removidos do LocalStorage.');
});

btnShowAll.addEventListener('click', () => {
  renderAllCards();
  titleHeader.textContent = 'Inventário — Todos os locais';
});

// Busca com Debounce
function performSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderAllCards();
    return;
  }
  renderAllCards(q);
}
const debouncedSearchHandler = debounce(performSearch, 300);
searchInput.addEventListener('input', debouncedSearchHandler);

// Modal
closeModal.addEventListener('click', () => { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); });
modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); } });
btnSalvarModal.addEventListener('click', saveItemDetails); 

// Lógica de Salvamento
function saveItemDetails() {
  if (activeRowIndex === -1 || !activeSheetName || !inventory[activeSheetName]) return;

  const currentItem = inventory[activeSheetName][activeRowIndex];
  const inputElements = modalBody.querySelectorAll('input');
  
  // 1. Coleta e aplica os novos valores
  inputElements.forEach(input => {
    const key = input.dataset.key;
    const value = input.value;
    
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== '') {
        currentItem[key] = numValue;
    } else {
        currentItem[key] = value;
    }
  });

  // 2. Persiste o inventário atualizado no localStorage
  const currentFilename = footerText.textContent.match(/Dados de: (.*) \(salvos localmente\)/)?.[1] || 'Planilha Editada';
  const saveData = {
    data: inventory,
    sourceFile: currentFilename
  };
  localStorage.setItem(LS_KEY, JSON.stringify(saveData));

  // 3. Atualiza a interface
  renderAllCards(); 
  
  // 4. Fecha o modal
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  
  activeRowIndex = -1;
  activeSheetName = '';
  
  alert('Item salvo com sucesso!');
}

// Lógica de Importação
function handleFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheets = workbook.SheetNames.filter(n => !EXCLUDE_NAMES.includes(n.toLowerCase()));

      inventory = {};
      sheets.forEach(name => {
        const ws = workbook.Sheets[name];
        let json = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!json || json.length === 0 || hasUnnamedHeaders(json)) {
          const asArray = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (asArray.length > 0) {
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
              const cols = asArray[0].length;
              if (cols === 3) {
                json = asArray.map(row => ({
                  codigo: row[0],
                  nome: row[1],
                  quantidade: row[2]
                }));
              } else {
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
        inventory[name] = json;
      });

      const saveData = {
        data: inventory,
        sourceFile: f.name
      };
      localStorage.setItem(LS_KEY, JSON.stringify(saveData));

      footerText.textContent = `Dados de: ${f.name} (salvos localmente)`;

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

// Lógica de Renderização
function hasUnnamedHeaders(jsonArr) {
  if (!Array.isArray(jsonArr) || jsonArr.length === 0) return false;
  const sample = jsonArr[0];
  return Object.keys(sample).some(k => /unnamed|^col_|^f\d+$/i.test(k));
}

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

function setActiveLocal(nome) {
  activeSheet = nome;
  document.querySelectorAll('.local-btn').forEach(b => b.classList.remove('active'));
  const btn = Array.from(document.querySelectorAll('.local-btn')).find(b => b.textContent === nome);
  if (btn) btn.classList.add('active');

  titleHeader.textContent = `Inventário — ${nome}`;
  renderSheet(nome);
}

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
    const card = createCard(k, filtered, arr); 
    mainList.appendChild(card);
  });
}

function renderSheet(nome) {
  mainList.innerHTML = '';
  const arr = inventory[nome] || [];
  if (!arr || arr.length === 0) {
    mainList.innerHTML = '<div style="color:var(--muted)">Nenhum item neste local.</div>';
    return;
  }
  const card = createCard(nome, arr, arr); 
  mainList.appendChild(card);
}

function createCard(title, rowsToDisplay, originalRows) {
  const sec = document.createElement('section');
  sec.className = 'card';
  sec.innerHTML = `<h3>${escapeHtml(title)} <small style="color:var(--muted);font-size:0.85rem">(${rowsToDisplay.length})</small></h3>`;
  const ul = document.createElement('ul');
  ul.className = 'lista';
  rowsToDisplay.forEach((r) => {
    const rowIndex = originalRows.indexOf(r);
    if(rowIndex === -1) return;

    const li = document.createElement('li');
    li.className = 'item';
    const displayName = guessDisplayName(r) || `Item ${rowIndex + 1}`;
    const qtd = findValueByKey(r, ['quantidade','qtd','quant','qty','amount','quantidade_total','col_2']) || '';
    const localGuess = findValueByKey(r, ['local','loc','armazen','location','col_3']) || '';
    li.innerHTML = `
      <div>
        <div class="nome">${escapeHtml(String(displayName))}</div>
        <div class="meta">${escapeHtml(String(localGuess))} • Qtd: ${escapeHtml(String(qtd))}</div>
      </div>
    `;
    li.onclick = () => openDetalhes(title, r, rowIndex); 
    ul.appendChild(li);
  });
  sec.appendChild(ul);
  return sec;
}

function openDetalhes(sheetName, row, rowIndex) { 
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  modalTitulo.textContent = `${sheetName} — Editar Item`;
  modalBody.innerHTML = '';
  
  activeRowIndex = rowIndex;     
  activeSheetName = sheetName;   

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
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = (v === undefined || v === null) ? '' : String(v);
    input.dataset.key = k; 

    vEl.appendChild(input);
    
    rowDiv.appendChild(kEl);
    rowDiv.appendChild(vEl);
    modalBody.appendChild(rowDiv);
  });
}


// Helpers
function findValueByKey(obj, keys) {
  const lowerKeys = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = k; return acc; }, {});
  for (const kk of keys) {
    const lk = kk.toLowerCase();
    if (lowerKeys[lk]) return obj[lowerKeys[lk]];
  }
  for (const k of Object.keys(obj)) {
    const kl = k.toLowerCase();
    for (const kk of keys) {
      if (kl.includes(kk)) return obj[k];
    }
  }
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

function debounce(func, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
