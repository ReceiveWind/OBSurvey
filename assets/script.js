const CSV_FILE = '文献矩阵.csv';

const filterInput = document.getElementById('table-filter');
const table = document.getElementById('survey-table');
const thead = table ? table.querySelector('thead') : null;
const tbody = table ? table.querySelector('tbody') : null;
const statusEl = document.getElementById('table-status');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const pageSizeSelect = document.getElementById('page-size');
const columnToggle = document.getElementById('toggle-columns');
const columnPanel = document.getElementById('column-panel');

const hiddenDefaults = new Set([
  '摘要',
  '领域基础知识',
  '研究背景',
  '作者的问题意识',
  '研究意义',
  '研究结论',
  '未来研究方向提及',
  '未来研究方向思考',
  'extra'
]);

const TEXT = {
  loading: '正在加载表格...',
  empty: '未读取到任何数据。',
  error: '加载 CSV 失败，请检查文件是否存在。',
  loaded: (total) => '已加载 ' + total + ' 条记录。',
  filtered: (filtered, total) => '筛选后 ' + filtered + ' / ' + total + ' 条记录。',
  pageInfo: (page, totalPages) => '第 ' + page + ' / ' + totalPages + ' 页',
  expand: '展开',
  collapse: '收起',
};

const state = {
  header: [],
  rows: [],
  filtered: [],
  sortIndex: null,
  sortDir: 'asc',
  page: 1,
  pageSize: pageSizeSelect ? parseInt(pageSizeSelect.value, 10) : 50,
  columnVisibility: [],
  query: '',
};

const setStatus = (message, isError = false) => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '';
};

const normalizeText = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const parseCSV = (text) => {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
};

const createHighlightedNode = (text, query) => {
  const fragment = document.createDocumentFragment();
  if (!query) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let start = 0;
  let index = lower.indexOf(q, start);

  if (index === -1) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  while (index !== -1) {
    if (index > start) {
      fragment.appendChild(document.createTextNode(text.slice(start, index)));
    }
    const mark = document.createElement('mark');
    mark.className = 'highlight';
    mark.textContent = text.slice(index, index + q.length);
    fragment.appendChild(mark);
    start = index + q.length;
    index = lower.indexOf(q, start);
  }

  if (start < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(start)));
  }

  return fragment;
};

const buildHeader = () => {
  if (!thead) return;
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  state.header.forEach((header, index) => {
    const th = document.createElement('th');
    th.classList.add('sortable');
    th.dataset.index = index.toString();
    const label = document.createElement('span');
    label.textContent = header;
    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    th.appendChild(label);
    th.appendChild(indicator);
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  updateSortIndicators();
  applyColumnVisibility();
};

const updateSortIndicators = () => {
  if (!thead) return;
  const headers = Array.from(thead.querySelectorAll('th.sortable'));
  headers.forEach((th, index) => {
    const indicator = th.querySelector('.sort-indicator');
    if (!indicator) return;
    if (index === state.sortIndex) {
      indicator.textContent = state.sortDir === 'asc' ? '?' : '?';
    } else {
      indicator.textContent = '';
    }
  });
};

const compareValues = (a, b) => {
  const numA = parseFloat(String(a).replace(/,/g, ''));
  const numB = parseFloat(String(b).replace(/,/g, ''));
  const bothNumeric = !Number.isNaN(numA) && !Number.isNaN(numB);
  if (bothNumeric) return numA - numB;
  return String(a).localeCompare(String(b), 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base',
  });
};

const applySort = () => {
  if (state.sortIndex === null) return;
  const idx = state.sortIndex;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  state.filtered.sort((rowA, rowB) => {
    const a = rowA.values[idx] ?? '';
    const b = rowB.values[idx] ?? '';
    return compareValues(a, b) * dir;
  });
};

const updatePagination = () => {
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  if (pageInfo) {
    pageInfo.textContent = TEXT.pageInfo(state.page, totalPages);
  }
  if (prevBtn) prevBtn.disabled = state.page <= 1;
  if (nextBtn) nextBtn.disabled = state.page >= totalPages;
};

const applyColumnVisibility = () => {
  if (!thead) return;
  const headers = Array.from(thead.querySelectorAll('th.sortable'));
  headers.forEach((th, index) => {
    if (!state.columnVisibility[index]) {
      th.classList.add('col-hidden');
    } else {
      th.classList.remove('col-hidden');
    }
  });
};

const renderRows = () => {
  if (!tbody) return;
  const start = (state.page - 1) * state.pageSize;
  const end = start + state.pageSize;
  const rows = state.filtered.slice(start, end);
  const summaryIndex = state.header.indexOf('摘要');
  const query = state.query;

  tbody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.values.forEach((value, idx) => {
      const td = document.createElement('td');
      if (!state.columnVisibility[idx]) {
        td.classList.add('col-hidden');
      }

      if (idx === summaryIndex) {
        td.classList.add('summary-col');
        const wrapper = document.createElement('div');
        wrapper.className = 'summary-cell';
        const summary = document.createElement('div');
        summary.className = 'cell-summary is-collapsed';
        summary.appendChild(createHighlightedNode(value, query));
        wrapper.appendChild(summary);
        if (value) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'summary-toggle';
          button.textContent = TEXT.expand;
          wrapper.appendChild(button);
        }
        td.appendChild(wrapper);
      } else {
        const cellText = document.createElement('div');
        cellText.className = 'cell-text';
        cellText.appendChild(createHighlightedNode(value, query));
        td.appendChild(cellText);
      }
      tr.appendChild(td);
    });
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);

  if (statusEl) {
    const total = state.rows.length;
    const filtered = state.filtered.length;
    const message = filtered === total
      ? TEXT.loaded(total)
      : TEXT.filtered(filtered, total);
    setStatus(message);
  }
};

