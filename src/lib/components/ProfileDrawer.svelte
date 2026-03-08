<script>
  import { uiState, notesData, currentUser } from '$lib/stores.js';
  import { API } from '$lib/utils/api.js';
  
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { tick } from 'svelte';

  import 'cropperjs';

  import { 
    Loader2, AlertCircle, Settings, Users, UserPlus, MapPin, Ghost, Navigation,UserMinus, 
    UserCheck, Clock,Check, X, Bell,Trash2,Camera, Save, Lock, LogOut
  } from 'lucide-svelte';

  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

  let profileData = null;
  let userNotes = [];
  let isLoading = false;
  let errorMessage = '';
  let isActionLoading = false; // ⚡️ 新增：按钮防抖与加载状态

  // 补充收件箱状态变量
  let pendingRequests = []; // 存放待处理的好友请求
  let respondingId = null;  // 正在处理中的请求 ID (用于按钮转圈防抖)
  let myFriends = []; // ⚡️ 新增：存放好友列表
  let isRemoving = null; // ⚡️ 新增：正在删除哪个好友（用于列表按钮转圈防抖）

  // 编辑资料相关的状态变量
  let isEditingProfile = false;
  let editBio = '';
  let isSavingProfile = false;
  let isUploadingAvatar = false;

  // Cropper状态变量
  let isCropModalOpen = false;
  let cropImageSrc = '';        // 待裁剪的原图 base64
  let cropperSelection;         // ⚡️ 绑定到 <cropper-selection> 组件实例

  // ⚡️ 响应式魔法：只要 isProfileDrawerOpen 变成 true，且有了目标用户，就立刻去后端拉取数据
  $: if ($uiState.isProfileDrawerOpen && $uiState.currentProfileUser) {
    loadProfile($uiState.currentProfileUser);
  }

  async function loadProfile(username) {
    isLoading = true;
    errorMessage = '';
    profileData = null;
    userNotes = [];
    pendingRequests = [];
    myFriends = []; // 每次加载先清空

    try {
      // 1. 获取用户资料与关系
      const resProfile = await API.getUserProfile(username);
      if (!resProfile.success) throw new Error(resProfile.message);
      profileData = resProfile;

      // 2. 获取该用户的笔记 
      // ⚠️ 注意：这需要你的 API.getNotes 支持传参 ?targetUser=xxx
      const resNotes = await API.getNotes(username); 
      if (resNotes) {
        userNotes = resNotes;
      }

      if (profileData.relation === 'self') {
        const resNetwork = await API.getMyNetwork();
        if (resNetwork && resNetwork.success) {
          pendingRequests = resNetwork.pendingRequests || [];
          myFriends = resNetwork.friends || [];
        }
      }
    } catch (err) {
      errorMessage = err.message || '加载主页失败';
    } finally {
      isLoading = false;
    }
  }

  // 关闭抽屉并在关闭时清空数据
  function handleOpenChange(isOpen) {
    $uiState.isProfileDrawerOpen = isOpen;
    if (!isOpen) {
      setTimeout(() => { profileData = null; }, 300); // 等动画结束再清空
    }
  }

  // ==========================================
  // ⚡️ 社交功能：添加好友
  // ==========================================
  async function handleAddFriend() {
    isActionLoading = true;
    try {
      const res = await API.sendFriendRequest(profileData.profile.username);
      if (res.success) {
        // 请求发送成功，重新拉取当前抽屉的用户数据，刷新按钮状态（变成“已发送请求”）
        await loadProfile(profileData.profile.username);
      } else {
        alert(res.message || '发送请求失败');
      }
    } catch (err) {
      alert('网络错误，请稍后再试');
    } finally {
      isActionLoading = false;
    }
  }

  // ==========================================
  // ⚡️ 社交功能：解除好友 (支持主页头部 和 列表页 共用)
  // ==========================================
  async function handleRemoveFriend(targetUsername) {
    // 如果有传参就用参数（从列表点击），没传参就用当前看的主页人（从头部点击）
    const target = typeof targetUsername === 'string' ? targetUsername : profileData.profile.username;
    
    if (!confirm(`确定要和 ${target} 解除好友关系吗？\n解除后你们将无法查看对方的私密足迹。`)) {
      return; 
    }

    isActionLoading = true; // 锁定头部按钮
    isRemoving = target;    // 锁定列表里的特定垃圾桶按钮
    
    try {
      const res = await API.removeFriend(target);
      if (res.success) {
        // 1. 根据当前在看谁的主页，决定刷新逻辑
        if ($uiState.currentProfileUser === $currentUser.username) {
          await loadProfile($currentUser.username); // 如果在看自己的列表，刷新列表
        } else {
          await loadProfile(target); // 如果在看对方的主页，刷新头部的按钮状态
        }
        
        // 2. 刷新全局地图数据
        const allNotes = await API.getNotes();
        if (Array.isArray(allNotes)) $notesData = allNotes;
      } else {
        alert(res.message || '删除失败');
      }
    } catch (err) {
      console.error(err);
      alert('网络错误，请稍后再试');
    } finally {
      isActionLoading = false;
      isRemoving = null;
    }
  }

  // ==========================================
  // ⚡️ 社交功能：处理好友请求 (信箱与主页共用)
  // ==========================================
  async function handleRespond(id, action) {
    respondingId = id; // 锁定当前按钮 (用于信箱卡片转圈)
    isActionLoading = true; // 锁定全局状态 (用于主页头部按钮转圈)
    
    try {
      const res = await API.respondToRequest(id, action);
      
      if (res.success) {
        // 1. 信箱列表乐观更新：从本地数组中瞬间剔除该请求
        pendingRequests = pendingRequests.filter(req => req.id !== id);

        // 2. ⚡️ 核心联动：如果我们在看别人的主页，操作完后立刻重新拉取他的资料！
        // 这样头部的按钮就会瞬间从 "同意/拒绝" 变成 "已是好友" 或 "加为好友"
        if ($uiState.currentProfileUser) {
          await loadProfile($uiState.currentProfileUser);
        }

        // 3. 如果同意了请求，必须重新拉取地图数据，因为权限发生变化了
        if (action === 'accepted') {
          const allNotes = await API.getNotes();
          if (Array.isArray(allNotes)) $notesData = allNotes;
        }
      } else {
        alert(res.message || '操作失败');
      }
    } catch (err) {
      console.error(err);
      alert('网络错误，请稍后再试');
    } finally {
      respondingId = null; 
      isActionLoading = false;
    }
  }

  // ==========================================
  // ⚡️ 编辑资料逻辑
  // ==========================================
  function startEditProfile() {
    // 把当前的签名塞进临时草稿变量里
    editBio = profileData.profile.bio || '';
    isEditingProfile = true;
  }

  async function saveProfileData() {
    isSavingProfile = true;
    try {
      const res = await API.updateProfile(editBio);
      if (res.success) {
        // 保存成功，更新本地展示数据，退出编辑模式
        profileData.profile.bio = editBio;
        isEditingProfile = false;
      } else {
        alert(res.message || '保存失败');
      }
    } catch (err) {
      console.error(err);
      alert('网络错误，请稍后再试');
    } finally {
      isSavingProfile = false;
    }
  }

  // ==========================================
  // ⚡️ 3. 拦截原有的上传逻辑，打开弹窗
  // ==========================================
  function handleAvatarSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      cropImageSrc = e.target.result;
      isCropModalOpen = true; // Web Components 自己会初始化，不需要手动 new 了！
    };
    reader.readAsDataURL(file);
    
    event.target.value = ''; 
  }

  // ==========================================
  // ⚡️ 4. 确认裁剪并上传 (2.0 异步高阶玩法)
  // ==========================================
  async function confirmCrop() {
    if (!cropperSelection) return;

    isUploadingAvatar = true;
    isCropModalOpen = false; // 先关弹窗，后台默默处理

    try {
      // ⚡️ 2.0 专属魔法：直接调用选区组件的 $toCanvas 方法生成画布
      const canvas = await cropperSelection.$toCanvas({
        width: 300,
        height: 300,
      });

      // 转成 Blob 并上传
      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.png'); 

        const res = await API.uploadAvatar(formData);
        if (res.success) {
          profileData.profile.avatar = res.avatarUrl;
        } else {
          alert(res.message || '上传头像失败');
        }
        isUploadingAvatar = false;
      }, 'image/png');

    } catch (err) {
      console.error('裁图或上传失败:', err);
      alert('网络错误，请稍后再试');
      isUploadingAvatar = false;
    }
  }

  // 取消裁剪
  function cancelCrop() {
    isCropModalOpen = false;
    cropImageSrc = '';
  }

