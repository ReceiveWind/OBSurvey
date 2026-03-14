<template>
  <div>
    <header class="hero">
      <div class="hero-content">
        <div class="hero-kicker">OBSurvey</div>
        <h1>多模态融合目标检测</h1>
        <p class="hero-subtitle">面向多模态融合目标检测的文献综述</p>
      </div>
    </header>

    <nav class="tabs" aria-label="Primary">
      <div class="tabs-inner page">
        <a href="#info">文献矩阵</a>
        <a href="#zotero">Zotero</a>
      </div>
    </nav>

    <main class="page">
      <section id="info" class="section">
        <div class="section-header">
          <div>
            <h2>文献矩阵</h2>
            <p class="muted">使用搜索框实时筛选表格内容。</p>
          </div>
          <label class="search">
            <span class="search-label">筛选</span>
            <input
              id="table-filter"
              v-model="query"
              type="search"
              placeholder="输入关键词..."
              aria-label="筛选表格"
            />
          </label>
        </div>

        <div class="column-controls">
          <button id="toggle-columns" type="button" class="column-toggle" @click.stop="toggleColumnPanel">
            列显示
          </button>
          <div
            id="column-panel"
            class="column-panel"
            :class="{ 'is-hidden': !columnPanelOpen }"
            aria-label="列显示选项"
            @click.stop
          >
            <label v-for="(col, idx) in header" :key="col" class="column-option">
              <input type="checkbox" v-model="columnVisibility[idx]" />
              <span>{{ col }}</span>
            </label>
          </div>
        </div>

        <div class="table-controls">
          <div class="pagination">
            <button id="prev-page" type="button" class="page-btn" :disabled="page <= 1" @click="prevPage">
              上一页
            </button>
            <span id="page-info" class="page-info">{{ pageInfo }}</span>
            <button
              id="next-page"
              type="button"
              class="page-btn"
              :disabled="page >= totalPages"
              @click="nextPage"
            >
              下一页
            </button>
          </div>
          <label class="page-size">
            <span>每页</span>
            <select id="page-size" v-model.number="pageSize">
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
            <span>条</span>
          </label>
        </div>

        <div class="table-wrap" role="region" aria-label="Survey table">
          <div id="table-status" class="table-status" role="status" aria-live="polite">
            {{ statusMessage }}
          </div>
          <table id="survey-table" :class="{ 'is-hidden': header.length === 0 }">
            <thead>
              <tr>
                <th
                  v-for="(col, idx) in header"
                  :key="col"
                  class="sortable"
                  :class="{ 'col-hidden': !columnVisibility[idx] }"
                  @click="toggleSort(idx)"
                >
                  <span>{{ col }}</span>
                  <span class="sort-indicator">{{ sortIndicator(idx) }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pagedRows" :key="row.id">
                <td
                  v-for="(val, idx) in row.values"
                  :key="idx"
                  :class="cellClass(idx)"
                >
                  <div v-if="idx === summaryIndex" class="summary-cell">
                    <div class="cell-summary" :class="{ 'is-expanded': isExpanded(row.id) }">
                      <template v-for="(seg, sidx) in highlightSegments(val)" :key="sidx">
                        <mark v-if="seg.match" class="highlight">{{ seg.text }}</mark>
                        <span v-else>{{ seg.text }}</span>
                      </template>
                    </div>
                    <button
                      v-if="val"
                      class="summary-toggle"
                      type="button"
                      @click="toggleSummary(row.id)"
                    >
                      {{ isExpanded(row.id) ? '收起' : '展开' }}
                    </button>
                  </div>
                  <div v-else class="cell-text">
                    <template v-for="(seg, sidx) in highlightSegments(val)" :key="sidx">
                      <mark v-if="seg.match" class="highlight">{{ seg.text }}</mark>
                      <span v-else>{{ seg.text }}</span>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="zotero" class="section">
        <div class="section-header">
          <div>
            <h2>Zotero</h2>
            <p class="muted">This section is reserved for your Zotero integration.</p>
          </div>
        </div>
        <div class="placeholder">
          <p>Zotero content will appear here once you decide the format.</p>
        </div>
      </section>
    </main>

    <footer class="footer">
      <p>OBSurvey - maintained on GitHub Pages.</p>
    </footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const csvFile = '文献矩阵.csv'
const hiddenDefaults = new Set([
  '摘要',
  '领域基础知识',
  '研究背景',
  '作者的问题意识',
  '研究意义',
  '研究结论',
  '未来研究方向提及',
  '未来研究方向思考',
  'extra',
])

const header = ref([])
const rows = ref([])
const query = ref('')
const sortIndex = ref(null)
const sortDir = ref('asc')
const page = ref(1)
const pageSize = ref(50)
const columnVisibility = ref([])
const columnPanelOpen = ref(false)
const expandedIds = ref(new Set())
const loading = ref(true)
const error = ref(false)

const summaryIndex = computed(() => header.value.indexOf('摘要'))

const normalizedQuery = computed(() => query.value.trim().toLowerCase())

const filteredRows = computed(() => {
  if (!normalizedQuery.value) return rows.value
  return rows.value.filter((row) => row.searchText.includes(normalizedQuery.value))
})

const sortedRows = computed(() => {
  if (sortIndex.value === null) return filteredRows.value
  const idx = sortIndex.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...filteredRows.value].sort((a, b) => compareValues(a.values[idx], b.values[idx]) * dir)
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  const end = start + pageSize.value
  return sortedRows.value.slice(start, end)
})

