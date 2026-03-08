// src/lib/utils/draftManager.js

// ⚡️ 引入我们定义好的全局草稿状态
import { draftsData } from '$lib/stores.js';

/**
 * 🏭 内部辅助函数：生成统一的 Key
 */
function _generateKey(params) {
    if (params.id) return `draft_edit_${params.id}`;
    if (params.lat && params.lng) return `draft_new_${params.lat}_${params.lng}`;
    return null;
}

/**
 * 🏭 工厂方法：创建一个标准的草稿对象
 */
export function createDraft(params = {}) {
    return {
        id: params.id || null,           
        lat: params.lat || null,         
        lng: params.lng || null,
        title: params.title || '',
        content: params.content || '',
        visibility: params.visibility || 'public',
        lastModified: Date.now(),
        isDirty: false                   
    };
}

/**
 * 🔍 获取所有“新建笔记”的草稿，并更新到全局状态
 */
export function refreshDraftsStore() {
    const drafts = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('draft_new_')) {
            try {
                const draft = JSON.parse(localStorage.getItem(key));
                if (draft && draft.lat && draft.lng) {
                    drafts.push(draft);
                }
            } catch (e) {
                console.error("解析草稿失败", key, e);
            }
        }
    }
    // ⚡️ Svelte 魔法：将解析出的数组塞入全局状态
    // 一旦这行代码执行，MapBox.svelte 就会瞬间监听到，并在地图上画出灰色点！
    draftsData.set(drafts); 
    return drafts;
}

/**
 * 💾 保存草稿到 LocalStorage
 */
export function saveDraft(draft) {
    if (!draft) return;
    draft.lastModified = Date.now();
    const key = _generateKey(draft);
    if (key) {
        localStorage.setItem(key, JSON.stringify(draft));
        console.log(`[DraftManager] 草稿已保存: ${key}`);
        
        // ⚡️ 每次保存后，自动刷新全局状态，UI会自动更新
        refreshDraftsStore(); 
    }
}

/**
 * 🗑️ 删除草稿 (发布成功后调用)
 */
export function removeDraft(params) {
    const key = _generateKey(params);
    if (key) {
        localStorage.removeItem(key);
        console.log(`[DraftManager] 草稿已清理: ${key}`);
        
        // ⚡️ 每次删除后，自动刷新全局状态，地图上的草稿点会自动消失
        refreshDraftsStore();
    }
}