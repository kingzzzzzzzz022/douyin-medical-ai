<template>
  <view class="report">
    <!-- 顶部栏 -->
    <view class="top-bar">
      <view class="top-bar-left">
        <button class="back-button" @click="goBack">
          <text class="back-icon">←</text>
        </button>
        <text class="page-title">诊断报告</text>
      </view>
      <view class="top-bar-right">
        <button class="share-button" @click="shareReport">
          <text class="share-text">分享</text>
        </button>
      </view>
    </view>

    <!-- 内容区 -->
    <view class="content">
      <!-- 评分概览 -->
      <view class="score-overview">
        <view class="score-main">
          <view class="score-circle" :class="scoreCircleClass">
            <text class="score-number">{{ report?.overall_score || 0 }}</text>
            <text class="score-grade">{{ report?.grade || "" }}</text>
          </view>
          <view class="score-info">
            <text class="note-title">{{ params?.title || "未命名笔记" }}</text>
            <text class="note-category">{{ params?.category || "" }}</text>
          </view>
        </view>

        <!-- 雷达图 -->
        <view class="radar-chart">
          <text class="chart-title">维度分析</text>
          <view class="chart-container">
            <canvas 
              canvas-id="radarCanvas" 
              id="radarCanvas"
              class="radar-canvas"
              @touchstart="onChartTouch"
            ></canvas>
          </view>
        </view>
      </view>

      <!-- 问题与建议 -->
      <view class="issues-suggestions">
        <!-- 问题 -->
        <view class="section">
          <text class="section-title">存在问题</text>
          <view v-if="report?.issues && report.issues.length > 0" class="issues-list">
            <view v-for="(issue, index) in report.issues" :key="index" class="issue-item">
              <view class="issue-severity" :class="`severity-${issue.severity}`">
                <text class="severity-text">{{ issue.severity }}</text>
              </view>
              <text class="issue-description">{{ issue.description }}</text>
              <text class="issue-agent">{{ issue.from_agent }}</text>
            </view>
          </view>
          <view v-else class="empty-state">
            <text class="empty-text">未发现明显问题</text>
          </view>
        </view>

        <!-- 建议 -->
        <view class="section">
          <text class="section-title">优化建议</text>
          <view v-if="report?.suggestions && report.suggestions.length > 0" class="suggestions-list">
            <view v-for="(suggestion, index) in report.suggestions" :key="index" class="suggestion-item">
              <view class="suggestion-priority" :class="`priority-${suggestion.priority}`">
                <text class="priority-text">{{ suggestion.priority }}</text>
              </view>
              <text class="suggestion-description">{{ suggestion.description }}</text>
              <text class="suggestion-impact">{{ suggestion.expected_impact }}</text>
            </view>
          </view>
          <view v-else class="empty-state">
            <text class="empty-text">暂无优化建议</text>
          </view>
        </view>
      </view>

      <!-- 辩论总结 -->
      <view class="debate-summary">
        <text class="section-title">专家辩论总结</text>
        <view class="summary-content">
          <text class="summary-text">{{ report?.debate_summary || "专家们经过讨论，认为该笔记整体质量良好，具有一定的互动潜力。" }}</text>
        </view>
      </view>

      <!-- 模拟评论 -->
      <view class="simulated-comments">
        <text class="section-title">模拟用户评论</text>
        <view v-if="report?.simulated_comments && report.simulated_comments.length > 0" class="comments-list">
          <view v-for="(comment, index) in report.simulated_comments" :key="index" class="comment-item">
            <view class="comment-avatar">
              <text class="avatar-emoji">{{ comment.avatar_emoji || "👤" }}</text>
            </view>
            <view class="comment-content">
              <text class="comment-username">{{ comment.username }}</text>
              <text class="comment-text">{{ comment.comment }}</text>
              <view class="comment-meta">
                <text class="comment-sentiment" :class="`sentiment-${comment.sentiment}`">
                  {{ comment.sentiment === 'positive' ? '正面' : comment.sentiment === 'negative' ? '负面' : '中性' }}
                </text>
                <text v-if="comment.likes" class="comment-likes">{{ comment.likes }}赞</text>
                <text v-if="comment.time_ago" class="comment-time">{{ comment.time_ago }}</text>
              </view>
            </view>
          </view>
        </view>
        <view v-else class="empty-state">
          <text class="empty-text">暂无模拟评论</text>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="action-buttons">
        <button class="action-button primary" @click="saveReport">保存报告</button>
        <button class="action-button secondary" @click="goBack">返回首页</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick} from 'vue';
