<template>
  <view class="home">
    <!-- 头部 -->
    <view class="header">
      <view class="header-left">
        <view class="logo">
          <view class="logo-icon"><text class="logo-text">Dx</text></view>
          <text class="logo-name">豆医</text>
        </view>
        <text class="header-desc">基于大量数据训练用户画像和流量预测模型</text>
      </view>
      <view class="header-right">
        <button class="header-btn" @click="goToWhitepaper">白皮书</button>
        <button class="header-btn" @click="goToHistory">
          <text class="header-btn-text">历史</text>
        </button>
      </view>
    </view>

    <!-- 主内容区 -->
    <view class="main">
      <view class="main-container">
        <!-- 左侧：上传区 -->
        <view class="upload-section">
          <view class="section-header">
            <view>
              <text class="section-title">上传笔记素材</text>
            <text class="section-subtitle">把豆音截图拖进来，AI 自动识别标题、正文、分类</text>
            </view>
            <view v-if="files.length > 0" class="file-count">
              <text class="file-count-text">{{ files.length }}/9</text>
            </view>
          </view>

          <view v-if="apiReachable === false" class="api-warning">
            <text class="api-warning-text">
              无法连接本机诊断 API（/api/health）。请启动后端，并确认 Vite 代理端口与之一致（默认 8000，可在 frontend/.env 设置 VITE_API_PROXY_TARGET）。
            </text>
          </view>

          <!-- 上传区域 -->
          <view class="upload-zone">
            <view 
              class="upload-area" 
              :class="{ 'is-dragging': isDragging, 'has-error': error }"
              @dragover.prevent="handleDragOver"
              @dragleave="handleDragLeave"
              @drop.prevent="handleDrop"
              @click="triggerFileInput"
            >
              <input 
                ref="fileInput" 
                type="file" 
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                multiple 
                style="display: none"
                @change="handleFileChange"
              />
              
              <template v-if="files.length > 0">
                <view class="file-grid">
                  <view v-for="(file, index) in files" :key="fileKey(file)" class="file-item">
                    <view class="file-preview">
                      <image 
                        v-if="isImage(file) && previews[fileKey(file)]" 
                        :src="previews[fileKey(file)]" 
                        mode="aspectFill"
                      />
                      <view v-else-if="isVideo(file) && previews[fileKey(file)]" class="video-preview">
                        <image :src="previews[fileKey(file)]" mode="aspectFill" />
                        <view class="video-icon">
                          <text>▶</text>
                        </view>
                      </view>
                      <view v-else-if="isVideo(file)" class="video-placeholder">
                        <text class="placeholder-text">加载中</text>
                      </view>
                      <view v-else class="image-placeholder">
                        <text class="placeholder-text">加载中</text>
                      </view>
                    </view>
                    <view class="file-remove" @click.stop="removeFile(index)">
                      <text>×</text>
                    </view>
                  </view>
                  <view v-if="files.length < maxFiles" class="add-file" @click="triggerFileInput">
                    <view class="add-icon">
                      <text>+</text>
                    </view>
                    <text class="add-text">{{ files.length }}/{{ maxFiles }}</text>
                  </view>
                </view>
              </template>
              
              <template v-else>
                <view class="empty-state">
                  <view class="empty-icon">
                    <text>↑</text>
                  </view>
                  <view class="empty-text">
                    <text class="empty-title">拖入截图开始诊断</text>
                    <text class="empty-subtitle">支持拖拽 · 点击 · Ctrl+V 粘贴</text>
                    <text class="empty-hint">图片最多 {{ maxFiles }} 张 · 视频 1 个</text>
                  </view>
                </view>
              </template>
            </view>
            
            <text v-if="error" class="error-text">{{ error }}</text>
          </view>

          <!-- 识别状态 -->
          <view v-if="files.length > 0" class="slot-chips">
            <view 
              v-for="(label, slot) in slotLabelMap" 
              :key="slot"
              class="chip"
              :class="{ 'chip-success': recognizedSlots.has(slot) }"
            >
              <text class="chip-text">{{ label }}</text>
            </view>
          </view>

          <!-- 分析进度 -->
          <view v-if="(anyLoading || pendingRecognition) && files.length > 0" class="analysis-progress">
            <view class="progress-header">
              <text class="progress-text">{{ analysisMessage }}</text>
              <text class="progress-count">{{ Object.keys(aiRecogs).length }}/{{ Math.max(recognizeFileKeys.size, 1) }}</text>
            </view>
            <view class="progress-bar">
              <view class="progress-fill" :style="{ width: `${smoothProgress}%` }"></view>
            </view>
          </view>

          <!-- 完成提示 -->
          <view v-if="isReady && files.length > 0 && hasRecogSuccess" class="ready提示">
            <text class="ready-icon">✓</text>
            <text class="ready-text">分析完成，可以开始诊断</text>
          </view>

          <!-- 失败提示 -->
          <view v-if="allFailed" class="error提示">
            <text class="error提示-text">
              {{ firstRecognizeError ? `识别失败：${firstRecognizeError}` : '识别失败，请检查网络或手动输入' }}
            </text>
          </view>
        </view>

        <!-- 右侧：表单区 -->
        <view class="form-section">
          <text class="section-title">笔记信息</text>

          <!-- 视频提示 -->
          <view v-if="videoWithoutImage && allRecognitionDone && !allFailed" class="video-hint">
            <text class="video-hint-text">
              仅上传视频时，笔记标题一般在发布页或信息流封面，很少出现在画面里。请再传一张含标题或封面大字的截图，系统会从截图填标题；视频里的步骤与画面说明会写在正文。
            </text>
          </view>

          <!-- 加载提示 -->
          <view v-if="isFormBlocked" class="loading提示">
            <view class="loading-spinner"></view>
            <text class="loading-text">AI 识别中，完成后自动填入</text>
          </view>

          <!-- 表单 -->
          <view class="form" :class="{ 'form-blocked': isFormBlocked }">
            <!-- 标题 -->
            <view class="form-item">
              <view class="form-label">
                <text class="label-text">标题</text>
                <text v-if="autoFilled.title" class="label-tag">AI 识别</text>
              </view>
              <input 
                class="form-input" 
                v-model="title" 
                placeholder="笔记标题"
                :disabled="lockInputs"
                maxlength="100"
                @input="handleTitleInput"
              />
              <text v-if="showWarnings && warnings.title && !title.trim() && !userEdited.title" class="form-warning">
                请手动输入标题
              </text>
            </view>

            <!-- 正文 -->
            <view class="form-item">
              <view class="form-label">
                <text class="label-text">正文</text>
                <text v-if="autoFilled.content" class="label-tag">AI 识别</text>
              </view>
              <textarea 
                class="form-textarea" 
                v-model="content" 
                placeholder="笔记正文（可选）"
                :disabled="lockInputs"
                @input="handleContentInput"
              ></textarea>
            </view>

            <!-- 分类 -->
            <view class="form-item">
              <view class="form-label">
                <text class="label-text">垂类</text>
                <text v-if="autoFilled.category" class="label-tag">AI 已识别</text>
              </view>
              <view class="category-picker">
                <view 
                  v-for="(label, value) in categories" 
                  :key="value"
                  class="category-item"
                  :class="{ 'category-item-active': category === value }"
                  @click="handleCategoryChange(value)"
                >
                  <text class="category-text">{{ label }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 桌面端按钮 -->
          <view class="desktop-cta">
            <button 
              class="cta-btn" 
              :class="{ 'cta-btn-disabled': !canSubmit }"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              开始诊断
            </button>
            <text v-if="files.length > 0 && allRecognitionDone && !hasDetailScreenshot" class="cta-hint">
              建议补充详情页截图
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 移动端固定按钮 -->
    <view class="mobile-cta">
      <button 
        class="cta-btn mobile-cta-btn" 
        :class="{ 'cta-btn-disabled': !canSubmit }"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        开始诊断
      </button>
      <text v-if="submitError" class="submit-error">{{ submitError }}</text>
    </view>

    <!-- 底部 -->
    <view class="footer">
      <text class="footer-link">服务条款</text>
      <text class="footer-separator">|</text>
      <text class="footer-link">隐私政策</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { diagnoseNote } from '@/api/diagnose.js';
// 状态管理
const files = ref<File[]>([]);
const title = ref('');
const content = ref('');
const category = ref('food');
const isDragging = ref(false);
const error = ref('');
const previews = ref<Record<string, string>>({});
const videoPosterFailed = ref<Record<string, boolean>>({});
const aiRecogs = ref<Record<string, any>>({});
const aiLoading = ref<Record<string, boolean>>({});
const uploadingPulse = ref(false);
const analyzingPulse = ref(false);
const userEdited = ref({ title: false, content: false, category: false });
const apiReachable = ref<boolean | null>(null);
const setApiReachable = (reachable: boolean) => {
  apiReachable.value = reachable;
  console.log('API 可达性:', reachable);
};
const submitError = ref('');
const leaving = ref(false);
const fileInput = ref<HTMLInputElement>();

// 常量
const maxFiles = 9;
const QUICK_RECOGNIZE_CONCURRENCY = 10;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_IMAGE = 10 * 1024 * 1024;
const VIDEO_MAX_MB = 300;
const MAX_VIDEO = VIDEO_MAX_MB * 1024 * 1024;

// 分析消息
const ANALYSIS_MESSAGES = [
  '正在全面分析笔记内容...',
  '正在调用市场流量预测模型...',
  '正在识别封面视觉元素...',
  '正在提取标题和正文...',
  '正在比对同类笔记数据...',
  '正在评估互动潜力...',
];

// 分类映射
const categories = {
  food: '美食',
  fashion: '穿搭',
  tech: '科技',
  travel: '旅行',
  beauty: '美妆',
  fitness: '健身',
  lifestyle: '生活',
  home: '家居'
};

// 分类映射（用于 AI 识别结果）
const CAT_MAP: Record<string, string> = {
  '美食': 'food', '食谱': 'food', '做饭': 'food', '烘焙': 'food',
  '穿搭': 'fashion', '时尚': 'fashion', '服装': 'fashion', 'outfit': 'fashion',
  '科技': 'tech', '数码': 'tech', '手机': 'tech', '电脑': 'tech',
  '旅行': 'travel', '旅游': 'travel', '景点': 'travel',
  '美妆': 'beauty', '护肤': 'beauty', '化妆': 'beauty',
  '健身': 'fitness', '运动': 'fitness', '减肥': 'fitness',
  '生活': 'lifestyle', '日常': 'lifestyle', 'vlog': 'lifestyle',
  '家居': 'home', '装修': 'home', '家装': 'home',
  'food': 'food', 'fashion': 'fashion', 'tech': 'tech', 'travel': 'travel',
  'beauty': 'beauty', 'fitness': 'fitness', 'lifestyle': 'lifestyle', 'home': 'home',
};

// 槽位标签映射
const slotLabelMap = {
  content: '详情',
  cover: '封面',
  profile: '主页',
  comments: '评论区',
};

// 计算属性
const anyLoading = computed(() => Object.values(aiLoading.value).some(Boolean));
const successRecogEntries = computed(() => 
  Object.entries(aiRecogs.value).filter(([, r]) => r.success)
);
const successResults = computed(() => 
  successRecogEntries.value.map(([, r]) => r)
);

const aggregated = computed(() => {
  let bestTitle = '';
  const contentParts: string[] = [];
  let bestCategory = '';
  let bestSummary = '';
  let engLikes = 0, engCollects = 0, engComments = 0;

  // Pass 1: content 类型 — 标题取第一个, 正文全部合并
  for (const [, r] of successRecogEntries.value) {
    if ((r.slot_type || '').toLowerCase() === 'content') {
      if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
      if (r.content_text?.trim()) contentParts.push(r.content_text.trim());
    }
    if (!bestCategory && r.category?.trim()) bestCategory = r.category.trim();
    if (!bestSummary && r.summary?.trim()) bestSummary = r.summary.trim();
    // 提取互动数据（取最大值）
    const eng = r.engagement_signal;
    if (eng) {
      engLikes = Math.max(engLikes, eng.likes_visible || 0);
      engCollects = Math.max(engCollects, eng.collects_visible || 0);
      engComments = Math.max(engComments, eng.comments_visible || 0);
    }
  }

  // Pass 2: fallback — 非 content 类型补充
  if (!bestTitle) {
    for (const [, r] of successRecogEntries.value) {
      if (!bestTitle && r.title?.trim()) bestTitle = r.title.trim();
    }
  }
  if (contentParts.length === 0) {
    for (const [, r] of successRecogEntries.value) {
      if (r.content_text?.trim()) contentParts.push(r.content_text.trim());
    }
  }

  // 合并正文（去重：如果两段内容有50%以上重叠就跳过）
  const mergedParts: string[] = [];
  for (const part of contentParts) {
    const isDuplicate = mergedParts.some((existing) => {
      const shorter = part.length < existing.length ? part : existing;
      return existing.includes(shorter.slice(0, 30)) || part.includes(existing.slice(0, 30));
    });
    if (!isDuplicate) mergedParts.push(part);
  }
  let bestContent = mergedParts.join('\n');

  // 仅视频时 summary 多为画面概括，不能冒充笔记标题
  const videoOnlySuccess = 
    successRecogEntries.value.length > 0 &&
    successRecogEntries.value.every(([, r]) => r.success && r.media_source === 'video');

  if (!bestTitle && bestSummary && !videoOnlySuccess) {
    const s = bestSummary.replace(/\s+/g, ' ').trim();
    if (s) {
      const firstPhrase = (s.split(/[。！？\n]/)[0] || s).trim();
      bestTitle = (firstPhrase || s).slice(0, 100);
    }
  }
  if (!bestContent.trim() && bestSummary.trim()) {
    bestContent = bestSummary.trim();
  }

  return {
    bestTitle, bestContent, bestCategory, bestSummary,
    engagementData: { likes: engLikes, collects: engCollects, comments: engComments },
  };
});

const imageFileKeys = computed(() => 
  new Set(files.value.filter((f) => f.type.startsWith('image/')).map(fileKey))
);

const videoFileKeys = computed(() => 
  new Set(files.value.filter((f) => f.type.startsWith('video/')).map(fileKey))
);

const recognizeFileKeys = computed(() => {
  const s = new Set<string>();
  imageFileKeys.value.forEach((k) => s.add(k));
  videoFileKeys.value.forEach((k) => s.add(k));
  return s;
});

const pendingRecognition = computed(() => {
  if (recognizeFileKeys.value.size === 0) return false;
  for (const key of recognizeFileKeys.value) {
    if (aiLoading.value[key] || !aiRecogs.value[key]) return true;
  }
  return false;
});

const allRecognitionDone = computed(() => {
  if (recognizeFileKeys.value.size === 0) return true;
  for (const k of recognizeFileKeys.value) {
    if (!aiRecogs.value[k] && !aiLoading.value[k]) return false;
    if (aiLoading.value[k]) return false;
  }
  return true;
});

const allFailed = computed(() => 
  allRecognitionDone.value && successResults.value.length === 0 && Object.keys(aiRecogs.value).length > 0
);

const firstRecognizeError = computed(() => {
  for (const r of Object.values(aiRecogs.value)) {
    if (!r.success && r.error?.trim()) return r.error.trim();
  }
  return null;
});

const showWarnings = computed(() => 
  allRecognitionDone.value && files.value.length > 0 && !allFailed.value
);

const warnings = computed(() => {
  if (!showWarnings.value) return { title: false, content: false, category: false };
  const { bestTitle, bestContent, bestCategory, bestSummary } = aggregated.value;
  return {
    title: !bestTitle && !bestSummary,
    content: !bestContent,
    category: !bestCategory,
  };
});

const autoFilled = computed(() => {
  const { bestTitle, bestContent, bestCategory } = aggregated.value;
  return {
    title: !userEdited.value.title && !!bestTitle,
    content: !userEdited.value.content && !!bestContent,
    category: !userEdited.value.category && !!bestCategory && !!CAT_MAP[bestCategory],
  };
});

const videoWithoutImage = computed(() => 
  videoFileKeys.value.size > 0 && imageFileKeys.value.size === 0
);

const recognizedSlots = computed(() => 
  new Set(
    successRecogEntries.value
      .map(([, r]) => (typeof r.slot_type === 'string' ? r.slot_type.toLowerCase() : ''))
      .filter(Boolean)
  )
);

const hasDetailScreenshot = computed(() => recognizedSlots.value.has('content'));

const canSubmit = computed(() => 
  files.value.length > 0 && title.value.trim().length > 0 && !lockInputs.value && !isFormBlocked.value
);

const isReady = computed(() => files.value.length > 0 && allRecognitionDone.value);
const hasRecogSuccess = computed(() => successResults.value.length > 0);
const lockInputs = computed(() => !!processingStatus.value && processingStatus.value.label !== '已就绪');
const isFormBlocked = computed(() => files.value.length > 0 && !allRecognitionDone.value);

const processingStatus = computed(() => {
  if (files.value.length === 0) return null;
  if (uploadingPulse.value) {
    return { label: '上传中', tone: 'info' as const, text: '素材已接收，正在准备识别...' };
  }
  if (pendingRecognition.value) {
    const videoPending = [...videoFileKeys.value].some((k) => aiLoading.value[k] || !aiRecogs.value[k]);
    const imagePending = [...imageFileKeys.value].some((k) => aiLoading.value[k] || !aiRecogs.value[k]);
    if (videoPending && !imagePending && imageFileKeys.value.size === 0) {
      return { label: '识别中', tone: 'info' as const, text: 'AI 正在识别视频内容（含画面与字幕），请稍候...' };
    }
    return { label: '识别中', tone: 'info' as const, text: 'AI 正在自动识别图片与视频...' };
  }
  if (analyzingPulse.value) {
    return { label: '分析中', tone: 'info' as const, text: '正在汇总识别结果并回填表单...' };
  }
  if (allRecognitionDone.value) {
    return { label: '已就绪', tone: 'success' as const, text: '识别完成，可以继续发起诊断。' };
  }
  return null;
});

// 平滑进度条
const smoothProgress = ref(0);
const realProgress = computed(() => {
  if (recognizeFileKeys.value.size === 0) return 0;
  return (Object.keys(aiRecogs.value).length / recognizeFileKeys.value.size) * 100;
});

// 分析消息轮播
const analysisMessageIndex = ref(0);
const analysisMessage = computed(() => ANALYSIS_MESSAGES[analysisMessageIndex.value]);

// 方法
const fileKey = (f: File) => `${f.name}_${f.size}_${f.lastModified}`;

const formatSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isImage = (file: File) => IMAGE_TYPES.includes(file.type);
const isVideo = (file: File) => VIDEO_TYPES.includes(file.type);
// 辅助判断：通过文件扩展名识别类型（小程序环境下 file.type 可能为空）
const isImageFileByExt = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
const isVideoFileByExt = (name: string) => /\.(mp4|mov|m4v|webm)$/i.test(name);

const triggerFileInput = () => {
  // #ifdef MP-TOUTIAO
  // 豆音小程序环境：使用 uni.chooseMedia
  uni.chooseMedia({
    count: maxFiles - files.value.length,
    mediaType: ['image', 'video'],
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempFiles = res.tempFiles.map((tf) => {
        // 将 uni 返回的临时文件对象转换为类似 File 的对象
        return {
          name: tf.name || `temp_${Date.now()}.${tf.tempFilePath.split('.').pop()}`,
          type: tf.fileType === 'video' ? 'video/mp4' : 'image/jpeg',
          size: tf.size,
          path: tf.tempFilePath,
          // 小程序中实际上没有 File 对象，这里保存临时路径供后续使用
        } as unknown as File;
      });
      validateAndAdd(tempFiles);
    },
    fail: (err) => {
      console.error('chooseMedia fail', err);
      error.value = '选择文件失败，请重试';
    }
  });
  // #endif

  // #ifndef MP-TOUTIAO
  // Web 环境：保留原有逻辑
  fileInput.value?.click();
  // #endif
};

