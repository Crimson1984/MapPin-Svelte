<script>
  import { onMount } from 'svelte'; // ⚡️ 1. 引入 onMount 生命周期钩子
  import { currentUser, uiState } from '$lib/stores.js';
  import { API } from '$lib/utils/api.js'; // ⚡️ 2. 引入 API 模块
  import * as Avatar from "$lib/components/ui/avatar/index.js";

  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

  // ⚡️ 组件挂载时，主动去后端拉取“我”的详细信息
  onMount(async () => {
    // 如果已经登录，且当前还没有加载过头像
    if ($currentUser.isLoggedIn && !$currentUser.avatar) {
      try {
        const userData = await API.getCurrentUser();
        
        // 你的后端直接返回了用户对象 res.json(results[0])
        if (userData && userData.avatar) {
          $currentUser.avatar = userData.avatar; // 更新全局状态
        }
      } catch (err) {
        console.error("获取当前用户信息失败:", err);
      }
    }
  });

  // 点击头像，打开抽屉并设置目标用户为自己
  function openMyProfile() {
    $uiState.currentProfileUser = $currentUser.username;
    $uiState.isProfileDrawerOpen = true;
  }
</script>

{#if $currentUser.isLoggedIn}
  <div class="absolute top-6 right-6 z-[20]">
    <button 
      class="group flex items-center gap-2 cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95 bg-transparent border-none outline-none"
      onclick={openMyProfile}
      title="查看个人主页"
    >
      <Avatar.Root class="h-10 w-10 border-2 border-white shadow-md group-hover:shadow-lg transition-shadow">
        <Avatar.Image 
          src={$currentUser.avatar ? ($currentUser.avatar.startsWith('http') ? $currentUser.avatar : `${SERVER_URL}${$currentUser.avatar}`) : `${SERVER_URL}/uploads/avatars/default-avatar.png`} 
          alt="Avatar" 
        />
        <Avatar.Fallback>{$currentUser.username?.charAt(0).toUpperCase()}</Avatar.Fallback>
      </Avatar.Root>
      
      <span class="text-sm font-bold text-gray-800 group-hover:text-blue-600 transition-colors [text-shadow:0_1px_4px_rgba(255,255,255,0.9)]">
        {$currentUser.username}
      </span>
    </button>
  </div>
{/if}