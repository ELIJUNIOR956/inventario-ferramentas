// ===============================
//   SISTEMA DE INVENTÁRIO — JS
// ===============================

// Abas a ignorar
const ABAS_IGNORAR = ["materiais SAP (2)", "materiais sap-alterado", "materiais sap alterado", "padrão", "padrao"];

// Dados carregados
let dadosPlanilha = {};
let dadosOriginais = {};

let localAtual = null; // se for "_ALL" = modo global

// Elementos DOM
const locaisList = document.getElementById("locaisList");
const mainList = document.getElementById("mainList");
const titleHeader = document.getElementById("titleHeader");
const searchInput = document.getElementById("searchInput");
const footerText = document.getElementById("footerText");

// Modal
const modal = document.getElementById("modalDetalhes");
const modalTitulo = document.getElementById("modalTitulo");
const modalBody = document.getElementById("modalBody");
const btnSalvarModal = document.getElementById("btnSalvarModal");
const closeModal = document.getElementById("closeModal");

// ===============================
// UTILIDADES
// ===============================

function escapeHtml(txt) {
  return String(txt).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function findValueByKey(obj, keys) {
  for (const tryKey of keys) {
    for (const realKey in obj) {
      if (realKey.trim().toLowerCase() === tryKey.trim().toLowerCase()) {
        return obj[realKey];
      }
    }
  }
  return "";
}

function guessDisplayName(row) {
  const prefer = ["descrição","descricao","item","nome","material","produto"];
  for (const k of prefer) {
    const v = findValueByKey(row, [k]);
    if (v) return v;
  }

  // fallback
  for (const key in row) {
    if (row[key]) return row[key];
  }

  return null;
}

// ===============================
// ABRIR / FECHAR MODAL
// ===============================

function openDetalhes(local, row, index) {
  modalTitulo.textContent = `Item — ${local}`;
  modalBody.innerHTML = "";

  Object.keys(row).forEach(campo => {
    modalBody.innerHTML += `
      <div class="det-row">
        <div class="k">${escapeHtml(campo)}</div>
        <div class="v">
          <input type="text" data-field="${escapeHtml(campo)}" value="${escapeHtml(row[campo] || "")}">
        </div>
      </div>
    `;
  });

  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");

  btnSalvarModal.onclick = () => {
    const inputs = modalBody.querySelectorAll("input");
    inputs.forEach(input => {
      const campo = input.dataset.field;
      dadosPlanilha[local][index][campo] = input.value;
    });

    salvarLocalStorage();

    if (localAtual === "_ALL") renderTodos();
    else renderLocal(localAtual);

    modal.style.display = "none";
  };
}

closeModal.onclick = () => (modal.style.display = "none");
window.onclick = e => { if (e.target === modal) modal.style.display = "none"; };

// ===============================
// MENU LATERAL
// ===============================

function criarMenuLocais() {
  locaisList.innerHTML = "";

  Object.keys(dadosPlanilha).forEach(local => {
    const btn = document.createElement("button");
    btn.className = "local-btn";
    btn.textContent = local;

    btn.onclick = () => {
      document.querySelectorAll(".local-btn").forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      localAtual = local;
      renderLocal(local);
    };

    locaisList.appendChild(btn);
  });
}

// ===============================
// EXIBIR UM LOCAL (ABA)
// ===============================

function renderLocal(local) {
  localAtual = local;
  titleHeader.textContent = `Inventário — ${local}`;
  mainList.innerHTML = "";

  const lista = dadosPlanilha[local];
  if (!lista) return;

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<h3>${local}</h3>`;

  const ul = document.createElement("ul");
  ul.className = "lista";

  lista.forEach((r, i) => {
    const displayName = guessDisplayName(r) || `Item ${i+1}`;
    const qtd = findValueByKey(r, ["quantidade","qtd","quant","qty"]);

    const carrinho = findValueByKey(r, ["carrinho"]);
    let localFormatted = "";

    // CARRINHO 1 e 2
    if (carrinho == 1 || carrinho == 2) {
      const g = findValueByKey(r, ["gaveta"]) || "";
      const f = findValueByKey(r, ["fileira"]) || "";
      const nf = findValueByKey(r, ["nº da fileira","n da fileira","nº fileira"]);
      localFormatted = `Carrinho ${carrinho} • Gaveta ${g} • Fileira ${f} • Nº ${nf}`;
    }
    // CARRINHO 3
    else if (carrinho == 3) {
      const g = findValueByKey(r, ["gaveta"]) || "";
      const nf = findValueByKey(r, ["nº da fileira","n da fileira","nº fileira"]);
      localFormatted = `Carrinho 3 • Gaveta ${g} • Nº ${nf}`;
    }
    // OUTROS LOCAIS
    else {
      localFormatted = findValueByKey(r, ["local","loc","armazen","location"]);
    }

    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div>
        <div class="nome">${escapeHtml(displayName)}</div>
        <div class="meta">${escapeHtml(localFormatted)} • Qtd: ${escapeHtml(String(qtd))}</div>
      </div>
    `;
    li.onclick = () => openDetalhes(local, r, i);

    ul.appendChild(li);
  });

  card.appendChild(ul);
  mainList.appendChild(card);
}

