<script>
  import { fade } from 'svelte/transition';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  
  import { uiState, currentUser, notesData } from '$lib/stores.js';
  import { API } from '$lib/utils/api.js';

  import {removeDraft, saveDraft} from '$lib/utils/draftManager.js'; // ⚡️ 引入草稿管理器
  
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Save, Send, Image as ImageIcon, Eye, Edit3, Loader2, Bold, Italic, Heading, Quote, List, Link, X} from 'lucide-svelte';

  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

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

    if (note.id) {
      // 🟢 情况 A: 用户正在【修改已发布的笔记】
      const draftKey = `draft_edit_${note.id}`;
      const savedDraft = localStorage.getItem(draftKey);
      
      // 只有存在修改痕迹时，才弹窗询问是否覆盖数据库原版
      if (savedDraft && confirm(`检测到未发布的修改痕迹，是否恢复？`)) {
        const parsed = JSON.parse(savedDraft);
        title = decodeHtml(parsed.title) || '';
        content = decodeHtml(parsed.content) || '';
        visibility = parsed.visibility || 'public';
      } else {
        title = decodeHtml(note.title) || '';
        content = decodeHtml(note.content) || '';
        visibility = note.visibility || 'public';
      }
    } else {
      // 🟢 情况 B: 用户正在【写新笔记】(从小窗点"详细"进来，或点击地图上的灰点进来)
      // 这时没有数据库原版冲突，草稿就是唯一真理！直接静默加载，绝不弹窗打扰！
      title = decodeHtml(note.title) || '';
      content = decodeHtml(note.content) || '';
      visibility = note.visibility || 'public';
    }
    
    saveStatus = '';
  }

  // ==========================================
  // ⚡️ 2. 自动保存引擎 (防抖机制)
  // ==========================================
  // 只要 title 或 content 发生变化，就会触发这个响应式块
  $: if ($uiState.isEditorOpen && (title !== undefined || content !== undefined)) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveDraftToLocal();
    }, 2000); // 用户停手 2 秒后自动保存
  }

  function saveDraftToLocal() {
    if (!$uiState.editingNote) return;
    const note = $uiState.editingNote;
    if(note.id) {
      // 已发布笔记的草稿
      const draftKey = `draft_edit_${note.id}`;
      const draftData = { ...note, title, content, visibility, updated_at: new Date().getTime() };
      saveDraft(draftData);
      showStatus('草稿已自动保存');
    } else {
      // 新笔记的草稿
      const draftKey = `draft_new_${note.lat}_${note.lng}`;
      const draftData = { ...note, title, content, visibility, updated_at: new Date().getTime() };
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
    const draftKey = note.id ? `draft_edit_${note.id}` : `draft_new_${note.lat}_${note.lng}`;

    try {
      let res;
      if (note.id) {
        res = await API.updateNote(note.id, { title, content, visibility });
      } else {
        res = await API.createNote({ title, content, visibility, lat: note.lat, lng: note.lng });
      }

      if (res.success) {
        localStorage.removeItem(draftKey);
        
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
</script>

<Dialog.Root bind:open={$uiState.isEditorOpen} onOpenChange={(v) => { if(!v) $uiState.editingNote = null; }}>
  <Dialog.Content class="w-full h-[100dvh] max-w-none p-0 flex flex-col md:h-[85vh] md:max-w-4xl md:rounded-2xl overflow-hidden bg-white [&>button.absolute]:hidden" >
    
    <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
      <Dialog.Title class="text-xl font-bold flex items-center gap-2">
        <Edit3 class="w-5 h-5 text-blue-500" />
        {$uiState.editingNote?.id ? '编辑笔记' : '发布笔记'}
      </Dialog.Title>
      
      <div class="flex items-center gap-4">
        {#if saveStatus}
          <span transition:fade class="text-xs text-green-600 flex items-center font-medium">
            <Save class="w-3.5 h-3.5 mr-1" /> {saveStatus}
          </span>
        {/if}
        
        <Button size="sm" class="rounded-full px-5 shadow-md" disabled={isPublishing} onclick={handlePublish}>
          {#if isPublishing}
            <Loader2 class="w-4 h-4 mr-2 animate-spin" /> 处理中...
          {:else}
            <Send class="w-4 h-4 mr-2" /> {$uiState.editingNote?.id ? '保存修改' : '立即发布'}
          {/if}
        </Button>

        <!-- <div class="w-[1px] h-6 bg-gray-200 mx-1 hidden sm:block"></div> -->

        <Button 
          variant="ghost" 
          size="icon" 
          class="rounded-full w-8 h-8 text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 active:scale-95 transition-all"
          onclick={() => { 
            $uiState.isEditorOpen = false; 
            $uiState.editingNote = null; 
          }}
          title="关闭编辑器"
        >
          <X class="w-5 h-5" />
          <span class="sr-only">关闭</span>
        </Button>

      </div>
    </div>

    <div class="flex flex-col flex-1 overflow-hidden p-6 gap-6">
      
      <div class="flex flex-col md:flex-row gap-4 shrink-0">
        <div class="flex-1 space-y-2">
          <Label for="title" class="text-gray-500">标题</Label>
          <Input id="title" bind:value={title} placeholder="给这个足迹起个名字..." class="text-lg font-medium h-12" />
        </div>
        <div class="w-full md:w-48 space-y-2">
          <Label for="visibility" class="text-gray-500">可见性</Label>
          <select 
            id="visibility" 
            bind:value={visibility} 
            class="flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="public">🌍 公开 (所有人可见)</option>
            <option value="friends">👥 仅好友可见</option>
            <option value="private">🔒 私密 (仅自己可见)</option>
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