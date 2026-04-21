// src/api/diagnose.js
export function diagnoseNote(data) {
  console.log('📤 准备发送请求到: http://192.168.93.156:3000/api/diagnose');
  console.log('📦 请求数据:', data);

  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: 'http://192.168.93.156:3000/api/diagnose',
      filePath: data.coverFilePath,
      name: 'images',
      formData: {
        title: data.title,
        content: data.content,
        category: data.category
      },
      success: (res) => {
        console.log('📥 后端响应原始数据:', res.data);
        try {
          const result = JSON.parse(res.data);
          console.log('✅ 解析后的 AI 结果:', result);
          resolve(result);
        } catch (e) {
          console.error('❌ JSON 解析失败:', e);
          reject(new Error('AI返回数据解析失败'));
        }
      },
      fail: (err) => {
        console.error('❌ 请求失败:', err);
        reject(err);
      }
    });
  });
}