const statusMessage = computed(() => {
  if (loading.value) return '正在加载表格...'
  if (error.value) return '加载 CSV 失败，请检查文件是否存在。'
  if (rows.value.length === 0) return '未读取到任何数据。'
  if (normalizedQuery.value) {
    return `筛选后 ${filteredRows.value.length} / ${rows.value.length} 条记录。`
  }
  return `已加载 ${rows.value.length} 条记录。`
})

const pageInfo = computed(() => `第 ${page.value} / ${totalPages.value} 页`)

const compareValues = (a, b) => {
  const numA = parseFloat(String(a).replace(/,/g, ''))
  const numB = parseFloat(String(b).replace(/,/g, ''))
  const bothNumeric = !Number.isNaN(numA) && !Number.isNaN(numB)
  if (bothNumeric) return numA - numB
  return String(a).localeCompare(String(b), 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base',
  })
}

const parseCSV = (text) => {
  const rows = []
  let row = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1
      }
      row.push(current)
      rows.push(row)
      row = []
      current = ''
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (current.length || row.length) {
    row.push(current)
    rows.push(row)
  }

  return rows
}

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

const setDefaultSort = () => {
  const candidates = ['年份', 'Year', 'year']
  const index = candidates.map((name) => header.value.indexOf(name)).find((idx) => idx !== -1)
  if (index !== undefined && index !== -1) {
    sortIndex.value = index
    sortDir.value = 'desc'
  }
}

const loadCSV = async () => {
  loading.value = true
  error.value = false
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${csvFile}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    const data = parseCSV(text.trim())
    if (data.length === 0) {
      header.value = []
      rows.value = []
      loading.value = false
      return
    }

    let headerRow = data[0].map((h) => normalizeText(h))
    if (headerRow[0] && headerRow[0].charCodeAt(0) === 0xfeff) {
      headerRow[0] = headerRow[0].replace(/^\ufeff/, '')
    }

    header.value = headerRow
    columnVisibility.value = headerRow.map((name) => !hiddenDefaults.has(name))

    rows.value = data.slice(1).map((row, idx) => {
      const values = headerRow.map((_, i) => normalizeText(row[i] ?? ''))
      return {
        id: idx,
        values,
        searchText: values.join(' ').toLowerCase(),
      }
    })

    setDefaultSort()
  } catch (err) {
    error.value = true
  } finally {
    loading.value = false
  }
}

const toggleSort = (idx) => {
  if (sortIndex.value === idx) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortIndex.value = idx
    sortDir.value = 'asc'
  }
}

const sortIndicator = (idx) => {
  if (sortIndex.value !== idx) return ''
  return sortDir.value === 'asc' ? '▲' : '▼'
}

const cellClass = (idx) => ({
  'col-hidden': !columnVisibility.value[idx],
  'summary-col': idx === summaryIndex.value,
})

const toggleSummary = (id) => {
  const next = new Set(expandedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedIds.value = next
}

const isExpanded = (id) => expandedIds.value.has(id)

const highlightSegments = (text) => {
  const raw = String(text ?? '')
  if (!normalizedQuery.value) return [{ text: raw, match: false }]
  const lower = raw.toLowerCase()
  const q = normalizedQuery.value
  const segments = []
  let start = 0
  let index = lower.indexOf(q, start)

  if (index === -1) return [{ text: raw, match: false }]

  while (index !== -1) {
    if (index > start) {
      segments.push({ text: raw.slice(start, index), match: false })
    }
    segments.push({ text: raw.slice(index, index + q.length), match: true })
    start = index + q.length
    index = lower.indexOf(q, start)
  }

  if (start < raw.length) {
    segments.push({ text: raw.slice(start), match: false })
  }

  return segments
}

const toggleColumnPanel = () => {
  columnPanelOpen.value = !columnPanelOpen.value
}

const closeColumnPanel = () => {
  columnPanelOpen.value = false
}

const handleGlobalClick = () => {
  if (columnPanelOpen.value) closeColumnPanel()
}

const prevPage = () => {
  if (page.value > 1) page.value -= 1
}

const nextPage = () => {
  if (page.value < totalPages.value) page.value += 1
}

watch([normalizedQuery, pageSize], () => {
  page.value = 1
})

watch(totalPages, () => {
  if (page.value > totalPages.value) page.value = totalPages.value
})

onMounted(() => {
  loadCSV()
  window.addEventListener('click', handleGlobalClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick)
})
</script>
