<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Download, Share, PlusSquare, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  
  // ⚡️ 核心新增：引入我们在 stores.js 里建好的全局状态
  import { uiState } from '$lib/stores.js'; 

  let showAndroidPrompt = false;
  let showIosPrompt = false;

  // 检查是否已经在 PWA 独立窗口中运行
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  onMount(() => {
    if (isStandalone) return; // 已经装好了，直接罢工不干活

    // 1. 嗅探设备类型，并存入全局状态（让设置页面也能知道）
    const ua = window.navigator.userAgent.toLowerCase();
    $uiState.isIosDevice = /iphone|ipad|ipod/.test(ua); 

    // ⚡️ 2. 检查本地防骚扰记录：用户以前关掉过这个横幅吗？
    const hasDismissed = localStorage.getItem('pwa_prompt_dismissed') === 'true';

    if ($uiState.isIosDevice) {
      // 🍎 苹果端逻辑
      if (!hasDismissed) {
        // 如果没被拒绝过，延迟 2 秒弹出教程式横幅
        setTimeout(() => showIosPrompt = true, 2000);
      }
    } else {
      // 🤖 安卓/电脑端逻辑：全局监听原生安装事件
      window.addEventListener('beforeinstallprompt', (e) => {
        // 阻止浏览器默认的、毫无美感的安装提示
        e.preventDefault();
        
        // ⚡️ 极其重要：把事件存入全局商店，让设置组件能拿到它来手动触发！
        $uiState.pwaInstallEvent = e; 
        
        // 如果用户没在本地点过“关闭”，就弹出我们自己画的底部横幅
        if (!hasDismissed) {
          showAndroidPrompt = true;
        }
      });
    }
  });

  // 处理横幅上的“获取/安装”按钮点击
  async function handleInstall() {
    if (!$uiState.pwaInstallEvent) return;
    
    // 唤起系统原生的安装弹窗
    $uiState.pwaInstallEvent.prompt();
    const { outcome } = await $uiState.pwaInstallEvent.userChoice;
    
    // 不管用户点接受还是取消，这个事件用完就作废了，必须清空
    $uiState.pwaInstallEvent = null;
    
    // 安装流程走完，关闭当前横幅
    closePrompt();
  }

  // 处理横幅上的“X（关闭）”按钮点击
  function closePrompt() {
    showAndroidPrompt = false;
    showIosPrompt = false;
    
    // ⚡️ 核心防骚扰：写入本地存储，以后这台设备再也不自动弹横幅了！
    // 但因为事件已经存进了 $uiState.pwaInstallEvent，用户依然可以去设置页里手动点安装
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  }
</script>

{#if showAndroidPrompt}
  <div 
    transition:slide={{ axis: 'y' }}
    class="fixed bottom-0 left-0 w-full z-[9999] bg-white border-t border-gray-100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-4 flex items-center justify-between"
  >
    <div class="flex items-center gap-3">
      <img src="/pwa-192x192.png" alt="MapPin Logo" class="w-10 h-10 rounded-xl shadow-sm" />
      <div>
        <h3 class="text-sm font-bold text-gray-800">安装 MapPin</h3>
        <p class="text-xs text-gray-500">添加到桌面</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button size="sm" class="rounded-full shadow-md" onclick={handleInstall}>
        <Download class="w-4 h-4 mr-1.5" /> 获取
      </Button>
      <button class="p-2 text-gray-400 hover:text-gray-600" onclick={closePrompt}>
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
{/if}

{#if showIosPrompt}
  <div 
    transition:slide={{ axis: 'y' }}
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[90%] max-w-sm bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-2xl p-4"
  >
    <button class="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600" onclick={closePrompt}>
      <X class="w-4 h-4" />
    </button>
    <div class="flex flex-col items-center text-center gap-2 mt-1">
      <h3 class="text-sm font-bold text-gray-800">将 MapPin 添加到主屏幕</h3>
      <p class="text-xs text-gray-600 leading-relaxed">
        点击底部菜单栏的 <Share class="w-4 h-4 inline-block mx-0.5 text-blue-500" /> 图标<br/>
        然后向下滑动，选择 <strong>“添加到主屏幕”</strong> <PlusSquare class="w-4 h-4 inline-block mx-0.5 text-gray-700" />
      </p>
    </div>
  </div>
{/if}