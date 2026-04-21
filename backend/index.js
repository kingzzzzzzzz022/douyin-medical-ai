require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs').promises;

const app = express();
app.use(cors());
app.use(express.json());

// 配置临时文件上传
const upload = multer({ dest: 'uploads/' });

// 从环境变量读取密钥（安全！）
const API_KEY = process.env.ARK_API_KEY;
const ENDPOINT_ID = process.env.ARK_ENDPOINT_ID;
const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// AI诊断接口
app.post('/api/diagnose', upload.array('images', 9), async (req, res) => {
  try {
    const { title, content, category } = req.body;
    const imageFiles = req.files;

    // 将上传的图片转换为 Base64 编码，然后删除临时文件
    const base64Images = await Promise.all(
      imageFiles.map(async (file) => {
        const buffer = await fs.readFile(file.path);
        await fs.unlink(file.path);
        return buffer.toString('base64');
      })
    );

   // 构造给 AI 的提示词（Prompt）- 同时进行 OCR 识别和专业诊断
const prompt = `你是一个专业的抖音笔记分析助手。请先仔细查看上传的图片，识别图片中可见的所有文字信息，然后完成以下两个任务：

【任务一：信息提取】
从图片文字中提取以下内容：
1. 笔记标题（通常是最醒目、字号最大的文字）
2. 笔记正文（描述、步骤、说明等详细内容）
3. 内容垂类（从以下选项中选择最匹配的一个：food/fashion/tech/travel/beauty/fitness/lifestyle/home）

【任务二：专业诊断】
请作为一名专业的抖音笔记诊断专家，基于你识别到的文字内容和图片视觉信息，进行全面诊断分析。

请严格按照以下JSON格式返回结果，不要包含任何额外解释：
{
  "title": "你识别出的笔记标题",
  "content": "你识别出的笔记正文",
  "category": "你判断的垂类（英文）",
  "overall_score": 85,
  "grade": "优秀",
  "dimensions": {
    "标题质量": 90,
    "内容质量": 85,
    "视觉表现": 80,
    "标签策略": 85,
    "互动潜力": 88
  },
  "issues": [
    { "severity": "high", "description": "问题描述", "from_agent": "抖音诊断专家" }
  ],
  "suggestions": [
    { "priority": 1, "description": "建议内容", "expected_impact": "预期效果" }
  ],
  "debate_summary": "专家总结..."
}

注意：
- 如果图片中没有明确的标题文字，请根据内容概括一个简短的标题。
- 如果图片中没有正文文字，content 字段可以为空字符串。
- category 必须是 food/fashion/tech/travel/beauty/fitness/lifestyle/home 之一。
- 评分和诊断请基于图片的实际内容给出，不要使用固定值。`;
    // 调用火山引擎豆包大模型 API
    const response = await axios.post(
      API_URL,
      {
        model: ENDPOINT_ID,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...base64Images.map(img => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${img}` }
              }))
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );

    // 解析 AI 返回的 JSON 结果
    const aiResult = JSON.parse(response.data.choices[0].message.content);
    res.json(aiResult);
  } catch (error) {
    console.error('AI诊断失败:', error.response?.data || error.message);
    res.status(500).json({ error: 'AI诊断失败，请稍后重试' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ AI诊断后端服务运行在 http://localhost:${PORT}`);
  console.log(`📱 手机访问地址: http:// 192.168.93.156:${PORT}  (请替换为你的实际电脑IP)`);
});