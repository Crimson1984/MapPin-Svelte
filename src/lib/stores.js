// src/lib/stores.js
import { writable } from 'svelte/store';

// ==========================================
// 🧑‍💻 1. 用户状态 (User State)
// ==========================================
// 管理当前登录用户的信息。初始化时可以尝试从 localStorage 读取 token
const storedUsername = localStorage.getItem('username') || null;
const storedToken = localStorage.getItem('userToken') || null;

export const currentUser = writable({
  isLoggedIn: !!storedToken, // 只要有 token 就默认为登录状态
  username: storedUsername,
  token: storedToken
});


// ==========================================
// 🗺️ 2. 核心数据状态 (Data State)
// ==========================================
// 存放从后端 API 拉取的所有坐标点和内容
export const notesData = writable([]);   // 所有公开发布的笔记、好友笔记
export const draftsData = writable([]);  // 当前用户的本地草稿


// ==========================================
// 📱 3. UI 交互状态 (UI State) - 极其重要！
// ==========================================
// 彻底取代以前的 document.getElementById(...).classList.add('open')
// 用变量来决定各个抽屉、弹窗的生死
export const uiState = writable({
  // 浏览与交互
  activeNote: null,          // 当前被点击的笔记对象（悬浮卡片用）
  clickedLatLng: null,       // 用户点击地图空白处的坐标（准备发新笔记用）
  mapViewMode: 'standard',   // 地图底图模式：'standard' | 'heatmap'
  
  // 弹窗与抽屉开关
  isQuickEditOpen: false,    // 是否展开底部/侧边快捷发布栏
  isFullEditorOpen: false,   // 是否打开详细编辑器抽屉
  isAuthModalOpen: false,    // 是否打开登录/注册弹窗

  isProfileDrawerOpen: false, // 抽屉是否打开
  currentProfileUser: null,   // 当前正在查看哪个用户的主页 (字符串，如 'garvofadge')

  // ⚡️ 悬浮卡片专用状态
  activeNote: null,        // 当前被点击的笔记对象
  cardPosition: 'right', 
  cardOffset: { x: 0, y: 0 }, // ⚡️ 新增：只记录拖动了多少距离！

  // ⚡️ 编辑器专属状态
  isEditorOpen: false,     // 控制详细编辑器是否打开
  editingNote: null,       // 当前正在编辑的草稿/笔记对象
});