const handleDragOver = () => {
  isDragging.value = true;
};

const handleDragLeave = () => {
  isDragging.value = false;
};

const handleDrop = (e: DragEvent) => {
  isDragging.value = false;
  if (e.dataTransfer?.files) {
    validateAndAdd(Array.from(e.dataTransfer.files));
  }
};

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files) {
    validateAndAdd(Array.from(target.files));
    target.value = '';
  }
};

const validateAndAdd = (incoming: File[]) => {
  error.value = '';
  const valid: File[] = [];
  for (const f of incoming) {
    const isVideoFile = isVideo(f);
    const isImageFile = isImage(f);
    if (!isImageFile && !isVideoFile) {
      error.value = '仅支持图片（JPG/PNG/WebP）或视频（MP4/MOV/WebM）';
      continue;
    }
    if (isImageFile && f.size > MAX_IMAGE) {
      error.value = `图片过大（${formatSize(f.size)}），最大 10MB`;
      continue;
    }
    if (isVideoFile && f.size > MAX_VIDEO) {
      error.value = `视频过大（${formatSize(f.size)}），最大 ${VIDEO_MAX_MB}MB`;
      continue;
    }
    if (isVideoFile && files.value.some((ex) => isVideo(ex))) {
      error.value = '仅支持上传一个视频';
      continue;
    }
    valid.push(f);
  }
  if (valid.length === 0) return;
  const merged = [...files.value, ...valid].slice(0, maxFiles);
  files.value = merged;
  triggerUploadPulse();
};

