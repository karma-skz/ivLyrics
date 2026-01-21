/**
 * AI Addon Manager
 * AI 제공자(Gemini, ChatGPT 등) Addon들을 관리하는 중앙 시스템
 * 
 * @author ivLis STUDIO
 * @description 번역, 발음, TMI 생성을 위한 AI Addon 등록 및 관리
 */

(() => {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    const STORAGE_PREFIX = 'ivLyrics:ai:';
    const PROVIDER_KEYS = {
        METADATA: 'provider:metadata',
        LYRICS: 'provider:lyrics',
        TMI: 'provider:tmi'
    };

    // ============================================
    // AIAddonManager Class
    // ============================================

    class AIAddonManager {
        constructor() {
            this._addons = new Map();
            this._initialized = false;
            this._initPromise = null;
        }

        /**
         * 초기화
         */
        async init() {
            if (this._initialized) return;
            if (this._initPromise) return this._initPromise;

            this._initPromise = (async () => {
                console.log('[AIAddonManager] Initializing...');

                // 등록된 모든 Addon 초기화
                for (const [id, addon] of this._addons) {
                    try {
                        if (typeof addon.init === 'function') {
                            await addon.init();
                        }
                        console.log(`[AIAddonManager] Addon "${id}" initialized`);
                    } catch (e) {
                        console.error(`[AIAddonManager] Failed to initialize addon "${id}":`, e);
                    }
                }

                this._initialized = true;
                console.log('[AIAddonManager] Initialization complete');
            })();

            return this._initPromise;
        }

        /**
         * Addon 등록
         * @param {Object} addon - Addon 객체
         */
        register(addon) {
            if (!addon || !addon.id) {
                console.error('[AIAddonManager] Invalid addon: missing id');
                return false;
            }

            // 필수 필드 검증
            const requiredFields = ['id', 'name', 'author', 'description', 'version'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    console.error(`[AIAddonManager] Invalid addon "${addon.id}": missing ${field}`);
                    return false;
                }
            }

            // 필수 메서드 검증
            const requiredMethods = ['getSettingsUI'];
            for (const method of requiredMethods) {
                if (typeof addon[method] !== 'function') {
                    console.error(`[AIAddonManager] Invalid addon "${addon.id}": missing ${method}()`);
                    return false;
                }
            }

            this._addons.set(addon.id, addon);
            console.log(`[AIAddonManager] Registered addon: ${addon.id} (${addon.name})`);

            // 이미 초기화 완료된 경우, 새 Addon도 초기화
            if (this._initialized && typeof addon.init === 'function') {
                addon.init().catch(e => {
                    console.error(`[AIAddonManager] Failed to late-init addon "${addon.id}":`, e);
                });
            }

            return true;
        }

        /**
         * Addon 해제
         * @param {string} addonId - Addon ID
         */
        unregister(addonId) {
            if (this._addons.has(addonId)) {
                this._addons.delete(addonId);
                console.log(`[AIAddonManager] Unregistered addon: ${addonId}`);
                return true;
            }
            return false;
        }

        /**
         * Addon 가져오기
         * @param {string} addonId - Addon ID
         * @returns {Object|null}
         */
        getAddon(addonId) {
            return this._addons.get(addonId) || null;
        }

        /**
         * 모든 Addon 목록 가져오기
         * @returns {Object[]}
         */
        getAddons() {
            return Array.from(this._addons.values());
        }

        /**
         * Addon ID 목록 가져오기
         * @returns {string[]}
         */
        getAddonIds() {
            return Array.from(this._addons.keys());
        }

        // ============================================
        // Provider Selection
        // ============================================

        /**
         * 특정 기능의 Provider 설정
         * @param {'metadata'|'lyrics'|'tmi'} type - 기능 유형
         * @param {string} addonId - Addon ID
         */
        setProvider(type, addonId) {
            const key = PROVIDER_KEYS[type.toUpperCase()];
            if (!key) {
                console.error(`[AIAddonManager] Invalid provider type: ${type}`);
                return false;
            }

            if (addonId && !this._addons.has(addonId)) {
                console.warn(`[AIAddonManager] Addon "${addonId}" not found`);
            }

            Spicetify.LocalStorage.set(STORAGE_PREFIX + key, addonId || '');
            console.log(`[AIAddonManager] Set ${type} provider to: ${addonId || '(none)'}`);
            return true;
        }

        /**
         * 특정 기능의 Provider 가져오기
         * @param {'metadata'|'lyrics'|'tmi'} type - 기능 유형
         * @returns {string|null}
         */
        getProvider(type) {
            const key = PROVIDER_KEYS[type.toUpperCase()];
            if (!key) return null;

            const addonId = Spicetify.LocalStorage.get(STORAGE_PREFIX + key);
            return addonId || null;
        }

        /**
         * 특정 기능의 Provider Addon 객체 가져오기
         * @param {'metadata'|'lyrics'|'tmi'} type - 기능 유형
         * @returns {Object|null}
         */
        getProviderAddon(type) {
            const addonId = this.getProvider(type);
            if (!addonId) return null;
            return this.getAddon(addonId);
        }

        // ============================================
        // Addon Settings Storage
        // ============================================

        /**
         * Addon 설정 저장
         * @param {string} addonId - Addon ID
         * @param {string} key - 설정 키
         * @param {*} value - 설정 값
         */
        setAddonSetting(addonId, key, value) {
            const storageKey = `${STORAGE_PREFIX}addon:${addonId}:${key}`;
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            Spicetify.LocalStorage.set(storageKey, serialized);
        }

        /**
         * Addon 설정 가져오기
         * @param {string} addonId - Addon ID
         * @param {string} key - 설정 키
         * @param {*} defaultValue - 기본값
         * @returns {*}
         */
        getAddonSetting(addonId, key, defaultValue = null) {
            const storageKey = `${STORAGE_PREFIX}addon:${addonId}:${key}`;
            const value = Spicetify.LocalStorage.get(storageKey);

            if (value === null || value === undefined) {
                return defaultValue;
            }

            // JSON 파싱 시도
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }

        /**
         * Addon의 모든 설정 가져오기
         * @param {string} addonId - Addon ID
         * @returns {Object}
         */
        getAddonSettings(addonId) {
            const prefix = `${STORAGE_PREFIX}addon:${addonId}:`;
            const settings = {};

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    const settingKey = key.substring(prefix.length);
                    settings[settingKey] = this.getAddonSetting(addonId, settingKey);
                }
            }

            return settings;
        }

        // ============================================
        // API Methods (Delegates to Provider)
        // ============================================

        /**
         * 메타데이터 번역
         * @param {Object} params - { trackId, title, artist, lang }
         * @returns {Promise<Object|null>}
         */
        async translateMetadata(params) {
            const addon = this.getProviderAddon('metadata');
            if (!addon || typeof addon.translateMetadata !== 'function') {
                console.warn('[AIAddonManager] No metadata provider set or method not available');
                return null;
            }

            try {
                return await addon.translateMetadata(params);
            } catch (e) {
                console.error('[AIAddonManager] translateMetadata failed:', e);
                throw e;
            }
        }

        /**
         * 가사 번역/발음 생성
         * @param {Object} params - { trackId, artist, title, text, lang, wantSmartPhonetic, provider }
         * @returns {Promise<Object|null>}
         */
        async translateLyrics(params) {
            const addon = this.getProviderAddon('lyrics');
            if (!addon || typeof addon.translateLyrics !== 'function') {
                console.warn('[AIAddonManager] No lyrics provider set or method not available');
                return null;
            }

            try {
                return await addon.translateLyrics(params);
            } catch (e) {
                console.error('[AIAddonManager] translateLyrics failed:', e);
                throw e;
            }
        }

        /**
         * TMI 생성
         * @param {Object} params - { trackId, title, artist, lang }
         * @returns {Promise<Object|null>}
         */
        async generateTMI(params) {
            const addon = this.getProviderAddon('tmi');
            if (!addon || typeof addon.generateTMI !== 'function') {
                console.warn('[AIAddonManager] No TMI provider set or method not available');
                return null;
            }

            try {
                return await addon.generateTMI(params);
            } catch (e) {
                console.error('[AIAddonManager] generateTMI failed:', e);
                throw e;
            }
        }

        // ============================================
        // Utility Methods
        // ============================================

        /**
         * Addon이 특정 기능을 지원하는지 확인
         * @param {string} addonId - Addon ID
         * @param {'translateMetadata'|'translateLyrics'|'generateTMI'} method - 메서드 이름
         * @returns {boolean}
         */
        supportsMethod(addonId, method) {
            const addon = this.getAddon(addonId);
            return addon && typeof addon[method] === 'function';
        }

        /**
         * 특정 기능을 지원하는 Addon 목록 가져오기
         * @param {'translateMetadata'|'translateLyrics'|'generateTMI'} method - 메서드 이름
         * @returns {Object[]}
         */
        getAddonsWithMethod(method) {
            return this.getAddons().filter(addon => typeof addon[method] === 'function');
        }
    }

    // ============================================
    // Global Registration
    // ============================================

    const manager = new AIAddonManager();
    window.AIAddonManager = manager;

    // Spicetify가 준비되면 초기화
    const initWhenReady = () => {
        if (Spicetify?.LocalStorage) {
            manager.init().catch(e => {
                console.error('[AIAddonManager] Init failed:', e);
            });
        } else {
            setTimeout(initWhenReady, 100);
        }
    };

    initWhenReady();

    console.log('[AIAddonManager] Module loaded');
})();
