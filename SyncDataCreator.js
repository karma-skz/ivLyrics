/**
 * SyncDataCreator - 노래방 싱크 데이터 생성 UI
 */

const SyncDataCreator = ({ trackInfo, onClose }) => {
	const { useState, useEffect, useRef, useCallback, useMemo } = react;

	// 상태 관리
	const [provider, setProvider] = useState('spotify');
	const [lyrics, setLyrics] = useState(null);
	const [lyricsText, setLyricsText] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [currentLineIndex, setCurrentLineIndex] = useState(0);
	const [syncData, setSyncData] = useState(null);
	const [mode, setMode] = useState('idle');
	const [position, setPosition] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [recordingCharIndex, setRecordingCharIndex] = useState(-1);
	const [dragStartTime, setDragStartTime] = useState(null);
	const [dragStartCharIndex, setDragStartCharIndex] = useState(-1);
	const [isDragging, setIsDragging] = useState(false);
	const [globalOffset, setGlobalOffset] = useState(0);

	// Refs
	const containerRef = useRef(null);
	const lyricsScrollRef = useRef(null);
	const animationRef = useRef(null);
	const charTimesRef = useRef([]);
	const charElementsRef = useRef([]);
	const preventNextTrackRef = useRef(false);

	// 트랙 정보
	const trackId = trackInfo?.uri?.split(':')[2] || '';
	const trackUri = trackInfo?.uri || Spicetify.Player?.data?.item?.uri;
	const trackName = trackInfo?.name || Spicetify.Player?.data?.item?.name || '';
	const artistName = trackInfo?.artists?.map(a => a.name).join(', ') ||
		Spicetify.Player?.data?.item?.artists?.map(a => a.name).join(', ') || '';
	const albumArt = trackInfo?.album?.images?.[0]?.url ||
		Spicetify.Player?.data?.item?.album?.images?.[0]?.url || '';

	// 가사를 줄 단위로 파싱
	const lyricsLines = useMemo(() => {
		if (!lyricsText) return [];
		return lyricsText.split('\n').filter(line => line.trim().length > 0);
	}, [lyricsText]);

	const totalChars = useMemo(() => {
		return lyricsLines.reduce((sum, line) => sum + Array.from(line).length, 0);
	}, [lyricsLines]);

	const syncedChars = useMemo(() => {
		if (!syncData || !syncData.lines) return 0;
		return syncData.lines.reduce((sum, line) => sum + (line.chars?.length || 0), 0);
	}, [syncData]);

	const lineCharOffsets = useMemo(() => {
		const offsets = [];
		let total = 0;
		lyricsLines.forEach((line) => {
			offsets.push(total);
			total += Array.from(line).length;
		});
		return offsets;
	}, [lyricsLines]);

	const currentLineChars = useMemo(() => {
		if (currentLineIndex < 0 || currentLineIndex >= lyricsLines.length) return [];
		return Array.from(lyricsLines[currentLineIndex]);
	}, [lyricsLines, currentLineIndex]);

	const completedLines = useMemo(() => {
		if (!syncData || !syncData.lines) return 0;
		return syncData.lines.length;
	}, [syncData]);

	// 현재 줄이 싱크되어 있는지
	const isCurrentLineSynced = useMemo(() => {
		if (!syncData || !syncData.lines) return false;
		const lineStart = lineCharOffsets[currentLineIndex];
		return syncData.lines.some(l => l.start === lineStart);
	}, [syncData, lineCharOffsets, currentLineIndex]);

	// 다음 곡 방지
	useEffect(() => {
		if (!lyricsText) return;

		preventNextTrackRef.current = true;

		const handleSongChange = () => {
			if (!preventNextTrackRef.current) return;
			const currentTrackUri = Spicetify.Player?.data?.item?.uri;
			if (currentTrackUri && currentTrackUri !== trackUri) {
				Spicetify.Player.playUri(trackUri);
			}
		};

		const handleProgress = () => {
			if (!preventNextTrackRef.current) return;
			const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
			const progress = Spicetify.Player.getProgress();
			if (duration > 0 && progress >= duration - 500) {
				Spicetify.Player.seek(0);
			}
		};

		const progressInterval = setInterval(handleProgress, 200);
		Spicetify.Player.addEventListener('songchange', handleSongChange);

		return () => {
			preventNextTrackRef.current = false;
			clearInterval(progressInterval);
			Spicetify.Player.removeEventListener('songchange', handleSongChange);
		};
	}, [lyricsText, trackUri]);

	// 가사 로드
	const loadLyrics = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMode('idle');

		try {
			const info = {
				uri: trackInfo?.uri || Spicetify.Player?.data?.item?.uri,
				title: trackName,
				name: trackName,
				artist: artistName,
				album: trackInfo?.album?.name || Spicetify.Player?.data?.item?.album?.name || '',
				duration: Spicetify.Player?.data?.item?.duration?.milliseconds || 0
			};

			let result = null;

			if (typeof LyricsService !== 'undefined' && LyricsService.getLyrics) {
				result = await LyricsService.getLyrics(info, provider);
			} else if (typeof Providers !== 'undefined' && Providers[provider]) {
				result = await Providers[provider](info);
			}

			if (result && (result.synced || result.unsynced)) {
				setLyrics(result);
				const lyricsSource = result.synced || result.unsynced;
				let text = '';

				if (Array.isArray(lyricsSource)) {
					text = lyricsSource.map(line => {
						if (typeof line === 'string') return line;
						if (line.text) return typeof line.text === 'string' ? line.text : '';
						if (line.originalText) return typeof line.originalText === 'string' ? line.originalText : '';
						return '';
					}).filter(t => t.trim().length > 0).join('\n');
				} else if (typeof lyricsSource === 'string') {
					text = lyricsSource;
				}

				if (text.trim().length > 0) {
					setLyricsText(text);
				} else {
					setError(I18n.t('syncCreator.noLyrics'));
				}
			} else {
				setError(I18n.t('syncCreator.noLyrics'));
			}
		} catch (e) {
			console.error('[SyncDataCreator] Load lyrics error:', e);
			setError(I18n.t('syncCreator.loadError'));
		}

		setIsLoading(false);
	}, [provider, trackInfo, trackName, artistName]);

	// 재생 위치 업데이트 + 미리보기 자동 줄 이동
	useEffect(() => {
		const updatePosition = () => {
			const pos = Spicetify.Player.getProgress();
			setPosition(pos);

			if (mode === 'preview' && syncData && syncData.lines) {
				const currentTimeSec = pos / 1000;

				for (let i = syncData.lines.length - 1; i >= 0; i--) {
					const lineData = syncData.lines[i];
					if (lineData.chars && lineData.chars[0] <= currentTimeSec) {
						const lineIdx = lyricsLines.findIndex((_, idx) => {
							const lineStart = lineCharOffsets[idx];
							return lineData.start === lineStart;
						});

						if (lineIdx >= 0 && lineIdx !== currentLineIndex) {
							setCurrentLineIndex(lineIdx);
							if (lyricsScrollRef.current) {
								lyricsScrollRef.current.scrollLeft = 0;
							}
						}
						break;
					}
				}
			}

			animationRef.current = requestAnimationFrame(updatePosition);
		};

		animationRef.current = requestAnimationFrame(updatePosition);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [mode, syncData, lyricsLines, lineCharOffsets, currentLineIndex]);

	const autoScroll = useCallback((charIndex) => {
		if (!lyricsScrollRef.current || charIndex < 0) return;
		const scrollContainer = lyricsScrollRef.current;
		const charElement = charElementsRef.current[charIndex];
		if (!charElement) return;

		const containerRect = scrollContainer.getBoundingClientRect();
		const charRect = charElement.getBoundingClientRect();
		const charCenter = charRect.left + charRect.width / 2;
		const containerCenter = containerRect.left + containerRect.width / 2;
		const scrollOffset = charCenter - containerCenter;

		if (Math.abs(scrollOffset) > 50) {
			scrollContainer.scrollLeft += scrollOffset * 0.3;
		}
	}, []);

	const getCharIndexFromPoint = useCallback((clientX, clientY) => {
		for (let i = 0; i < charElementsRef.current.length; i++) {
			const el = charElementsRef.current[i];
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
				return i;
			}
		}

		if (charElementsRef.current.length > 0) {
			const firstEl = charElementsRef.current[0];
			const lastEl = charElementsRef.current[charElementsRef.current.length - 1];
			if (firstEl && lastEl) {
				const firstRect = firstEl.getBoundingClientRect();
				const lastRect = lastEl.getBoundingClientRect();
				if (clientX < firstRect.left) return 0;
				if (clientX > lastRect.right) return charElementsRef.current.length - 1;

				let closestIndex = 0;
				let closestDist = Infinity;
				for (let i = 0; i < charElementsRef.current.length; i++) {
					const el = charElementsRef.current[i];
					if (!el) continue;
					const rect = el.getBoundingClientRect();
					const centerX = rect.left + rect.width / 2;
					const dist = Math.abs(clientX - centerX);
					if (dist < closestDist) {
						closestDist = dist;
						closestIndex = i;
					}
				}
				return closestIndex;
			}
		}
		return 0;
	}, []);

	const handleDragStart = useCallback((charIndex, e) => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;
		e.preventDefault();
		e.stopPropagation();

		const currentTime = Spicetify.Player.getProgress() / 1000;
		const startIndex = charIndex < 0 ? 0 : charIndex;

		setDragStartTime(currentTime);
		setDragStartCharIndex(startIndex);
		setRecordingCharIndex(startIndex);
		setIsDragging(true);

		charTimesRef.current = new Array(currentLineChars.length).fill(null);
		for (let i = 0; i <= startIndex; i++) {
			charTimesRef.current[i] = currentTime;
		}
	}, [mode, currentLineIndex, lyricsLines.length, currentLineChars.length]);

	const handleDragMove = useCallback((charIndex, e) => {
		if (mode !== 'record' || !isDragging || dragStartTime === null) return;
		e.preventDefault();
		const currentTime = Spicetify.Player.getProgress() / 1000;

		if (charIndex < 0) {
			setRecordingCharIndex(-1);
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setIsDragging(false);
			charTimesRef.current = [];
			return;
		}

		if (charIndex >= recordingCharIndex) {
			for (let i = recordingCharIndex + 1; i <= charIndex; i++) {
				if (charTimesRef.current[i] === null) {
					charTimesRef.current[i] = currentTime;
				}
			}
			setRecordingCharIndex(charIndex);
			autoScroll(charIndex);
		}
	}, [mode, isDragging, dragStartTime, recordingCharIndex, autoScroll]);

	const handleDragEnd = useCallback((e) => {
		if (mode !== 'record' || !isDragging || dragStartTime === null || recordingCharIndex === -1) {
			setIsDragging(false);
			return;
		}

		e.preventDefault();
		const endTime = Spicetify.Player.getProgress() / 1000;
		const endCharIndex = recordingCharIndex;
		const lineStart = lineCharOffsets[currentLineIndex];
		const lineEnd = lineStart + currentLineChars.length - 1;
		const charCount = currentLineChars.length;

		const chars = [];
		for (let i = 0; i < charCount; i++) {
			let time;
			if (charTimesRef.current[i] !== null) {
				time = charTimesRef.current[i];
			} else if (i <= endCharIndex) {
				const prevTime = chars[chars.length - 1] || dragStartTime;
				time = prevTime + 0.02;
			} else {
				const remainingCount = charCount - endCharIndex - 1;
				const perCharDuration = 0.5 / Math.max(1, remainingCount);
				time = endTime + ((i - endCharIndex) * perCharDuration);
			}
			// 소수점 3자리로 반올림
			chars.push(Math.round(time * 1000) / 1000);
		}

		const lastCharTime = chars[chars.length - 1];

		setSyncData(prev => {
			let newLines = prev?.lines ? [...prev.lines] : [];
			const existingIndex = newLines.findIndex(l => l.start === lineStart);
			const lineData = { start: lineStart, end: lineEnd, chars: chars };

			if (existingIndex >= 0) {
				newLines[existingIndex] = lineData;
			} else {
				newLines.push(lineData);
				newLines.sort((a, b) => a.start - b.start);
			}

			// 유효성 검사
			const validLines = newLines.filter(line => {
				if (line.start > lineStart && line.chars && line.chars[0] < lastCharTime) {
					return false;
				}
				return true;
			});

			return { lines: validLines };
		});

		const isComplete = endCharIndex >= charCount - 1;
		if (isComplete && currentLineIndex < lyricsLines.length - 1) {
			setCurrentLineIndex(prev => prev + 1);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}

		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setRecordingCharIndex(-1);
		setIsDragging(false);
		charTimesRef.current = [];
	}, [mode, isDragging, dragStartTime, recordingCharIndex, currentLineIndex, currentLineChars, lineCharOffsets, lyricsLines.length]);

	const handleContainerMouseDown = useCallback((e) => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;
		const touch = e.touches ? e.touches[0] : e;
		const charIndex = getCharIndexFromPoint(touch.clientX, touch.clientY);
		if (charIndex >= 0) handleDragStart(charIndex, e);
	}, [mode, currentLineIndex, lyricsLines.length, getCharIndexFromPoint, handleDragStart]);

	useEffect(() => {
		if (!isDragging) return;

		const handleGlobalMove = (e) => {
			if (!isDragging) return;
			const touch = e.touches ? e.touches[0] : e;
			const charIndex = getCharIndexFromPoint(touch.clientX, touch.clientY);
			if (charIndex !== null) handleDragMove(charIndex, e);
		};

		const handleGlobalEnd = (e) => {
			if (isDragging) handleDragEnd(e);
		};

		document.addEventListener('mousemove', handleGlobalMove);
		document.addEventListener('mouseup', handleGlobalEnd);
		document.addEventListener('touchmove', handleGlobalMove, { passive: false });
		document.addEventListener('touchend', handleGlobalEnd);

		return () => {
			document.removeEventListener('mousemove', handleGlobalMove);
			document.removeEventListener('mouseup', handleGlobalEnd);
			document.removeEventListener('touchmove', handleGlobalMove);
			document.removeEventListener('touchend', handleGlobalEnd);
		};
	}, [isDragging, getCharIndexFromPoint, handleDragMove, handleDragEnd]);

	const handleLineRecord = useCallback(() => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;

		const currentTime = Spicetify.Player.getProgress() / 1000;
		const lineStart = lineCharOffsets[currentLineIndex];
		const lineEnd = lineStart + currentLineChars.length - 1;
		const charCount = currentLineChars.length;

		const chars = [];
		for (let i = 0; i < charCount; i++) {
			// 소수점 3자리로 반올림
			chars.push(Math.round((currentTime + (i * 0.08)) * 1000) / 1000);
		}

		const lastCharTime = chars[chars.length - 1];

		setSyncData(prev => {
			let newLines = prev?.lines ? [...prev.lines] : [];
			const existingIndex = newLines.findIndex(l => l.start === lineStart);
			const lineData = { start: lineStart, end: lineEnd, chars: chars };

			if (existingIndex >= 0) {
				newLines[existingIndex] = lineData;
			} else {
				newLines.push(lineData);
				newLines.sort((a, b) => a.start - b.start);
			}

			const validLines = newLines.filter(line => {
				if (line.start > lineStart && line.chars && line.chars[0] < lastCharTime) {
					return false;
				}
				return true;
			});

			return { lines: validLines };
		});

		if (currentLineIndex < lyricsLines.length - 1) {
			setCurrentLineIndex(prev => prev + 1);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [mode, currentLineIndex, lyricsLines.length, lineCharOffsets, currentLineChars]);

	// 현재 줄 싱크 삭제
	const deleteCurrentLineSync = useCallback(() => {
		if (!syncData || !syncData.lines) return;
		const lineStart = lineCharOffsets[currentLineIndex];

		setSyncData(prev => {
			const newLines = prev.lines.filter(l => l.start !== lineStart);
			return newLines.length > 0 ? { lines: newLines } : null;
		});
	}, [syncData, lineCharOffsets, currentLineIndex]);

	const toggleMode = useCallback((newMode) => {
		if (mode === newMode) {
			setMode('idle');
		} else {
			setMode(newMode);
			if (newMode === 'preview') Spicetify.Player.seek(0);
			if (!Spicetify.Player.isPlaying()) Spicetify.Player.play();
		}
	}, [mode]);

	const adjustGlobalOffset = useCallback((deltaMs) => {
		if (!syncData || !syncData.lines) return;
		const deltaSec = deltaMs / 1000;

		setSyncData(prev => ({
			lines: prev.lines.map(line => ({
				...line,
				chars: line.chars.map(t => t + deltaSec)
			}))
		}));
		setGlobalOffset(prev => prev + deltaMs);
	}, [syncData]);

	const resetFromStart = useCallback(() => {
		setCurrentLineIndex(0);
		setSyncData(null);
		setGlobalOffset(0);
		setMode('idle');
		Spicetify.Player.seek(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, []);

	const goToPrevLine = useCallback(() => {
		if (currentLineIndex > 0) {
			setCurrentLineIndex(prev => prev - 1);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [currentLineIndex]);

	const goToNextLine = useCallback(() => {
		if (currentLineIndex < lyricsLines.length - 1) {
			setCurrentLineIndex(prev => prev + 1);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [currentLineIndex, lyricsLines.length]);

	const goToFirstLine = useCallback(() => {
		setCurrentLineIndex(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, []);

	const handleSeek = useCallback((e) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
		const percent = Math.max(0, Math.min(1, x / rect.width));
		const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
		Spicetify.Player.seek(duration * percent);
	}, []);

	const handleSeekOffset = useCallback((offsetMs) => {
		Spicetify.Player.seek(Math.max(0, Spicetify.Player.getProgress() + offsetMs));
	}, []);

	const handleSubmit = useCallback(async () => {
		if (!syncData || !syncData.lines || syncData.lines.length === 0) {
			Toast.error(I18n.t('syncCreator.noSyncData'));
			return;
		}

		if (syncData.lines.length < lyricsLines.length) {
			if (!confirm(I18n.t('syncCreator.incompleteConfirm'))) return;
		}

		setIsSubmitting(true);

		try {
			if (typeof SyncDataService !== 'undefined' && SyncDataService.submitSyncData) {
				const result = await SyncDataService.submitSyncData(trackId, provider, syncData);
				if (result) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					if (onClose) onClose();
				} else {
					Toast.error(I18n.t('syncCreator.submitError'));
				}
			} else {
				const userHash = Utils.getCurrentUserHash();
				const response = await fetch(`${CONFIG.api.baseUrl}/lyrics/sync-data`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ trackId, provider, syncData, userHash })
				});

				if (response.ok) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					if (onClose) onClose();
				} else {
					Toast.error((await response.json()).error || I18n.t('syncCreator.submitError'));
				}
			}
		} catch (e) {
			console.error('[SyncDataCreator] Submit error:', e);
			Toast.error(I18n.t('syncCreator.submitError'));
		}

		setIsSubmitting(false);
	}, [syncData, lyricsLines.length, trackId, provider, onClose]);

	const formatTime = useCallback((ms) => {
		const totalSeconds = Math.floor(ms / 1000);
		return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
	}, []);

	const formatSeconds = useCallback((seconds) => `${seconds.toFixed(1)}s`, []);

	const isCharSynced = useCallback((lineIndex, charIndex) => {
		if (!syncData || !syncData.lines) return false;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncData.lines.find(l => l.start === lineStart);
		return lineData && lineData.chars && lineData.chars.length > charIndex;
	}, [syncData, lineCharOffsets]);

	const getCharSyncTime = useCallback((lineIndex, charIndex) => {
		if (!syncData || !syncData.lines) return null;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncData.lines.find(l => l.start === lineStart);
		return lineData?.chars?.[charIndex] ?? null;
	}, [syncData, lineCharOffsets]);

	const getPreviewCharIndex = useCallback((lineIndex) => {
		if (!syncData || !syncData.lines) return -1;
		const currentTimeSec = position / 1000;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncData.lines.find(l => l.start === lineStart);
		if (!lineData || !lineData.chars) return -1;
		for (let i = lineData.chars.length - 1; i >= 0; i--) {
			if (currentTimeSec >= lineData.chars[i]) return i;
		}
		return -1;
	}, [syncData, position, lineCharOffsets]);

	useEffect(() => { charElementsRef.current = []; }, [currentLineIndex, lyricsText]);

	const getModeStyle = () => {
		if (mode === 'record') return { background: '#e53935', color: '#fff' };
		if (mode === 'preview') return { background: '#2196f3', color: '#fff' };
		return { background: 'var(--spice-misc)', color: 'var(--spice-subtext)' };
	};

	const getModeLabel = () => {
		if (mode === 'record') return I18n.t('syncCreator.recordMode');
		if (mode === 'preview') return I18n.t('syncCreator.previewMode');
		return I18n.t('syncCreator.idleMode');
	};

	// 스타일
	const s = {
		overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--spice-main, #121212)', zIndex: 10000, display: 'flex', flexDirection: 'column' },
		header: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '12px 20px', borderBottom: '1px solid var(--spice-misc)', flexShrink: 0 },
		backBtn: { background: 'var(--spice-misc)', border: 'none', color: 'var(--spice-text)', cursor: 'pointer', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600' },
		title: { fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--spice-text)' },
		modeBadge: { padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' },
		submitBtn: { background: 'var(--spice-button)', color: 'var(--spice-button-text, #000)', border: 'none', padding: '10px 20px', borderRadius: '20px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' },
		trackRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: 'var(--spice-card)', flexShrink: 0 },
		albumArt: { width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover' },
		trackMeta: { flex: 1 },
		trackName: { fontSize: '14px', fontWeight: '600', color: 'var(--spice-text)' },
		artistName: { fontSize: '12px', color: 'var(--spice-subtext)' },
		providerRow: { display: 'flex', alignItems: 'center', gap: '8px' },
		select: { background: 'var(--spice-card)', color: 'var(--spice-text)', border: '1px solid var(--spice-misc)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' },
		loadBtn: { background: 'var(--spice-button)', color: 'var(--spice-button-text, #000)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' },
		playbackRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--spice-card)', flexShrink: 0 },
		playbackTime: { fontSize: '11px', color: 'var(--spice-subtext)', minWidth: '40px', fontVariantNumeric: 'tabular-nums' },
		playbackBar: { flex: 1, height: '6px', background: 'var(--spice-misc)', borderRadius: '3px', cursor: 'pointer' },
		playbackFill: { height: '100%', background: 'var(--spice-button)', borderRadius: '3px' },
		seekBtn: { background: 'var(--spice-misc)', color: 'var(--spice-text)', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' },
		offsetRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 20px', background: 'var(--spice-card)', borderTop: '1px solid var(--spice-misc)', flexShrink: 0 },
		offsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)' },
		offsetValue: { fontSize: '11px', color: 'var(--spice-text)', fontWeight: '600', minWidth: '50px', textAlign: 'center' },
		offsetBtn: { background: 'var(--spice-misc)', color: 'var(--spice-text)', border: 'none', padding: '3px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' },
		lyricsArea: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '16px 20px', overflow: 'hidden' },
		lineNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' },
		navBtn: { background: 'var(--spice-misc)', color: 'var(--spice-text)', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' },
		lineInfo: { textAlign: 'center' },
		lineCount: { fontSize: '20px', fontWeight: '700', color: 'var(--spice-text)' },
		lineStatus: { fontSize: '11px', color: 'var(--spice-subtext)' },
		lyricsBox: { background: 'var(--spice-card)', borderRadius: '12px', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: mode === 'record' ? 'pointer' : 'default', userSelect: 'none', marginBottom: '12px' },
		lyricsScroll: { width: '100%', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '28px', display: 'flex', justifyContent: 'center' },
		lyricsLine: { display: 'inline-flex', flexWrap: 'nowrap', gap: '0px', paddingLeft: '32px', paddingRight: '32px', justifyContent: 'center' },
		charSpan: { padding: '10px 2px', borderRadius: '4px', cursor: mode === 'record' ? 'pointer' : 'default', position: 'relative', fontSize: '32px', fontWeight: '600', minWidth: '18px', textAlign: 'center', flexShrink: 0, color: 'var(--spice-text)', letterSpacing: '-1px' },
		charSynced: { background: 'rgba(var(--spice-rgb-button), 0.2)' },
		charPlayed: { background: 'var(--spice-button)', color: 'var(--spice-button-text, #000)' },
		charRecording: { background: 'rgba(255, 152, 0, 0.6)' },
		charTime: { position: 'absolute', bottom: '-20px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'var(--spice-subtext)', whiteSpace: 'nowrap' },
		nextLineBox: { textAlign: 'center', padding: '8px', opacity: 0.6 },
		nextLineLabel: { fontSize: '10px', color: 'var(--spice-subtext)', marginBottom: '4px', textTransform: 'uppercase' },
		nextLineText: { fontSize: '14px', color: 'var(--spice-subtext)' },
		hint: { fontSize: '12px', color: 'var(--spice-subtext)', textAlign: 'center', padding: '8px', fontStyle: 'italic' },
		progressRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '6px 20px', fontSize: '12px', color: 'var(--spice-subtext)', flexShrink: 0 },
		controls: { display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '12px 20px', justifyContent: 'center', borderTop: '1px solid var(--spice-misc)', flexShrink: 0 },
		ctrlBtn: { background: 'var(--spice-card)', color: 'var(--spice-text)', border: '1px solid var(--spice-misc)', padding: '10px 16px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
		modeBtn: { border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '14px', minWidth: '100px' },
		deleteBtn: { background: 'transparent', color: '#f44336', border: '1px solid #f44336', padding: '10px 16px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
		loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--spice-subtext)' },
		error: { textAlign: 'center', padding: '40px', color: '#e53935' },
	};

	return react.createElement('div', { style: s.overlay, ref: containerRef },
		// Header - 가운데 정렬
		react.createElement('div', { style: s.header },
			react.createElement('button', { style: s.backBtn, onClick: onClose },
				react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
					react.createElement('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
				),
				I18n.t('syncCreator.back') || '닫기'
			),
			react.createElement('h2', { style: s.title }, I18n.t('syncCreator.title')),
			react.createElement('span', { style: { ...s.modeBadge, ...getModeStyle() } }, getModeLabel()),
			react.createElement('button', {
				style: { ...s.submitBtn, opacity: isSubmitting || !syncData ? 0.5 : 1, cursor: isSubmitting || !syncData ? 'not-allowed' : 'pointer' },
				onClick: handleSubmit,
				disabled: isSubmitting || !syncData
			}, isSubmitting ? I18n.t('syncCreator.submitting') : I18n.t('syncCreator.submit'))
		),

		// Track + Provider
		react.createElement('div', { style: s.trackRow },
			albumArt && react.createElement('img', { src: albumArt, style: s.albumArt, alt: trackName }),
			react.createElement('div', { style: s.trackMeta },
				react.createElement('div', { style: s.trackName }, trackName),
				react.createElement('div', { style: s.artistName }, artistName)
			),
			react.createElement('div', { style: s.providerRow },
				react.createElement('select', { style: s.select, value: provider, onChange: (e) => setProvider(e.target.value) },
					react.createElement('option', { value: 'spotify' }, 'Spotify'),
					react.createElement('option', { value: 'lrclib' }, 'LRCLIB')
				),
				react.createElement('button', { style: { ...s.loadBtn, opacity: isLoading ? 0.5 : 1 }, onClick: loadLyrics, disabled: isLoading },
					isLoading ? I18n.t('syncCreator.loading') : I18n.t('syncCreator.loadLyrics')
				)
			)
		),

		// Playback
		lyricsText && react.createElement('div', { style: s.playbackRow },
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-3000) }, '-3s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-1000) }, '-1s'),
			react.createElement('span', { style: s.playbackTime }, formatTime(position)),
			react.createElement('div', { style: s.playbackBar, onClick: handleSeek },
				react.createElement('div', { style: { ...s.playbackFill, width: `${(position / (Spicetify.Player?.data?.item?.duration?.milliseconds || 1)) * 100}%` } })
			),
			react.createElement('span', { style: s.playbackTime }, formatTime(Spicetify.Player?.data?.item?.duration?.milliseconds || 0)),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(1000) }, '+1s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(3000) }, '+3s')
		),

		// Offset
		lyricsText && syncData && react.createElement('div', { style: s.offsetRow },
			react.createElement('span', { style: s.offsetLabel }, I18n.t('syncCreator.globalOffset')),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-100) }, '-100ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-10) }, '-10ms'),
			react.createElement('span', { style: s.offsetValue }, `${globalOffset >= 0 ? '+' : ''}${globalOffset}ms`),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(10) }, '+10ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(100) }, '+100ms')
		),

		// Lyrics Area
		react.createElement('div', { style: s.lyricsArea },
			isLoading && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadingLyrics')),
			error && react.createElement('div', { style: s.error }, error),
			!isLoading && !error && !lyricsText && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.selectProvider')),

			lyricsText && lyricsLines.length > 0 && react.createElement(react.Fragment, null,
				// Line Navigation (이전/다음 버튼)
				react.createElement('div', { style: s.lineNav },
					react.createElement('button', { style: { ...s.navBtn, opacity: currentLineIndex <= 0 ? 0.3 : 1 }, onClick: goToPrevLine, disabled: currentLineIndex <= 0 }, '◀'),
					react.createElement('div', { style: s.lineInfo },
						react.createElement('div', { style: s.lineCount }, `${currentLineIndex + 1} / ${lyricsLines.length}`),
						react.createElement('div', { style: s.lineStatus }, isCurrentLineSynced ? '✓ ' + I18n.t('syncCreator.synced') : I18n.t('syncCreator.notSynced'))
					),
					react.createElement('button', { style: { ...s.navBtn, opacity: currentLineIndex >= lyricsLines.length - 1 ? 0.3 : 1 }, onClick: goToNextLine, disabled: currentLineIndex >= lyricsLines.length - 1 }, '▶')
				),

				// Lyrics Box
				react.createElement('div', { style: s.lyricsBox, onMouseDown: handleContainerMouseDown, onTouchStart: handleContainerMouseDown, ref: lyricsScrollRef },
					react.createElement('div', { style: s.lyricsLine },
						currentLineChars.map((char, i) => {
							const isSynced = isCharSynced(currentLineIndex, i);
							const isRec = mode === 'record' && isDragging && i <= recordingCharIndex;
							const previewIdx = getPreviewCharIndex(currentLineIndex);
							const isPlayed = isSynced && previewIdx >= i;
							const charTime = getCharSyncTime(currentLineIndex, i);

							let style = { ...s.charSpan };
							if (isRec) style = { ...style, ...s.charRecording };
							else if (isSynced) style = isPlayed ? { ...style, ...s.charPlayed } : { ...style, ...s.charSynced };

							return react.createElement('span', { key: i, style, ref: (el) => { charElementsRef.current[i] = el; }, 'data-char-index': i },
								char === ' ' ? '\u00A0' : char,
								isSynced && charTime !== null && react.createElement('span', { style: s.charTime }, formatSeconds(charTime))
							);
						})
					)
				),

				// Next Line
				currentLineIndex < lyricsLines.length - 1 && react.createElement('div', { style: s.nextLineBox },
					react.createElement('div', { style: s.nextLineLabel }, I18n.t('syncCreator.nextLine')),
					react.createElement('div', { style: s.nextLineText }, lyricsLines[currentLineIndex + 1])
				),

				mode === 'record' && react.createElement('div', { style: s.hint }, I18n.t('syncCreator.dragHint'))
			)
		),

		// Progress
		lyricsText && react.createElement('div', { style: s.progressRow },
			`${completedLines} / ${lyricsLines.length} ${I18n.t('syncCreator.linesCompleted')}`,
			react.createElement('span', { style: { opacity: 0.5 } }, '|'),
			`${syncedChars} / ${totalChars} ${I18n.t('syncCreator.chars')}`
		),

		// Controls
		lyricsText && react.createElement('div', { style: s.controls },
			react.createElement('button', { style: s.ctrlBtn, onClick: resetFromStart }, I18n.t('syncCreator.reset')),
			react.createElement('button', { style: s.ctrlBtn, onClick: goToFirstLine, disabled: currentLineIndex <= 0 }, I18n.t('syncCreator.firstLine')),

			// 기록 모드
			react.createElement('button', {
				style: { ...s.modeBtn, background: mode === 'record' ? '#e53935' : 'var(--spice-button)', color: mode === 'record' ? '#fff' : 'var(--spice-button-text, #000)' },
				onClick: () => toggleMode('record')
			}, mode === 'record' ? I18n.t('syncCreator.stopRecord') : I18n.t('syncCreator.recordMode')),

			// 미리보기 모드
			react.createElement('button', {
				style: { ...s.modeBtn, background: mode === 'preview' ? '#2196f3' : 'var(--spice-misc)', color: mode === 'preview' ? '#fff' : 'var(--spice-text)' },
				onClick: () => toggleMode('preview'),
				disabled: !syncData || syncData.lines.length === 0
			}, mode === 'preview' ? I18n.t('syncCreator.stopPreview') : I18n.t('syncCreator.previewMode')),

			// 빠른 등록
			mode === 'record' && react.createElement('button', { style: { ...s.ctrlBtn, background: '#4caf50', color: '#fff', borderColor: '#4caf50' }, onClick: handleLineRecord },
				I18n.t('syncCreator.recordLine')
			),

			// 현재 줄 삭제
			isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync },
				I18n.t('syncCreator.deleteLine')
			)
		)
	);
};

window.SyncDataCreator = SyncDataCreator;
