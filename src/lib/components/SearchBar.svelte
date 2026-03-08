<script>
  import { API } from '$lib/utils/api.js';
  import { uiState } from '$lib/stores.js';
  import { toView, toDB} from '$lib/utils/coordManager.js'; 

  import { Search, X, Loader2, User, FileText, MapPin, ArrowLeft } from 'lucide-svelte';
  
  const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3000' : '';

  // ⚡️ 核心状态
  let searchQuery = '';
  let isSearchOpen = false;
  let isLoading = false;
  let activeTab = 'users'; // 默认显示的 Tab：'users' | 'notes' | 'places'
  let isMobileExpanded = false;

  // ⚡️ 新增数据源容器
  let userResults = [];
  let notesResults = []; 
  let placesResults = []; 

  // ⚡️ 当前选中的地点搜索引擎 (默认 osm)
  let placeSearchEngine = 'osm'; // 可选值: 'osm' | 'amap'

  // ⚡️ 切换引擎时自动重新搜索
  function switchEngine(engine) {
    if (placeSearchEngine === engine) return;
    placeSearchEngine = engine;
    if (searchQuery.trim() && activeTab === 'places') {
      performSearch(searchQuery);
    }
  }

  // ⚡️ 防抖引擎 (Debounce)
  let timeoutId;
  function handleInput(e) {
    searchQuery = e.target.value;
    
    // 如果清空了输入框，立刻收起面板
    if (!searchQuery.trim()) {
      isSearchOpen = false;
      isLoading = false;
      return;
    }

    // 只要开始打字，就展开面板并显示 Loading
    isSearchOpen = true;
    isLoading = true;

    // 清除上一次的倒计时
    clearTimeout(timeoutId);
    
    // 重新开启 500ms 倒计时
    timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 500);
  }

  async function performSearch(query) {
    // 每次搜索前清空旧数据
    userResults = [];
    notesResults = []; 
    placesResults = []; 

    isLoading = true;

    try {
      const osmPromise = fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=5`)
                          .then(res => res.json()).catch(() => []);
      
      const amapPromise = API.searchPlaces(query).catch(() => ({ data: [] }));

      const [usersRes, notesRes, rawPlacesRes] = await Promise.all([
        API.searchUsers(query).catch(err => { console.error('用户搜索失败:', err); return []; }),
        API.searchNotes(query).catch(err => { console.error('笔记搜索失败:', err); return { data: [] }; }),
        placeSearchEngine === 'osm' ? osmPromise : amapPromise
      ]);
      
      // 判断如果它是个数组，就赋值给 userResults
      if (Array.isArray(usersRes)) {
        userResults = usersRes;
      } else if (usersRes && usersRes.data) {
        // 兼容一下如果你后端包了一层 { data: [...] } 的情况
        userResults = usersRes.data;
      }

      // 灌入笔记结果 (处理你刚写的后端返回格式 { success: true, data: results })
      if (Array.isArray(notesRes)) {
        notesResults = notesRes;
      } else if (notesRes && notesRes.data) {
        notesResults = notesRes.data;
      }

      // ==========================================
      // ⚡️ 核心黑科技：数据洗牌 (适配器模式)
      // 把 OSM 和 高德 的乱七八糟的数据，统一洗成标准格式！
      // ==========================================
      if (placeSearchEngine === 'osm') {
        // --- 清洗 OSM 数据 ---
        placesResults = (Array.isArray(rawPlacesRes) ? rawPlacesRes : []).map(p => ({
          id: p.place_id,
          source: 'osm',
          name: p.name || p.display_name.split(',')[0],
          address: p.display_name,
          type: p.type || p.category,
          wgsLat: parseFloat(p.lat), // 本来就是 WGS84，直接用
          wgsLng: parseFloat(p.lon),
          boundingbox: p.boundingbox // OSM 特产：边界框
        }));
      } else {
        // --- 清洗 高德 数据 ---
        let amapData = Array.isArray(rawPlacesRes) ? rawPlacesRes : (rawPlacesRes && rawPlacesRes.data ? rawPlacesRes.data : []);
        placesResults = amapData.map(p => {
          // 解密坐标
          const [lngStr, latStr] = p.location.split(',');
          const [wgsLat, wgsLng] = toDB(parseFloat(latStr), parseFloat(lngStr));
          
          return {
            id: p.id,
            source: 'amap',
            name: p.name,
            address: `${p.pname||''}${p.cityname||''}${p.adname||''}${p.address||''}`,
            type: p.type ? p.type.split(';')[0] : '地点',
            wgsLat: wgsLat, // 已经洗白成 WGS84
            wgsLng: wgsLng,
            boundingbox: null // 高德没有边界框
          };
        });
      }
      
    } catch (err) {
      console.error('检索失败:', err);
    } finally {
      isLoading = false;
    }
  }

  // ⚡️ 新增联动指令：点击用户
  function handleUserClick(username) {
    $uiState.currentProfileUser = username;
    $uiState.isProfileDrawerOpen = true;
    isSearchOpen = false;
    if (!searchQuery.trim()) {
      isMobileExpanded = false;
    }
  }

  // 点击笔记卡片
  function handleNoteClick(note) {
    // 1. 激活并显示笔记的悬浮详情卡
    $uiState.activeNote = note;
    
    // 2. 收起搜索栏 (保持视野开阔)
    isSearchOpen = false;
    if (!searchQuery.trim()) {
      isMobileExpanded = false;
    }

    // 3. 终极联动：启动地图底层飞行引擎！
    if (note.lat && note.lng) {
      $uiState.flyToLocation = { 
        lat: note.lat, 
        lng: note.lng 
      };
    }
  }

  function clearSearch() {
    searchQuery = '';
    isSearchOpen = false;
  }

  // ⚡️ 外部点击处理
  function clickOutside(node) {
    const handleClick = (event) => {
      if (node && !node.contains(event.target) && !event.defaultPrevented) {
        isSearchOpen = false; // 收起下拉面板       
        if (!searchQuery.trim()) {
          isMobileExpanded = false;
        }
      }
    };
    document.addEventListener('click', handleClick, true);
    return {
      destroy() {
        document.removeEventListener('click', handleClick, true);
      }
    };
  }

  // ⚡️ 升级版：带边界框和红点指令的点击交互
  function handlePlaceClick(place) {
    isSearchOpen = false;
    if (!searchQuery.trim()) isMobileExpanded = false;

    // 直接无脑使用 place 里的标准数据！
    $uiState.flyToLocation = { 
      lat: place.wgsLat, 
      lng: place.wgsLng,
      boundingbox: place.boundingbox, // OSM 会有，高德是 null
      isTempMarker: true, 
      title: place.name   
    };
  }
</script>


<div 
  class="absolute top-4 left-4 z-[25] font-sans transition-all duration-300 {isMobileExpanded ? 'right-4' : ''} sm:top-6 sm:left-6 sm:right-auto sm:w-[380px]" 
  use:clickOutside
>
  
  {#if !isMobileExpanded}
    <button
      class="sm:hidden flex items-center justify-center w-12 h-12 bg-white rounded-full shadow-lg border border-gray-100 text-gray-600 hover:text-blue-600 active:scale-95 transition-all"
      onclick={() => isMobileExpanded = true}
    >
      <Search class="w-5 h-5" />
    </button>
  {/if}

  <div class="relative w-full h-12 bg-white rounded-full shadow-lg border border-gray-100 overflow-hidden transition-shadow focus-within:shadow-xl focus-within:ring-2 focus-within:ring-blue-100 {isMobileExpanded ? 'flex' : 'hidden sm:flex'} items-center">
    
    <button 
      class="sm:hidden pl-4 pr-2 text-gray-400 hover:text-gray-600 active:scale-90 transition-transform" 
      onclick={() => { 
        isMobileExpanded = false; 
        isSearchOpen = false; 
        searchQuery = ''; // 退出时顺便清空
      }}
    >
      <ArrowLeft class="w-5 h-5" />
    </button>

    <div class="hidden sm:block pl-4 pr-2 text-gray-400">
      <Search class="w-5 h-5" />
    </div>
    
    <input 
      type="text" 
      class="flex-1 h-full bg-transparent outline-none text-gray-700 placeholder-gray-400 text-sm"
      placeholder="搜索用户、笔记或地点..." 
      bind:value={searchQuery}
      oninput={handleInput}
      onfocus={() => { if(searchQuery.trim()) isSearchOpen = true; }}
    />

    {#if searchQuery}
      <button class="px-4 text-gray-400 hover:text-gray-600 transition-colors" onclick={clearSearch}>
        <X class="w-4 h-4" />
      </button>
    {/if}
  </div>

  {#if isSearchOpen}
    <div class="absolute top-14 left-0 w-full bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[60vh] animate-in fade-in slide-in-from-top-2 duration-200">
      
        <div class="flex border-b border-gray-100 bg-gray-50/50">
            <button class="flex-1 py-3 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors {activeTab === 'users' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}" onclick={() => activeTab = 'users'}>
            <User class="w-4 h-4" /> 用户
            </button>
            <button class="flex-1 py-3 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors {activeTab === 'notes' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}" onclick={() => activeTab = 'notes'}>
            <FileText class="w-4 h-4" /> 笔记
            </button>
            <button class="flex-1 py-3 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors {activeTab === 'places' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700'}" onclick={() => activeTab = 'places'}>
            <MapPin class="w-4 h-4" /> 地点
            </button>
        </div>

        <div class="flex-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {#if isLoading}
            <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                <Loader2 class="w-8 h-8 animate-spin mb-3 text-blue-500" />
                <span class="text-xs tracking-widest">检索中...</span>
            </div>
            {:else}
            <div class="w-full">




                {#if activeTab === 'users'}
                
                    {#if userResults.length === 0}
                        <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                        <User class="w-12 h-12 mb-3 stroke-[1px] opacity-50" />
                        <span class="text-sm">没有找到相关的用户</span>
                        </div>
                    {:else}
                        <div class="space-y-2 p-2">
                        {#each userResults as user}
                        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (这是可点击的div，用于特定交互) -->
                            <div 
                            class="flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors group border border-transparent hover:border-blue-100 w-full text-left"
                            onclick={() => handleUserClick(user.username)}
                            >
                            <div class="h-10 w-10 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                                <img 
                                src={user.avatar ? `${SERVER_URL}${user.avatar}` : `${SERVER_URL}/uploads/avatars/default-avatar.png`} 
                                alt={user.username} 
                                class="w-full h-full object-cover"
                                />
                            </div>
                            
                            <div class="min-w-0 flex-1">
                                <p class="text-sm font-bold text-gray-800 group-hover:text-blue-600 truncate transition-colors">
                                {user.username}
                                </p>
                                <p class="text-xs text-gray-400 truncate mt-0.5">
                                {user.bio || '这个人很懒，什么都没写~'}
                                </p>
                            </div>
                            </div>
                        {/each}
                        </div>
                    {/if}

                {:else if activeTab === 'notes'}
                
                    {#if notesResults.length === 0}
                        <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                        <FileText class="w-12 h-12 mb-3 stroke-[1px] opacity-50" />
                        <span class="text-sm">没有找到相关的足迹</span>
                        </div>
                    {:else}
                        <div class="space-y-2 p-2">
                        {#each notesResults as note}
                        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (这是可点击的div，用于特定交互) -->
                            <div 
                            class="flex items-start gap-3 p-3 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors group border border-transparent hover:border-blue-100 w-full text-left"
                            onclick={() => handleNoteClick(note)}
                            >
                            <div class="p-2 sm:p-2.5 bg-blue-100 text-blue-500 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors shrink-0 mt-0.5">
                                <MapPin class="w-4 h-4" />
                            </div>
                            
                            <div class="min-w-0 flex-1">
                                <h4 class="text-sm font-bold text-gray-800 group-hover:text-blue-600 truncate transition-colors">
                                {note.title}
                                </h4>
                                {#if note.content}
                                <p class="text-xs text-gray-500 mt-1 truncate">
                                    {note.content.replace(/[#*`_~>]/g, '')}
                                </p>
                                {/if}
                                
                                <div class="flex items-center justify-between gap-2 mt-2">
                                <span class="text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                    @{note.username}
                                </span>
                                <span class="text-[10px] text-gray-400">
                                    {note.updated_at || note.created_at ? new Date(note.updated_at || note.created_at).toLocaleDateString() : ''}
                                </span>
                                </div>
                            </div>
                            </div>
                        {/each}
                        </div>
                    {/if}


                {:else if activeTab === 'places'}
              
                    <div class="px-3 py-2 border-b border-gray-100/50 bg-gray-50/50 flex justify-center">
                        <div class="flex bg-gray-200/50 p-1 rounded-lg">
                        <button 
                            onclick={() => switchEngine('osm')}
                            class="px-4 py-1.5 text-xs font-medium rounded-md transition-all {placeSearchEngine === 'osm' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
                        >
                            <span>OSM</span>
                            <span class="text-[8px] bg-indigo-100 text-indigo-500 px-1 rounded">默认</span>
                        </button>
                        <button 
                            onclick={() => switchEngine('amap')}
                            class="px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 {placeSearchEngine === 'amap' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
                        >
                            <span>高德</span>
                            <span class="text-[8px] bg-indigo-100 text-indigo-500 px-1 rounded">国内</span>
                        </button>
                        </div>
                    </div>

                    {#if placesResults.length === 0}
                        <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                        <MapPin class="w-12 h-12 mb-3 stroke-[1px] opacity-50" />
                        <span class="text-sm">{placeSearchEngine === 'osm' ? '未在世界地图上找到该地点' : '高德地图未找到该地点'}</span>
                        </div>
                    {:else}
                        <div class="space-y-2 p-2">
                        {#each placesResults as place}
                        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (这是可点击的div，用于特定交互) -->
                            <div 
                            class="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group border border-transparent hover:border-gray-100 w-full text-left"
                            onclick={() => handlePlaceClick(place)}
                            >
                                <div class="p-2 sm:p-2.5 rounded-lg transition-colors shrink-0 mt-0.5 {place.source === 'osm' ? 'bg-blue-100 text-blue-500 group-hover:bg-blue-500 group-hover:text-white' : 'bg-indigo-100 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white'}">
                                    <MapPin class="w-4 h-4" />
                                </div>
                            
                                <div class="min-w-0 flex-1">
                                    <h4 class="text-sm font-bold text-gray-800 group-hover:text-gray-900 truncate transition-colors">
                                    {place.name}
                                    </h4>
                                    
                                    <p class="text-xs text-gray-500 mt-1 truncate">
                                    {place.address}
                                    </p>
                                    
                                    <div class="flex items-center justify-between gap-2 mt-2">
                                    <span class="text-[10px] font-medium text-gray-400 bg-gray-100/80 px-1.5 py-0.5 rounded uppercase truncate max-w-[150px]">
                                        {place.type}
                                    </span>
                                    <span class="text-[9px] font-medium text-gray-300 uppercase">
                                        {place.source === 'osm' ? 'OpenStreetMap' : 'AMap'}
                                    </span>
                                    </div>
                                </div>
                            </div>
                        {/each}  
                        </div>                    
                    {/if}

                {/if}
            </div>
            {/if}
        </div>

    </div>
  {/if}
</div>