//引入 uCharts,这是关于雷达的插件
import uCharts from '@qiun/ucharts';
import { onLoad } from '@dcloudio/uni-app';

// 状态管理
const params = ref<any>(null);
const report = ref<any>(null);
//这下面是添加的变量和函数为了适应雷达图
// 图表实例
let radarChart: any = null;

// 初始化雷达图
const initRadarChart = (reportData: any) => {
  if (!reportData) return;
  
  // 确保有维度数据，若无则用模拟维度数据
  let dimensions = reportData.dimensions;
  if (!dimensions) {
    const baseScore = reportData.overall_score || 80;
    dimensions = {
      '标题质量': Math.min(100, baseScore + 5),
      '内容质量': Math.min(100, baseScore - 2),
      '视觉表现': Math.min(100, baseScore + 8),
      '标签策略': Math.min(100, baseScore),
      '互动潜力': Math.min(100, baseScore - 5)
    };
  }
  
  const categories = Object.keys(dimensions);
  const seriesData = Object.values(dimensions).map(v => Number(v) || 0);

  // 使用旧版 canvas-id 方式获取上下文（无需查询节点，兼容性最好）
  const ctx = uni.createCanvasContext('radarCanvas');
  
  const opts = {
    type: "radar",
    canvasId: 'radarCanvas',      // 使用 canvas-id
    context: ctx,                 // 传入上下文
    width: 300,                   // 必须与 CSS 宽高一致
    height: 200,
    categories: categories,
    series: [{
      name: "维度得分",
      data: seriesData
    }],
    extra: {
      radar: {
        max: 100,
        gridType: 'circle',
        labelColor: '#666',
        gridColor: '#e5e7eb',
        areaColor: 'rgba(0, 191, 255, 0.2)',
        lineColor: '#00BFFF'
      }
    }
  };
  
  // 销毁旧实例
  if (radarChart) {
    radarChart.dispose();
    radarChart = null;
  }
  
  // 创建新实例
  radarChart = new uCharts(opts);
};
// 触摸事件（必须保留，防止警告）
const onChartTouch = () => {};
//这里也添加了雷达相关内容
onLoad((options: any) => {
  if (options.state) {
    try {
      const state = JSON.parse(decodeURIComponent(options.state));
      params.value = state.params;
      report.value = state.report;
      // 数据赋值后，初始化雷达图
      if (report.value) {
  nextTick(() => {
    initRadarChart(report.value);
  });
}
    } catch (e) {
      console.error('解析报告参数失败', e);
    }
  }
});

// 计算属性
const scoreCircleClass = computed(() => {
  if (!report.value) return '';
  const score = report.value.overall_score;
  if (score >= 85) return 'score-circle-excellent';
  if (score >= 70) return 'score-circle-good';
  return 'score-circle-poor';
});

// 方法
const goBack = () => {
  uni.navigateBack({
    delta: 1,
    fail: () => {
      uni.redirectTo({ url: '/pages/index' });
    }
  });
};

const shareReport = () => {
  // 模拟分享功能
  uni.showToast({
    title: '分享功能开发中',
    icon: 'none'
  });
};

const saveReport = () => {
  // 模拟保存功能
  uni.showToast({
    title: '报告已保存',
    icon: 'success'
  });
};
</script>

<style scoped>
.report {
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
  gap: 12px;
}

.back-button {
  border: none;
  background: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
}

.back-button:hover {
  background-color: #f5f5f5;
}

.back-icon {
  font-size: 18px;
  color: #262626;
  font-weight: bold;
}

.page-title {
  font-size: 14px;
  font-weight: 700;
  color: #262626;
}

.top-bar-right {
  display: flex;
  align-items: center;
}