// ==========================================
// ⚡️ 互动：点击足迹卡片
// ==========================================
function handleNoteClick(note) {
  // 1. 激活卡片：把选中的笔记赋值给全局状态，触发地图中央的浮窗显示
  $uiState.activeNote = note;

  // 2. 收起抽屉：为了防止侧边栏挡住弹出的足迹详情，点击后必须顺滑关闭抽屉
  $uiState.isProfileDrawerOpen = false;

  $uiState.cardPosition = 'left';

  // 3. ⚡️ 下发飞行指令！(注意核对你数据库里经纬度字段的名字是 lat/lng 还是 latitude/longitude)
    // 这里假设你的字段名是 latitude 和 longitude
    if (note.lat && note.lng) {
      $uiState.flyToLocation = { 
        lat: note.lat, 
        lng: note.lng 
      };
    }
}

  // ==========================================
  // ⚡️ 退出登录逻辑
  // ==========================================
  function handleLogout() {
    // 1. 物理销毁：清空 localStorage 里的令牌
    localStorage.removeItem('userToken');
    
    // (可选) 如果你还存了用户信息，一并带走
    localStorage.removeItem('username');
    
    // 2. 状态复位：把全局的用户状态设为未登录
    $currentUser = { 
      isLoggedIn: false, 
      token: null, 
      username: '',  
    };

    // 视线清理：关闭当前的个人主页抽屉/侧边栏
    $uiState.isProfileDrawerOpen = false;

    $uiState.isAuthModalOpen = true;
  }
