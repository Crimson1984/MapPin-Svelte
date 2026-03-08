<script>
  // 1. 引入 Svelte 和全局状态
  import { uiState, currentUser } from '$lib/stores.js';
  import { API } from '$lib/utils/api.js';

  // 2. 引入 Shadcn 组件
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  // 3. 内部状态
  let username = '';
  let password = '';
  let isLoading = false;
  let errorMessage = '';
  let successMessage = '';

  // 4. 重置状态函数 (每次切换 Tab 时清空)
  function resetState() {
    username = '';
    password = '';
    errorMessage = '';
    successMessage = '';
  }

  // ============================
  // 🚀 核心：登录逻辑
  // ============================
  async function handleLogin() {
    if (!username || !password) return errorMessage = '请输入用户名和密码';
    
    isLoading = true;
    errorMessage = '';
    
    try {
      const data = await API.login(username, password);
      
      if (data.success) {
        // 登录成功：保存到 localStorage 和全局状态
        localStorage.setItem('userToken', data.token);
        localStorage.setItem('username', data.username);
        
        currentUser.set({
          isLoggedIn: true,
          username: data.username,
          token: data.token
        });

        // 关闭弹窗
        $uiState.isAuthModalOpen = false;
        
        // ⚡️ 强行刷新页面以重新加载所有数据 (最简单粗暴，也可以后续优化为无感加载)
        window.location.reload();
      } else {
        errorMessage = data.message;
      }
    } catch (err) {
      errorMessage = '网络连接失败，请检查后端是否启动';
    } finally {
      isLoading = false;
    }
  }

  // ============================
  // 🚀 核心：注册逻辑
  // ============================
  async function handleRegister() {
    if (!username || !password) return errorMessage = '账号和密码不能为空';
    
    isLoading = true;
    errorMessage = '';
    successMessage = '';
    
    try {
      const data = await API.register(username, password);
      
      if (data.success) {
        successMessage = '注册成功！请切换到登录页面。';
        // 注册成功后清空密码，方便用户直接去登录
        password = ''; 
      } else {
        errorMessage = data.message;
      }
    } catch (err) {
      errorMessage = '注册失败，可能用户名已存在';
    } finally {
      isLoading = false;
    }
  }
</script>

<Dialog.Root bind:open={$uiState.isAuthModalOpen}>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title class="text-2xl font-bold text-center flex items-center justify-center gap-2">
        <span class="text-3xl">🗺️</span> MapPin 登录
      </Dialog.Title>
      <Dialog.Description class="text-center">
        她说 去**的花海;
        我说 你这么说好帅.
      </Dialog.Description>
    </Dialog.Header>

    <Tabs.Root value="login" class="w-full mt-4" onValueChange={resetState}>
      <Tabs.List class="grid w-full grid-cols-2">
        <Tabs.Trigger value="login">登录</Tabs.Trigger>
        <Tabs.Trigger value="register">注册新账号</Tabs.Trigger>
      </Tabs.List>
      
      <Tabs.Content value="login">
        <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="username">用户名</Label>
            <Input id="username" bind:value={username} placeholder="请输入您的用户名" />
          </div>
          <div class="space-y-2">
            <Label for="password">密码</Label>
            <Input id="password" type="password" bind:value={password} placeholder="请输入密码" />
          </div>
          
          {#if errorMessage}
            <p class="text-sm font-medium text-red-500">{errorMessage}</p>
          {/if}

          <Button type="submit" class="w-full" disabled={isLoading}>
            {#if isLoading}
              <svg class="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              登录中...
            {:else}
              登录
            {/if}
          </Button>
        </form>
      </Tabs.Content>
      
      <Tabs.Content value="register">
        <form onsubmit={(e) => { e.preventDefault(); handleRegister(); }} class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="reg-username">设置用户名</Label>
            <Input id="reg-username" bind:value={username} placeholder="想一个好记的用户名" />
          </div>
          <div class="space-y-2">
            <Label for="reg-password">设置密码</Label>
            <Input id="reg-password" type="password" bind:value={password} placeholder="请输入至少 6 位密码" />
          </div>
          
          {#if errorMessage}
            <p class="text-sm font-medium text-red-500">{errorMessage}</p>
          {/if}
          {#if successMessage}
            <p class="text-sm font-medium text-green-600">{successMessage}</p>
          {/if}

          <Button type="submit" class="w-full" variant="secondary" disabled={isLoading}>
            {#if isLoading}
              处理中...
            {:else}
              立即注册
            {/if}
          </Button>
        </form>
      </Tabs.Content>
    </Tabs.Root>

  </Dialog.Content>
</Dialog.Root>