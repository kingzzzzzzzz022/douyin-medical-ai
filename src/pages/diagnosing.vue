<template>
  <view class="diagnosing">
    <!-- 顶部栏 -->
    <view class="top-bar">
      <view class="top-bar-left">
        <view class="pulse-dot"></view>
        <text class="note-title">{{ params?.title || "诊断中" }}</text>
      </view>
      <view class="top-bar-right">
        <text class="status-text">{{ streamMsg || "预计 30-60s" }}</text>
        <text class="timer">{{ elapsed }}s</text>
      </view>
    </view>

    <!-- 内容区 -->
    <view class="content">
      <view class="content-container">
        <!-- 左侧：评分 -->
        <view class="score-section">
          <template v-if="preScoreData">
            <view class="score-ring-container">
              <view class="score-ring" :style="scoreRingStyle">
                <text class="score-text">{{ Math.round(preScoreData.total_score) }}</text>
              </view>
            </view>
            <view class="score-info">
              <text class="note-title">{{ params?.title || "未命名笔记" }}</text>
              <view class="category-info">
                <text class="category-name">{{ preScoreData.category_cn }}</text>
                <view class="level-tag" :class="levelTagClass">
                  <text class="level-text">{{ preScoreData.level }}</text>
                </view>
              </view>
            </view>

            <!-- 维度评分 -->
            <view class="dimension-bars">
              <view v-for="(value, key) in preScoreData.dimensions" :key="key" class="dimension-bar">
                <text class="dimension-label">{{ DIM_LABELS[key] || key }}</text>
                <view class="bar-container">
                  <view class="bar-fill" :style="{ width: `${value}%`, backgroundColor: DIM_COLORS[key] || '#10b981' }"></view>
                </view>
                <text class="dimension-value">{{ Math.round(value) }}</text>
              </view>
              <text class="dimension-hint">基于大量数据训练</text>
            </view>
          </template>
          <template v-else>
            <view class="score-placeholder">
              <view class="placeholder-ring">
                <text class="placeholder-text">评分中</text>
              </view>
              <text class="placeholder-title">{{ params?.title || "正在分析..." }}</text>
            </view>
          </template>
        </view>

        <!-- 右侧：步骤时间线 -->
        <view class="steps-section">
          <!-- 进度条 -->
          <view class="progress-bar">
            <view class="progress-fill" :style="{ width: `${progress}%` }"></view>
          </view>
          <view class="progress-info">
            <text class="step-count">{{ step + 1 }}/{{ STEPS.length }}</text>
            <text class="elapsed-time">{{ elapsed }}s</text>
          </view>

          <!-- 垂直步骤时间线 -->
          <view class="steps-timeline">
            <view v-for="(s, i) in STEPS" :key="i" class="step-item">
              <view class="step-icon-container">
                <view class="step-icon" :class="{
                  'step-icon-done': i < step,
                  'step-icon-active': i === step
                }">
                  <text v-if="i < step" class="step-icon-check">✓</text>
                  <view v-else-if="i === step" class="step-icon-dot"></view>
                </view>
                <view v-if="i < STEPS.length - 1" class="step-line" :class="{ 'step-line-done': i < step }"></view>
              </view>
              <view class="step-content">
                <text class="step-label" :class="{
                  'step-label-done': i < step,
                  'step-label-active': i === step
                }">
                  {{ s.label }}
                </text>
                <text v-if="i === step" class="step-desc">{{ s.desc }}</text>

                <!-- 辩论阶段：显示实时消息 -->
                <view v-if="i === 8 && (i < step || i === step) && debateMsgs.length > 0" class="debate-messages">
                  <view v-for="(msg, j) in debateMsgs" :key="j" class="debate-message" :class="`debate-message-${j % 4}`">
                    <text class="debate-message-text">{{ msg }}</text>
                  </view>
                </view>

                <!-- 裁判阶段：显示状态 -->
                <view v-if="i === 9 && i === step" class="judge-status">
                  <view class="judge-pulse"></view>
                  <text class="judge-text">综合裁判正在评定最终报告...</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 数据洞察 -->
          <view class="tips-section">
            <text class="tips-title">数据洞察</text>
            <text class="tip-text">{{ currentTip }}</text>
          </view>

          <!-- 猜一猜 -->
          <view class="quiz-section" @click="toggleAnswer">
            <text class="quiz-title">{{ showAnswer ? "答案" : "猜一猜" }}</text>
            <text class="quiz-text">{{ showAnswer ? FUN_FACTS[factIdx].a : FUN_FACTS[factIdx].q }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 错误提示 -->
    <view v-if="terminalError" class="error-container">
      <view class="error-alert">
        <text class="error-text">{{ terminalError }}</text>
        <button class="error-button" @click="goBack">返回首页重试</button>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { diagnoseNote } from '@/api/diagnose.js'; //新增的调用
// 状态管理
const params = ref<any>(null);

onLoad((options: any) => {
  if (options.state) {
    try {
      params.value = JSON.parse(decodeURIComponent(options.state));
    } catch (e) {
      console.error('解析参数失败', e);
    }
  }
});
const step = ref(0);
const tipIdx = ref(0);
const elapsed = ref(0);
const factIdx = ref(0);
const showAnswer = ref(false);
const preScoreData = ref<any>(null);
const streamMsg = ref('');
const debateMsgs = ref<string[]>([]);
const apiDone = ref(false);
const hasRealtimeProgress = ref(false);
const resultRef = ref<any>(null);
const lastSseActivityRef = ref(Date.now());
const stallTriggeredRef = ref(false);
const terminalError = ref<string | null>(null);

// 常量
const DIM_LABELS: Record<string, string> = {
  title_quality: "标题质量",
  content_quality: "内容质量",
  visual_quality: "视觉表现",
  tag_strategy: "标签策略",
  engagement_potential: "互动潜力",
};

const DIM_COLORS: Record<string, string> = {
  title_quality: "#10b981",
  content_quality: "#3b82f6",
  visual_quality: "#f59e0b",
  tag_strategy: "#8b5cf6",
  engagement_potential: "#ff6b6b",
};

const STEPS = [
  { label: "数据预评分", desc: "基于大量数据训练的流量预测模型" },
  { label: "解析笔记内容", desc: "提取标题、正文、标签信息" },
  { label: "分析封面视觉", desc: "评估构图、色彩、文字占比" },
  { label: "对比垂类数据", desc: "与数千条同类笔记基线对比" },
  { label: "内容分析师诊断", desc: "评估文案结构与可读性" },
  { label: "视觉诊断师诊断", desc: "分析封面视觉吸引力" },
  { label: "增长策略师诊断", desc: "评估标签与发布策略" },
  { label: "用户模拟器运行", desc: "模拟真实用户反应与评论" },
  { label: "Agent 辩论交锋", desc: "4 位专家互相质疑与补充" },
  { label: "综合裁判评定", desc: "汇总意见，给出最终诊断" },
  { label: "生成诊断报告", desc: "整合评分、建议与优化方案" },
];

const EVENT_STEP_MAP: Record<string, number> = {
  parse_start: 1,
  parse_done: 2,
  baseline_start: 3,
  baseline_done: 3,
  round1_start: 4,
  round1_content_done: 4,
  round1_visual_done: 5,
  round1_growth_done: 6,
  round1_user_done: 7,
  round1_done: 8,
  debate_start: 8,
  debate_agent_0: 8,
  debate_agent_1: 8,
  debate_agent_2: 8,
  debate_agent_3: 9,
  debate_done: 9,
  judge_start: 9,
  judge_done: 10,
  finalizing: 10,
};

const TIPS: Record<string, string[]> = {
  food: [
    "美食爆款标题平均 18.3 字，标题权重占比 57.3%",
    "食物特写封面比全景更容易吸引点击",
    "17:00 是黄金发布时段（互动量是凌晨的 5658 倍）",
    "最优标签数 4-8 个，6 个标签效果最佳",
    "中等长度正文（100-300字）互动量最高",
    "视频笔记互动量是图文的 2.25 倍",
  ],
  fashion: [
    "穿搭品类 98.3% 的互动差异由视觉决定，文字几乎无效",
    "爆款标题平均仅 14 字，简短精炼即可",
    "评论区 63% 正面情绪，种草型用户占 25.4%",
    "多图展示（2-10张）效果最好",
    "穿搭封面建议：全身照 + 干净背景",
  ],
  tech: [
    "科技品类图片数量是最强预测因子（β=0.41）",
    "含数字的标题互动显著更高",
    "长文在科技赛道有优势（87-517字最优）",
    "经验型评论占 37%，科技用户爱分享心得",
    "科技品类负面评论 27%，最高的品类",
  ],
  travel: [
    "旅游品类标签是最强预测因子（β=0.52）",
    "营销感标题反而降低互动（β=-0.51）",
    "图片 4-14 张，需要多图展示",
    "真实分享 > 套路标题",
    "标题带天数+人均花费是黄金公式",
  ],
  _default: [
    "3 个钩子元素最优（互动 21,132），4 个反而崩塌",
    "视频笔记互动量是图文的 2.25 倍",
    "17:00 是全品类黄金发布时段",
    "标签数量 4-8 个最佳",
    "Macro 作者互动是素人的 52 倍，但内容优化可缩小差距",
  ],
};

const FUN_FACTS = [
  { q: "豆音互动量最高的一条笔记有多少互动？", a: "270,670！标题只用了情感+好奇心" },
  { q: "凌晨 3 点和下午 5 点发笔记，互动量差多少倍？", a: "5,658 倍！同样的内容，发布时间决定生死" },
  { q: "穿搭品类，文字能解释多少互动差异？", a: "只有 1.7%！剩余 98.3% 靠图片说话" },
  { q: "有一条没有标题的笔记，互动量是多少？", a: "55,637！纯靠封面图的力量" },
  { q: "评论区最高赞的一条评论有多少赞？", a: "39,000 赞！比绝大多数笔记还火" },
  { q: "钩子元素越多越好吗？", a: "不是！3个最佳，4个反而崩塌到只有 5,826" },
  { q: "我们分析了多少条真实评论？", a: "2,465 条，AI 分类成 6 种用户类型" },
  { q: "科技品类头部笔记是均值的多少倍？", a: "24.4 倍！赢家通吃最严重的品类" },
];

// 计算属性
const tips = computed(() => (params.value ? TIPS[params.value.category] : null) || TIPS._default);
const currentTip = computed(() => tips.value[tipIdx.value]);
const progress = computed(() => ((step.value + 1) / STEPS.length) * 100);

const scoreRingStyle = computed(() => {
  if (!preScoreData.value) return {};
  const score = preScoreData.value.total_score;
  const color = score >= 85 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ff6b6b";
  const r = 66;
  const c = 2 * Math.PI * r;
  const pct = score / 100;
  const strokeDashoffset = c * (1 - pct);
  
  return {
    background: `conic-gradient(${color} ${pct * 360}deg, #f0f0f0 0deg)`
  };
});

const levelTagClass = computed(() => {
  if (!preScoreData.value) return '';
  const score = preScoreData.value.total_score;
  if (score >= 85) return 'level-tag-excellent';
  if (score >= 70) return 'level-tag-good';
  return 'level-tag-poor';
});

// 方法
const toggleAnswer = () => {
  showAnswer.value = !showAnswer.value;
};
const goBack = () => {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.redirectTo({ url: '/pages/index/index' });
    }
  });
};
// 真实 AI 诊断调用
const startAIDiagnosis = async (params: any) => {
  try {
    // 构造传给 AI 的数据
    const diagnoseData = {
      title: params.title,
      content: params.content,
      category: params.category,
      coverFilePath: params.coverFilePath || (params.coverImages && params.coverImages[0]?.path) || ''
    };

    // 调用后端 API
    const aiResult = await diagnoseNote(diagnoseData);

    // 用 AI 返回的数据更新预评分显示
    preScoreData.value = {
      total_score: aiResult.overall_score,
      dimensions: aiResult.dimensions,
      level: aiResult.grade,
      category: params.category,
      category_cn: params.category // 可根据需要映射中文名
    };
    step.value = 1;

    // 保存完整报告结果
    resultRef.value = { report: aiResult, isFallback: false };
    apiDone.value = true;

  } catch (error: any) {
    console.error('AI诊断失败:', error);
    terminalError.value = 'AI服务暂时不可用，请稍后重试';
    apiDone.value = true;
  }
};



