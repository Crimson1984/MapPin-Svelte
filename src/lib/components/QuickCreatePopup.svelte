<script>
  import { onMount } from 'svelte';
  import { uiState } from '$lib/stores.js';
  import { saveDraft, removeDraft } from '$lib/utils/draftManager.js'; // ⚡️ 引入草稿管理员
  import { API } from '$lib/utils/api.js';
  import { toView, toDB} from '$lib/utils/coordManager.js';
  import { notesData } from '$lib/stores.js';
  
  import { MapPin, Maximize2, Send, Loader2, Save } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  export let lat;
  export let lng;
  export let closePopup; 

  let title = '';
  let content = '';
  let visibility = 'public';
  let isPublishing = false;


  let locationName = ''; 
  let isFetchingAddress = false;

  let tagsString = '';

  $: if (lat && lng) {
    fetchAddress(lat, lng);
  }

  const draftKey = `draft_new_${lat}_${lng}`;

  // 1. 挂载时检查：这个坐标本来是不是就有一个草稿？如果是，加载它。
  onMount(() => {
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        title = parsed.title || '';
        content = parsed.content || '';
        visibility = parsed.visibility || 'public';
        tagsString = parsed.tagsString || ''
      } catch (e) {
        console.error('草稿解析失败', e);
      }
    }
  });

  // ==========================================
  // 关闭弹窗如果没点保存，数据会随 DOM 销毁而自然丢失
  // ==========================================

  // 2. 显式保存草稿
  function handleSaveDraft() {
    if (!title.trim() && !content.trim()) return; // 全空不存
    
    // 构建标准的 draft 对象并交给草稿管理器
    const draftData = { lat, lng, title, content, visibility, isDirty: true, locationName, tagsString };
    saveDraft(draftData); 
    
    if (closePopup) closePopup(); // 存完关闭，地图会自动刷新出灰点
  }

  // 3. 打开详细编辑器 (纯内存传递，不写硬盘)
  function openFullEditor() {
    const tagsArray = tagsString.trim() ? tagsString.trim().split(/\s+/).filter(Boolean) : [];

    $uiState.editingNote = { lat, lng, title, content, visibility, locationName, tags: tagsArray };
    $uiState.isEditorOpen = true;
    if (closePopup) closePopup();
  }

  // 4. 快捷发布
  async function handleQuickPublish() {
    if (!title.trim() || !content.trim()) return alert('标题和内容不能为空！');
    
    isPublishing = true;

    const tagsArray = tagsString.trim() ? tagsString.trim().split(/\s+/).filter(Boolean) : [];

    try {
      const res = await API.createNote({ title, content, visibility, lat, lng, location_name: locationName || null, tags: tagsArray });
      if (res.success) {
        // ⚡️ 发布成功后，调用 draftManager 的标准删除方法，清理干净
        removeDraft({ lat, lng }); 
        
        // 通知 App.svelte 或地图刷新数据 (这里使用原生事件或靠 API 重新拉取)
        const allNotes = await API.getNotes();
        if (Array.isArray(allNotes)) $notesData = allNotes;
        if (closePopup) closePopup();
      } else {
        alert('发布失败: ' + res.message);
      }
    } catch (err) {
      alert('网络错误，请重试');
    } finally {
      isPublishing = false;
    }
  }

  // ⚡️ 后台静默查询真实地址
  async function fetchAddress(targetLat, targetLng) {
    isFetchingAddress = true;
    try {
      const currentLayer = localStorage.getItem('MAPPIN_LAYER') || 'osm';

      if (currentLayer === 'gaode') {
        const [gcjLat, gcjLng] = toView(targetLat, targetLng);
        const res = await API.regeoAmap(gcjLat, gcjLng);
        if (res && res.success && res.locationName) {
          locationName = res.locationName;
        }
      } else {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${targetLat}&lon=${targetLng}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.display_name) {
          locationName = data.name || data.display_name.split(',').slice(0, 2).join(', ');
        }
      }
    } catch (err) {
      console.error('快捷发布定位失败:', err);
    } finally {
      isFetchingAddress = false;
    }
  }
</script>

<div class="w-[260px] flex flex-col gap-3 font-sans">
  
  <div class="flex items-center gap-1.5 text-blue-600 font-bold border-b border-gray-100 pb-2">
    <MapPin class="w-4 h-4" />
    <span class="text-sm tracking-wide">记录新足迹</span>
  </div>

  <Input bind:value={title} placeholder="标题..." class="h-9 text-sm focus-visible:ring-1" />

  <Input 
    bind:value={tagsString} 
    placeholder="# 添加标签 (用空格分隔)" 
    class="h-8 text-xs focus-visible:ring-1 text-blue-600 placeholder:text-gray-400 border-dashed" 
  />

  <textarea bind:value={content} placeholder="写点什么..." class="w-full h-16 p-2.5 text-sm rounded-md border border-input bg-transparent shadow-sm focus:outline-none focus:ring-1 resize-none leading-relaxed"></textarea>

  <select bind:value={visibility} class="w-full h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm focus:outline-none focus:ring-1">
    <option value="public">🌍 公开足迹</option>
    <option value="friends">👥 仅好友可见</option>
    <option value="private">🔒 私密记录</option>
  </select>

  <div class="flex gap-1 mt-1">
    <Button variant="ghost" size="sm" class="flex-1 h-8 px-1 text-xs text-gray-500 hover:text-gray-800" title="存为草稿" onclick={handleSaveDraft}>
      <Save class="w-3.5 h-3.5" />
    </Button>
    <Button variant="secondary" size="sm" class="flex-[1.2] h-8 px-2 text-xs font-medium bg-gray-100 hover:bg-gray-200" onclick={openFullEditor}>
      <Maximize2 class="w-3 h-3 mr-1" /> 详细
    </Button>
    <Button size="sm" class="flex-[1.5] h-8 px-2 text-xs font-medium shadow-sm" disabled={isPublishing} onclick={handleQuickPublish}>
      {#if isPublishing}
        <Loader2 class="w-3 h-3 animate-spin" />
      {:else}
        <Send class="w-3 h-3 mr-1" /> 发布
      {/if}
    </Button>
  </div>
</div>