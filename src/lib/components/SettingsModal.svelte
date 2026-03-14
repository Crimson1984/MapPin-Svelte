<script>
  import { fade, slide } from 'svelte/transition';
  import { X, Download, Share, PlusSquare, Settings, Info, Smartphone } from 'lucide-svelte';
  import { uiState } from '$lib/stores.js';
  import { Button } from '$lib/components/ui/button/index.js';

  function closeSettings() {
    $uiState.isSettingsOpen = false;
  }

  // ⚡️ 手动触发安装
  async function handleManualInstall() {
    if (!$uiState.pwaInstallEvent) return;
    
    $uiState.pwaInstallEvent.prompt();
    const { outcome } = await $uiState.pwaInstallEvent.userChoice;
    
    if (outcome === 'accepted') {
      $uiState.pwaInstallEvent = null; // 安装成功，清空事件
    }
  }
</script>

    
{#if $uiState.isSettingsOpen}
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions  -->
  <div 
    class="fixed inset-0 z-[6000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" 
    transition:fade={{ duration: 200 }}
    
    onclick={(e) => { 
      e.stopPropagation(); // ⚡️ 拦截点击穿透
      if (e.target === e.currentTarget) closeSettings(); 
    }}
    onpointerdown={(e) => e.stopPropagation()} onwheel={(e) => e.stopPropagation()}       >
    
    <div 
      class="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
      transition:slide={{ axis: 'y', duration: 300 }}
    >
      
      <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h2 class="text-lg font-bold text-gray-800 flex items-center gap-2">
           <Settings class="w-5 h-5 text-gray-500" /> 系统设置
        </h2>
        <button class="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-full transition" onclick={closeSettings}>
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        
        <section>
          <h3 class="text-sm font-bold text-gray-400 tracking-wider mb-3">客户端应用</h3>
          
          <div class="flex items-center justify-between p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
            <div class="flex items-start gap-3">
              <Smartphone class="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <h4 class="font-medium text-gray-800 text-sm">安装原生应用</h4>
                <p class="text-xs text-gray-500 mt-1">获得全屏沉浸体验与离线支持</p>
              </div>
            </div>

            {#if $uiState.isIosDevice}
               <div class="text-[10px] text-gray-500 text-right leading-tight">
                 点击底部 <Share class="inline w-3 h-3 text-blue-500 mx-0.5"/> <br/>
                 选择「添加到主屏幕」<PlusSquare class="inline w-3 h-3 mx-0.5"/>
               </div>
            {:else if $uiState.pwaInstallEvent}
               <Button size="sm" class="shadow-sm" onclick={handleManualInstall}>
                 <Download class="w-3.5 h-3.5 mr-1.5" /> 安装
               </Button>
            {:else}
               <span class="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md">已安装</span>
            {/if}
          </div>
        </section>

        <section>
          <h3 class="text-sm font-bold text-gray-400 tracking-wider mb-3">关于 MapPin</h3>
          <div class="p-4 bg-gray-50 border border-gray-100 rounded-xl flex items-center gap-3 text-sm text-gray-600">
            <Info class="w-5 h-5 text-gray-400" />
            <span>当前版本：v1.0.0 (Beta)</span>
          </div>
        </section>

      </div>
    </div>
  </div>
{/if}