.share-button {
  border: none;
  background: none;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.share-button:hover {
  background-color: #f5f5f5;
}

.share-text {
  font-size: 12px;
  font-weight: 600;
  color: #ff2442;
}

/* 内容区 */
.content {
  flex: 1;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 评分概览 */
.score-overview {
  background-color: #fff;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.score-main {
  display: flex;
  align-items: center;
  gap: 20px;
}

.score-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.score-circle-excellent {
  background-color: #dcfce7;
  border: 2px solid #bbf7d0;
}

.score-circle-good {
  background-color: #fef3c7;
  border: 2px solid #fed7aa;
}

.score-circle-poor {
  background-color: #fee2e2;
  border: 2px solid #fecaca;
}

.score-number {
  font-size: 32px;
  font-weight: 800;
  color: #1a1a1a;
}

.score-grade {
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
}

.score-circle-excellent .score-grade {
  color: #16a34a;
}

.score-circle-good .score-grade {
  color: #d97706;
}

.score-circle-poor .score-grade {
  color: #dc2626;
}

.score-info {
  flex: 1;
  min-width: 0;
}

.note-title {
  font-size: 16px;
  font-weight: 700;
  color: #262626;
  line-height: 1.3;
  margin-bottom: 4px;
  display: block;
}

.note-category {
  font-size: 12px;
  color: #999;
  display: block;
}

/* 雷达图 */
.radar-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #262626;
}

.chart-container {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}

.radar-canvas {
  width: 300px;
  height: 200px;
}

.placeholder-text {
  font-size: 14px;
  color: #999;
}

/* 问题与建议 */
.issues-suggestions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section {
  background-color: #fff;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #262626;
  margin-bottom: 4px;
}

/* 问题列表 */
.issues-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.issue-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background-color: #f9fafb;
  border-radius: 10px;
  border-left: 3px solid #ef4444;
}

.issue-severity {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.severity-high {
  background-color: #fee2e2;
  color: #dc2626;
}

.severity-medium {
  background-color: #fef3c7;
  color: #d97706;
}

.severity-low {
  background-color: #dbeafe;
  color: #2563eb;
}

.issue-description {
  flex: 1;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}

.issue-agent {
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
  align-self: flex-start;
}

/* 建议列表 */
.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background-color: #f9fafb;
  border-radius: 10px;
  border-left: 3px solid #10b981;
}

.suggestion-priority {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.priority-1 {
  background-color: #dcfce7;
  color: #16a34a;
}

.priority-2 {
  background-color: #fef3c7;
  color: #d97706;
}

.priority-3 {
  background-color: #dbeafe;
  color: #2563eb;
}

.suggestion-description {
  flex: 1;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}

.suggestion-impact {
  font-size: 11px;
  color: #9ca3af;
  flex-shrink: 0;
  align-self: flex-start;
}

/* 空状态 */
.empty-state {
  padding: 20px;
  background-color: #f9fafb;
  border-radius: 10px;
  text-align: center;
}

.empty-text {
  font-size: 13px;
  color: #9ca3af;
}

/* 辩论总结 */
.debate-summary {
  background-color: #fff;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-content {
  padding: 16px;
  background-color: #f9fafb;
  border-radius: 10px;
  border-left: 3px solid #8b5cf6;
}

.summary-text {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
}

/* 模拟评论 */
.simulated-comments {
  background-color: #fff;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-item {
  display: flex;
  gap: 12px;
}

.comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-emoji {
  font-size: 20px;
}

.comment-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comment-username {
  font-size: 13px;
  font-weight: 600;
  color: #262626;
}

.comment-text {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.comment-sentiment {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
}

.sentiment-positive {
  background-color: #dcfce7;
  color: #16a34a;
}

.sentiment-negative {
  background-color: #fee2e2;
  color: #dc2626;
}

.sentiment-neutral {
  background-color: #e5e7eb;
  color: #6b7280;
}

.comment-likes {
  font-size: 11px;
  color: #9ca3af;
}

.comment-time {
  font-size: 11px;
  color: #9ca3af;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  margin-bottom: 32px;
}

.action-button {
  flex: 1;
  padding: 14px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-button.primary {
  background-color: #ff2442;
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 36, 66, 0.25);
}

.action-button.primary:hover {
  background-color: #e61e3d;
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(255, 36, 66, 0.35);
}

.action-button.secondary {
  background-color: #f3f4f6;
  color: #4b5563;
}

.action-button.secondary:hover {
  background-color: #e5e7eb;
}

/* 响应式设计 */
@media (min-width: 768px) {
  .content {
    max-width: 800px;
    margin: 0 auto;
  }
  
  .score-main {
    gap: 32px;
  }
  
  .score-circle {
    width: 140px;
    height: 140px;
  }
  
  .score-number {
    font-size: 36px;
  }
}
</style>