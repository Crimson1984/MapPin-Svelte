// src/lib/mapConfig.js
import L from 'leaflet';

export const TILE_LAYERS_CONFIG = {
    osm: {
        name: "🗺️ 标准地图 (OSM)",
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: { attribution: '&copy; OpenStreetMap contributors' }
    },

    satellite: {
        name: "🛰️ 卫星影像 (Esri)",
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri' }
    },

    gaode: {
        name: "🚗 高德地图 ",
        url: 'http://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        options: { subdomains: "1234" }
    },

    // 2. 国家地理风格 (极其美观，复古探险风，非常适合做足迹地图底图！)
    natgeo: {
        name: "🧭 国家地理 (Esri)",
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri & National Geographic' }
    },

    // 3. 深灰底图 (数据可视化的绝佳选择，配合你的热力图效果炸裂！)
    dark_gray: {
        name: "🌑 极暗深灰 (Esri)",
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri' }
    },

    // ⚡️ 5. 组合图层：带地名和路网的卫星图 
    satellite_labeled: {
        name: "🌍 混合卫星图 (带标注)",
        isGroup: true, // 告诉解析器，这是一个组合图层！
        urls: [
            // 底层：卫星影像
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            // 顶层：透明的标注、国界、路网层 (World_Boundaries_and_Places)
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
        ],
        options: { attribution: 'Tiles &copy; Esri' }
    }

};

/** @type {Omit<import('leaflet').IconOptions, 'iconUrl'>} */
// --- 🎨 图标资源配置 ---
const IconConfig = {
    shadowUrl: '/images/pins/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
};


// 辅助函数：快速生成不同颜色的图标
function createColorIcon(color) {
    return new L.Icon({
        ...IconConfig,
        iconUrl: `/images/pins/marker-icon-${color}.png`
    });
}

export const ICONS = {
    public:  createColorIcon('blue'),
    friends: createColorIcon('green'),
    private: createColorIcon('red'),
    draft:   createColorIcon('grey'),
    default: createColorIcon('blue')
};

export function getIconForNote(note, isDraft = false) {
    if (isDraft) return ICONS.draft;
    return ICONS[note.visibility] || ICONS.default;
}