// ===============================
// MOSTRAR TODOS (GLOBAL)
// ===============================

function renderTodos(filtro = "") {
  localAtual = "_ALL";

  titleHeader.textContent = "Inventário — Todos os Itens";
  mainList.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<h3>Todos os Itens</h3>`;

  const ul = document.createElement("ul");
  ul.className = "lista";

  for (const local in dadosPlanilha) {
    dadosPlanilha[local].forEach((r, i) => {
      const texto = JSON.stringify(r).toLowerCase();
      if (filtro && !texto.includes(filtro.toLowerCase())) return;

      const displayName = guessDisplayName(r) || `Item ${i+1}`;
      const qtd = findValueByKey(r, ["quantidade","qtd","quant","qty"]);

      const li = document.createElement("li");
      li.className = "item";
      li.innerHTML = `
        <div>
          <div class="nome">${escapeHtml(displayName)}</div>
          <div class="meta">${escapeHtml(local)} • Qtd: ${escapeHtml(String(qtd))}</div>
        </div>
      `;

      li.onclick = () => openDetalhes(local, r, i);

      ul.appendChild(li);
    });
  }

  card.appendChild(ul);
  mainList.appendChild(card);
}

// ===============================
// BUSCA
// ===============================

searchInput.onkeyup = () => {
  const termo = searchInput.value.toLowerCase();

  // 🔎 MODO GLOBAL
  if (localAtual === "_ALL") {
    renderTodos(termo);
    return;
  }

  // 🔎 MODO NORMAL
  if (!localAtual || !dadosPlanilha[localAtual]) return;

  const lista = dadosPlanilha[localAtual];

  const filtrado = lista.filter(r =>
    JSON.stringify(r).toLowerCase().includes(termo)
  );

  mainList.innerHTML = "";

  let card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<h3>${localAtual} — Resultado da busca</h3>`;

  let ul = document.createElement("ul");
  ul.className = "lista";

  filtrado.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div>
        <div class="nome">${escapeHtml(guessDisplayName(r) || `Item ${i+1}`)}</div>
      </div>
    `;
    li.onclick = () => openDetalhes(localAtual, r, i);
    ul.appendChild(li);
  });

  card.appendChild(ul);
  mainList.appendChild(card);
};

// ===============================
// IMPORTAÇÃO .XLSX
// ===============================

document.getElementById("btnImport").onclick = () =>
  document.getElementById("fileInput").click();

document.getElementById("fileInput").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = evt => {
    const wb = XLSX.read(evt.target.result, { type: "binary" });

    dadosPlanilha = {};

    wb.SheetNames.forEach(sheetName => {
      const nomeLower = sheetName.trim().toLowerCase();

      if (ABAS_IGNORAR.includes(nomeLower)) return;

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

// ===============================
// LOCALSTORAGE
// ===============================

function salvarLocalStorage() {
  localStorage.setItem("inventario_usinagem", JSON.stringify(dadosPlanilha));
}

function carregarLocalStorage() {
  const salvo = localStorage.getItem("inventario_usinagem");
  if (salvo) {
    dadosPlanilha = JSON.parse(salvo);
    criarMenuLocais();
  }
}

document.getElementById("btnClear").onclick = () => {
  localStorage.removeItem("inventario_usinagem");
  location.reload();
};

// ===============================
// MODO CLARO / ESCURO
// ===============================

document.getElementById("btnToggleTheme").onclick = () => {
  document.body.classList.toggle("light-theme");

  const btn = document.getElementById("btnToggleTheme");
  if (document.body.classList.contains("light-theme")) {
    btn.textContent = "🌙 Modo Escuro";
  } else {
    btn.textContent = "☀️ Modo Claro";
  }
};

// ===============================
// INICIALIZAÇÃO
// ===============================
carregarLocalStorage();

