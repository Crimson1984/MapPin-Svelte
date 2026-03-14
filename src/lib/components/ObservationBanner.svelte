<script>
  import { X, Hash, User } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  import { uiState } from '$lib/stores.js'; 

  // 当退出任何一种观察模式时，通知父组件去重新拉取全站大盘数据
  export let onExit = () => {}; 

  // ⚡️ 退出用户观察模式
  function handleExitUser() {
    $uiState.observingTarget = null;
    onExit(); 
  }

  // ⚡️ 退出话题标签观察模式
  function handleExitTag() {
    $uiState.observingTag = null;
    onExit(); 
  }

  // ⚡️ 一键退出所有过滤模式（如果同时在看某人的某标签）
  function handleExitAll() {
    $uiState.observingTarget = null;
    $uiState.observingTag = null;
    onExit();
  }
</script>

{#if $uiState.observingTarget || $uiState.observingTag}
  <div 
    transition:slide={{ axis: 'y', duration: 300 }}
    class="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[3000] flex flex-col sm:flex-row items-center gap-2 sm:gap-3 bg-white/95 backdrop-blur-xl px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl sm:rounded-full shadow-xl border border-gray-100 w-max max-w-[90vw] sm:max-w-none"
  >
    
    <div class="flex items-center gap-3">
      <span class="relative flex h-2.5 w-2.5 shrink-0">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
      </span>
      
      <div class="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
        <span>正在探索</span>

        {#if $uiState.observingTarget}
          <span class="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
            <User class="w-3.5 h-3.5" />
            <span class="font-bold">{$uiState.observingTarget}</span>
            <button class="ml-1 hover:text-red-500 transition-colors" onclick={handleExitUser} title="取消观察">
              <X class="w-3.5 h-3.5" />
            </button>
          </span>
        {/if}

        {#if $uiState.observingTarget && $uiState.observingTag}
          <span class="text-gray-400 text-xs">的</span>
        {/if}

        {#if $uiState.observingTag}
          <span class="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100">
            <Hash class="w-3.5 h-3.5" />
            <span class="font-bold">{$uiState.observingTag}</span>
            <button class="ml-1 hover:text-red-500 transition-colors" onclick={handleExitTag} title="取消标签">
              <X class="w-3.5 h-3.5" />
            </button>
          </span>
        {/if}
        
      </div>
    </div>

    <div class="hidden sm:block w-[1px] h-5 bg-gray-200 mx-1"></div>

    <button 
      class="text-gray-400 hover:text-red-500 transition-colors hover:bg-red-50 px-2 py-1 rounded-full cursor-pointer flex items-center gap-1 shrink-0 mt-1 sm:mt-0"
      onclick={handleExitAll}
      title="退出"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
{/if}