// 生命周期
onMounted(() => {
 //document.title = "诊断中... - 豆医 NoteRx";
  
  if (!params.value) {
  uni.redirectTo({ url: '/pages/index/index' });
  return;
}
// 启动真实 AI 诊断
startAIDiagnosis(params.value);


  // 步骤计时器（填补真实事件之间的空白）
  const stepTimer = setInterval(() => {
    if (apiDone.value && step.value >= STEPS.length - 2) {
      clearInterval(stepTimer);
      setTimeout(() => {
        if (resultRef.value) {
          const reportState = {
  report: resultRef.value.report,
  params: params.value,
  isFallback: resultRef.value.isFallback
};
uni.navigateTo({
  url: `/pages/report?state=${encodeURIComponent(JSON.stringify(reportState))}`
});
        }
      }, 600);
      step.value = STEPS.length - 1;
      return;
    }
    if (hasRealtimeProgress.value) return;
    if (step.value >= STEPS.length - 1) return;
    if (!apiDone.value && step.value >= STEPS.length - 2) return;
    step.value += 1;
  }, 3500);

  // 提示计时器
  const tipTimer = setInterval(() => {
    tipIdx.value = (tipIdx.value + 1) % tips.value.length;
  }, 4500);

  // 时钟计时器
  const clockTimer = setInterval(() => {
    elapsed.value += 1;
  }, 1000);

  // 趣味事实计时器
  const factTimer = setInterval(() => {
    factIdx.value = (factIdx.value + 1) % FUN_FACTS.length;
    showAnswer.value = false;
  }, 8000);

  // 清理定时器
  onUnmounted(() => {
    clearInterval(stepTimer);
    clearInterval(tipTimer);
    clearInterval(clockTimer);
    clearInterval(factTimer);
  });
});
</script>

