<script>
  import { fade } from 'svelte/transition';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  
  import { uiState, currentUser, notesData } from '$lib/stores.js';
  import { API } from '$lib/utils/api.js';

  import {removeDraft, saveDraft} from '$lib/utils/draftManager.js'; // ⚡️ 引入草稿管理器
  import { toView, toDB} from '$lib/utils/coordManager.js';
  
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Save, Send, Image as ImageIcon, Eye, Edit3, Loader2, Bold, Italic, Heading, Quote, List, Link, X, MapPin} from 'lucide-svelte';

  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '/api';

  // 📝 表单状态
  let title = '';
  let content = '';
  let visibility = 'public';
  
  // ⚙️ UI 状态
  let isPublishing = false;
  let isUploading = false;
  let saveStatus = ''; // 用于显示 "草稿已保存"
  let saveTimeout;
  let textareaRef;

  // 👁️ 预览模式开关
  let isPreviewMode = false;

  // ⚡️ 物理地名状态
  let locationName = ''; 
  let isFetchingAddress = false; // 控制加载动画，提升 UX

  //胶囊标签状态
  let currentTagInput = ''; 
  let tagsList = [];
  // ⚡️ 联想提示专属状态
  let suggestedTags = [];       // 存放后端返回的建议列表
  let isSuggesting = false;     // 控制下拉框的显示/隐藏
  let suggestTimeout;           // 防抖定时器
  let focusedSuggestIndex = -1; // 键盘上下键选中的高亮索引 (-1 表示没选中任何下拉项)

  function togglePreview() {
    isPreviewMode = !isPreviewMode;
    if (isPreviewMode) {
      generatePreview(); // 切换到预览时，立刻生成最新的 HTML
    } else {
      // 切回编辑模式时，自动让文本框重新获得焦点
      setTimeout(() => textareaRef?.focus(), 10);
    }
  }

  // ==========================================
  // ⚡️ 1. 生命周期：精确打扰逻辑
  // ==========================================
  $: if ($uiState.isEditorOpen && $uiState.editingNote) {
    const note = $uiState.editingNote;
    
    // 🛠️ 浏览器原生反转义魔法：将 &gt; 变回 >
    const decodeHtml = (html) => {
      if (!html) return '';
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    };

    // ⚡️ 提取并统一标签数据结构的通用函数
    const extractTags = (sourceTags) => {
        if (!sourceTags) return [];
        if (Array.isArray(sourceTags)) return sourceTags; // 如果从 QuickCreatePopup 传来的是数组
        if (typeof sourceTags === 'string') return sourceTags.split(',').filter(Boolean); // 如果从数据库传来的是 "探店,咖啡"
        return [];
    };

    if (note.id) {
      // 🟢 情况 A: 用户正在【修改已发布的笔记】
      const draftKey = `draft_edit_${note.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      locationName = $uiState.editingNote.location_name || '';
      

      // 只有存在修改痕迹时，才弹窗询问是否覆盖数据库原版
      if (savedDraft && confirm(`检测到未发布的修改痕迹，是否恢复？`)) {
        const parsed = JSON.parse(savedDraft);
        title = decodeHtml(parsed.title) || '';
        content = decodeHtml(parsed.content) || '';
        visibility = parsed.visibility || 'public';
        tagsList = extractTags(parsed.tags); // ⚡️ 恢复草稿标签
      } else {
        title = decodeHtml(note.title) || '';
        content = decodeHtml(note.content) || '';
        visibility = note.visibility || 'public';
        tagsList = extractTags(note.tags); // ⚡️ 恢复数据库原版标签
      }
    } else {
      // 🟢 情况 B: 用户正在【写新笔记】(从小窗点"详细"进来，或点击地图上的灰点进来)
      // 这时没有数据库原版冲突，草稿就是唯一真理！直接静默加载，绝不弹窗打扰！
      title = decodeHtml(note.title) || '';
      content = decodeHtml(note.content) || '';
      visibility = note.visibility || 'public';
      tagsList = extractTags(note.tags); // ⚡️ 接收从气泡传来的标签
      fetchAddress($uiState.editingNote.lat, $uiState.editingNote.lng);
    }
    
    saveStatus = '';
    currentTagInput = ''; // 每次打开清空输入框
  }



  // ==========================================
  // ⚡️ 2. 自动保存引擎 (防抖机制)
  // ==========================================
  //只要 title 或 content 发生变化，就会触发这个响应式块
  $: if ($uiState.isEditorOpen && (title !== undefined || content !== undefined)) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveDraftToLocal();
    }, 5000); // 用户停手 2 秒后自动保存
  }

  function saveDraftToLocal() {
    if (!$uiState.editingNote) return;
    const note = $uiState.editingNote;
    if(note.id) {
      // 已发布笔记的草稿
      const draftKey = `draft_edit_${note.id}`;
      const draftData = { ...note, title, content, visibility, updated_at: new Date().getTime(), location_name: locationName, tags: tagsList };
      saveDraft(draftData);
      showStatus('草稿已自动保存');
    } else {
      // 新笔记的草稿
      const draftKey = `draft_new_${note.lat}_${note.lng}`;
      const draftData = { ...note, title, content, visibility, updated_at: new Date().getTime(), location_name: locationName, tags: tagsList };
      saveDraft(draftData);
      showStatus('草稿已自动保存');
    }
  }

  function showStatus(msg) {
    saveStatus = msg;
    setTimeout(() => saveStatus = '', 3000);
  }

  // ==========================================
  // ⚡️ 完美修复版：与 FloatingCard 保持绝对一致
  // ==========================================
  let previewHtml = '';
  function generatePreview() {
    let rawContent = content || '';
    const token = $currentUser.token;

    // 1. 核心：在 Markdown 解析前，直接用正则替换文本中的相对路径
    if (token) {
      const regex = /(\/uploads\/resources\/[^\s\)"']+)/g;
      rawContent = rawContent.replace(regex, (match) => {
        const separator = match.includes('?') ? '&' : '?';
        return `${SERVER_URL}${match}${separator}token=${token}`;
      });
    }

    // 2. 解析 Markdown 为 HTML
    const rawHtml = marked.parse(rawContent);
    
    // 3. 安全净化 (保留媒体标签和属性)
    previewHtml = DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ['video', 'audio', 'source'],
      ADD_ATTR: ['src', 'controls', 'width', 'height', 'preload', 'type']
    });
  }

  // ==========================================
  // ⚡️ 新增：Markdown 快捷排版引擎
  // ==========================================
  function applyFormat(prefix, suffix = '') {
    if (!textareaRef) return;
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const selectedText = content.substring(start, end);
    
    content = content.substring(0, start) + prefix + selectedText + suffix + content.substring(end);
    
    // 保持光标位置
    setTimeout(() => {
      textareaRef.focus();
      textareaRef.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 10);
  }

  // ==========================================
  // ⚡️ 4. 文件上传与语法插入
  // ==========================================
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    isUploading = true;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await API.uploadFile(formData);
      if (res.success) {
        let insertText = '';
        if (res.type === 'image') insertText = `\n![图片](${res.url})\n`;
        else if (res.type === 'video') insertText = `\n<video src="${res.url}" controls width="100%"></video>\n`;
        else insertText = `\n[📎 附件: ${file.name}](${res.url})\n`;

        insertToCursor(insertText);
      } else {
        alert(`上传失败: ${res.message}`);
      }
    } catch (err) {
      alert('上传出错，请检查网络');
    } finally {
      isUploading = false;
      event.target.value = ''; // 清空 input
    }
  }

  function insertToCursor(text) {
    if (!textareaRef) return;
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    content = content.substring(0, start) + text + content.substring(end);
    
    // 聚焦并移动光标 (需要微小延迟等 DOM 更新)
    setTimeout(() => {
      textareaRef.focus();
      textareaRef.selectionStart = textareaRef.selectionEnd = start + text.length;
    }, 10);
  }

  // ==========================================
  // ⚡️ 修复版：发布/更新笔记
  // ==========================================
  async function handlePublish() {
    if (!title.trim() || !content.trim()) return alert('标题和内容不能为空！');
    
    isPublishing = true;
    const note = $uiState.editingNote;
    const draftKey = note.id ? {id:note.id} : {lat: note.lat, lng: note.lng};

    try {
      let res;
      if (note.id) {
        res = await API.updateNote(note.id, { title, content, visibility, location_name: locationName.trim() || null, tags: tagsList });
      } else {
        res = await API.createNote({ title, content, visibility, lat: note.lat , lng: note.lng, location_name: locationName.trim() || null, tags: tagsList });
      }

      if (res.success) {
        removeDraft(draftKey);
        
        const allNotes = await API.getNotes();
        if (Array.isArray(allNotes)) $notesData = allNotes;
        
        $uiState.isEditorOpen = false;
        $uiState.editingNote = null;
      } else {
        alert('发布失败: ' + res.message);
      }
    } catch (err) {
      console.error(err);
      alert('网络错误，请稍后再试');
    } finally {
      isPublishing = false;
    }
  }

  // ==========================================
  // ⚡️ 双擎逆地理编码 (感知物理世界)
  // ==========================================
  async function fetchAddress(lat, lng) {
    isFetchingAddress = true;
    try {
      // 1. 获取当前用户正在使用的地图底图模式 (高德 or OSM)
      const currentLayer = localStorage.getItem('MAPPIN_LAYER') || 'osm';

      if (currentLayer === 'gaode') {
        // ----------------------------------------
        // 🇨🇳 模式 A：高德精准国内解析
        // ----------------------------------------
        // 核心防御：高德只认火星坐标(GCJ02)！用你写的 toView 进行动态加密
        const [gcjLat, gcjLng] = toView(lat, lng);
        
        // 呼叫你的 Node.js 后端代理
        const res = await API.regeoAmap(gcjLat, gcjLng);
        
        if (res && res.success && res.locationName) {
          locationName = res.locationName;
        }

      } else {
        // ----------------------------------------
        // 🌍 模式 B：OSM 全球网络解析 (Nominatim)
        // ----------------------------------------
        // OSM 直接接收国际标准 WGS84 坐标，无需加密，完全白嫖
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data && data.display_name) {
          // 数据清洗：优先用精准的 name，没有就把冗长的完整地址切取前两段
          locationName = data.name || data.display_name.split(',').slice(0, 2).join(', ');
        }
      }

    } catch (err) {
      console.error('地理坐标解析双擎灾难性失败:', err);
      // 容错处理：即使断网或 API 报错，也不要弹红字报错阻塞用户
      // 直接把地址留空，让用户自己手动填即可
    } finally {
      isFetchingAddress = false;
    }
  }

  // ==========================================
  // 胶囊标签键盘引擎
  // ==========================================
  // function handleTagKeydown(e) {
  //   // 拦截回车和空格
  //   if (e.key === 'Enter' || e.key === ' ') {
  //     e.preventDefault(); // 阻止表单默认提交或输入空格
  //     const newTag = currentTagInput.trim();
      
  //     // 防止重复和空标签
  //     if (newTag && !tagsList.includes(newTag)) {
  //       // 限制标签长度，防止数据库爆炸或 UI 崩坏
  //       if(newTag.length > 15) return alert('单个标签不要超过 15 个字哦');
  //       if(tagsList.length >= 5) return alert('最多只能添加 5 个标签');
        
  //       tagsList = [...tagsList, newTag];
  //     }
  //     currentTagInput = ''; // 清空输入框，准备迎接下一个
  //   }
  //   // 极致手感：如果在输入框为空时按退格键，自动删除最后一个胶囊
  //   if (e.key === 'Backspace' && currentTagInput === '' && tagsList.length > 0) {
  //       tagsList = tagsList.slice(0, -1);
  //   }
  // }

  function removeTag(tagToRemove) {
    tagsList = tagsList.filter(t => t !== tagToRemove);
  }

  // ⚡️ 1. 防抖输入引擎 (监听用户打字)
  function handleTagInput() {
    const val = currentTagInput.trim();
    focusedSuggestIndex = -1; // 用户只要重新打字，高亮焦点就重置
    
    if (!val) {
      suggestedTags = [];
      isSuggesting = false;
      return;
    }

    // 核心：防抖 (Debounce)，憋住 300 毫秒不发请求
    clearTimeout(suggestTimeout);
    suggestTimeout = setTimeout(async () => {
      try {
        const res = await API.completeTag(val); 
        if (res && res.success) {
          suggestedTags = res.data;
          isSuggesting = true;
        }
      } catch (err) {
        console.error('联想提示拉取失败', err);
      }
    }, 300);
  }

  // ⚡️ 2. 键盘状态机 (全面接管回车和上下键)
  function handleTagKeydown(e) {
    const isDropdownOpen = isSuggesting && suggestedTags.length > 0;

    // ⬇️ 向下键
    if (e.key === 'ArrowDown') {
      if (isDropdownOpen) {
        e.preventDefault();
        focusedSuggestIndex = (focusedSuggestIndex + 1) % suggestedTags.length;
      }
      return;
    }

    // ⬆️ 向上键
    if (e.key === 'ArrowUp') {
      if (isDropdownOpen) {
        e.preventDefault();
        focusedSuggestIndex = focusedSuggestIndex <= 0 ? suggestedTags.length - 1 : focusedSuggestIndex - 1;
      }
      return;
    }

    // ❌ Esc 键 (随时退出联想)
    if (e.key === 'Escape') {
      isSuggesting = false;
      focusedSuggestIndex = -1;
      return;
    }

    // 🎯 回车或空格 (确认选择)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      
      let tagToAdd = '';
      
      // 如果下拉框开着，且用户用上下键选了某一项，就用这一项
      if (isDropdownOpen && focusedSuggestIndex > -1) {
        tagToAdd = suggestedTags[focusedSuggestIndex].name;
      } else {
        // 否则就用输入框里现有的字
        tagToAdd = currentTagInput.trim();
      }

      if (tagToAdd && !tagsList.includes(tagToAdd)) {
        if(tagToAdd.length > 15) return alert('单个标签不要超过 15 个字哦');
        if(tagsList.length >= 5) return alert('最多只能添加 5 个标签');
        
        tagsList = [...tagsList, tagToAdd];
      }
      
      // 选完后清理战场
      currentTagInput = ''; 
      suggestedTags = [];
      isSuggesting = false;
      focusedSuggestIndex = -1;
    }

    // 退格键删除上一个胶囊 (保持原逻辑)
    if (e.key === 'Backspace' && currentTagInput === '' && tagsList.length > 0) {
        tagsList = tagsList.slice(0, -1);
    }
  }

  // ⚡️ 3. 鼠标点击直接选择
  function selectSuggestedTag(tagName) {
    if (!tagsList.includes(tagName)) {
        if(tagsList.length >= 5) return alert('最多只能添加 5 个标签');
        tagsList = [...tagsList, tagName];
    }
    currentTagInput = '';
    suggestedTags = [];
    isSuggesting = false;
    focusedSuggestIndex = -1;
    // 选择后让原输入框重新获得焦点 (可选)
    document.getElementById('tag-input').focus();
  }

</script>

<Dialog.Root bind:open={$uiState.isEditorOpen} onOpenChange={(v) => { if(!v) $uiState.editingNote = null; }}>
  <Dialog.Content class="w-full h-[100dvh] max-w-none p-0 flex flex-col md:h-[85vh] md:max-w-4xl md:rounded-2xl overflow-hidden bg-white [&>button.absolute]:hidden" >
    

    <div class="relative px-3 py-3 sm:px-6 sm:py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
      
      <Dialog.Title class="text-base sm:text-xl font-bold flex items-center gap-1.5 sm:gap-2 min-w-0 pr-2">
        <Edit3 class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0" />
        <span class="truncate">{$uiState.editingNote?.id ? '编辑' : '发布'}笔记</span>
      </Dialog.Title>
      
      <div class="flex items-center gap-2 sm:gap-4 shrink-0">
        
        {#if saveStatus}
          <span 
            transition:fade 
            class="absolute left-1/2 -translate-x-1/2 sm:static sm:translate-x-0 text-[10px] sm:text-xs text-green-600 flex items-center font-medium bg-green-50 sm:bg-transparent px-2.5 py-1 sm:p-0 rounded-full shadow-sm sm:shadow-none whitespace-nowrap z-10"
          >
            <Save class="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1" /> {saveStatus}
          </span>
        {/if}
        
        <Button size="sm" class="rounded-full px-3 sm:px-5 h-8 sm:h-9 shadow-md text-xs sm:text-sm transition-all" disabled={isPublishing} onclick={handlePublish}>
          {#if isPublishing}
            <Loader2 class="w-3.5 h-3.5 sm:mr-1.5 animate-spin" /> 
            <span class="hidden sm:inline">处理中...</span>
          {:else}
            <Send class="w-3.5 h-3.5 sm:mr-1.5" /> 
            <span>{$uiState.editingNote?.id ? '保存' : '发布'}</span>
          {/if}
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          class="rounded-full w-8 h-8 text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 active:scale-95 transition-all shrink-0"
          onclick={() => { 
            $uiState.isEditorOpen = false; 
            $uiState.editingNote = null; 
          }}
          title="关闭编辑器"
        >
          <X class="w-4 sm:w-5 h-4 sm:h-5" />
          <span class="sr-only">关闭</span>
        </Button>

      </div>
    </div>

    <div class="flex flex-col flex-1 overflow-hidden p-6 gap-6">
      
      <div class="flex flex-col gap-3 shrink-0 pb-2">

        <Input 
          id="title" 
          bind:value={title} 
          placeholder="给笔记起个名字..." 
          aria-label="标题"
          class="text-base md:text-lg font-bold h-11 shadow-sm focus-visible:ring-blue-500 border-gray-200" 
        />

        <div class="flex flex-wrap items-center gap-2 min-h-[36px] p-1.5 border border-transparent focus-within:border-gray-200 focus-within:bg-gray-50/50 rounded-lg transition-colors">
            
            {#each tagsList as tag}
                <div transition:fade={{duration: 150}} class="flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-600 rounded-full text-xs font-medium group">
                    <span>#{tag}</span>
                    <button 
                        class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-blue-200 hover:text-blue-800 transition-colors"
                        onclick={() => removeTag(tag)}
                        title="删除标签"
                    >
                        <X class="w-2.5 h-2.5" />
                    </button>
                </div>
            {/each}

            {#if tagsList.length < 5}


              <div class="relative flex-1 min-w-[150px]">
                  <input 
                      id="tag-input"
                      type="text" 
                      bind:value={currentTagInput}
                      oninput={handleTagInput}       onkeydown={handleTagKeydown}   placeholder={tagsList.length === 0 ? "添加标签 (空格或回车生成) ..." : "继续添加..."}
                      class="w-full bg-transparent border-none outline-none text-sm text-gray-600 placeholder:text-gray-400 focus:ring-0 px-1"
                      autocomplete="off"             />

                  {#if isSuggesting && currentTagInput.trim().length > 0}
                      <div class="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden">
                          {#if suggestedTags.length > 0}
                              <div class="px-3 py-1 text-[10px] font-bold text-gray-400 tracking-wider">猜你想搜</div>
                              {#each suggestedTags as suggest, index}
                                  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions  -->
                                  <div 
                                      class="flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors
                                            {focusedSuggestIndex === index ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}"
                                      onclick={() => selectSuggestedTag(suggest.name)}
                                      onmouseenter={() => focusedSuggestIndex = index} >
                                      <span class="font-medium">
                                          <span class="text-blue-600">{currentTagInput.trim()}</span>{suggest.name.substring(currentTagInput.trim().length)}
                                      </span>
                                      <span class="text-[10px] text-gray-400">{suggest.usage_count} 篇</span>
                                  </div>
                              {/each}
                          {:else}
                              <div class="px-4 py-3 text-sm text-gray-500 flex flex-col items-center justify-center text-center">
                                  <span class="text-gray-400 mb-1">未找到相关标签</span>
                                  <span class="text-xs text-blue-500 font-medium">按下回车或空格直接创建</span>
                              </div>
                          {/if}
                      </div>
                  {/if}
              </div>             
            {/if}
            
            {#if tagsList.length >= 5}
                <span class="text-xs text-orange-400 ml-2">最多 5 个标签</span>
            {/if}
        </div>

        <div class="flex flex-row items-center gap-3">

          <div class="relative flex items-center flex-1 group min-w-0">
            <div class="absolute left-3 text-gray-400 group-focus-within:text-blue-500 transition-colors">
              {#if isFetchingAddress}
                <Loader2 class="w-4 h-4 animate-spin" />
              {:else}
                <MapPin class="w-4 h-4" />
              {/if}
            </div>
            <Input 
              id="location" 
              bind:value={locationName} 
              placeholder={isFetchingAddress ? "定位中..." : "你在哪里？(可修改)"} 
              aria-label="物理位置"
              class="pl-9 h-10 text-sm bg-gray-50/50 border-gray-200 text-gray-600 focus:bg-white focus:border-blue-300 transition-all shadow-sm w-full truncate" 
            />
          </div>

          <select 
            id="visibility" 
            bind:value={visibility} 
            aria-label="可见性"
            class="flex h-10 w-28 md:w-32 shrink-0 items-center justify-between rounded-md border border-gray-200 bg-white px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow cursor-pointer hover:bg-gray-50"
          >
            <option value="public">🌍 公开</option>
            <option value="friends">👥 好友</option>
            <option value="private">🔒 私密</option>
          </select>

        </div>
      </div>

      <div class="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white transition-all shadow-sm">
        
        <div class="flex items-center gap-1 p-2 border-b border-gray-200 bg-white shrink-0 overflow-x-auto">
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" disabled={isPreviewMode} onclick={() => applyFormat('**', '**')} title="加粗"><Bold class="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" disabled={isPreviewMode} onclick={() => applyFormat('*', '*')} title="斜体"><Italic class="w-4 h-4" /></Button>
          <div class="w-[1px] h-4 bg-gray-300 mx-1"></div>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" disabled={isPreviewMode} onclick={() => applyFormat('### ', '')} title="标题"><Heading class="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" disabled={isPreviewMode} onclick={() => applyFormat('> ', '')} title="引用"><Quote class="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" disabled={isPreviewMode} onclick={() => applyFormat('- ', '')} title="无序列表"><List class="w-4 h-4" /></Button>
          <div class="w-[1px] h-4 bg-gray-300 mx-1"></div>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-gray-500 hover:text-gray-900" disabled={isPreviewMode} onclick={() => applyFormat('[', '](url)')} title="链接"><Link class="w-4 h-4" /></Button>
          
          <input type="file" id="file-upload" class="hidden" accept="image/*,video/*,audio/*" onchange={handleFileUpload}>
          <Button variant="ghost" size="sm" class="h-8 px-2 text-gray-500 hover:text-blue-600" disabled={isUploading || isPreviewMode} onclick={() => document.getElementById('file-upload').click()}>
            {#if isUploading}
              <Loader2 class="w-4 h-4 mr-1 animate-spin" /> 上传
            {:else}
              <ImageIcon class="w-4 h-4 mr-1" /> 媒体
            {/if}
          </Button>

          <div class="flex-1"></div>
          
          <Button variant={isPreviewMode ? "default" : "outline"} size="sm" class="h-8 transition-all shadow-sm" onclick={togglePreview}>
            {#if isPreviewMode}
              <Edit3 class="w-3.5 h-3.5 mr-1.5" /> 继续编辑
            {:else}
              <Eye class="w-3.5 h-3.5 mr-1.5" /> 预览效果
            {/if}
          </Button>
        </div>

        <div class="flex-1 relative overflow-hidden bg-transparent">
          
          {#if isPreviewMode}
            <div class="absolute inset-0 overflow-y-auto p-5 bg-white">
              {#if content.trim() === ''}
                <div class="h-full flex items-center justify-center text-gray-400 text-sm">还没有写任何内容哦，切回编辑模式开始创作吧~</div>
              {:else}
                <div class="prose prose-sm prose-slate max-w-none prose-img:rounded-xl prose-img:shadow-sm">
                  {@html previewHtml}
                </div>
              {/if}
            </div>
          {:else}
            <textarea 
              bind:this={textareaRef}
              bind:value={content}
              placeholder="支持 Markdown 语法。在这里记录你的故事..."
              class="absolute inset-0 w-full h-full p-5 bg-transparent border-none focus:ring-0 focus:outline-none resize-none font-mono text-sm leading-relaxed text-gray-700"
            ></textarea>
          {/if}

        </div>
      </div>

    </div>
  </Dialog.Content>
</Dialog.Root>