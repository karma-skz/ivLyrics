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

            // EventEmitter 믹스인
            this._events = new Map();
            this._onceEvents = new Map();
        }

        // ============================================
        // EventEmitter Methods
        // ============================================

        /**
         * 이벤트 리스너 등록
         * @param {string} event - 이벤트 이름
         * @param {Function} listener - 콜백 함수
         * @returns {Function} unsubscribe 함수
         */
        on(event, listener) {
            if (!this._events.has(event)) {
                this._events.set(event, new Set());
            }
            this._events.get(event).add(listener);
            return () => this.off(event, listener);
        }

        /**
         * 일회성 이벤트 리스너 등록
         */
        once(event, listener) {
            if (!this._onceEvents.has(event)) {
                this._onceEvents.set(event, new Set());
            }
            this._onceEvents.get(event).add(listener);
        }

        /**
         * 이벤트 리스너 제거
         */
        off(event, listener) {
            if (this._events.has(event)) {
                this._events.get(event).delete(listener);
            }
            if (this._onceEvents.has(event)) {
                this._onceEvents.get(event).delete(listener);
            }
        }

        /**
         * 이벤트 발생
         */
        emit(event, ...args) {
            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('events', `AIAddonManager.emit: ${event}`, args[0]);
            }

            if (this._events.has(event)) {
                for (const listener of this._events.get(event)) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[AIAddonManager] Error in listener for "${event}":`, e);
                    }
                }
            }

            if (this._onceEvents.has(event)) {
                const onceListeners = this._onceEvents.get(event);
                this._onceEvents.delete(event);
                for (const listener of onceListeners) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[AIAddonManager] Error in once listener for "${event}":`, e);
                    }
                }
            }
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

            // 이벤트 발생
            this.emit('addon:registered', { id: addon.id, name: addon.name, type: 'ai' });

            return true;
        }

        /**
         * Addon 등록 검증 (상세 에러 메시지)
         * @param {Object} addon - 검증할 Addon 객체
         * @returns {{ valid: boolean, errors: string[] }}
         */
        validate(addon) {
            const errors = [];

            if (!addon) {
                errors.push('Addon object is null or undefined');
                return { valid: false, errors };
            }

            // 필수 필드 검증
            const requiredFields = ['id', 'name', 'author', 'description', 'version'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    errors.push(`Missing required field: "${field}"`);
                }
            }

            // 필수 메서드 검증
            if (typeof addon.getSettingsUI !== 'function') {
                errors.push('Missing required method: getSettingsUI()');
            }

            // 기능 메서드 중 최소 하나는 있어야 함
            const featureMethods = ['translateLyrics', 'translateMetadata', 'generateTMI'];
            const hasAnyFeature = featureMethods.some(m => typeof addon[m] === 'function');
            if (!hasAnyFeature) {
                errors.push(`Must implement at least one of: ${featureMethods.join(', ')}`);
            }

            // 선택 메서드 타입 검증
            if (addon.init && typeof addon.init !== 'function') {
                errors.push('Field "init" must be a function if provided');
            }
            if (addon.testConnection && typeof addon.testConnection !== 'function') {
                errors.push('Field "testConnection" must be a function if provided');
            }

            return { valid: errors.length === 0, errors };
        }

        /**
         * Addon 해제
         * @param {string} addonId - Addon ID
         */
        unregister(addonId) {
            if (this._addons.has(addonId)) {
                const addon = this._addons.get(addonId);
                this._addons.delete(addonId);
                console.log(`[AIAddonManager] Unregistered addon: ${addonId}`);

                // 이벤트 발생
                this.emit('addon:unregistered', { id: addonId, name: addon?.name });

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

            // 이벤트 발생
            this.emit('ai:provider:changed', { type, addonId });

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

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'translateMetadata called', { provider: addon.id, ...params });
                window.AddonDebug.time('ai', 'translateMetadata');
            }

            // 이벤트 발생
            this.emit('ai:request:start', { type: 'metadata', provider: addon.id, params });

            try {
                const result = await addon.translateMetadata(params);

                // 디버그 타이머 종료
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('ai', 'translateMetadata');
                }

                // 이벤트 발생
                this.emit('ai:request:success', { type: 'metadata', provider: addon.id });

                return result;
            } catch (e) {
                console.error('[AIAddonManager] translateMetadata failed:', e);

                // 디버그 로깅
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('ai', 'translateMetadata');
                    window.AddonDebug.error('ai', 'translateMetadata error', e);
                }

                // 이벤트 발생
                this.emit('ai:request:error', { type: 'metadata', provider: addon.id, error: e.message });

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

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'translateLyrics called', {
                    provider: addon.id,
                    lang: params.lang,
                    wantSmartPhonetic: params.wantSmartPhonetic,
                    lineCount: params.text?.split('\n').length
                });
                window.AddonDebug.time('ai', 'translateLyrics');
            }

            // 이벤트 발생
            this.emit('ai:request:start', { type: 'lyrics', provider: addon.id, params: { ...params, text: '[...]' } });

            try {
                const result = await addon.translateLyrics(params);

                // 디버그 타이머 종료
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('ai', 'translateLyrics');
                }

                // 이벤트 발생
                this.emit('ai:request:success', { type: 'lyrics', provider: addon.id });

                return result;
            } catch (e) {
                console.error('[AIAddonManager] translateLyrics failed:', e);

                // 디버그 로깅
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('ai', 'translateLyrics');
                    window.AddonDebug.error('ai', 'translateLyrics error', e);
                }

                // 이벤트 발생
                this.emit('ai:request:error', { type: 'lyrics', provider: addon.id, error: e.message });

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

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'generateTMI called', { provider: addon.id, ...params });
                window.AddonDebug.time('ai', 'generateTMI');
            }

            // 이벤트 발생
            this.emit('ai:request:start', { type: 'tmi', provider: addon.id, params });

            try {
                const result = await addon.generateTMI(params);

                // 디버그 타이머 종료
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('ai', 'generateTMI');
                }

                // 이벤트 발생
                this.emit('ai:request:success', { type: 'tmi', provider: addon.id });

                return result;
            } catch (e) {
                console.error('[AIAddonManager] generateTMI failed:', e);

                // 디버그 로깅
                if (window.AddonDebug?.isEnabled()) {
                    window.AddonDebug.timeEnd('ai', 'generateTMI');
                    window.AddonDebug.error('ai', 'generateTMI error', e);
                }

                // 이벤트 발생
                this.emit('ai:request:error', { type: 'tmi', provider: addon.id, error: e.message });

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