<style scoped>
.diagnosing {
  min-height: 100vh;
  background-color: #faf9f7;
  display: flex;
  flex-direction: column;
}

/* 顶部栏 */
.top-bar {
  height: 48px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background-color: #fff;
  flex-shrink: 0;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #ff2442;
  animation: pulse 1.5s infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

.note-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.status-text {
  font-size: 12px;
  color: #bbb;
  display: none;
}

.timer {
  font-size: 13px;
  font-weight: 700;
  color: #555;
  font-variant-numeric: tabular-nums;
  background-color: #f5f5f5;
  padding: 2px 8px;
  border-radius: 6px;
}

/* 内容区 */
.content {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 16px;
}

.content-container {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 左侧：评分 */
.score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.score-ring-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.score-ring {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.score-ring::before {
  content: '';
  position: absolute;
  width: 126px;
  height: 126px;
  border-radius: 50%;
  background-color: #faf9f7;
}

.score-text {
  font-size: 32px;
  font-weight: 800;
  color: #1a1a1a;
  z-index: 1;
}

.score-info {
  text-align: center;
}

.category-info {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  margin-top: 4px;
}

.category-name {
  font-size: 11px;
  color: #999;
}

.level-tag {
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}

.level-tag-excellent {
  background-color: #dcfce7;
  color: #16a34a;
}

.level-tag-good {
  background-color: #fef3c7;
  color: #d97706;
}

.level-tag-poor {
  background-color: #fee2e2;
  color: #dc2626;
}

.level-text {
  font-size: 10px;
  font-weight: 700;
}

/* 维度评分 */
.dimension-bars {
  width: 100%;
  max-width: 280px;
}

.dimension-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.dimension-label {
  font-size: 11px;
  color: #999;
  min-width: 44px;
  text-align: right;
}

.bar-container {
  flex: 1;
  height: 5px;
  background-color: #f5f5f5;
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 1s ease-out;
}

.dimension-value {
  font-size: 11px;
  font-weight: 600;
  color: #666;
  min-width: 24px;
  text-align: right;
}

.dimension-hint {
  font-size: 10px;
  color: #ccc;
  text-align: center;
  margin-top: 12px;
}

/* 评分占位符 */
.score-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.placeholder-ring {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 3px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: placeholderPulse 2s infinite;
}

@keyframes placeholderPulse {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.6;
  }
}

.placeholder-text {
  font-size: 14px;
  color: #ccc;
  font-weight: 600;
}

.placeholder-title {
  font-size: 13px;
  font-weight: 600;
  color: #999;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

/* 右侧：步骤时间线 */
.steps-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 进度条 */
.progress-bar {
  height: 4px;
  background-color: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background-color: #ff2442;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.step-count {
  font-size: 11px;
  color: #999;
}

.elapsed-time {
  font-size: 11px;
  color: #bbb;
}

/* 垂直步骤时间线 */
.steps-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.step-item {
  display: flex;
  gap: 12px;
  padding-bottom: 16px;
}

.step-icon-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.step-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.step-icon-done {
  background-color: #10b981;
  width: 16px;
  height: 16px;
}

.step-icon-active {
  background-color: #ff2442;
  width: 18px;
  height: 18px;
  box-shadow: 0 0 8px rgba(255, 36, 66, 0.3);
}

.step-icon-check {
  color: #fff;
  font-size: 10px;
  font-weight: bold;
}

.step-icon-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #fff;
}

.step-line {
  width: 2px;
  flex: 1;
  min-height: 16px;
  background-color: #f0f0f0;
  transition: background-color 0.3s;
}

.step-line-done {
  background-color: #10b981;
}

.step-content {
  flex: 1;
  min-width: 0;
  padding-bottom: 16px;
}

.step-label {
  font-size: 13px;
  font-weight: 400;
  color: #ccc;
  line-height: 1.3;
  transition: all 0.3s;
}

.step-label-done {
  color: #10b981;
  font-weight: 500;
}

.step-label-active {
  color: #1a1a1a;
  font-size: 14px;
  font-weight: 700;
}

.step-desc {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

/* 辩论消息 */
.debate-messages {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.debate-message {
  padding: 6px 10px;
  border-radius: 8px;
  border-left: 2px solid;
}

.debate-message-0 {
  background-color: #fff5f6;
  border-left-color: #ff2442;
}

.debate-message-1 {
  background-color: #faf5ff;
  border-left-color: #8b5cf6;
}

.debate-message-2 {
  background-color: #fffbeb;
  border-left-color: #f59e0b;
}

.debate-message-3 {
  background-color: #eff6ff;
  border-left-color: #3b82f6;
}

.debate-message-text {
  font-size: 11px;
  color: #444;
  line-height: 1.5;
}

/* 裁判状态 */
.judge-status {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.judge-pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background-color: #10b981;
  animation: pulse 1.5s infinite;
}

.judge-text {
  font-size: 11px;
  color: #10b981;
}

/* 数据洞察 */
.tips-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.tips-title {
  font-size: 10px;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 4px;
  letter-spacing: 0.04em;
}

.tip-text {
  font-size: 12px;
  color: #666;
  line-height: 1.6;
}

/* 猜一猜 */
.quiz-section {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background-color: #f9f9f9;
  cursor: pointer;
  transition: all 0.3s;
}

.quiz-section:hover {
  background-color: #fff5f6;
  border: 1px solid #fecaca;
}

.quiz-title {
  font-size: 10px;
  font-weight: 700;
  color: #bbb;
  margin-bottom: 2px;
  display: block;
}

.quiz-text {
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  line-height: 1.5;
  display: block;
}

.quiz-section:hover .quiz-title {
  color: #ff2442;
}

.quiz-section:hover .quiz-text {
  font-weight: 700;
  color: #ff2442;
}

/* 错误提示 */
.error-container {
  position: fixed;
  inset: 0;
  background-color: #faf9f7;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 16px;
  z-index: 100;
}

.error-alert {
  max-width: 440px;
  width: 100%;
  background-color: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.error-text {
  font-size: 14px;
  color: #b91c1c;
  line-height: 1.5;
  margin-bottom: 16px;
}

.error-button {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background-color: #ff2442;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.2s;
}

.error-button:hover {
  background-color: #e61e3d;
}

/* 响应式设计 */
@media (min-width: 768px) {
  .content-container {
    flex-direction: row;
    gap: 32px;
  }
  
  .score-section {
    width: 300px;
    flex-shrink: 0;
  }
  
  .steps-section {
    flex: 1;
  }
  
  .status-text {
    display: block;
  }
  
  .score-ring {
    width: 140px;
    height: 140px;
  }
  
  .score-ring::before {
    width: 126px;
    height: 126px;
  }
  
  .score-text {
    font-size: 32px;
  }
}

@media (max-width: 767px) {
  .score-ring {
    width: 110px;
    height: 110px;
  }
  
  .score-ring::before {
    width: 98px;
    height: 98px;
  }
  
  .score-text {
    font-size: 24px;
  }
}
</style>