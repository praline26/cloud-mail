<template>
  <div class="batch-user-box">
    <div class="header-actions">
      <el-button type="primary" @click="openCreate">
        <Icon icon="ion:add-outline" width="18" height="18" />
        <span>{{ $t('batchCreate') }}</span>
      </el-button>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="getBatchList" />
    </div>

    <el-scrollbar class="scrollbar">
      <el-table
          :data="batchList"
          v-loading="listLoading"
          element-loading-background="transparent"
          style="width: 100%"
      >
        <el-table-column prop="name" :label="$t('batchName')" min-width="160" show-overflow-tooltip />
        <el-table-column :label="$t('emailPrefix')" min-width="140">
          <template #default="props">
            {{ props.row.prefix }}{{ numberPreview(props.row) }}{{ props.row.domain }}
          </template>
        </el-table-column>
        <el-table-column prop="count" :label="$t('batchCount')" width="90" />
        <el-table-column :label="$t('batchSuccess')" width="100">
          <template #default="props">
            <el-tag type="success" disable-transitions>{{ props.row.successCount }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('batchFailed')" width="100">
          <template #default="props">
            <el-tag :type="props.row.failCount ? 'danger' : 'info'" disable-transitions>{{ props.row.failCount }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('tabRole')" min-width="120">
          <template #default="props">
            {{ toRoleName(props.row.type) }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('date')" min-width="155">
          <template #default="props">
            {{ tzDayjs(props.row.createTime).format('YYYY-MM-DD HH:mm') }}
          </template>
        </el-table-column>
        <el-table-column :label="$t('action')" width="170">
          <template #default="props">
            <el-button size="small" type="primary" @click="openItems(props.row)">{{ $t('details') }}</el-button>
            <el-button size="small" type="danger" @click="deleteBatch(props.row)">{{ $t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination" v-if="total > params.size">
        <el-pagination
            background
            layout="prev, pager, next, sizes, total"
            :current-page="params.num"
            :page-size="params.size"
            :page-sizes="[10, 15, 20, 30, 50]"
            :total="total"
            @size-change="sizeChange"
            @current-change="numChange"
        />
      </div>
    </el-scrollbar>

    <el-dialog v-model="createShow" :title="$t('batchCreate')" class="create-dialog" @closed="resetCreateForm">
      <el-form class="create-form" label-position="top">
        <el-form-item :label="$t('batchName')">
          <el-input v-model="createForm.name" :placeholder="$t('optional')" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="$t('emailPrefix')">
            <el-input v-model="createForm.prefix" placeholder="user" />
          </el-form-item>
          <el-form-item :label="$t('domain')">
            <el-select v-model="createForm.domain" :placeholder="$t('select')">
              <el-option v-for="item in domainList" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item :label="$t('batchStartNo')">
            <el-input-number v-model="createForm.startNo" :min="0" :max="999999999" />
          </el-form-item>
          <el-form-item :label="$t('batchPadLength')">
            <el-input-number v-model="createForm.padLength" :min="0" :max="12" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item :label="$t('batchCount')">
            <el-input-number v-model="createForm.count" :min="1" :max="500" />
          </el-form-item>
          <el-form-item :label="$t('batchPasswordLength')">
            <el-input-number v-model="createForm.passwordLength" :min="6" :max="64" />
          </el-form-item>
        </div>
        <el-form-item :label="$t('perm')">
          <el-select v-model="createForm.type" :placeholder="$t('select')">
            <el-option v-for="item in roleList" :key="item.roleId" :label="item.name" :value="item.roleId" />
          </el-select>
        </el-form-item>
        <div class="preview">
          <div class="preview-title">{{ $t('batchPreview') }}</div>
          <div v-for="email in previewEmails" :key="email" class="preview-email">{{ email }}</div>
        </div>
        <el-button class="submit-btn" type="primary" :loading="createLoading" @click="createBatch">
          {{ $t('confirm') }}
        </el-button>
      </el-form>
    </el-dialog>

    <el-dialog v-model="itemsShow" :title="currentBatch.name || $t('batchDetails')" class="items-dialog">
      <div class="item-actions">
        <el-button type="primary" @click="copyAll" :disabled="successItems.length === 0">
          <Icon icon="solar:copy-outline" width="18" height="18" />
          <span>{{ $t('copyAll') }}</span>
        </el-button>
        <el-button type="primary" @click="exportXlsx" :disabled="successItems.length === 0">
          <Icon icon="vscode-icons:file-type-excel" width="18" height="18" />
          <span>{{ $t('exportXlsx') }}</span>
        </el-button>
      </div>
      <el-table
          :data="batchItems"
          v-loading="itemsLoading"
          element-loading-background="transparent"
          height="480"
      >
        <el-table-column prop="email" :label="$t('emailAccount')" min-width="210" show-overflow-tooltip />
        <el-table-column prop="password" :label="$t('password')" min-width="160" show-overflow-tooltip>
          <template #default="props">
            <span>{{ props.row.password || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="$t('tabStatus')" width="95">
          <template #default="props">
            <el-tag v-if="props.row.status === 0" type="success" disable-transitions>{{ $t('batchSuccess') }}</el-tag>
            <el-tag v-else type="danger" disable-transitions>{{ $t('batchFailed') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error" :label="$t('error')" min-width="180" show-overflow-tooltip />
        <el-table-column :label="$t('action')" width="95">
          <template #default="props">
            <el-button size="small" :disabled="props.row.status !== 0" @click="copyRow(props.row)">{{ $t('copy') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineOptions, onMounted, reactive, ref} from 'vue';
import {Icon} from '@iconify/vue';
import {roleSelectUse} from '@/request/role.js';
import {userBatchAdd, userBatchDelete, userBatchItems, userBatchList} from '@/request/user-batch.js';
import {useSettingStore} from '@/store/setting.js';
import {tzDayjs} from '@/utils/day.js';
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'user-batch'
})

const {t} = useI18n();
const settingStore = useSettingStore();
const domainList = computed(() => settingStore.domainList || []);
const batchList = ref([]);
const batchItems = ref([]);
const roleList = reactive([]);
const listLoading = ref(false);
const itemsLoading = ref(false);
const createLoading = ref(false);
const createShow = ref(false);
const itemsShow = ref(false);
const total = ref(0);
const currentBatch = ref({});
const params = reactive({
  num: 1,
  size: 10,
});
const createForm = reactive(defaultCreateForm());
const successItems = computed(() => batchItems.value.filter(item => item.status === 0));
const previewEmails = computed(() => {
  const count = Math.min(Number(createForm.count) || 0, 3);
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(buildEmail(Number(createForm.startNo) + i));
  }
  return list;
});

onMounted(() => {
  loadRoles();
  getBatchList();
});

function defaultCreateForm() {
  return {
    name: '',
    prefix: '',
    domain: '',
    startNo: 1,
    count: 10,
    padLength: 3,
    passwordLength: 12,
    type: null,
  };
}

function loadRoles() {
  roleSelectUse().then(list => {
    roleList.length = 0;
    roleList.push(...list);
    if (!createForm.type && list.length) {
      createForm.type = list[0].roleId;
    }
  });
}

function openCreate() {
  if (!createForm.domain && domainList.value.length) {
    createForm.domain = domainList.value[0];
  }
  createShow.value = true;
}

function resetCreateForm() {
  Object.assign(createForm, defaultCreateForm());
  if (domainList.value.length) createForm.domain = domainList.value[0];
  if (roleList.length) createForm.type = roleList[0].roleId;
}

function createBatch() {
  if (createLoading.value) return;
  if (!createForm.prefix) return showError(t('emptyEmailMsg'));
  if (!createForm.domain) return showError(t('notEmailMsg'));
  if (!createForm.type) return showError(t('emptyRole'));

  createLoading.value = true;
  userBatchAdd({...createForm}).then(data => {
    ElMessage({ message: t('batchCreated'), type: 'success', plain: true });
    createShow.value = false;
    currentBatch.value = {
      batchId: data.batchId,
      name: createForm.name || buildEmail(createForm.startNo),
      createTime: data.createTime,
    };
    batchItems.value = data.items;
    itemsShow.value = true;
    getBatchList(false);
  }).finally(() => {
    createLoading.value = false;
  });
}

function getBatchList(loading = true) {
  listLoading.value = loading;
  userBatchList(params).then(data => {
    batchList.value = data.list;
    total.value = data.total;
  }).finally(() => {
    listLoading.value = false;
  });
}

function openItems(batch) {
  currentBatch.value = batch;
  itemsShow.value = true;
  itemsLoading.value = true;
  userBatchItems(batch.batchId).then(data => {
    currentBatch.value = data.batch;
    batchItems.value = data.list;
  }).finally(() => {
    itemsLoading.value = false;
  });
}

function deleteBatch(batch) {
  ElMessageBox.confirm(t('delConfirm', {msg: batch.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userBatchDelete(batch.batchId).then(() => {
      ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true });
      getBatchList(false);
    });
  });
}

function sizeChange(size) {
  params.size = size;
  getBatchList();
}

function numChange(num) {
  params.num = num;
  getBatchList();
}

function buildEmail(no) {
  const domain = normalizeDomain(createForm.domain);
  return `${createForm.prefix}${String(no).padStart(Number(createForm.padLength) || 0, '0')}${domain}`;
}

function normalizeDomain(domain) {
  if (!domain) return '';
  return domain.startsWith('@') ? domain : `@${domain}`;
}

function numberPreview(batch) {
  return String(batch.startNo).padStart(batch.padLength || 0, '0');
}

function toRoleName(type) {
  const role = roleList.find(role => role.roleId === type);
  return role?.name || '';
}

function copyRow(row) {
  copyText(`${row.email}\t${row.password}`);
}

function copyAll() {
  copyText(successItems.value.map(item => `${item.email}\t${item.password}`).join('\n'));
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage({ message: t('copySuccessMsg'), type: 'success', plain: true });
  }).catch(() => {
    ElMessage({ message: t('copyFailMsg'), type: 'error', plain: true });
  });
}

function exportXlsx() {
  const headers = [t('emailAccount'), t('password'), t('batchName'), t('date')];
  const rows = successItems.value.map(item => [
    item.email,
    item.password,
    currentBatch.value.name || '',
    item.createTime || currentBatch.value.createTime || ''
  ]);
  const blob = buildXlsx([headers, ...rows]);
  downloadBlob(blob, `${currentBatch.value.name || 'user-batch'}.xlsx`);
}

function buildXlsx(rows) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Accounts" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': sheetXml(rows),
  };
  return new Blob([zip(files)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

function sheetXml(rows) {
  const data = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${colName(colIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`;
}

function colName(index) {
  let name = '';
  while (index > 0) {
    const mod = (index - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    index = Math.floor((index - mod) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
}

function zip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end]);
}

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, '_');
  a.click();
  URL.revokeObjectURL(url);
}

function showError(message) {
  ElMessage({message, type: 'error', plain: true});
}
</script>

<style lang="scss" scoped>
.batch-user-box {
  overflow: hidden;
  height: 100%;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 12px;
  align-items: center;
  box-shadow: var(--header-actions-border);

  .el-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .icon {
    cursor: pointer;
  }
}

.scrollbar {
  height: calc(100% - 50px);
}

.pagination {
  padding: 15px 25px 20px;
  display: flex;
  justify-content: flex-end;
}

:deep(.create-dialog) {
  width: 520px !important;

  @media (max-width: 560px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.items-dialog) {
  width: min(860px, calc(100% - 40px)) !important;
}

.create-form {
  display: grid;
  gap: 4px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
}

.preview {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--el-text-color-regular);
}

.preview-title {
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.preview-email {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.8;
}

.submit-btn {
  width: 100%;
}

.item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 12px;

  .el-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
}
</style>
