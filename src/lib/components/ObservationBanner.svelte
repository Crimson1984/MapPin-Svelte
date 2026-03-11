<script>
  import { X } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  // 引入你的全局状态，路径请根据实际情况修改
  import { uiState } from '$lib/stores.js'; 

  // 暴露一个对外接口（回调函数），当点击退出时，通知父组件去重新拉取全局数据
  export let onExit = () => {}; 

  // ⚡️ 组件内部的闭环逻辑
  function handleExit() {
    // 1. 清理全局视察目标状态，横幅会自动触发 slide 动画消失
    $uiState.observingTarget = null;
    // 2. 呼叫父组件传入的函数，去干重活（比如重新 fetch 全局笔记）
    onExit(); 
  }
</script>

{#if $uiState.observingTarget}
  <div 
    transition:slide={{ axis: 'y', duration: 300 }}
    class="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-[3000] flex items-center gap-2 sm:gap-3 bg-white/95 backdrop-blur-xl px-4 py-2 sm:px-5 sm:py-2.5 rounded-full shadow-lg border border-indigo-100 w-max max-w-[95vw] sm:max-w-none"
  >
    <div class="flex items-center gap-2">
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
      </span>
      
      <span class="text-sm font-medium text-gray-700">
        正在探索 <span class="font-bold text-indigo-600">{$uiState.observingTarget}</span> 的足迹
      </span>
    </div>

    <div class="w-[1px] h-4 bg-gray-200 mx-1"></div>

    <button 
      class="text-gray-400 hover:text-red-500 transition-colors hover:bg-red-50 p-1 rounded-full cursor-pointer flex items-center gap-1"
      onclick={handleExit}
      title="退出"
    >
      <X class="w-4 h-4" />
      <span class="text-xs font-medium mr-1">退出</span>
    </button>
  </div>
{/if}