const triggerUploadPulse = () => {
  uploadingPulse.value = true;
  setTimeout(() => {
    uploadingPulse.value = false;
  }, 500);
};

const removeFile = (idx: number) => {
  const next = files.value.filter((_, i) => i !== idx);
  files.value = next;
};

const handleTitleInput = () => {
  userEdited.value = { ...userEdited.value, title: true };
};

const handleContentInput = () => {
  userEdited.value = { ...userEdited.value, content: true };
};

const handleCategoryChange = (value: string) => {
  category.value = value;
  userEdited.value = { ...userEdited.value, category: true };
};

const handleSubmit = () => {
  if (files.value.length === 0) {
    submitError.value = '请先上传笔记截图';
    return;
  }
  if (!title.value.trim()) {
    submitError.value = '请输入笔记标题';
    return;
  }
  if (lockInputs.value || isFormBlocked.value) {
    submitError.value = 'AI 识别中，请稍等';
    return;
  }
  submitError.value = '';
  
  // 检查是否有高互动的识别结果
  const hasHighEngagement = successResults.value.some(r => r.engagement_signal?.is_high_engagement);
  
  // 跳转到诊断页面
 // 将 state 对象转为 JSON 字符串，并进行 URL 编码
const stateStr = encodeURIComponent(JSON.stringify({
  title: title.value,
  content: content.value,
  tags: '',
  category: category.value,
  // 注意：File 对象无法序列化，这里只传递文件名和临时路径信息
  coverFileName: files.value.find((f) => isImage(f))?.name || '',
  coverFilePath: files.value.find((f) => isImage(f))?.path || '',
  coverImages: files.value.filter((f) => isImage(f)).map(f => ({ name: f.name, path: f.path })),
  videoFileName: files.value.find((f) => isVideo(f))?.name || '',
  videoFilePath: files.value.find((f) => isVideo(f))?.path || '',
  hasHighEngagement,
}));

// 使用 uni.navigateTo 进行跳转
uni.navigateTo({
  url: `/pages/diagnosing?state=${stateStr}`
});
};