const renderTable = () => {
  updatePagination();
  renderRows();
  applyColumnVisibility();
  if (table) table.classList.remove('is-hidden');
};

const applyFilter = () => {
  const query = filterInput ? filterInput.value.trim().toLowerCase() : '';
  state.query = query;
  if (!query) {
    state.filtered = [...state.rows];
  } else {
    state.filtered = state.rows.filter((row) => row.searchText.includes(query));
  }
  if (state.sortIndex !== null) applySort();
  state.page = 1;
  renderTable();
};

const buildColumnPanel = () => {
  if (!columnPanel) return;
  columnPanel.innerHTML = '';
  state.header.forEach((header, index) => {
    const option = document.createElement('label');
    option.className = 'column-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!state.columnVisibility[index];
    checkbox.dataset.index = index.toString();
    const text = document.createElement('span');
    text.textContent = header;
    option.appendChild(checkbox);
    option.appendChild(text);
    columnPanel.appendChild(option);
  });

  columnPanel.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || input.tagName !== 'INPUT') return;
    const index = Number(input.dataset.index);
    if (Number.isNaN(index)) return;
    state.columnVisibility[index] = input.checked;
    renderTable();
  });
};

const setupEvents = () => {
  if (filterInput) {
    filterInput.addEventListener('input', applyFilter);
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      const value = parseInt(pageSizeSelect.value, 10);
      state.pageSize = Number.isNaN(value) ? 50 : value;
      state.page = 1;
      renderTable();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });
  }

  if (thead) {
    thead.addEventListener('click', (event) => {
      const th = event.target.closest('th.sortable');
      if (!th) return;
      const index = Number(th.dataset.index);
      if (Number.isNaN(index)) return;
      if (state.sortIndex === index) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortIndex = index;
        state.sortDir = 'asc';
      }
      applySort();
      updateSortIndicators();
      renderTable();
    });
  }

  if (tbody) {
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('.summary-toggle');
      if (!button) return;
      const cell = button.closest('.summary-cell');
      const summary = cell ? cell.querySelector('.cell-summary') : null;
      if (!summary) return;
      const expanded = summary.classList.toggle('is-expanded');
      summary.classList.toggle('is-collapsed', !expanded);
      button.textContent = expanded ? TEXT.collapse : TEXT.expand;
    });
  }

  if (columnToggle && columnPanel) {
    columnToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      columnPanel.classList.toggle('is-hidden');
    });

    columnPanel.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', () => {
      columnPanel.classList.add('is-hidden');
    });
  }
};

const setDefaultSort = () => {
  const candidates = ['年份', 'Year', 'year'];
  const index = candidates
    .map((name) => state.header.indexOf(name))
    .find((idx) => idx !== -1);
  if (index !== undefined && index !== -1) {
    state.sortIndex = index;
    state.sortDir = 'desc';
  }
};

const loadCSV = async () => {
  if (!table || !thead || !tbody) return;

  try {
    setStatus(TEXT.loading);
    const response = await fetch(encodeURI(CSV_FILE));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const rows = parseCSV(text.trim());
    if (rows.length === 0) {
      setStatus(TEXT.empty, true);
      return;
    }

    let headerRow = rows[0].map((h) => normalizeText(h));
    if (headerRow[0] && headerRow[0].charCodeAt(0) === 0xfeff) {
      headerRow[0] = headerRow[0].replace(/^\ufeff/, '');
    }

    const dataRows = rows.slice(1);
    state.header = headerRow;
    state.columnVisibility = headerRow.map((name) => !hiddenDefaults.has(name));
    state.rows = dataRows.map((row) => {
      const values = headerRow.map((_, idx) => normalizeText(row[idx] ?? ''));
      const searchText = values.join(' ').toLowerCase();
      return { values, searchText };
    });
    state.filtered = [...state.rows];

    setDefaultSort();
    buildHeader();
    buildColumnPanel();
    applySort();
    renderTable();
    setupEvents();
  } catch (error) {
    setStatus(TEXT.error, true);
  }
};

loadCSV();
