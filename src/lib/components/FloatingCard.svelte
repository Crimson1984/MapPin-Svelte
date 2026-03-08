<script>
  import { fade, fly } from 'svelte/transition';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  
  import { uiState, currentUser } from '$lib/stores.js';
  import { X, User, Clock, Edit3, Trash2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';


  import { API } from '$lib/utils/api.js';
  import { notesData } from '$lib/stores.js'; // 用于拉取最新地图数据
  import { removeDraft } from '$lib/utils/draftManager.js'; // 引入草稿清理员

  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

  let cleanHtml = '';
  let cardElement; // 引用卡片 DOM，用于拖拽重置

  // ⚡️ 响应式引擎
  $: if ($uiState.activeNote) {
    parseMarkdown($uiState.activeNote);
    
    // 每次点击新笔记时，清除之前拖拽留下的自定义坐标，让卡片回到默认智能避让位置
    if (cardElement) {
      cardElement.style.left = '';
      cardElement.style.top = '';
      cardElement.style.right = '';
      cardElement.style.bottom = '';
    }
  }

  function parseMarkdown(note) {
    let rawContent = note.content || '';
    const token = $currentUser.token;

    if (token) {
      const regex = /(\/uploads\/resources\/[^\s\)"']+)/g;
      rawContent = rawContent.replace(regex, (match) => {
        const separator = match.includes('?') ? '&' : '?';
        return `${SERVER_URL}${match}${separator}token=${token}`;
      });
    }

    const rawHtml = marked.parse(rawContent);
    cleanHtml = DOMPurify.sanitize(rawHtml, {
      ADD_TAGS: ['video', 'audio', 'source'],
      ADD_ATTR: ['src', 'controls', 'width', 'height', 'preload', 'type']
    });
  }

  function closeCard() { $uiState.activeNote = null; }

  function openProfile(username) {
    $uiState.currentProfileUser = username;
    $uiState.isProfileDrawerOpen = true;
  }

  function handleEdit() {
    $uiState.editingNote = $uiState.activeNote; // 把当前阅读的笔记塞进编辑器
    $uiState.isEditorOpen = true;               // 打开编辑器大门
    $uiState.activeNote = null;                 // 关闭当前的阅读卡片
  }
        
    
  

  // ==========================================
  // 🗑️ 处理删除逻辑 (精准区分草稿与正式笔记)
  // ==========================================
  async function handleDelete() {
    const note = $uiState.activeNote;
    if (!note) return;

    // 🟢 情况 A: 删除未发布的【本地草稿】(没有 ID)
    if (note.id === undefined) {
      if (confirm('确定要丢弃这个草稿吗？')) {
        // 根据坐标精准制导，删除本地存储
        removeDraft({ lat: note.lat, lng: note.lng }); 
        
        $uiState.activeNote = null; // 关闭卡片
        // 注：removeDraft 内部已经调用了 refreshDraftsStore，地图上的灰点会自动消失
      }
      return;
    }

    // 🔴 情况 B: 删除已发布的【正式笔记】(有 ID)
    if (confirm('⚠️ 确定要永久删除这篇笔记吗？此操作不可恢复！')) {
      try {
        // 1. 呼叫后端删除数据库记录
        const res = await API.deleteNote(note.id);
        
        if (res.success) {
          // 2. 清理掉它可能遗留在本地的修改痕迹 (根据 ID 清理)
          removeDraft({ id: note.id });
          
          // 3. 关闭当前阅读卡片
          $uiState.activeNote = null; 
          
          // 4. 重新拉取一次云端数据，彻底刷新地图上的红点
          const allNotes = await API.getNotes();
          if (Array.isArray(allNotes)) {
            $notesData = allNotes;
          }
        } else {
          alert('删除失败: ' + res.message);
        }
      } catch (err) {
        console.error("删除笔记失败:", err);
        alert('网络错误，请稍后再试');
      }
    }
  }

  // ==========================================
  // ⚡️ 超级拖拽引擎 4.0 (Translate 偏移版)
  // ==========================================
  function draggable(node) {
    let isDragging = false;
    let startX, startY;
    let initialOffsetX, initialOffsetY;

    function onMouseDown(e) {
      if (window.innerWidth < 768) return;
      if (e.target.closest('button') || e.target.closest('input')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // 读取当前全局保存的偏移量（如果没有，就是 0）
      initialOffsetX = $uiState.cardOffset?.x || 0;
      initialOffsetY = $uiState.cardOffset?.y || 0;

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // ⚡️ 直接操作现代 CSS 的 translate 属性，绝对不会和 Tailwind 或 Svelte 打架！
      node.style.translate = `${initialOffsetX + dx}px ${initialOffsetY + dy}px`;
    }

    function onMouseUp(e) {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      // ⚡️ 拖拽结束：把最终的偏移量存入全局！
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      $uiState.cardOffset = {
        x: initialOffsetX + dx,
        y: initialOffsetY + dy
      };
    }

    const handle = node.querySelector('.drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', onMouseDown);
    }

    return {
      destroy() { if (handle) handle.removeEventListener('mousedown', onMouseDown); }
    };
  }
</script>

{#if $uiState.activeNote}
  <div 
    bind:this={cardElement}
    use:draggable
    class="
      fixed z-50 flex flex-col overflow-hidden bg-white/95 backdrop-blur-xl shadow-2xl transition-opacity duration-300 border-gray-100
      w-full max-h-[85vh] 
      max-md:bottom-0 max-md:left-0 max-md:rounded-t-3xl max-md:border-t 
      md:absolute md:top-24 md:w-[400px] md:rounded-2xl md:border md:max-h-[80vh]
      {$uiState.cardPosition === 'left' ? 'md:left-6' : 'md:right-6'}
    "
    style:translate={$uiState.cardOffset ? `${$uiState.cardOffset.x}px ${$uiState.cardOffset.y}px` : "0px 0px"}
    in:fly={{ y: window.innerWidth < 768 ? 100 : 20, duration: 300 }}
    out:fade={{ duration: 200 }}
  >
    
    <div class="drag-handle px-5 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50 md:cursor-grab md:active:cursor-grabbing">
      
      <div class="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-300 rounded-full md:hidden"></div>

      <div class="mt-2 md:mt-0">
        <h2 class="text-xl font-bold text-gray-800 leading-tight">
          {@html DOMPurify.sanitize($uiState.activeNote.title || '无标题草稿')}
          {#if $uiState.activeNote.id === undefined}
            <span class="ml-2 text-xs font-normal px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-md">草稿</span>
          {/if}
        </h2>
        
        <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <button class="flex items-center hover:text-blue-600 transition" onclick={() => openProfile($uiState.activeNote.username)}>
            <User class="w-3.5 h-3.5 mr-1" /> {$uiState.activeNote.username || $currentUser.username}
          </button>
          <span class="flex items-center">
            <Clock class="w-3.5 h-3.5 mr-1" /> 
            {new Date($uiState.activeNote.created_at || $uiState.activeNote.lastModified).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      <button class="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition relative z-10" onclick={closeCard}>
        <X class="w-5 h-5" />
      </button>
    </div>

    <ScrollArea class="flex-1 px-5 py-4 overflow-y-auto">
      <div class="prose prose-sm prose-slate max-w-none prose-img:rounded-xl prose-img:shadow-sm pb-8">
        {@html cleanHtml}
      </div>
    </ScrollArea>

    {#if $uiState.activeNote.id === undefined || $uiState.activeNote.username === $currentUser.username}
      <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 shrink-0">
        <Button variant="outline" size="sm" onclick={handleEdit}>
          <Edit3 class="w-4 h-4 mr-1.5" /> 编辑
        </Button>
        <Button variant="destructive" size="sm" onclick={handleDelete}>
          <Trash2 class="w-4 h-4 mr-1.5" /> 删除
        </Button>
      </div>
    {/if}

  </div>
{/if}