//const goToWhitepaper = () => {
  // 跳转到白皮书页面
  //uni.navigateTo({
    //url: '/pages/whitepaper/index'
 // });
//};
const goToWhitepaper = () => {
  uni.showToast({
    title: '白皮书功能开发中',
    icon: 'none',
    duration: 1500
  });
};

//const goToHistory = () => {
  // 跳转到历史页面
  //uni.navigateTo({
    //url: '/pages/history/index'
  //});
//};
const goToHistory = () => {
  uni.showToast({
    title: '历史记录功能开发中',
    icon: 'none',
    duration: 1500
  });
};

// 模拟 API 健康检查
const getApiHealth = async (): Promise<boolean> => {
  try {
    // 这里应该调用真实的 API 健康检查
    // 暂时返回 true
    return true;
  } catch {
    return false;
  }
};

// 真实 AI 识别（替换原来的模拟函数）
const quickRecognize = async (file: File, slotHint?: string): Promise<any> => {
  const key = fileKey(file);
  try {
    // 调用真实 AI 接口
    const result = await diagnoseNote({
      title: title.value || '未命名',
      content: content.value || '',
      category: category.value || 'food',
      coverFilePath: (file as any).path || ''
    });
    
    // 返回 AI 识别和诊断结果
    return {
      success: true,
      slot_type: 'content',
      category: result.category || 'food',
      title: result.title || '',
      content_text: result.content || '',
      summary: result.content?.slice(0, 100) || '',
      engagement_signal: {
        likes_visible: 0,
        collects_visible: 0,
        comments_visible: 0,
        is_high_engagement: false
      }
    };
  } catch (e: any) {
    return {
      success: false,
      slot_type: 'unknown',
      category: '',
      title: '',
      content_text: '',
      summary: '',
      error: e.message || '识别失败'
    };
  }
};

