// src/lib/utils/api.js

import { currentUser, uiState } from '$lib/stores.js';

// 1. 基础配置：区分开发环境和生产环境
// 假设你的 Express 后端运行在 3000 端口，请根据实际情况修改
// import.meta.env.DEV 是 Vite 提供的环境变量，判断当前是否是 npm run dev
const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''; 

// 获取 Token
function getToken() {
    return localStorage.getItem('userToken'); // 保持你原有的 Key 不变
}

// 通用 Fetch 封装
async function request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers = { ...options.headers };
    
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const config = { ...options, headers };

    try {
        const response = await fetch(url, config);
        
        // ⚡️ 核心改造：SPA 模式的 401/403 处理
        if (response.status === 401 || response.status === 403) {
            console.warn('登录已失效，请重新登陆');
            
            // 1. 清理本地脏数据
            localStorage.removeItem('userToken'); 
            localStorage.removeItem('username');
            
            // 2. 瞬间更新全局状态，地图和 UI 上的敏感信息会自动消失
            currentUser.set({ isLoggedIn: false, username: null, token: null });
            
            // 3. 呼叫 UI 状态机，直接在当前页面弹出登录框！(不需要跳转 login.html)
            uiState.update(state => ({ ...state, isAuthModalOpen: true }));
            
            throw new Error('Unauthorized'); 
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// --- 导出 API 方法 (这部分逻辑保持完美不变，只修改一下引用的 request) ---
export const API = {
    login: async (username, password) => request('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    }),

    register: async (username, password) => request('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    }),

    getNotes: (targetUser = null) => {
        let path = '/notes'; // 建议变量名叫 path，避免混淆
        if (targetUser) {
            path += `?targetUser=${targetUser}`;
        }
        // ✅ 修正核心：去掉引号，传递变量
        return request(path); 
    },

    createNote: (data) => request('/notes', {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    updateNote: (id, data) => request(`/notes/${id}`, { 
        method: 'PUT', 
        body: JSON.stringify(data) 
    }),
    
    deleteNote: (id) => request(`/notes/${id}`, {
        method: 'DELETE'
    }),

    searchNotes: (query) => request(`/notes/search?q=${encodeURIComponent(query)}`),


    // 用户相关
    getCurrentUser: () => request('/users/me'),

    updateProfile: (bio) => request('/users/profile', {
        method: 'PUT',
        body: JSON.stringify({ bio }),
    }),

    // 上传头像
    uploadAvatar: (formData) => request('/users/avatar', { 
        method: 'POST', 
        body: formData 
    }),
    
    // 文件上传
    uploadFile: (formData) => request('/api/upload', { 
        method: 'POST', 
        body: formData 
    }),

    // 好友相关
    // 搜索用户
    searchUsers: (query) => request(`/users/search?q=${query}`),

    // 获取用户主页
    getUserProfile: (username) => request(`/users/profile/${encodeURIComponent(username)}`),
    
    getMyNetwork: () => request('/friends/my-network'),

    // 发送好友请求 
    sendFriendRequest: (receiverUsername) => request('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ receiver: receiverUsername })
    }),
    
    // 获取待处理请求 (收件箱)
    getPendingRequests: () => request('/friends/pending'),

    // 处理请求 (同意/拒绝)
    respondToRequest: (id, action) => request('/friends/response', { 
        method: 'PUT', 
        body: JSON.stringify({ id, action }) 
    }),

    removeFriend: (username) => request('/friends/remove', {
        method: 'PUT', 
        body: JSON.stringify({ username })
    }),


    //高德API
    searchPlaces: (query) => request(`/gaode/search?q=${encodeURIComponent(query)}`),
    regeoAmap: (lat, lng) => request(`/gaode/regeo?lat=${lat}&lng=${lng}`),
};