</script>

<Sheet.Root open={$uiState.isProfileDrawerOpen} onOpenChange={handleOpenChange}>
  <Sheet.Content side="right" class="w-full max-w-[100vw] sm:w-[400px] md:w-[540px] p-0 flex flex-col bg-white overflow-hidden">
    
    {#if isLoading}
      <div class="flex-1 flex flex-col items-center justify-center text-gray-400">
        <Loader2 class="w-8 h-8 animate-spin mb-4 text-primary" />
        <span class="text-sm tracking-widest">加载数据中...</span>
      </div>
      
    {:else if errorMessage}
      <div class="flex-1 flex flex-col items-center justify-center text-red-500 p-6">
        <AlertCircle class="w-16 h-16 mb-4 opacity-80" />
        <p class="font-medium text-center">{errorMessage}</p>
      </div>
      
    {:else if profileData}
      
      <div class="bg-gradient-to-b from-blue-50/50 to-white p-6 sm:p-8 border-b border-gray-100 flex flex-col items-center relative shrink-0">
        
        <div class="relative mb-3 sm:mb-4">
          <Avatar.Root class="h-20 w-20 sm:h-24 sm:w-24 shadow-lg ring-4 {isEditingProfile ? 'ring-blue-400 border-2 border-dashed border-blue-500' : 'ring-white'} transition-all">
            <Avatar.Image src={profileData.profile.avatar ? `${SERVER_URL}${profileData.profile.avatar}` : `${SERVER_URL}/uploads/avatars/default-avatar.png`} />
            <Avatar.Fallback class="text-2xl">{profileData.profile.username.charAt(0).toUpperCase()}</Avatar.Fallback>
          </Avatar.Root>
          
          {#if isEditingProfile}
            <label class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full cursor-pointer hover:bg-black/50 transition-colors group">
              {#if isUploadingAvatar}
                <Loader2 class="w-6 h-6 text-white animate-spin" />
              {:else}
                <Camera class="w-6 h-6 text-white/80 group-hover:text-white" />
              {/if}
              <input type="file" accept="image/*" class="hidden" onchange={handleAvatarSelect} disabled={isUploadingAvatar} />
            </label>
          {/if}
        </div>
        
        <h2 class="text-xl sm:text-2xl font-extrabold text-gray-800 tracking-tight">{profileData.profile.username}</h2>
        
        <div class="mt-2 w-full max-w-sm px-2 sm:px-4 flex flex-col items-center">
          {#if isEditingProfile}
            <textarea 
              bind:value={editBio} 
              placeholder="写点个性签名吧..." 
              class="w-full text-sm text-center text-gray-700 bg-white border border-blue-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
              rows="2"
            ></textarea>
          {:else}
            <p class="text-xs sm:text-sm text-gray-500 text-center leading-relaxed whitespace-pre-wrap">
              {profileData.profile.bio || '这个人很懒，什么都没写~'}
            </p>
          {/if}
        </div>

        <div class="mt-4 sm:mt-6 flex gap-3">
          {#if profileData.relation === 'self'}
            
            {#if isEditingProfile}
              <Button size="sm" class="rounded-full px-6 shadow-md" disabled={isSavingProfile} onclick={saveProfileData}>
                {#if isSavingProfile}
                  <Loader2 class="w-4 h-4 mr-1.5 animate-spin" /> 保存中...
                {:else}
                  <Save class="w-4 h-4 mr-1.5" /> 保存
                {/if}
              </Button>
              <Button variant="outline" size="sm" class="rounded-full px-4 text-gray-500" disabled={isSavingProfile} onclick={() => isEditingProfile = false}>
                取消
              </Button>
            {:else}
              <Button variant="outline" class="rounded-full px-6 shadow-sm hover:bg-gray-50" onclick={startEditProfile}>
                <Settings class="w-4 h-4 mr-2" /> 编辑资料
              </Button>

              <Button 
                  variant="outline" 
                  class="rounded-full px-4 shadow-sm text-red-500 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors" 
                  onclick={handleLogout}
                >
                  <LogOut class="w-4 h-4 mr-1.5" /> 退出
                </Button>
            {/if}
            
          {:else if profileData.relation === 'friend'}
            <Button 
              variant="outline" 
              class="rounded-full px-6 border-green-200 text-green-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 group transition-all"
              disabled={isActionLoading}
              onclick={handleRemoveFriend}
            >
              {#if isActionLoading}
                <Loader2 class="w-4 h-4 mr-2 animate-spin" /> 处理中...
              {:else}
                <span class="group-hover:hidden flex items-center"><UserCheck class="w-4 h-4 mr-2" /> 已是好友</span>
                <span class="hidden group-hover:flex items-center"><UserMinus class="w-4 h-4 mr-2" /> 解除关系</span>
              {/if}
            </Button>

          {:else if profileData.relation === 'pending_sent'}
            <Button variant="secondary" disabled class="rounded-full px-6">
              <Clock class="w-4 h-4 mr-2" /> 请求已发送
            </Button>

          {:else if profileData.relation === 'pending_received'}
            <Button 
              class="rounded-full px-6 shadow-md bg-blue-600 hover:bg-blue-700 text-white" 
              disabled={isActionLoading} 
              onclick={() => handleRespond(profileData.requestId, 'accepted')}
            >
              {#if isActionLoading && respondingId === profileData.requestId}
                <Loader2 class="w-4 h-4 mr-1.5 animate-spin" /> 处理中...
              {:else}
                <Check class="w-4 h-4 mr-1.5" /> 同意
              {/if}
            </Button>

            <Button 
              variant="outline" 
              class="rounded-full px-4 text-gray-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200" 
              disabled={isActionLoading} 
              onclick={() => handleRespond(profileData.requestId, 'rejected')}
            >
              <X class="w-4 h-4 mr-1" /> 拒绝
            </Button>

          {:else}
            <Button class="rounded-full px-6 shadow-md" disabled={isActionLoading} onclick={handleAddFriend}>
              {#if isActionLoading}
                <Loader2 class="w-4 h-4 mr-2 animate-spin" /> 发送中...
              {:else}
                <UserPlus class="w-4 h-4 mr-2" /> 加为好友
              {/if}
            </Button>
          {/if}
        </div>
      </div>

      <Tabs.Root value="notes" class="flex-1 flex flex-col min-h-0">
        <Tabs.List class="w-full rounded-none border-b bg-transparent justify-start px-4 sm:px-6 gap-4 shrink-0 overflow-hidden">
          <Tabs.Trigger value="notes" class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 pt-4 whitespace-nowrap">
            <MapPin class="w-4 h-4 mr-1.5" /> Ta的足迹
          </Tabs.Trigger>
          {#if profileData.relation === 'self'}
            <Tabs.Trigger value="friends" class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 pt-4 whitespace-nowrap">
              <Users class="w-4 h-4 mr-1.5" /> 我的好友
            </Tabs.Trigger>
          {/if}
        </Tabs.List>
      
        <Tabs.Content value="notes" class="flex-1 overflow-hidden m-0 bg-gray-50/30">
          <ScrollArea class="h-full px-4 sm:px-6 py-4 sm:py-6">
            
            {#if userNotes.length === 0}
              <div class="flex flex-col items-center justify-center mt-12 sm:mt-20 text-gray-300">
                <Navigation class="w-12 h-12 sm:w-16 sm:h-16 mb-4 stroke-[1px]" />
                <p class="text-sm">暂无公开足迹</p>
              </div>
            {:else}
              
              <div class="space-y-3 pb-8">
                {#each userNotes as note}
                  <button 
                    type="button"
                    class="w-full text-left group relative p-3 sm:p-4 bg-white border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all duration-200 cursor-pointer flex items-start gap-3 sm:gap-4"
                    onclick={() => handleNoteClick(note)}
                  >
                    
                    <div class="p-2 sm:p-2.5 bg-blue-50 text-blue-500 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors duration-200 shrink-0 mt-0.5">
                      <MapPin class="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    
                    <div class="flex-1 min-w-0">
                      
                      <div class="flex items-center justify-between gap-2">
                        <h4 class="font-bold text-gray-800 truncate text-sm sm:text-base">{note.title}</h4>
                        
                        {#if note.visibility === 'private'}
                          <div class="flex items-center text-xs text-red-400 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
                            <Lock class="w-3 h-3 mr-1" /> 私密
                          </div>
                        {:else if note.visibility === 'friends'}
                          <div class="flex items-center text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0">
                            <Users class="w-3 h-3 mr-1" /> 仅好友
                          </div>
                        {/if}
                        </div>

                      {#if note.content}
                        <p class="text-xs text-gray-500 mt-1 truncate">
                          {note.content.replace(/[#*`_~>]/g, '')}
                        </p>
                      {/if}
                      
                      <p class="text-[10px] sm:text-xs text-gray-400 mt-1.5">
                        {note.updated_at || note.created_at ? new Date(note.updated_at || note.created_at).toLocaleDateString() : '未知时间'}
                      </p>
                      
                    </div>             
                  </button>
                {/each}
              </div>
              
            {/if}
          </ScrollArea>
        </Tabs.Content>

        {#if profileData.relation === 'self'}
          <Tabs.Content value="friends" class="flex-1 bg-gray-50/30 overflow-hidden m-0">
            <ScrollArea class="h-full px-4 sm:px-6 py-4 sm:py-6">
              
              {#if pendingRequests.length > 0}
                <div class="mb-8">
                  <h3 class="flex items-center text-sm font-bold text-gray-800 mb-3">
                    <Bell class="w-4 h-4 mr-1.5 text-blue-500" /> 
                    收到好友请求 
                    <span class="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full leading-none">
                      {pendingRequests.length}
                    </span>
                  </h3>
                  
                  <div class="space-y-3">
                    {#each pendingRequests as req}
                      <div class="flex items-center justify-between p-3 sm:p-4 bg-white border border-blue-100/60 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                        
                        <div class="flex items-center gap-3">
                          <Avatar.Root class="h-10 w-10 border border-gray-100 shadow-sm cursor-pointer" onclick={() => $uiState.currentProfileUser = req.requester}>
                            <Avatar.Image src={req.avatar ? `${SERVER_URL}${req.avatar}` : `${SERVER_URL}/uploads/avatars/default-avatar.png`} />
                            <Avatar.Fallback>{req.requester.charAt(0).toUpperCase()}</Avatar.Fallback>
                          </Avatar.Root>
                          <div>
                            <button 
                              type="button" 
                              class="font-bold text-sm text-gray-800 cursor-pointer hover:text-blue-600 transition text-left p-0 bg-transparent border-none" 
                              onclick={() => $uiState.currentProfileUser = req.requester}
                            >
                              {req.requester}
                            </button>
                            <p class="text-xs text-gray-400 mt-0.5">
                              {req.updated_at ? new Date(req.updated_at).toLocaleDateString() : '刚刚'}
                            </p>
                          </div>
                        </div>

                        <div class="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            class="h-8 px-3 rounded-full shadow-sm text-xs font-medium" 
                            disabled={respondingId === req.id} 
                            onclick={() => handleRespond(req.id, 'accepted')}
                          >
                            {#if respondingId === req.id}
                              <Loader2 class="w-3.5 h-3.5 animate-spin"/>
                            {:else}
                              同意
                            {/if}
                          </Button>
                          
                          <Button 
                            size="sm" 
                            variant="outline" 
                            class="h-8 w-8 p-0 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors" 
                            disabled={respondingId === req.id} 
                            onclick={() => handleRespond(req.id, 'rejected')}
                          >
                            <X class="w-4 h-4" />
                          </Button>
                        </div>

                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <div>
                <h3 class="flex items-center text-sm font-bold text-gray-800 mb-3">
                  <Users class="w-4 h-4 mr-1.5 text-gray-500" /> 我的好友 ({myFriends.length})
                </h3>
                
                {#if myFriends.length === 0}
                  <div class="flex flex-col items-center justify-center py-10 text-gray-300 bg-white border border-dashed border-gray-200 rounded-xl">
                    <Ghost class="w-12 h-12 sm:w-16 sm:h-16 mb-4 stroke-[1px]" />
                    <p class="text-sm">还没有好友，去地图上逛逛吧~</p>
                  </div>
                {:else}
                  <div class="space-y-3 pb-8">
                    {#each myFriends as friend}
                      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions,a11y_no_static_element_interactions -->
                      <div 
                        class="flex items-center justify-between p-3 sm:p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-blue-100 transition-all cursor-pointer group"
                        onclick={() => $uiState.currentProfileUser = friend.username}
                      >
                        <div class="flex items-center gap-3 overflow-hidden">
                          <Avatar.Root class="h-10 w-10 border border-gray-100 shadow-sm shrink-0">
                            <Avatar.Image src={friend.avatar ? `${SERVER_URL}${friend.avatar}` : `${SERVER_URL}/uploads/avatars/default-avatar.png`} />
                            <Avatar.Fallback>{friend.username.charAt(0).toUpperCase()}</Avatar.Fallback>
                          </Avatar.Root>
                          
                          <div class="min-w-0">
                            <p class="font-bold text-sm text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                              {friend.username}
                            </p>
                            <p class="text-xs text-gray-400 mt-0.5 truncate max-w-[180px] sm:max-w-[250px]">
                              {friend.bio || '这个人很懒，什么都没写~'}
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8 w-8 p-0 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors shrink-0 ml-2"
                          disabled={isRemoving === friend.username}
                          onclick={(e) => {
                            e.stopPropagation(); 
                            handleRemoveFriend(friend.username);
                          }}
                        >
                          {#if isRemoving === friend.username}
                            <Loader2 class="w-4 h-4 animate-spin"/>
                          {:else}
                            <Trash2 class="w-4 h-4" />
                          {/if}
                        </Button>

                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

            </ScrollArea>
          </Tabs.Content>
        {/if}

      </Tabs.Root>
    {/if}
  </Sheet.Content>

  {#if isCropModalOpen}
    <div class="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-8 animate-in fade-in duration-200">
      
      <div class="w-full max-w-md flex justify-between items-center text-white mb-4 px-2">
        <h3 class="font-bold tracking-widest text-lg">移动和缩放</h3>
        <button class="p-2 hover:bg-white/10 rounded-full transition" onclick={cancelCrop}>
          <X class="w-6 h-6" />
        </button>
      </div>

      <div class="w-full max-w-md h-[60vh] bg-black/50 rounded-2xl overflow-hidden shadow-2xl relative border border-white/10">
        
        <cropper-canvas class="w-full h-full" background>
          <cropper-image src={cropImageSrc} alt="待裁剪图片" rotatable scalable translatable></cropper-image>
          
          <cropper-shade hidden></cropper-shade>
          
          <cropper-selection bind:this={cropperSelection} initial-coverage="0.8" aspect-ratio="1" movable resizable>
            <cropper-grid role="grid" covered></cropper-grid>
            <cropper-crosshair centered></cropper-crosshair>
            
            <cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>
            
            <cropper-handle action="ne-resize"></cropper-handle>
            <cropper-handle action="nw-resize"></cropper-handle>
            <cropper-handle action="se-resize"></cropper-handle>
            <cropper-handle action="sw-resize"></cropper-handle>
          </cropper-selection>
        </cropper-canvas>

      </div>

      <div class="w-full max-w-md flex gap-4 mt-8">
        <Button variant="outline" class="flex-1 rounded-full h-12 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent" onclick={cancelCrop}>
          取消
        </Button>
        <Button class="flex-1 rounded-full h-12 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/50" onclick={confirmCrop}>
          <Check class="w-5 h-5 mr-2" /> 确认使用
        </Button>
      </div>

    </div>
  {/if}

</Sheet.Root>