// 视频识别（目前复用图片识别逻辑）
const quickRecognizeVideo = async (file: File): Promise<any> => {
  return quickRecognize(file);
};

// 运行识别
const runRecognition = async (file: File, slotHint?: string) => {
  const key = fileKey(file);
  aiLoading.value[key] = true;
  try {
    const res = isVideo(file)
      ? await quickRecognizeVideo(file)
      : await quickRecognize(file, slotHint);
    aiRecogs.value[key] = res;
  } catch (e: any) {
    aiRecogs.value[key] = {
      success: false,
      slot_type: 'unknown',
      extra_slots: [],
      category: '',
      summary: '',
      error: e.message || '识别失败'
    };
  } finally {
    aiLoading.value[key] = false;
  }
};

// 生成预览
// 生成预览
const generatePreviews = () => {
  const keysNow = new Set(files.value.map(fileKey));
  
  // #ifndef MP-TOUTIAO
  // Web 环境：清理旧的预览 URL
  Object.keys(previews.value).forEach(key => {
    if (!keysNow.has(key)) {
      URL.revokeObjectURL(previews.value[key]);
      delete previews.value[key];
    }
  });
  // #endif

  // #ifdef MP-TOUTIAO
  // 小程序环境：直接清理不再使用的预览记录（无需 revoke）
  Object.keys(previews.value).forEach(key => {
    if (!keysNow.has(key)) {
      delete previews.value[key];
    }
  });
  // #endif
  
  // 生成新的预览
  files.value.forEach(file => {
    const key = fileKey(file);
    if (!previews.value[key]) {
      // #ifdef MP-TOUTIAO
      // 小程序环境：直接使用文件路径
      previews.value[key] = (file as any).path || (file as any).tempFilePath || '';
      // #endif

      // #ifndef MP-TOUTIAO
      // Web 环境：使用 URL.createObjectURL
      if (isImage(file)) {
        previews.value[key] = URL.createObjectURL(file as File);
      } else if (isVideo(file)) {
        // 视频预览暂时使用默认图片
        previews.value[key] = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0zMCAzMGMwLTUuNSA0LjUtMTAgMTAtMTBzMTAgNC41IDEwIDEwLTQuNSAxMC0xMCAxMC0xMC00LjUtMTAtMTB6bTAgNDdjMCA1LjUgNC41IDEwIDEwIDEwczEwLTQuNSAxMC0xMC00LjUtMTAtMTAtMTAtMTAgNC41LTEwIDEweiIvPjxwYXRoIGQ9Ik01MCA0MGMtNS41IDAtMTAgNC41LTEwIDEwczQuNSAxMCAxMCAxMCAxMC00LjUgMTAtMTAtNC41LTEwLTEwLTEweiIvPjxwYXRoIGQ9Ik00MCA1M2MtMS4xIDAtMiAuOS0yIDJzLjkgMiAyIDIgMi0uOSAyLTItLjktMi0yLTJ6bTgwIDBjLTEuMSAwLTIgLjktMiAycy45IDIgMiAyIDItLjkgMi0yLS45LTItMi0yeiIvPjwvc3ZnPg==';
      }
      // #endif
    }
  });
};

