/**
 * Addon Utilities
 * Addon 개발을 위한 공통 유틸리티 및 헬퍼
 *
 * @author ivLis STUDIO
 * @description Settings UI Helper, Error Classes, EventEmitter 등
 */

(() => {
    'use strict';

    // ============================================
    // AddonError - 표준 에러 클래스
    // ============================================

    /**
     * Addon 표준 에러 클래스
     * @example
     * throw new AddonError('NO_API_KEY', 'API 키가 설정되지 않았습니다.');
     * throw new AddonError('RATE_LIMITED', '요청 한도 초과', true);
     */
    class AddonError extends Error {
        /**
         * @param {string} code - 에러 코드 (예: 'NO_API_KEY', 'RATE_LIMITED', 'NO_LYRICS')
         * @param {string} message - 사용자에게 표시할 메시지
         * @param {boolean} recoverable - 재시도 가능 여부
         * @param {Object} details - 추가 정보 (디버깅용)
         */
        constructor(code, message, recoverable = false, details = {}) {
            super(message);
            this.name = 'AddonError';
            this.code = code;
            this.recoverable = recoverable;
            this.details = details;
            this.timestamp = Date.now();
        }

        /**
         * 로깅용 문자열 반환
         */
        toString() {
            return `[AddonError:${this.code}] ${this.message}${this.recoverable ? ' (recoverable)' : ''}`;
        }

        /**
         * JSON 직렬화
         */
        toJSON() {
            return {
                name: this.name,
                code: this.code,
                message: this.message,
                recoverable: this.recoverable,
                details: this.details,
                timestamp: this.timestamp
            };
        }
    }

    // 자주 사용되는 에러 코드 상수
    AddonError.Codes = {
        // 공통
        INVALID_CONFIG: 'INVALID_CONFIG',
        NETWORK_ERROR: 'NETWORK_ERROR',
        TIMEOUT: 'TIMEOUT',
        UNKNOWN: 'UNKNOWN',

        // API 관련
        NO_API_KEY: 'NO_API_KEY',
        INVALID_API_KEY: 'INVALID_API_KEY',
        RATE_LIMITED: 'RATE_LIMITED',
        API_ERROR: 'API_ERROR',

        // 가사 관련
        NO_LYRICS: 'NO_LYRICS',
        PARSE_ERROR: 'PARSE_ERROR',
        PROVIDER_ERROR: 'PROVIDER_ERROR',

        // AI 관련
        TRANSLATION_FAILED: 'TRANSLATION_FAILED',
        EMPTY_RESPONSE: 'EMPTY_RESPONSE',
        JSON_PARSE_ERROR: 'JSON_PARSE_ERROR'
    };

    // 에러 코드별 기본 recoverable 값
    AddonError.RecoverableByDefault = {
        [AddonError.Codes.RATE_LIMITED]: true,
        [AddonError.Codes.NETWORK_ERROR]: true,
        [AddonError.Codes.TIMEOUT]: true
    };

    /**
     * 팩토리 메서드들
     */
    AddonError.noApiKey = (provider) =>
        new AddonError(AddonError.Codes.NO_API_KEY, `${provider} API 키가 설정되지 않았습니다.`);

    AddonError.invalidApiKey = (provider) =>
        new AddonError(AddonError.Codes.INVALID_API_KEY, `${provider} API 키가 유효하지 않습니다.`);

    AddonError.rateLimited = (provider, retryAfter = null) =>
        new AddonError(AddonError.Codes.RATE_LIMITED, `${provider} 요청 한도 초과`, true, { retryAfter });

    AddonError.noLyrics = () =>
        new AddonError(AddonError.Codes.NO_LYRICS, '가사를 찾을 수 없습니다.');

    AddonError.networkError = (details) =>
        new AddonError(AddonError.Codes.NETWORK_ERROR, '네트워크 오류', true, details);

    // ============================================
    // EventEmitter - 이벤트 시스템
    // ============================================

    /**
     * 간단한 EventEmitter 구현
     * @example
     * const emitter = new AddonEventEmitter();
     * emitter.on('lyrics:fetched', (data) => console.log(data));
     * emitter.emit('lyrics:fetched', { provider: 'spotify', uri: '...' });
     */
    class AddonEventEmitter {
        constructor() {
            this._events = new Map();
            this._onceEvents = new Map();
        }

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

            // unsubscribe 함수 반환
            return () => this.off(event, listener);
        }

        /**
         * 일회성 이벤트 리스너 등록
         * @param {string} event - 이벤트 이름
         * @param {Function} listener - 콜백 함수
         */
        once(event, listener) {
            if (!this._onceEvents.has(event)) {
                this._onceEvents.set(event, new Set());
            }
            this._onceEvents.get(event).add(listener);
        }

        /**
         * 이벤트 리스너 제거
         * @param {string} event - 이벤트 이름
         * @param {Function} listener - 제거할 콜백 함수
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
         * @param {string} event - 이벤트 이름
         * @param {...*} args - 리스너에 전달할 인자
         */
        emit(event, ...args) {
            // 일반 리스너 호출
            if (this._events.has(event)) {
                for (const listener of this._events.get(event)) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[AddonEventEmitter] Error in listener for "${event}":`, e);
                    }
                }
            }

            // once 리스너 호출 후 제거
            if (this._onceEvents.has(event)) {
                const onceListeners = this._onceEvents.get(event);
                this._onceEvents.delete(event);
                for (const listener of onceListeners) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[AddonEventEmitter] Error in once listener for "${event}":`, e);
                    }
                }
            }
        }

        /**
         * 특정 이벤트의 모든 리스너 제거
         * @param {string} event - 이벤트 이름
         */
        removeAllListeners(event) {
            if (event) {
                this._events.delete(event);
                this._onceEvents.delete(event);
            } else {
                this._events.clear();
                this._onceEvents.clear();
            }
        }

        /**
         * 리스너 개수 반환
         * @param {string} event - 이벤트 이름
         * @returns {number}
         */
        listenerCount(event) {
            let count = 0;
            if (this._events.has(event)) count += this._events.get(event).size;
            if (this._onceEvents.has(event)) count += this._onceEvents.get(event).size;
            return count;
        }
    }

    // 이벤트 이름 상수
    AddonEventEmitter.Events = {
        // Lyrics 관련
        LYRICS_FETCH_START: 'lyrics:fetch:start',
        LYRICS_FETCH_SUCCESS: 'lyrics:fetch:success',
        LYRICS_FETCH_ERROR: 'lyrics:fetch:error',
        PROVIDER_ORDER_CHANGED: 'provider:order:changed',
        PROVIDER_ENABLED_CHANGED: 'provider:enabled:changed',

        // AI 관련
        AI_REQUEST_START: 'ai:request:start',
        AI_REQUEST_SUCCESS: 'ai:request:success',
        AI_REQUEST_ERROR: 'ai:request:error',
        AI_PROVIDER_CHANGED: 'ai:provider:changed',

        // Addon 관련
        ADDON_REGISTERED: 'addon:registered',
        ADDON_UNREGISTERED: 'addon:unregistered',
        ADDON_INITIALIZED: 'addon:initialized',
        ADDON_ERROR: 'addon:error'
    };

    // ============================================
    // SettingsUIBuilder - 선언적 설정 UI 생성
    // ============================================

    /**
     * 선언적 스키마로 Settings UI 생성
     * @example
     * const schema = [
     *   { type: 'password', key: 'api-key', label: 'API Key', placeholder: 'sk-...' },
     *   { type: 'select', key: 'model', label: 'Model', options: [{ id: 'gpt-4', name: 'GPT-4' }] },
     *   { type: 'button', action: 'test', label: 'Test Connection', primary: true }
     * ];
     * const SettingsUI = SettingsUIBuilder.build(schema, { addonId: 'chatgpt', manager: AIAddonManager });
     */
    const SettingsUIBuilder = {
        /**
         * 스키마로부터 React 컴포넌트 생성
         * @param {Array} schema - 설정 스키마 배열
         * @param {Object} options - 옵션
         * @param {string} options.addonId - Addon ID
         * @param {Object} options.manager - AddonManager 인스턴스
         * @param {Object} options.addon - Addon 객체 (메타데이터, 테스트 함수 등)
         * @returns {Function} React 함수 컴포넌트
         */
        build(schema, options) {
            const { addonId, manager, addon } = options;

            return function GeneratedSettingsUI() {
                const { useState, useCallback } = Spicetify.React;
                const React = Spicetify.React;

                // 모든 설정값의 state 생성
                const initialState = {};
                for (const field of schema) {
                    if (field.key) {
                        initialState[field.key] = manager.getAddonSetting(addonId, field.key, field.defaultValue ?? '');
                    }
                }

                const [values, setValues] = useState(initialState);
                const [testStatus, setTestStatus] = useState('');

                // 값 변경 핸들러
                const handleChange = useCallback((key, value) => {
                    setValues(prev => ({ ...prev, [key]: value }));
                    manager.setAddonSetting(addonId, key, value);
                }, []);

                // 테스트 버튼 핸들러
                const handleTest = useCallback(async () => {
                    if (addon && typeof addon.testConnection === 'function') {
                        setTestStatus('Testing...');
                        try {
                            await addon.testConnection();
                            setTestStatus('✓ Connection successful!');
                        } catch (e) {
                            setTestStatus(`✗ Error: ${e.message}`);
                        }
                    }
                }, []);

                // 외부 링크 핸들러
                const handleOpenUrl = useCallback((url) => {
                    window.open(url, '_blank');
                }, []);

                // 필드 렌더링 함수들
                const renderField = (field, index) => {
                    switch (field.type) {
                        case 'text':
                        case 'password':
                        case 'url':
                            return renderInputField(field);
                        case 'textarea':
                            return renderTextareaField(field);
                        case 'select':
                            return renderSelectField(field);
                        case 'checkbox':
                            return renderCheckboxField(field);
                        case 'button':
                            return renderButtonField(field);
                        case 'info':
                            return renderInfoField(field);
                        case 'divider':
                            return renderDivider(field);
                        case 'header':
                            return renderHeader(field);
                        default:
                            return null;
                    }
                };

                const renderInputField = (field) => {
                    const elements = [
                        React.createElement('label', { key: 'label' }, field.label)
                    ];

                    const inputElements = [
                        React.createElement('input', {
                            key: 'input',
                            type: field.type,
                            value: values[field.key] || '',
                            onChange: (e) => handleChange(field.key, e.target.value),
                            placeholder: field.placeholder || ''
                        })
                    ];

                    // 외부 링크 버튼 추가
                    if (field.externalUrl) {
                        inputElements.push(
                            React.createElement('button', {
                                key: 'external',
                                onClick: () => handleOpenUrl(field.externalUrl),
                                className: 'ai-addon-btn-secondary'
                            }, field.externalLabel || 'Open')
                        );
                    }

                    elements.push(
                        React.createElement('div', { key: 'input-group', className: 'ai-addon-input-group' }, inputElements)
                    );

                    if (field.description) {
                        elements.push(
                            React.createElement('small', { key: 'desc' }, field.description)
                        );
                    }

                    return React.createElement('div', {
                        key: field.key,
                        className: 'ai-addon-setting'
                    }, elements);
                };

                const renderTextareaField = (field) => {
                    return React.createElement('div', {
                        key: field.key,
                        className: 'ai-addon-setting'
                    },
                        React.createElement('label', null, field.label),
                        React.createElement('textarea', {
                            value: values[field.key] || '',
                            onChange: (e) => handleChange(field.key, e.target.value),
                            placeholder: field.placeholder || '',
                            rows: field.rows || 3
                        }),
                        field.description && React.createElement('small', null, field.description)
                    );
                };

                const renderSelectField = (field) => {
                    const options = field.options || [];
                    return React.createElement('div', {
                        key: field.key,
                        className: 'ai-addon-setting'
                    },
                        React.createElement('label', null, field.label),
                        React.createElement('select', {
                            value: values[field.key] || '',
                            onChange: (e) => handleChange(field.key, e.target.value)
                        },
                            options.map(opt =>
                                React.createElement('option', {
                                    key: opt.id || opt.value,
                                    value: opt.id || opt.value
                                }, opt.name || opt.label)
                            )
                        ),
                        field.description && React.createElement('small', null, field.description)
                    );
                };

                const renderCheckboxField = (field) => {
                    return React.createElement('div', {
                        key: field.key,
                        className: 'ai-addon-setting ai-addon-checkbox'
                    },
                        React.createElement('label', null,
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: values[field.key] || false,
                                onChange: (e) => handleChange(field.key, e.target.checked)
                            }),
                            React.createElement('span', null, field.label)
                        ),
                        field.description && React.createElement('small', null, field.description)
                    );
                };

                const renderButtonField = (field) => {
                    const isTestButton = field.action === 'test';
                    const onClick = isTestButton ? handleTest :
                        field.onClick ? () => field.onClick(values, handleChange) :
                            field.url ? () => handleOpenUrl(field.url) : null;

                    return React.createElement('div', {
                        key: `btn-${field.label}`,
                        className: 'ai-addon-setting'
                    },
                        React.createElement('button', {
                            onClick,
                            className: field.primary ? 'ai-addon-btn-primary' : 'ai-addon-btn-secondary'
                        }, field.label),
                        isTestButton && testStatus && React.createElement('span', {
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    );
                };

                const renderInfoField = (field) => {
                    return React.createElement('div', {
                        key: `info-${field.label || Math.random()}`,
                        className: 'ai-addon-setting'
                    },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            field.label && React.createElement('p', { style: { fontWeight: 'bold', marginBottom: '8px' } }, field.label),
                            field.content && React.createElement('p', null, field.content),
                            field.items && React.createElement('ul', { style: { paddingLeft: '20px', marginTop: '8px', opacity: 0.8 } },
                                field.items.map((item, i) => React.createElement('li', { key: i }, item))
                            )
                        )
                    );
                };

                const renderDivider = (field) => {
                    return React.createElement('hr', {
                        key: `divider-${Math.random()}`,
                        className: 'ai-addon-divider'
                    });
                };

                const renderHeader = (field) => {
                    return React.createElement('h4', {
                        key: `header-${field.label}`,
                        className: 'ai-addon-section-header'
                    }, field.label);
                };

                // 메인 렌더링
                const elements = [];

                // Addon 헤더 (addon 정보가 있으면)
                if (addon) {
                    elements.push(
                        React.createElement('div', { key: 'header', className: 'ai-addon-header' },
                            React.createElement('h3', null, addon.name),
                            React.createElement('span', { className: 'ai-addon-version' }, `v${addon.version}`)
                        )
                    );

                    if (addon.description) {
                        const desc = typeof addon.description === 'string'
                            ? addon.description
                            : addon.description[Spicetify.Locale?.getLocale()?.split('-')[0]] ||
                            addon.description['en'] ||
                            Object.values(addon.description)[0];
                        elements.push(
                            React.createElement('p', { key: 'desc', className: 'ai-addon-description' }, desc)
                        );
                    }
                }

                // 스키마 필드들 렌더링
                schema.forEach((field, index) => {
                    const rendered = renderField(field, index);
                    if (rendered) elements.push(rendered);
                });

                return React.createElement('div', {
                    className: `ai-addon-settings ${addonId}-settings`
                }, elements);
            };
        }
    };

    // ============================================
    // DebugMode - 디버그 모드 유틸리티
    // ============================================

    /**
     * 디버그 모드 유틸리티
     * @example
     * AddonDebug.enable();
     * AddonDebug.log('lyrics', 'Fetching lyrics...', { uri: '...' });
     * AddonDebug.time('lyrics', 'getLyrics');
     * // ... 작업 ...
     * AddonDebug.timeEnd('lyrics', 'getLyrics');
     */
    const AddonDebug = {
        _enabled: false,
        _categories: new Set(['all']),
        _timers: new Map(),
        _history: [],
        _maxHistory: 100,

        /**
         * 디버그 모드 활성화
         * @param {string[]} categories - 활성화할 카테고리 (기본: 전체)
         */
        enable(categories = ['all']) {
            this._enabled = true;
            this._categories = new Set(categories);
            console.log('[AddonDebug] Debug mode enabled', categories);
        },

        /**
         * 디버그 모드 비활성화
         */
        disable() {
            this._enabled = false;
            console.log('[AddonDebug] Debug mode disabled');
        },

        /**
         * 디버그 모드 상태 확인
         */
        isEnabled() {
            return this._enabled;
        },

        /**
         * 디버그 로그 출력
         * @param {string} category - 카테고리 (예: 'lyrics', 'ai', 'network')
         * @param {string} message - 메시지
         * @param {*} data - 추가 데이터
         */
        log(category, message, data = null) {
            if (!this._enabled) return;
            if (!this._categories.has('all') && !this._categories.has(category)) return;

            const entry = {
                timestamp: Date.now(),
                category,
                message,
                data
            };

            this._history.push(entry);
            if (this._history.length > this._maxHistory) {
                this._history.shift();
            }

            const prefix = `[AddonDebug:${category}]`;
            if (data) {
                console.log(prefix, message, data);
            } else {
                console.log(prefix, message);
            }
        },

        /**
         * 경고 로그
         */
        warn(category, message, data = null) {
            if (!this._enabled) return;
            if (!this._categories.has('all') && !this._categories.has(category)) return;

            const prefix = `[AddonDebug:${category}]`;
            if (data) {
                console.warn(prefix, message, data);
            } else {
                console.warn(prefix, message);
            }
        },

        /**
         * 에러 로그
         */
        error(category, message, error = null) {
            if (!this._enabled) return;
            if (!this._categories.has('all') && !this._categories.has(category)) return;

            const prefix = `[AddonDebug:${category}]`;
            if (error) {
                console.error(prefix, message, error);
            } else {
                console.error(prefix, message);
            }
        },

        /**
         * 타이머 시작
         * @param {string} category - 카테고리
         * @param {string} label - 타이머 레이블
         */
        time(category, label) {
            if (!this._enabled) return;
            const key = `${category}:${label}`;
            this._timers.set(key, performance.now());
        },

        /**
         * 타이머 종료 및 출력
         * @param {string} category - 카테고리
         * @param {string} label - 타이머 레이블
         * @returns {number|null} 경과 시간 (ms)
         */
        timeEnd(category, label) {
            if (!this._enabled) return null;
            const key = `${category}:${label}`;
            const start = this._timers.get(key);
            if (!start) return null;

            const elapsed = performance.now() - start;
            this._timers.delete(key);

            this.log(category, `${label} completed`, { elapsed: `${elapsed.toFixed(2)}ms` });
            return elapsed;
        },

        /**
         * API 요청 로깅
         * @param {string} provider - Provider 이름
         * @param {string} url - 요청 URL
         * @param {Object} options - 요청 옵션
         */
        logRequest(provider, url, options = {}) {
            this.log('network', `→ ${provider} Request`, {
                url: url.replace(/key=[^&]+/, 'key=***'),
                method: options.method || 'GET',
                hasBody: !!options.body
            });
        },

        /**
         * API 응답 로깅
         * @param {string} provider - Provider 이름
         * @param {number} status - HTTP 상태 코드
         * @param {number} elapsed - 응답 시간 (ms)
         */
        logResponse(provider, status, elapsed) {
            const level = status >= 400 ? 'warn' : 'log';
            this[level]('network', `← ${provider} Response`, {
                status,
                elapsed: `${elapsed.toFixed(2)}ms`
            });
        },

        /**
         * 히스토리 조회
         * @param {string} category - 필터할 카테고리 (선택)
         * @returns {Array}
         */
        getHistory(category = null) {
            if (category) {
                return this._history.filter(e => e.category === category);
            }
            return [...this._history];
        },

        /**
         * 히스토리 초기화
         */
        clearHistory() {
            this._history = [];
        },

        /**
         * 콘솔에 상태 덤프
         */
        dump() {
            console.group('[AddonDebug] State Dump');
            console.log('Enabled:', this._enabled);
            console.log('Categories:', [...this._categories]);
            console.log('Active Timers:', [...this._timers.keys()]);
            console.log('History Count:', this._history.length);
            console.table(this._history.slice(-10));
            console.groupEnd();
        }
    };

    // ============================================
    // AddonUI - 공통 UI 컴포넌트 라이브러리
    // ============================================

    /**
     * 미리 스타일링된 UI 컴포넌트 세트
     * @example
     * const { Toggle, TextInput, Select, Button } = AddonUI;
     * return React.createElement(Toggle, { label: 'Enable', value: true, onChange: (v) => {} });
     */
    const AddonUI = {
        /**
         * 토글 스위치
         * @param {Object} props
         * @param {string} props.label - 레이블
         * @param {boolean} props.value - 현재 값
         * @param {Function} props.onChange - 값 변경 핸들러
         * @param {string} props.description - 설명 (선택)
         * @param {boolean} props.disabled - 비활성화 여부 (선택)
         */
        Toggle: function Toggle(props) {
            const React = Spicetify.React;
            const { label, value, onChange, description, disabled = false } = props;

            return React.createElement('div', { className: 'addon-ui-toggle' },
                React.createElement('label', { className: `addon-ui-toggle-label ${disabled ? 'disabled' : ''}` },
                    React.createElement('input', {
                        type: 'checkbox',
                        checked: value,
                        onChange: (e) => onChange(e.target.checked),
                        disabled
                    }),
                    React.createElement('span', { className: 'addon-ui-toggle-switch' }),
                    React.createElement('span', { className: 'addon-ui-toggle-text' }, label)
                ),
                description && React.createElement('small', { className: 'addon-ui-description' }, description)
            );
        },

        /**
         * 텍스트 입력
         * @param {Object} props
         * @param {string} props.label - 레이블
         * @param {string} props.value - 현재 값
         * @param {Function} props.onChange - 값 변경 핸들러
         * @param {string} props.placeholder - 플레이스홀더 (선택)
         * @param {string} props.type - 입력 타입: 'text' | 'password' | 'url' (선택, 기본 'text')
         * @param {string} props.description - 설명 (선택)
         * @param {boolean} props.disabled - 비활성화 여부 (선택)
         */
        TextInput: function TextInput(props) {
            const React = Spicetify.React;
            const { label, value, onChange, placeholder = '', type = 'text', description, disabled = false } = props;

            return React.createElement('div', { className: 'addon-ui-text-input' },
                label && React.createElement('label', { className: 'addon-ui-label' }, label),
                React.createElement('input', {
                    type,
                    className: 'addon-ui-input',
                    value: value || '',
                    onChange: (e) => onChange(e.target.value),
                    placeholder,
                    disabled
                }),
                description && React.createElement('small', { className: 'addon-ui-description' }, description)
            );
        },

        /**
         * 비밀번호 입력 (API 키 등)
         * @param {Object} props - TextInput과 동일 + externalUrl, externalLabel
         */
        PasswordInput: function PasswordInput(props) {
            const React = Spicetify.React;
            const { useState } = React;
            const { label, value, onChange, placeholder = '', description, disabled = false, externalUrl, externalLabel = 'Get Key' } = props;

            const [showPassword, setShowPassword] = useState(false);

            return React.createElement('div', { className: 'addon-ui-password-input' },
                label && React.createElement('label', { className: 'addon-ui-label' }, label),
                React.createElement('div', { className: 'addon-ui-input-group' },
                    React.createElement('input', {
                        type: showPassword ? 'text' : 'password',
                        className: 'addon-ui-input',
                        value: value || '',
                        onChange: (e) => onChange(e.target.value),
                        placeholder,
                        disabled
                    }),
                    React.createElement('button', {
                        type: 'button',
                        className: 'addon-ui-btn-icon',
                        onClick: () => setShowPassword(!showPassword),
                        title: showPassword ? 'Hide' : 'Show'
                    }, showPassword ? '👁️' : '👁️‍🗨️'),
                    externalUrl && React.createElement('button', {
                        type: 'button',
                        className: 'addon-ui-btn-secondary',
                        onClick: () => window.open(externalUrl, '_blank')
                    }, externalLabel)
                ),
                description && React.createElement('small', { className: 'addon-ui-description' }, description)
            );
        },

        /**
         * 텍스트영역
         * @param {Object} props
         * @param {string} props.label - 레이블
         * @param {string} props.value - 현재 값
         * @param {Function} props.onChange - 값 변경 핸들러
         * @param {string} props.placeholder - 플레이스홀더 (선택)
         * @param {number} props.rows - 행 수 (선택, 기본 3)
         * @param {string} props.description - 설명 (선택)
         */
        TextArea: function TextArea(props) {
            const React = Spicetify.React;
            const { label, value, onChange, placeholder = '', rows = 3, description, disabled = false } = props;

            return React.createElement('div', { className: 'addon-ui-textarea' },
                label && React.createElement('label', { className: 'addon-ui-label' }, label),
                React.createElement('textarea', {
                    className: 'addon-ui-input',
                    value: value || '',
                    onChange: (e) => onChange(e.target.value),
                    placeholder,
                    rows,
                    disabled
                }),
                description && React.createElement('small', { className: 'addon-ui-description' }, description)
            );
        },

        /**
         * 셀렉트 (드롭다운)
         * @param {Object} props
         * @param {string} props.label - 레이블
         * @param {string} props.value - 현재 값
         * @param {Function} props.onChange - 값 변경 핸들러
         * @param {Array} props.options - 옵션 배열 [{ id: string, name: string }]
         * @param {string} props.description - 설명 (선택)
         * @param {boolean} props.disabled - 비활성화 여부 (선택)
         */
        Select: function Select(props) {
            const React = Spicetify.React;
            const { label, value, onChange, options = [], description, disabled = false } = props;

            return React.createElement('div', { className: 'addon-ui-select' },
                label && React.createElement('label', { className: 'addon-ui-label' }, label),
                React.createElement('select', {
                    className: 'addon-ui-input',
                    value: value || '',
                    onChange: (e) => onChange(e.target.value),
                    disabled
                },
                    options.map(opt =>
                        React.createElement('option', {
                            key: opt.id || opt.value,
                            value: opt.id || opt.value
                        }, opt.name || opt.label)
                    )
                ),
                description && React.createElement('small', { className: 'addon-ui-description' }, description)
            );
        },

        /**
         * 버튼
         * @param {Object} props
         * @param {string} props.label - 버튼 텍스트
         * @param {Function} props.onClick - 클릭 핸들러
         * @param {boolean} props.primary - 주요 버튼 여부 (선택)
         * @param {boolean} props.disabled - 비활성화 여부 (선택)
         * @param {boolean} props.loading - 로딩 중 여부 (선택)
         */
        Button: function Button(props) {
            const React = Spicetify.React;
            const { label, onClick, primary = false, disabled = false, loading = false } = props;

            return React.createElement('button', {
                className: `addon-ui-btn ${primary ? 'addon-ui-btn-primary' : 'addon-ui-btn-secondary'} ${loading ? 'loading' : ''}`,
                onClick,
                disabled: disabled || loading
            }, loading ? 'Loading...' : label);
        },

        /**
         * 정보 박스
         * @param {Object} props
         * @param {string} props.title - 제목 (선택)
         * @param {string} props.content - 내용
         * @param {Array} props.items - 목록 항목 (선택)
         * @param {'info'|'warning'|'error'|'success'} props.type - 타입 (선택, 기본 'info')
         */
        InfoBox: function InfoBox(props) {
            const React = Spicetify.React;
            const { title, content, items, type = 'info' } = props;

            return React.createElement('div', { className: `addon-ui-info-box addon-ui-info-${type}` },
                title && React.createElement('p', { className: 'addon-ui-info-title' }, title),
                content && React.createElement('p', { className: 'addon-ui-info-content' }, content),
                items && items.length > 0 && React.createElement('ul', { className: 'addon-ui-info-list' },
                    items.map((item, i) => React.createElement('li', { key: i }, item))
                )
            );
        },

        /**
         * 구분선
         */
        Divider: function Divider() {
            const React = Spicetify.React;
            return React.createElement('hr', { className: 'addon-ui-divider' });
        },

        /**
         * 섹션 헤더
         * @param {Object} props
         * @param {string} props.title - 제목
         */
        SectionHeader: function SectionHeader(props) {
            const React = Spicetify.React;
            return React.createElement('h4', { className: 'addon-ui-section-header' }, props.title);
        },

        /**
         * 슬라이더
         * @param {Object} props
         * @param {string} props.label - 레이블
         * @param {number} props.value - 현재 값
         * @param {Function} props.onChange - 값 변경 핸들러
         * @param {number} props.min - 최소값 (기본 0)
         * @param {number} props.max - 최대값 (기본 100)
         * @param {number} props.step - 단계 (기본 1)
         * @param {string} props.description - 설명 (선택)
         * @param {boolean} props.showValue - 현재 값 표시 여부 (선택, 기본 true)
         */
        Slider: function Slider(props) {
            const React = Spicetify.React;
            const { label, value, onChange, min = 0, max = 100, step = 1, description, showValue = true, disabled = false } = props;

            return React.createElement('div', { className: 'addon-ui-slider' },
                React.createElement('div', { className: 'addon-ui-slider-header' },
                    label && React.createElement('label', { className: 'addon-ui-label' }, label),
                    showValue && React.createElement('span', { className: 'addon-ui-slider-value' }, value)
                ),
                React.createElement('input', {
                    type: 'range',
                    className: 'addon-ui-slider-input',
                    value: value,
                    onChange: (e) => onChange(Number(e.target.value)),
                    min,
                    max,
                    step,
                    disabled
                }),
                description && React.createElement('small', { className: 'addon-ui-description' }, description)
            );
        },

        /**
         * 라디오 그룹
         * @param {Object} props
         * @param {string} props.label - 그룹 레이블
         * @param {string} props.value - 현재 선택 값
         * @param {Function} props.onChange - 값 변경 핸들러
         * @param {Array} props.options - 옵션 배열 [{ id: string, name: string, description?: string }]
         */
        RadioGroup: function RadioGroup(props) {
            const React = Spicetify.React;
            const { label, value, onChange, options = [], disabled = false } = props;
            const groupId = `radio-${Math.random().toString(36).slice(2, 11)}`;

            return React.createElement('div', { className: 'addon-ui-radio-group' },
                label && React.createElement('label', { className: 'addon-ui-label' }, label),
                React.createElement('div', { className: 'addon-ui-radio-options' },
                    options.map(opt =>
                        React.createElement('label', {
                            key: opt.id || opt.value,
                            className: `addon-ui-radio-option ${value === (opt.id || opt.value) ? 'selected' : ''}`
                        },
                            React.createElement('input', {
                                type: 'radio',
                                name: groupId,
                                value: opt.id || opt.value,
                                checked: value === (opt.id || opt.value),
                                onChange: (e) => onChange(e.target.value),
                                disabled
                            }),
                            React.createElement('span', { className: 'addon-ui-radio-label' }, opt.name || opt.label),
                            opt.description && React.createElement('small', { className: 'addon-ui-radio-desc' }, opt.description)
                        )
                    )
                )
            );
        },

        /**
         * 설정 컨테이너 (여러 컴포넌트를 감싸는 래퍼)
         * @param {Object} props
         * @param {string} props.addonId - Addon ID (CSS 클래스용)
         * @param {React.ReactNode} props.children - 자식 요소들
         */
        SettingsContainer: function SettingsContainer(props) {
            const React = Spicetify.React;
            const { addonId, children } = props;
            return React.createElement('div', {
                className: `addon-ui-settings ${addonId ? `${addonId}-settings` : ''}`
            }, children);
        },

        /**
         * Addon 헤더
         * @param {Object} props
         * @param {string} props.name - Addon 이름
         * @param {string} props.version - Addon 버전
         * @param {string} props.description - Addon 설명 (선택)
         */
        AddonHeader: function AddonHeader(props) {
            const React = Spicetify.React;
            const { name, version, description } = props;

            return React.createElement('div', { className: 'addon-ui-header' },
                React.createElement('div', { className: 'addon-ui-header-title' },
                    React.createElement('h3', null, name),
                    React.createElement('span', { className: 'addon-ui-version' }, `v${version}`)
                ),
                description && React.createElement('p', { className: 'addon-ui-header-desc' }, description)
            );
        }
    };

    // ============================================
    // Global Registration
    // ============================================

    window.AddonError = AddonError;
    window.AddonEventEmitter = AddonEventEmitter;
    window.SettingsUIBuilder = SettingsUIBuilder;
    window.AddonDebug = AddonDebug;
    window.AddonUI = AddonUI;

    console.log('[AddonUtils] Module loaded');
})();
