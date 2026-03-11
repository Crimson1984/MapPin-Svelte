<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet.markercluster/dist/MarkerCluster.css';
  import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
  import 'leaflet.markercluster';
  import 'leaflet.heat'; // 引入热力图插件

  import { Flame, MapPin , LocateFixed } from 'lucide-svelte'; // 引入 Lucide 图标
  import { uiState, notesData, draftsData } from '$lib/stores.js';
  import { TILE_LAYERS_CONFIG, getIconForNote } from '$lib/mapConfig.js';
  import { toView, isCoordinateSystemChanged, toDB} from '$lib/utils/coordManager.js'; 
  import QuickCreatePopup from './QuickCreatePopup.svelte';
  import { mount, unmount } from 'svelte';

  let mapElement;
  let mapInstance;
  let markersLayer;
  let heatLayer;
  let userLocationMarker;
  let rawUserLocation = null; // ⚡️ 新增：用来记住用户真实的 GPS 坐标
  let tempMarker = null; // ⚡️ 用来存放搜索产生的临时红点
  let customToolsWrapper;// 一个绑定变量，抓取 Svelte 渲染的现代按钮组

  // ==========================================
  // 🗺️ 1. 地图初始化 (仅执行一次)
  // ==========================================
  onMount(() => {
    const savedCenter = JSON.parse(localStorage.getItem('MAPPIN_CENTER')) || [31.88, 118.82];
    const savedZoom = parseInt(localStorage.getItem('MAPPIN_ZOOM'), 10) || 13;
    const savedLayerKey = localStorage.getItem('MAPPIN_LAYER') || 'gaode';

    // 生成底图
    /** @type {Record<string, import('leaflet').Layer>} */
    const layers = {};
    let defaultLayer = null;
    const layerNameToKey = {};

    for (const [key, config] of Object.entries(TILE_LAYERS_CONFIG)) {
        let layer;
        if (config.isGroup && Array.isArray(config.urls)) {
            const tileLayers = config.urls.map(url => L.tileLayer(url, config.options));
            layer = L.layerGroup(tileLayers);
        } else {
            layer = L.tileLayer(config.url, config.options);
        }
        layers[config.name] = layer;
        layerNameToKey[config.name] = key;
        if (key === savedLayerKey) defaultLayer = layer;
    }

    if (!defaultLayer) defaultLayer = Object.values(layers)[0];

    // 初始化地图实例
    mapInstance = L.map(mapElement, {
      center: savedCenter,
      zoom: savedZoom,
      zoomControl: false,
      layers: [defaultLayer]
    });

    // 依然保留底图切换控制器 (因为它需要读取内部配置，保留原生最方便)
    L.control.layers(layers, null, { position: 'bottomleft', collapsed: true }).addTo(mapInstance);

    //创建一个自定义的 Leaflet 控件
    const modernToolsControl = L.control({ position: 'bottomleft' }); // 同样放在左下角

    modernToolsControl.onAdd = function() {
    // 阻止点击事件穿透到底层地图（极其重要，否则点按钮地图会跟着动）
    L.DomEvent.disableClickPropagation(customToolsWrapper);
    L.DomEvent.disableScrollPropagation(customToolsWrapper);
    
    // 直接把我们的 Svelte 节点作为原生控件交出去！
    return customToolsWrapper; 
    };

    // 将自定义控件加入地图。Leaflet 会自动把它完美地堆叠在图层控件的上方！
    modernToolsControl.addTo(mapInstance);

    // ==========================================
    // ⚡️ 注册地图双击/右键 打点事件
    // ==========================================
    mapInstance.on('dblclick', (e) => {
      // 阻止默认的双击放大行为 (可选，视你需求而定)
      mapInstance.doubleClickZoom.disable(); 
      const [lat, lng] = toDB(e.latlng.lat, e.latlng.lng); // 转回数据库坐标系存储

      // 关闭正在阅读的卡片
      $uiState.activeNote = null;

      // 1. 创建一个临时的 DOM 容器
      const container = document.createElement('div');

      // 2. 声明 Leaflet popup (先不挂载内容)
      const popup = L.popup({
        closeButton: true,
        className: 'custom-leaflet-popup', // 你可以在 app.css 里稍微调一下 Leaflet 默认的白边 padding
        minWidth: 260
      })

      .setLatLng(e.latlng)
      .openOn(mapInstance);

      // 3. 将 Svelte 组件渲染进这个临时容器里
      const component = mount(QuickCreatePopup, {
        target: container,
        props: {
          lat: lat,
          lng: lng,
          closePopup: () => mapInstance.closePopup(popup)
        }
      });

      // 4. 把装有 Svelte 组件的容器塞给 Leaflet
      popup.setContent(container);

      // 5. 垃圾回收：当 popup 关闭时，销毁 Svelte 组件实例，防止内存泄漏
      popup.on('remove', () => {
         unmount(component); 
      });
    });

    // 记录视野
    mapInstance.on('moveend', () => {
      localStorage.setItem('MAPPIN_CENTER', JSON.stringify([mapInstance.getCenter().lat, mapInstance.getCenter().lng]));
      localStorage.setItem('MAPPIN_ZOOM', mapInstance.getZoom());
    });

    // 持久化图层
    mapInstance.on('baselayerchange', (e) => {
      // e.name 是你在 config 里配置的中文名，通过 layerNameToKey 找回内部的 key
      const newLayerKey = layerNameToKey[e.name];
      
      if (newLayerKey) {
        const oldLayerKey = localStorage.getItem('MAPPIN_LAYER') || 'osm';
        localStorage.setItem('MAPPIN_LAYER', newLayerKey);
        
        // 如果发生了“火星坐标系 <-> 国际标准坐标系”的跨越
        if (isCoordinateSystemChanged(oldLayerKey, newLayerKey)) {
          console.log('🔄 坐标系发生跨越，正在重新计算所有红点位置...');
          
          // ⚡️ Svelte 终极黑魔法：原地更新 Store！
          // 由于我们的地图点位是响应式监听 $notesData 的，
          // 我们只需要给它重新赋一遍自己原来的值，Svelte 就会瞬间触发重新渲染，
          // 新的渲染会重新走一遍 toView()，点位就自动“瞬移”到正确的地方了！
          notesData.update(notes => notes);
          draftsData.update(drafts => drafts);

          // ⚡️ 新增：如果用户定位过，帮定位小红点也重新计算一次火星/地球偏移
          if (userLocationMarker && rawUserLocation) {
            const [newLat, newLng] = toView(rawUserLocation.lat, rawUserLocation.lng);
            userLocationMarker.setLatLng([newLat, newLng]);
          }
        }
      }
    });
    
    markersLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount(); 
        
        // ⚡️ 利用 Tailwind 的任意值语法，硬编码经典原色
        // 默认少量 (< 10)：经典绿
        let outerBg = 'bg-[#6ecc39]/60'; 
        let innerBg = 'bg-[#6ecc39]/90';
        
        if (count >= 50) {
            // 大量 (>= 50)：经典橙
            outerBg = 'bg-[#f18017]/60';
            innerBg = 'bg-[#f18017]/90';
        } else if (count >= 10) {
            // 中等 (10-49)：经典黄
            outerBg = 'bg-[#f0c20c]/60';
            innerBg = 'bg-[#f0c20c]/90';
        }

        return L.divIcon({
            // ⚡️ 纯 Tailwind 结构：flex 居中，圆角，指定具体的长宽
            html: `
              <div class="flex h-full w-full items-center justify-center rounded-[20px] bg-clip-padding ${outerBg}">
                <div class="flex h-[30px] w-[30px] items-center justify-center rounded-[15px] text-white font-bold text-[14px] font-sans ${innerBg}">
                  ${count}
                </div>
              </div>
            `,
            className: '', // 清空原生类名，全权交给里面的 Tailwind
            iconSize: L.point(40, 40) 
        });
      }
    }).addTo(mapInstance);

    // 点击空白处，准备发新笔记
    mapInstance.on('click', (e) => {
        // 更新全局状态，关闭所有弹窗，准备新建
        $uiState.clickedLatLng = e.latlng;
    });
    
  });

  // ==========================================
  // ⚡️ 2. 响应式引擎 (魔法所在)
  // ==========================================
  // $: 是 Svelte 的响应式声明。只要里面的变量变了，这段代码自动执行！
  
  // 魔法 1：监听笔记数据变化，自动重绘红点和热力图！
  $: if (mapInstance && markersLayer && ($notesData || $draftsData)) {
    markersLayer.clearLayers();
    if (heatLayer) mapInstance.removeLayer(heatLayer);

    const heatData = [];

    // 渲染正式笔记
    $notesData.forEach(note => {
      const [viewLat, viewLng] = toView(note.lat, note.lng);
      heatData.push([viewLat, viewLng, 1]); // 收集热力图数据

      const marker = L.marker([viewLat, viewLng], { icon: getIconForNote(note, false) });
      
      // 绑定点击事件 (更新全局状态，而不是操作 DOM)
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        // ⚡️ 核心防遮挡计算：获取点击点在屏幕上的像素坐标
        const screenPoint = mapInstance.latLngToContainerPoint(e.latlng);
        // 如果点在屏幕右侧，卡片就弹在左侧；反之亦然
        if (!$uiState.cardOffset) {
          $uiState.cardPosition = screenPoint.x > window.innerWidth / 2 ? 'left' : 'right';
        }

        $uiState.activeNote = note; 
      });

      // 绑定 Tooltip 悬浮提示
      const dateStr = new Date(note.created_at).toLocaleDateString();
      marker.bindTooltip(`
        <div class="flex flex-col items-center gap-1">
            <span class="font-bold text-gray-800 text-sm tracking-wide">${note.title}</span>
            <span class="text-xs text-gray-500 font-medium">${note.username} · ${note.location_name} · ${dateStr}</span>
        </div>
      `, { 
        direction: 'top', 
        offset: [0, -30],
        // ⚡️ 使用 ! 强制覆盖 Leaflet 默认的白底和丑陋边框
        className: '!bg-white/90 !backdrop-blur-md !border !border-gray-100 !shadow-xl !rounded-xl !px-4 !py-2 !transition-opacity'
      });

      markersLayer.addLayer(marker);
    });

    // 渲染草稿
    $draftsData.forEach(draft => {
      const [viewLat, viewLng] = toView(draft.lat, draft.lng);
      const marker = L.marker([viewLat, viewLng], { icon: getIconForNote(draft, true), opacity: 0.7, zIndexOffset: 500});
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);

        // ⚡️ 核心防遮挡计算：获取点击点在屏幕上的像素坐标
        const screenPoint = mapInstance.latLngToContainerPoint(e.latlng);
        // 如果点在屏幕右侧，卡片就弹在左侧；反之亦然
        if (!$uiState.cardOffset) {
          $uiState.cardPosition = screenPoint.x > window.innerWidth / 2 ? 'left' : 'right';
        }

        $uiState.activeNote = draft; 
      });

      marker.bindTooltip(`
        <div class="flex items-center gap-2">
            <span class="text-sm">📝</span>
            <span class="text-sm font-semibold text-gray-600">草稿: ${draft.title || "点击继续编辑"}</span>
        </div>
      `, { 
        direction: 'top', 
        offset: [0, -35],
        className: '!bg-gray-50/95 !backdrop-blur-sm !border !border-dashed !border-gray-400 !shadow-lg !rounded-xl !px-4 !py-2'
      });

      markersLayer.addLayer(marker);
    });

    // 重新生成热力图数据备用
    heatLayer = L.heatLayer(heatData, { radius: 25, blur: 15, maxZoom: 15 });
  }

  // 魔法 2：监听视图模式切换 (标准 <-> 热力图)
  $: if (mapInstance && heatLayer && markersLayer) {
    if ($uiState.mapViewMode === 'heatmap') {
      mapInstance.removeLayer(markersLayer);
      heatLayer.addTo(mapInstance);
    } else {
      mapInstance.removeLayer(heatLayer);
      markersLayer.addTo(mapInstance);
    }
  }

  // 组件销毁清理
  onDestroy(() => {
    if (mapInstance) mapInstance.remove();
  });

  // ==========================================
  // 📍 3. 定位逻辑 (从原生 Control 抽离成普通函数)
  // ==========================================
  function locateMe() {
    if (!navigator.geolocation) return alert('不支持定位');
    navigator.geolocation.getCurrentPosition(pos => {
      rawUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const [viewLat, viewLng] = toView(pos.coords.latitude, pos.coords.longitude);
      mapInstance.flyTo([viewLat, viewLng], 16);
      
      if (userLocationMarker) {
        userLocationMarker.setLatLng([viewLat, viewLng]);
      } else {
        const redDotIcon = L.divIcon({
            className: 'my-location-icon',
            html: '<div class="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-md"></div>',
            iconSize: [22, 22]
        });
        userLocationMarker = L.marker([viewLat, viewLng], { icon: redDotIcon, zIndexOffset: 1002 }).addTo(mapInstance);
      }
    });
  }

  function toggleHeatmap() {
    $uiState.mapViewMode = $uiState.mapViewMode === 'standard' ? 'heatmap' : 'standard';
  }

  // ==========================================
  // ⚡️ 全局监听：智能飞行与目标锁定系统
  // ==========================================
  $: if ($uiState.flyToLocation && mapInstance) {
    const { lat, lng, boundingbox, isTempMarker, title } = $uiState.flyToLocation;
    
    // ------------------------------------
    // 🚁 1. 智能飞行阶段 (FlyTo vs FlyToBounds)
    // ------------------------------------
    if (boundingbox) {
      // Nominatim 的 boundingbox 格式是: ["lat的最小和最大", "lon的最小和最大"]
      // Leaflet 需要的格式是: [[西南角纬度, 西南角经度], [东北角纬度, 东北角经度]]
      
      const [SWLat, SWLng] = toView(parseFloat(boundingbox[0]), parseFloat(boundingbox[2]));
      const [NELat, NELng] = toView(parseFloat(boundingbox[1]), parseFloat(boundingbox[3]));
      const southWest = L.latLng(SWLat, SWLng);
      const northEast = L.latLng(NELat, NELng);
      const bounds = L.latLngBounds(southWest, northEast);

      // 使用 flyToBounds，Leaflet 会自动计算最完美的缩放比例！
      // padding: [50, 50] 是为了给四周留出 50px 的安全边距，防止贴边太死
      mapInstance.flyToBounds(bounds, { animate: true, duration: 1.5, padding: [50, 50] });
    } else {
      // 如果没有边界框（比如点击的是普通笔记），就回退到普通的固定比例缩放
      const [viewLat, viewLng] = toView(lat, lng);
      mapInstance.flyTo([viewLat, viewLng], 16, { animate: true, duration: 1.5 });
    }

    // ------------------------------------
    // 📍 2. 目标锁定阶段 (画临时红点)
    // ------------------------------------
    // 如果地图上已经有之前的临时红点了，先把它抹掉
    if (tempMarker) {
      mapInstance.removeLayer(tempMarker);
      tempMarker = null;
    }

    // 如果指令要求画临时红点（搜地点触发的）
    if (isTempMarker) {
      // 创造一个极具现代感的“红点白边带阴影”的 HTML 图标
      const redDotIcon = L.divIcon({
        className: 'custom-red-dot',
        html: `<div style="width: 16px; height: 16px; background-color: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8] // 锚点设在中心
      });

      // 把红点钉在地图上
      const [viewLat, viewLng] = toView(lat, lng); // 确保坐标转换正确
      tempMarker = L.marker([viewLat, viewLng], { icon: redDotIcon }).addTo(mapInstance);

      // (可选) 极其酷炫的 UX：给红点绑个气泡，提示用户可以建足迹
      if (title) {
        tempMarker.bindPopup(`
          <div class="text-center">
            <p class="font-bold text-gray-800 text-sm mb-1">${title}</p>
            <p class="text-xs text-gray-500">已到达目标坐标</p>
          </div>
        `).openPopup(); // 飞到之后自动弹开气泡！
      }
    }

    // ⚡️ 指令执行完毕，销毁载荷
    $uiState.flyToLocation = null;
  }

  
</script>

<div class="relative w-screen h-screen">
  <div bind:this={mapElement} class="w-full h-full z-0"></div>

  <div 
    bind:this={customToolsWrapper} 
    class="flex flex-col bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/60 rounded-2xl overflow-hidden mb-2"
  >
    
    <button 
      class="relative w-[44px] h-[44px] flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-gray-500/5 active:bg-gray-500/10 transition-all duration-200 group cursor-pointer"
      onclick={locateMe}
      title="定位当前位置"
    >
      <LocateFixed class="w-5 h-5 group-active:scale-90 transition-transform duration-200" />
    </button>

    <div class="w-8 h-[1px] bg-gray-200/60 mx-auto"></div>

    <button 
      class="relative w-[44px] h-[44px] flex items-center justify-center hover:bg-gray-500/5 active:bg-gray-500/10 transition-all duration-200 group cursor-pointer"
      onclick={toggleHeatmap}
      title="切换热图"
    >
      {#if $uiState.mapViewMode === 'heatmap'}
        <Flame class="w-5 h-5 text-red-500 drop-shadow-sm group-active:scale-90 transition-transform duration-200" />
      {:else}
        <MapPin class="w-5 h-5 text-gray-600 group-hover:text-blue-600 group-active:scale-90 transition-transform duration-200" />
      {/if}
    </button>
  </div>
</div>