// 生命周期
onMounted(() => {
  // 检查 API 健康状态
  getApiHealth().then(setApiReachable);
  
  // 分析消息轮播
  const messageInterval = setInterval(() => {
    analysisMessageIndex.value = (analysisMessageIndex.value + 1) % ANALYSIS_MESSAGES.length;
  }, 3000);
  
  // 平滑进度条
  const progressInterval = setInterval(() => {
    if (realProgress.value >= 100) {
      smoothProgress.value = 100;
      return;
    }
    if (realProgress.value > smoothProgress.value) {
      smoothProgress.value = realProgress.value;
    } else if (smoothProgress.value < 90) {
      smoothProgress.value += 0.8;
    }
  }, 200);
  
  // 清理定时器
  onUnmounted(() => {
    clearInterval(messageInterval);
    clearInterval(progressInterval);
  });
});

// 监听文件变化
watch(files, () => {
  generatePreviews();
  
  // 清理旧的识别结果
  const validKeys = new Set(files.value.map(fileKey));
  Object.keys(aiRecogs.value).forEach(key => {
    if (!validKeys.has(key)) {
      delete aiRecogs.value[key];
    }
  });
  Object.keys(aiLoading.value).forEach(key => {
    if (!validKeys.has(key)) {
      delete aiLoading.value[key];
    }
  });
  
  // 运行识别
  const mediaFiles = files.value.filter(
    (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
  );
  const inFlight = mediaFiles.filter((f) => aiLoading.value[fileKey(f)]).length;
  const freeSlots = Math.max(0, QUICK_RECOGNIZE_CONCURRENCY - inFlight);
  const need = mediaFiles.filter((f) => {
    const k = fileKey(f);
    return !aiRecogs.value[k] && !aiLoading.value[k];
  });
  need.slice(0, freeSlots).forEach((file) => {
    runRecognition(file);
  });
  
  // 清空状态
  if (files.value.length === 0) {
    aiRecogs.value = {};
    aiLoading.value = {};
    userEdited.value = { title: false, content: false, category: false };
    title.value = '';
    content.value = '';
    category.value = 'food';
    uploadingPulse.value = false;
    analyzingPulse.value = false;
  }
}, { deep: true });

// 监听识别结果变化
watch(aggregated, () => {
  const { bestTitle, bestContent, bestCategory } = aggregated.value;
  
  if (!userEdited.value.title && bestTitle) {
    title.value = bestTitle.slice(0, 100);
  }
  if (!userEdited.value.content && bestContent) {
    content.value = bestContent;
  }
  if (!userEdited.value.category && bestCategory) {
    const mapped = CAT_MAP[bestCategory];
    if (mapped) category.value = mapped;
  }
}, { deep: true });

// 监听提交错误
watch([files, title], () => {
  if (submitError.value) submitError.value = '';
});
</script>

<style scoped>
.home {
  min-height: 100vh;
  background-color: #faf9f7;
  display: flex;
  flex-direction: column;
}

/* 头部 */
.header {
  height: 48px;
  background-color: #fff;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #00BFFF;  /* 或你喜欢的蓝色 */
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-text {
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  font-family: 'Inter', sans-serif;
}

.logo-name {
  font-size: 14px;
  font-weight: 800;
  color: #262626;
  letter-spacing: -0.02em;
}

.header-desc {
  font-size: 12px;
  color: #999;
  font-weight: 500;
  display: none;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.header-btn:hover {
  color: #ff2442;
  background-color: #fff0f2;
}

/* 主内容区 */
.main {
  flex: 1;
  padding: 16px;
  overflow: auto;
  padding-bottom: 100px;
}

.main-container {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 上传区 */
.upload-section {
  background-color: #fff;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #262626;
}

.section-subtitle {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
  display: block;
}

.file-count {
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  background-color: #eff6ff;
  border: 1px solid #bfdbfe;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-count-text {
  font-size: 10px;
  font-weight: 700;
  color: #2563eb;
}

.api-warning {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 10px;
  padding: 8px;
  font-size: 12px;
  color: #856404;
  line-height: 1.4;
}

/* 上传区域 */
.upload-zone {
  flex: 1;
  min-height: 0;
}

.upload-area {
  border: 2px dashed rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  background-color: rgba(255, 255, 255, 0.65);
  overflow: hidden;
  transition: all 0.2s ease;
  cursor: pointer;
}

.upload-area.is-dragging {
  border-color: rgba(255, 36, 66, 0.65);
  background-color: rgba(255, 36, 66, 0.06);
  box-shadow: 0 0 0 3px rgba(255, 36, 66, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.upload-area.has-error {
  border-color: #ef4444;
}

/* 文件网格 */
.file-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 12px;
}

.file-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background-color: #f0f0f2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
}

.file-item:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

.file-preview {
  width: 100%;
  height: 100%;
  position: relative;
}

.file-preview image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-preview {
  position: relative;
}

.video-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-icon text {
  color: #fff;
  font-size: 16px;
  font-weight: bold;
}

.video-placeholder,
.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 11px;
  color: #999;
}

.file-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.file-remove:hover {
  background-color: rgba(0, 0, 0, 0.7);
}

.file-remove text {
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}

.add-file {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 1px dashed rgba(255, 36, 66, 0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background-color: rgba(255, 245, 247, 0.4);
  transition: all 0.2s ease;
}

.add-file:hover {
  border-color: #ff2442;
  background-color: rgba(255, 36, 66, 0.08);
  box-shadow: 0 2px 12px rgba(255, 36, 66, 0.12);
}

.add-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: rgba(255, 36, 66, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.add-icon text {
  color: #ff2442;
  font-size: 20px;
  font-weight: bold;
}

.add-text {
  font-size: 11px;
  color: #999;
}

/* 空状态 */
.empty-state {
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 36, 66, 0.08) 0%, rgba(255, 100, 120, 0.04) 100%);
  border: 1.5px solid rgba(255, 36, 66, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon text {
  font-size: 32px;
  color: #ff2442;
  font-weight: bold;
}

.empty-text {
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1.3;
  margin-bottom: 4px;
  display: block;
}

.empty-subtitle {
  font-size: 13px;
  color: #999;
  line-height: 1.5;
  display: block;
}

.empty-hint {
  font-size: 12px;
  color: #bbb;
  margin-top: 2px;
  display: block;
}

.error-text {
  color: #ef4444;
  margin-top: 6px;
  font-size: 12px;
}

/* 槽位标签 */
.slot-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}

.chip {
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background-color: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip-success {
  border-color: #d1fae5;
  background-color: #ecfdf5;
}

.chip-text {
  font-size: 10px;
  color: #6b7280;
}

.chip-success .chip-text {
  color: #059669;
}

/* 分析进度 */
.analysis-progress {
  padding: 0 4px;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.progress-text {
  font-size: 11px;
  color: #999;
  font-weight: 500;
}

.progress-count {
  font-size: 10px;
  color: #ccc;
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  height: 4px;
  background-color: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #ff2442, #ff6b81);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 完成提示 */
.ready提示 {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
}

.ready-icon {
  font-size: 13px;
  color: #16a34a;
  font-weight: bold;
}

.ready-text {
  font-size: 11px;
  color: #16a34a;
  font-weight: 600;
}

/* 失败提示 */
.error提示 {
  padding: 0 4px;
}

.error提示-text {
  font-size: 11px;
  color: #dc2626;
  line-height: 1.5;
}

/* 表单区 */
.form-section {
  background-color: #fff;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 视频提示 */
.video-hint {
  background-color: #e0f2fe;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 12px;
  font-size: 12px;
  color: #0369a1;
  line-height: 1.4;
  flex-shrink: 0;
}

/* 加载提示 */
.loading提示 {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background-color: #eff6ff;
  flex-shrink: 0;
}

.loading-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #93c5fd;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 12px;
  color: #3b82f6;
  font-weight: 500;
}

/* 表单 */
.form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: opacity 0.3s;
}

.form-blocked {
  opacity: 0.4;
  pointer-events: none;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

.label-text {
  font-size: 13px;
  font-weight: 600;
  color: #262626;
}

.label-tag {
  font-size: 10px;
  color: #16a34a;
  font-weight: 600;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #1a1a1a;
  background-color: #fff;
}

.form-input:disabled {
  background-color: #f9fafb;
  color: #6b7280;
}

.form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #1a1a1a;
  background-color: #fff;
  min-height: 80px;
  resize: vertical;
}

.form-textarea:disabled {
  background-color: #f9fafb;
  color: #6b7280;
}

.form-warning {
  font-size: 11px;
  color: #d97706;
  margin-top: 2px;
}

/* 分类选择器 */
.category-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-item {
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  font-size: 13px;
  color: #6b7280;
  background-color: #f9fafb;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-item:hover {
  border-color: #d1d5db;
  background-color: #f3f4f6;
}

.category-item-active {
  border-color: #ff2442;
  background-color: #fff0f2;
  color: #ff2442;
}

/* 桌面端按钮 */
.desktop-cta {
  display: none;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 4px;
}

.cta-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background-color: #ff2442;
  box-shadow: 0 4px 16px rgba(255, 36, 66, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}

.cta-btn:hover {
  background-color: #e61e3d;
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(255, 36, 66, 0.35);
}

.cta-btn:active {
  transform: translateY(0);
}

.cta-btn-disabled {
  background-color: #eee;
  box-shadow: none;
  color: #bbb;
  cursor: not-allowed;
}

.cta-btn-disabled:hover {
  background-color: #eee;
  transform: none;
  box-shadow: none;
}

.cta-hint {
  font-size: 10px;
  color: #d97706;
  text-align: center;
}

/* 移动端固定按钮 */
.mobile-cta {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 30;
  padding: 16px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.95);
  border-top: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mobile-cta-btn {
  min-height: 46px;
  font-size: 15px;
}

.submit-error {
  font-size: 11px;
  color: #dc2626;
  text-align: center;
  margin-top: 4px;
}

/* 底部 */
.footer {
  display: none;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-top: 1px solid #f0f0f0;
  background-color: #fff;
  flex-shrink: 0;
}

.footer-link {
  font-size: 11px;
  color: #bbb;
  text-decoration: none;
}

.footer-link:hover {
  color: #ff2442;
}

.footer-separator {
  font-size: 11px;
  color: #ddd;
}

/* 响应式设计 */
@media (min-width: 768px) {
  .header {
    padding: 0 24px;
  }
  
  .header-desc {
    display: block;
  }
  
  .main {
    padding: 16px 24px;
    padding-bottom: 16px;
  }
  
  .main-container {
    flex-direction: row;
    gap: 16px;
  }
  
  .upload-section,
  .form-section {
    flex: 1;
    min-height: 0;
  }
  
  .upload-section {
    flex: 1.2;
  }
  
  .file-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 8px;
    max-height: 220px;
    overflow-y: auto;
  }
  
  .empty-state {
    padding: 24px 16px;
    gap: 6px;
  }
  
  .empty-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
  }
  
  .empty-icon text {
    font-size: 26px;
  }
  
  .empty-title {
    font-size: 14px;
  }
  
  .empty-subtitle {
    font-size: 12px;
  }
  
  .empty-hint {
    font-size: 11px;
  }
  
  .desktop-cta {
    display: flex;
  }
  
  .mobile-cta {
    display: none;
  }
  
  .footer {
    display: flex;
  }
}
</style>