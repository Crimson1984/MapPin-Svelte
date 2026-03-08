<script>
  import { onMount } from 'svelte';
  import Map from '$lib/components/Map.svelte';
  import AuthModal from '$lib/components/AuthModal.svelte'; // ⚡️ 引入登录框
  import UserProfileBadge from '$lib/components/UserProfileBadge.svelte';
  import ProfileDrawer from '$lib/components/ProfileDrawer.svelte';
  import FloatingCard from '$lib/components/FloatingCard.svelte';
  import NoteEditor from '$lib/components/NoteEditor.svelte';
  import SearchBar from '$lib/components/SearchBar.svelte';
  
  import { notesData, currentUser, uiState } from '$lib/stores.js';
  import { refreshDraftsStore } from '$lib/utils/draftManager.js';
  import { API } from '$lib/utils/api.js';

 

  onMount(async () => {
    refreshDraftsStore();
    
    // 只有当用户确实登录了（有 Token），我们才去拉取数据
    if ($currentUser.isLoggedIn) {
      await loadServerNotes();
    } else {
       // 如果没登录，触发登录弹窗
       uiState.update(s => ({ ...s, isAuthModalOpen: true })); 
       // 其实这句不用写，因为如果没登录去调 API，api.js 里的拦截器会自动把这个变量设为 true
    }
  });

  async function loadServerNotes() {
      try {
        const res = await API.getNotes(); 
        // ⚡️ 核心修复：后端返回的直接是一个数组，所以我们用 Array.isArray 来判断
        if (Array.isArray(res)) {
          $notesData = res; // 直接把整个数组塞给状态库！
        } else if (res.success && res.data) {
          // 兼容一下如果你以后改了后端返回格式
          $notesData = res.data;
        }
      } catch (err) {
        console.error("加载笔记失败", err);
      }
    }
</script>

<main class="relative h-screen w-screen overflow-hidden bg-gray-100">
  
  <Map />

  <UserProfileBadge />

  <SearchBar />

  <ProfileDrawer />

  <AuthModal />

  <FloatingCard />

  <NoteEditor />

</main>