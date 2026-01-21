/**
 * Lyrics Addon Manager
 * 가사 제공자(Spotify, LRCLIB 등) Addon들을 관리하는 중앙 시스템
 *
 * @author ivLis STUDIO
 * @description 가사 제공자 Addon 등록 및 관리
 */

(() => {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    const STORAGE_PREFIX = 'ivLyrics:lyrics:';

    // 가사 유형
    const LYRICS_TYPES = {
        KARAOKE: 'karaoke',     // 노래방 가사 (단어별 타이밍)
        SYNCED: 'synced',       // 싱크 가사 (줄별 타이밍)
        UNSYNCED: 'unsynced'    // 일반 가사 (타이밍 없음)
    };

    // ============================================
    // LyricsAddonManager Class
    // ============================================

    class LyricsAddonManager {
        constructor() {
            this._addons = new Map();
            this._initialized = false;
            this._initPromise = null;

            // EventEmitter 믹스인 (AddonUtils가 로드된 경우)
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
                window.AddonDebug.log('events', `LyricsAddonManager.emit: ${event}`, args[0]);
            }

            if (this._events.has(event)) {
                for (const listener of this._events.get(event)) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[LyricsAddonManager] Error in listener for "${event}":`, e);
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
                        console.error(`[LyricsAddonManager] Error in once listener for "${event}":`, e);
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
                console.log('[LyricsAddonManager] Initializing...');

                // 등록된 모든 Addon 초기화
                for (const [id, addon] of this._addons) {
                    try {
                        if (typeof addon.init === 'function') {
                            await addon.init();
                        }
                        console.log(`[LyricsAddonManager] Addon "${id}" initialized`);
                    } catch (e) {
                        console.error(`[LyricsAddonManager] Failed to initialize addon "${id}":`, e);
                    }
                }

                this._initialized = true;
                console.log('[LyricsAddonManager] Initialization complete');
            })();

            return this._initPromise;
        }

        /**
         * Addon 등록
         * @param {Object} addon - Addon 객체
         *
         * 필수 필드:
         * - id: string (고유 ID)
         * - name: string (표시 이름)
         * - author: string (제작자)
         * - description: string | { en: string, ko: string, ... } (설명)
         * - version: string (버전)
         * - supports: { karaoke: boolean, synced: boolean, unsynced: boolean } (지원 가사 유형)
         *
         * 필수 메서드:
         * - getLyrics(info): Promise<LyricsResult> (가사 가져오기)
         *
         * 선택 메서드:
         * - getSettingsUI(): React.Component (설정 UI)
         * - init(): Promise<void> (초기화)
         */
        register(addon) {
            if (!addon || !addon.id) {
                console.error('[LyricsAddonManager] Invalid addon: missing id');
                return false;
            }

            // 필수 필드 검증
            const requiredFields = ['id', 'name', 'author', 'description', 'version', 'supports'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    console.error(`[LyricsAddonManager] Invalid addon "${addon.id}": missing ${field}`);
                    return false;
                }
            }

            // supports 필드 검증
            if (typeof addon.supports !== 'object') {
                console.error(`[LyricsAddonManager] Invalid addon "${addon.id}": supports must be an object`);
                return false;
            }

            // 필수 메서드 검증
            if (typeof addon.getLyrics !== 'function') {
                console.error(`[LyricsAddonManager] Invalid addon "${addon.id}": missing getLyrics()`);
                return false;
            }

            this._addons.set(addon.id, addon);
            console.log(`[LyricsAddonManager] Registered addon: ${addon.id} (${addon.name})`);
            console.log(`[LyricsAddonManager] Supports: karaoke=${addon.supports.karaoke}, synced=${addon.supports.synced}, unsynced=${addon.supports.unsynced}`);

            // 이미 초기화 완료된 경우, 새 Addon도 초기화
            if (this._initialized && typeof addon.init === 'function') {
                addon.init().catch(e => {
                    console.error(`[LyricsAddonManager] Failed to late-init addon "${addon.id}":`, e);
                });
            }

            // 이벤트 발생
            this.emit('addon:registered', { id: addon.id, name: addon.name, type: 'lyrics' });

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
            const requiredFields = ['id', 'name', 'author', 'description', 'version', 'supports'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    errors.push(`Missing required field: "${field}"`);
                }
            }

            // supports 객체 검증
            if (addon.supports) {
                if (typeof addon.supports !== 'object') {
                    errors.push('Field "supports" must be an object');
                } else {
                    const supportTypes = ['karaoke', 'synced', 'unsynced'];
                    for (const type of supportTypes) {
                        if (typeof addon.supports[type] !== 'boolean') {
                            errors.push(`Field "supports.${type}" must be a boolean`);
                        }
                    }
                }
            }

            // 필수 메서드 검증
            if (typeof addon.getLyrics !== 'function') {
                errors.push('Missing required method: getLyrics(info)');
            }

            // 선택 메서드 타입 검증
            if (addon.init && typeof addon.init !== 'function') {
                errors.push('Field "init" must be a function if provided');
            }
            if (addon.getSettingsUI && typeof addon.getSettingsUI !== 'function') {
                errors.push('Field "getSettingsUI" must be a function if provided');
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
                console.log(`[LyricsAddonManager] Unregistered addon: ${addonId}`);

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
        // Provider Order Management
        // ============================================

        /**
         * Provider 순서 저장
         * @param {string[]} order - Provider ID 순서
         */
        setProviderOrder(order) {
            Spicetify.LocalStorage.set(STORAGE_PREFIX + 'provider-order', JSON.stringify(order));
            console.log('[LyricsAddonManager] Provider order saved:', order);

            // 이벤트 발생
            this.emit('provider:order:changed', { order });

            // Trigger immediate lyrics refresh if possible
            if (window.lyricContainer && typeof window.lyricContainer.fetchLyrics === 'function') {
                console.log('[LyricsAddonManager] Triggering lyrics refresh for provider order change');
                // Force cache clear for current track if needed, or rely on fetchLyrics logic
                // fetchLyrics calls getLyricsFromProviders which might use cache.
                // We should probably clear the memory cache in index.js for the current track to ensure re-fetch.
                if (window.lyricContainer.clearCacheForCurrentTrack) {
                    // Assuming such method doesn't exist yet, we can manually clear CACHE if exposed, or rely on refresh=true param if we add it
                }

                // Using refresh=true argument for fetchLyrics (track, mode, refresh)
                const currentTrack = Spicetify.Player.data?.item;
                if (currentTrack) {
                    window.lyricContainer.fetchLyrics(currentTrack, -1, true);
                }
            }
        }

        /**
         * Provider 순서 가져오기
         * @returns {string[]}
         */
        getProviderOrder() {
            const stored = Spicetify.LocalStorage.get(STORAGE_PREFIX + 'provider-order');
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch {
                    // Fall through to default
                }
            }
            // 기본 순서: 등록된 순서대로
            return this.getAddonIds();
        }

        /**
         * Provider 활성화/비활성화
         * @param {string} addonId - Addon ID
         * @param {boolean} enabled - 활성화 여부
         */
        setProviderEnabled(addonId, enabled) {
            Spicetify.LocalStorage.set(STORAGE_PREFIX + `enabled:${addonId}`, enabled ? 'true' : 'false');

            // 이벤트 발생
            this.emit('provider:enabled:changed', { id: addonId, enabled });
        }

        /**
         * Provider 활성화 여부 확인
         * @param {string} addonId - Addon ID
         * @returns {boolean}
         */
        isProviderEnabled(addonId) {
            const stored = Spicetify.LocalStorage.get(STORAGE_PREFIX + `enabled:${addonId}`);
            // 기본값은 true
            return stored !== 'false';
        }

        /**
         * 활성화된 Provider 목록 (순서대로)
         * @returns {Object[]}
         */
        getEnabledProviders() {
            const order = this.getProviderOrder();
            return order
                .filter(id => this.isProviderEnabled(id) && this._addons.has(id))
                .map(id => this._addons.get(id));
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

        // ============================================
        // API Methods
        // ============================================

        /**
         * 가사 가져오기 (모든 활성화된 Provider 순회)
         * @param {Object} info - 트랙 정보 { uri, title, artist, album, duration }
         * @returns {Promise<LyricsResult|null>}
         *
         * LyricsResult 형식:
         * {
         *   uri: string,
         *   provider: string,
         *   karaoke: Array<{ startTime: number, text: string, syllables?: Array<{ text: string, startTime: number, endTime: number }> }> | null,
         *   synced: Array<{ startTime: number, text: string }> | null,
         *   unsynced: Array<{ text: string }> | null,
         *   copyright: string | null,
         *   error: string | null
         * }
         */
        async getLyrics(info) {
            const enabledProviders = this.getEnabledProviders();

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('lyrics', 'getLyrics called', {
                    uri: info.uri,
                    title: info.title,
                    artist: info.artist,
                    providers: enabledProviders.map(p => p.id)
                });
                window.AddonDebug.time('lyrics', 'getLyrics:total');
            }

            // 이벤트 발생
            this.emit('lyrics:fetch:start', { uri: info.uri, title: info.title, artist: info.artist });

            if (enabledProviders.length === 0) {
                console.warn('[LyricsAddonManager] No enabled lyrics providers');
                const error = { error: 'No lyrics providers enabled', uri: info.uri };
                this.emit('lyrics:fetch:error', { ...error, reason: 'no_providers' });
                return error;
            }

            for (const provider of enabledProviders) {
                try {
                    console.log(`[LyricsAddonManager] Trying provider: ${provider.id}`);

                    // 디버그 타이머
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.time('lyrics', `provider:${provider.id}`);
                    }

                    const result = await provider.getLyrics(info);

                    // 디버그 타이머 종료
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.timeEnd('lyrics', `provider:${provider.id}`);
                    }

                    if (result && !result.error) {
                        // 성공
                        console.log(`[LyricsAddonManager] Got lyrics from: ${provider.id}`);

                        // ivLyrics Sync 데이터 자동 적용 확인
                        if (provider.useIvLyricsSync) {
                            if (window.LyricsService?.applyIvLyricsSyncData) {
                                console.log(`[LyricsAddonManager] Applying sync data for ${provider.id}...`);
                                try {
                                    const syncResult = await window.LyricsService.applyIvLyricsSyncData(result);
                                    if (syncResult) Object.assign(result, syncResult);
                                } catch (e) {
                                    console.warn(`[LyricsAddonManager] Failed to apply sync data for ${provider.id}:`, e);
                                }
                            } else {
                                console.warn(`[LyricsAddonManager] Provider ${provider.id} requests sync data, but window.LyricsService.applyIvLyricsSyncData is missing!`);
                            }
                        }

                        // Filter based on user settings
                        const allowKaraoke = this.getAddonSetting(provider.id, 'enable_karaoke', true);
                        const allowSynced = this.getAddonSetting(provider.id, 'enable_synced', true);
                        const allowUnsynced = this.getAddonSetting(provider.id, 'enable_unsynced', true);

                        if (!allowKaraoke) result.karaoke = null;
                        if (!allowSynced) result.synced = null;
                        if (!allowUnsynced) result.unsynced = null;

                        // Check if specific types are allowed but missing, don't necessarily filter out unless ALL are missing/filtered
                        // If result has lyrics that are allowed, return it.
                        if (result.karaoke || result.synced || result.unsynced) {
                            // 디버그 타이머 종료
                            if (window.AddonDebug?.isEnabled()) {
                                window.AddonDebug.timeEnd('lyrics', 'getLyrics:total');
                                window.AddonDebug.log('lyrics', 'getLyrics success', {
                                    provider: result.provider,
                                    hasKaraoke: !!result.karaoke,
                                    hasSynced: !!result.synced,
                                    hasUnsynced: !!result.unsynced
                                });
                            }

                            // 이벤트 발생
                            this.emit('lyrics:fetch:success', {
                                uri: info.uri,
                                provider: result.provider,
                                hasKaraoke: !!result.karaoke,
                                hasSynced: !!result.synced,
                                hasUnsynced: !!result.unsynced
                            });

                            return result;
                        } else {
                            console.log(`[LyricsAddonManager] Lyrics from ${provider.id} filtered out by user settings or empty`);
                        }
                    }

                    // 에러가 있으면 다음 provider 시도
                    console.log(`[LyricsAddonManager] Provider ${provider.id} returned error:`, result?.error);
                } catch (e) {
                    console.warn(`[LyricsAddonManager] Provider ${provider.id} failed:`, e);

                    // 디버그 로깅
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.error('lyrics', `Provider ${provider.id} error`, e);
                    }
                }
            }

            // 디버그 타이머 종료
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('lyrics', 'getLyrics:total');
                window.AddonDebug.warn('lyrics', 'No lyrics found from any provider');
            }

            // 이벤트 발생
            const errorResult = { error: 'No lyrics found', uri: info.uri };
            this.emit('lyrics:fetch:error', { ...errorResult, reason: 'not_found' });

            return errorResult;
        }

        /**
         * 특정 Provider에서 가사 가져오기
         * @param {string} providerId - Provider ID
         * @param {Object} info - 트랙 정보
         * @returns {Promise<LyricsResult|null>}
         */
        async getLyricsFrom(providerId, info) {
            const provider = this.getAddon(providerId);
            if (!provider) {
                console.error(`[LyricsAddonManager] Provider not found: ${providerId}`);
                return { error: 'Provider not found', uri: info.uri };
            }

            try {
                return await provider.getLyrics(info);
            } catch (e) {
                console.error(`[LyricsAddonManager] Provider ${providerId} failed:`, e);
                return { error: e.message, uri: info.uri };
            }
        }

        // ============================================
        // Utility Methods
        // ============================================

        /**
         * 특정 가사 유형을 지원하는 Provider 목록
         * @param {'karaoke'|'synced'|'unsynced'} type - 가사 유형
         * @returns {Object[]}
         */
        getProvidersSupporting(type) {
            return this.getAddons().filter(addon =>
                addon.supports && addon.supports[type] === true
            );
        }

        /**
         * 가사 유형 상수
         */
        get TYPES() {
            return LYRICS_TYPES;
        }
    }

    // ============================================
    // Global Registration
    // ============================================

    const manager = new LyricsAddonManager();
    window.LyricsAddonManager = manager;

    // Spicetify가 준비되면 초기화
    const initWhenReady = () => {
        if (Spicetify?.LocalStorage) {
            manager.init().catch(e => {
                console.error('[LyricsAddonManager] Init failed:', e);
            });
        } else {
            setTimeout(initWhenReady, 100);
        }
    };

    initWhenReady();

    console.log('[LyricsAddonManager] Module loaded');
})();
