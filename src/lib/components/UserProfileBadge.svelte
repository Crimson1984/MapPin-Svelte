<script>
  import { onMount } from 'svelte'; // ⚡️ 1. 引入 onMount 生命周期钩子
  import { currentUser, uiState } from '$lib/stores.js';
  import { API } from '$lib/utils/api.js'; // ⚡️ 2. 引入 API 模块
  import * as Avatar from "$lib/components/ui/avatar/index.js";

  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

  // ⚡️ 3. 组件挂载时，主动去后端拉取“我”的详细信息
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
  <div class="absolute top-6 right-6 z-10">
    <button 
      class="flex items-center gap-3 bg-white/90 backdrop-blur-md p-2 pr-4 rounded-full shadow-lg hover:bg-gray-50 transition border border-gray-100 cursor-pointer"
      onclick={openMyProfile}
    >
      <Avatar.Root class="h-10 w-10 border-2 border-white shadow-sm">
        <Avatar.Image 
          src={$currentUser.avatar ? ($currentUser.avatar.startsWith('http') ? $currentUser.avatar : `${SERVER_URL}${$currentUser.avatar}`) : `${SERVER_URL}/uploads/avatars/default-avatar.png`} 
          alt="Avatar" 
        />
        <Avatar.Fallback>{$currentUser.username?.charAt(0).toUpperCase()}</Avatar.Fallback>
      </Avatar.Root>
      
      <div class="flex flex-col text-left">
        <span class="text-sm font-bold text-gray-800 leading-none">{$currentUser.username}</span>
        <span class="text-xs text-gray-500 mt-1">查看主页</span>
      </div>
    </button>
  </div>
{/if}