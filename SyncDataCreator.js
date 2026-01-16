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
	const [showLrcLibPublish, setShowLrcLibPublish] = useState(false);
	const [manualLyricsInput, setManualLyricsInput] = useState('');
	const [isPublishingToLrcLib, setIsPublishingToLrcLib] = useState(false);
	const [lrcLibPublishProgress, setLrcLibPublishProgress] = useState('');
	const [publishCancelled, setPublishCancelled] = useState(false);

	// Refs
	const containerRef = useRef(null);
	const lyricsScrollRef = useRef(null);
	const animationRef = useRef(null);
	const charTimesRef = useRef([]);
	const charElementsRef = useRef([]);
	const preventNextTrackRef = useRef(false);
	const publishWorkersRef = useRef([]);

	// 트랙 정보
	const trackId = trackInfo?.uri?.split(':')[2] || '';
	const trackUri = trackInfo?.uri || Spicetify.Player?.data?.item?.uri;
	const trackName = trackInfo?.name || Spicetify.Player?.data?.item?.name || '';
	const artistName = trackInfo?.artists?.map(a => a.name).join(', ') ||
		Spicetify.Player?.data?.item?.artists?.map(a => a.name).join(', ') || '';
	const albumArt = trackInfo?.album?.images?.[0]?.url ||
		Spicetify.Player?.data?.item?.album?.images?.[0]?.url || '';

	// 가사를 줄 단위로 파싱
	// NFC 정규화를 적용하여 결합 문자(NFD)를 합성 문자로 변환
	// 예: "e" + 결합 액센트 -> "é" (1개 코드포인트)
	const lyricsLines = useMemo(() => {
		if (!lyricsText) return [];
		return lyricsText.split('\n')
			.filter(line => line.trim().length > 0)
			.map(line => line.normalize('NFC'));
	}, [lyricsText]);

	const totalChars = useMemo(() => {
		// NFC 정규화된 lyricsLines를 사용하므로 Array.from()이 정확한 문자 수를 반환
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

	// Visibility tracking for robust lock handling
	const isVisibleRef = useRef(false);

	// Visibility Observer
	useEffect(() => {
		if (!containerRef.current) return;

		const observer = new IntersectionObserver(([entry]) => {
			isVisibleRef.current = entry.isIntersecting;
			preventNextTrackRef.current = entry.isIntersecting;
			// console.log("[SyncDataCreator] Visibility changed:", entry.isIntersecting);
		}, { threshold: 0 });

		observer.observe(containerRef.current);

		return () => observer.disconnect();
	}, []);

	// 다음 곡 방지 - 싱크 생성기가 보일 때만 활성화
	useEffect(() => {
		// 초기 마운트/업데이트 시 visibility 상태 동기화
		preventNextTrackRef.current = isVisibleRef.current;

		const handleSongChange = () => {
			// 화면에 보이지 않으면 동작하지 않음
			if (!isVisibleRef.current) return;
			// preventNextTrackRef가 false여도 동작하지 않음 (이중 체크)
			if (!preventNextTrackRef.current) return;

			const currentTrackUri = Spicetify.Player?.data?.item?.uri;
			if (currentTrackUri && currentTrackUri !== trackUri) {
				Spicetify.Player.playUri(trackUri);
			}
		};

		const handleProgress = () => {
			// 화면에 보이지 않으면 동작하지 않음
			if (!isVisibleRef.current) return;
			if (!preventNextTrackRef.current) return;

			const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
			const progress = Spicetify.Player.getProgress();
			if (duration > 0 && progress >= duration - 250) {
				Spicetify.Player.seek(0);
			}
		};

		const progressInterval = setInterval(handleProgress, 200);
		Spicetify.Player.addEventListener('songchange', handleSongChange);

		return () => {
			// 언마운트 시 해제 (단, 숨김 상태일 뿐이면 observer가 false로 설정함)
			preventNextTrackRef.current = false;
			clearInterval(progressInterval);
			Spicetify.Player.removeEventListener('songchange', handleSongChange);
		};
	}, [trackUri]);

	// 가사 로드 (Spotify -> LRCLIB 순서로 자동 시도)
	// 가사 로드 (Spotify -> LRCLIB 순서로 자동 시도)
	const loadLyrics = useCallback(async (preferredProvider = null) => {
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMode('idle');

		try {
			const firstArtist = trackInfo?.artists?.[0]?.name ||
				Spicetify.Player?.data?.item?.artists?.[0]?.name ||
				artistName.split(',')[0].trim();

			// 만약 preferredProvider가 지정되어 있다면 그것만 시도, 아니면 기본 순서대로
			const providersToTry = preferredProvider ? [preferredProvider] : ['spotify', 'lrclib'];
			let result = null;
			let usedProvider = null;

			for (const tryProvider of providersToTry) {
				const info = {
					uri: trackInfo?.uri || Spicetify.Player?.data?.item?.uri,
					title: trackName,
					name: trackName,
					artist: tryProvider === 'lrclib' ? firstArtist : artistName,
					album: trackInfo?.album?.name || Spicetify.Player?.data?.item?.album?.name || '',
					duration: Spicetify.Player?.data?.item?.duration?.milliseconds || 0
				};

				// provider 이름 파싱 (예: spotify-syncpower -> realProvider: spotify)
				let realProvider = tryProvider;
				if (tryProvider.startsWith('spotify-')) {
					realProvider = 'spotify';
				}

				console.log('[SyncDataCreator] Trying provider:', tryProvider, '(Real:', realProvider, ')');

				try {
					if (typeof Providers !== 'undefined' && Providers[realProvider]) {
						result = await Providers[realProvider](info);
					} else if (typeof LyricsService !== 'undefined' && LyricsService.getLyrics) {
						result = await LyricsService.getLyrics(info, realProvider);
					}

					if (result && (result.synced || result.unsynced)) {
						usedProvider = tryProvider;
						console.log('[SyncDataCreator] Found lyrics from:', tryProvider);
						break;
					}
				} catch (providerError) {
					console.log('[SyncDataCreator] Provider', tryProvider, 'failed:', providerError.message);
				}
			}

			if (result && (result.synced || result.unsynced)) {
				// provider 설정
				// 1. result.provider가 있으면 최우선 사용 (Providers.spotify가 spotify-xxx 형식 반환)
				// 2. 아니면 usedProvider (루프에서 찾은 키) 사용
				let finalProvider = result.provider || usedProvider || preferredProvider;

				// 혹시라도 'spotify'로 되어있고 내부 provider 정보가 있다면 조합 (안전장치)
				if ((finalProvider === 'Spotify' || finalProvider === 'spotify') && result.spotifyLyricsProvider) {
					finalProvider = `spotify-${result.spotifyLyricsProvider}`;
				}

				setProvider(finalProvider);
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

				// NFC 정규화 적용 - 결합 문자를 합성 문자로 변환
				text = text.normalize('NFC');

				if (text.trim().length > 0) {
					setLyricsText(text);
				} else {
					setError(I18n.t('syncCreator.noLyrics'));
				}
			} else {
				// 만약 수동 선택했는데 실패했으면 provider는 그 선택한걸로 유지해서 UI에 보여줌? 
				// 아니면 실패 메시지 띄우고 provider는 유지
				if (preferredProvider) setProvider(preferredProvider);
				setError(I18n.t('syncCreator.noLyrics'));
			}
		} catch (e) {
			console.error('[SyncDataCreator] Load lyrics error:', e);
			setError(I18n.t('syncCreator.loadError'));
		}

		setIsLoading(false);
	}, [trackInfo, trackName, artistName]);

	// 컴포넌트 마운트 시 자동 가사 로드 + 기존 싱크 데이터 불러오기
	useEffect(() => {
		const initWithExistingSyncData = async () => {
			// 1. 먼저 현재 유저의 Spotify provider를 확인 (가사를 로드해서 확인)
			let currentUserProvider = null;

			try {
				const firstArtist = trackInfo?.artists?.[0]?.name ||
					Spicetify.Player?.data?.item?.artists?.[0]?.name || '';

				const info = {
					uri: trackInfo?.uri || Spicetify.Player?.data?.item?.uri,
					title: trackName,
					name: trackName,
					artist: firstArtist,
					album: trackInfo?.album?.name || Spicetify.Player?.data?.item?.album?.name || '',
					duration: Spicetify.Player?.data?.item?.duration?.milliseconds || 0
				};

				// Spotify에서 가사를 가져와서 현재 유저의 provider 확인
				let spotifyResult = null;
				if (typeof Providers !== 'undefined' && Providers.spotify) {
					spotifyResult = await Providers.spotify(info);
				} else if (typeof LyricsService !== 'undefined' && LyricsService.getLyrics) {
					spotifyResult = await LyricsService.getLyrics(info, 'spotify');
				}

				if (spotifyResult && (spotifyResult.synced || spotifyResult.unsynced)) {
					// 현재 유저의 provider 추출
					currentUserProvider = spotifyResult.provider;
					if ((currentUserProvider === 'Spotify' || currentUserProvider === 'spotify') && spotifyResult.spotifyLyricsProvider) {
						currentUserProvider = `spotify-${spotifyResult.spotifyLyricsProvider}`;
					}
					console.log('[SyncDataCreator] Current user provider:', currentUserProvider);
				}
			} catch (e) {
				console.warn('[SyncDataCreator] Failed to determine current user provider:', e);
			}

			// 2. 기존 싱크 데이터가 있는지 확인
			if (window.SyncDataService && trackId) {
				try {
					const existingSyncData = await window.SyncDataService.getSyncData(trackId);
					if (existingSyncData && existingSyncData.syncData && existingSyncData.syncData.lines) {
						console.log('[SyncDataCreator] Found existing sync data, provider:', existingSyncData.provider);

						// 3. 현재 유저의 provider와 기존 싱크 데이터의 provider 비교
						if (currentUserProvider && existingSyncData.provider !== currentUserProvider) {
							// provider가 다르면 기존 싱크 데이터를 무시하고 현재 유저의 provider로 새로 시작
							console.log('[SyncDataCreator] Provider mismatch! Existing:', existingSyncData.provider, 'Current:', currentUserProvider);
							Toast.warning(
								I18n.t('syncCreator.providerMismatch') ||
								`기존 싱크 데이터는 ${existingSyncData.provider} 용입니다. 현재 계정은 ${currentUserProvider}를 사용하므로 새로 생성해야 합니다.`
							);
							// 현재 유저의 provider로 가사 로드
							loadLyrics();
							return;
						}

						// provider가 일치하면 기존 싱크 데이터 적용
						await loadLyrics(existingSyncData.provider);
						setSyncData(existingSyncData.syncData);
						setProvider(existingSyncData.provider);

						Toast.success(I18n.t('syncCreator.loadedExistingSyncData') || '기존 싱크 데이터를 불러왔습니다');
						return;
					}
				} catch (e) {
					console.warn('[SyncDataCreator] Failed to load existing sync data:', e);
				}
			}

			// 기존 싱크 데이터가 없으면 일반 가사 로드
			loadLyrics();
		};

		initWithExistingSyncData();
	}, []);

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

		// 마우스를 너무 위/아래로 움직였거나 영역을 벗어났을 때도 처리가 필요할 수 있음
		// 현재는 index 기반으로만 처리

		if (charIndex < 0) {
			// 영역 왼쪽 밖으로 나감 - 전체 취소 아님, 그냥 인덱스 0 처리?
			// 아니면 드래그 시작점보다 왼쪽으로 가면 그만큼 취소
			// 여기서는 -1이면 아무것도 안함
			return;
		}

		if (charIndex >= recordingCharIndex) {
			// 정방향 진행
			for (let i = recordingCharIndex + 1; i <= charIndex; i++) {
				if (charTimesRef.current[i] === null) {
					charTimesRef.current[i] = currentTime;
				}
			}
			setRecordingCharIndex(charIndex);
			autoScroll(charIndex);
		} else {
			// 역방향 진행 (취소)
			// 현재 recordingCharIndex에서 charIndex+1 까지의 기록을 지움
			for (let i = charIndex + 1; i <= recordingCharIndex; i++) {
				charTimesRef.current[i] = null;
			}
			setRecordingCharIndex(charIndex);
		}
	}, [mode, isDragging, dragStartTime, recordingCharIndex, autoScroll]);

	const handleDragEnd = useCallback((e) => {
		if (mode !== 'record' || !isDragging || dragStartTime === null || recordingCharIndex === -1) {
			setIsDragging(false);
			return;
		}

		e.preventDefault();

		// 드래그가 시작점보다 왼쪽에서 끝났으면 취소로 간주할 수도 있으나,
		// 여기서는 recordingCharIndex가 유효한 마지막 지점이므로 거기까지만 저장

		const endTime = Spicetify.Player.getProgress() / 1000;
		const endCharIndex = recordingCharIndex;
		const lineStart = lineCharOffsets[currentLineIndex];
		const lineEnd = lineStart + currentLineChars.length - 1;
		const charCount = currentLineChars.length;

		// 유효성 체크: 만약 드래그 시작하자마자 바로 끝나거나 이상한 경우
		if (endCharIndex < dragStartCharIndex) {
			// 시작점보다 뒤로 가서 끝났으면 해당 부분은 싱크 안함 (혹은 이전 싱크 유지)
			// 여기서는 그냥 저장 진행 (지워진 상태로)
			// 만약 전체를 취소하고 싶다면 별도 처리가 필요하지만, 
			// UX상 왼쪽으로 가서 놓으면 그 부분은 싱크가 안 된 상태가 됨.
		}

		const chars = [];
		for (let i = 0; i < charCount; i++) {
			let time;
			if (charTimesRef.current[i] !== null) {
				time = charTimesRef.current[i];
			} else if (i <= endCharIndex) {
				// 중간에 빈 곳이 있으면 채움 (보간)
				const prevTime = chars[chars.length - 1] || dragStartTime;
				time = prevTime + 0.02;
			} else {
				// 끝부분 이후는 자동 채움 (보간)
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
	}, [mode, isDragging, dragStartTime, recordingCharIndex, currentLineIndex, currentLineChars, lineCharOffsets, lyricsLines.length, dragStartCharIndex]);

	// 키보드 싱크 상태 ref (isDragging과 별개로 키보드용)
	const isKeyboardSyncingRef = useRef(false);
	const keyboardCharIndexRef = useRef(-1);

	// 드래그 키(/) 연속 입력을 위한 인터벌 ref
	const keyboardDragIntervalRef = useRef(null);
	const isKeyboardDraggingRef = useRef(false);

	// 이전 라인 인덱스 추적 (라인 변경 감지용)
	const prevLineIndexRef = useRef(currentLineIndex);

	// 키보드 이벤트 리스너 등록
	useEffect(() => {
		// 라인이 변경되었는지 확인
		const lineChanged = prevLineIndexRef.current !== currentLineIndex;
		if (lineChanged) {
			prevLineIndexRef.current = currentLineIndex;
		}

		// record 모드가 아니거나 라인이 변경되면 키보드 싱크 상태 초기화
		const shouldReset = mode !== 'record' || lineChanged;
		if (shouldReset && (isKeyboardSyncingRef.current || isKeyboardDraggingRef.current)) {
			console.log('[SyncDataCreator] Resetting keyboard sync state, mode:', mode, 'lineChanged:', lineChanged);
			// 진행 중인 키보드 싱크 초기화
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			setDragStartTime(null);
			setRecordingCharIndex(-1);
			// 드래그 모드도 초기화
			if (isKeyboardDraggingRef.current) {
				isKeyboardDraggingRef.current = false;
				if (keyboardDragIntervalRef.current) {
					clearInterval(keyboardDragIntervalRef.current);
					keyboardDragIntervalRef.current = null;
				}
			}
		}

		const finishKeyboardSync = () => {
			if (!isKeyboardSyncingRef.current) return;

			const endTime = Spicetify.Player.getProgress() / 1000;
			const endCharIndex = keyboardCharIndexRef.current;
			const lineStart = lineCharOffsets[currentLineIndex];
			const lineEnd = lineStart + currentLineChars.length - 1;
			const charCount = currentLineChars.length;

			const chars = [];
			const startTime = charTimesRef.current[0] || endTime;
			for (let i = 0; i < charCount; i++) {
				let time;
				if (charTimesRef.current[i] !== null) {
					time = charTimesRef.current[i];
				} else if (i <= endCharIndex) {
					const prevTime = chars[chars.length - 1] || startTime;
					time = prevTime + 0.02;
				} else {
					const remainingCount = charCount - endCharIndex - 1;
					const perCharDuration = 0.5 / Math.max(1, remainingCount);
					time = endTime + ((i - endCharIndex) * perCharDuration);
				}
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

				const validLines = newLines.filter(line => {
					if (line.start > lineStart && line.chars && line.chars[0] < lastCharTime) {
						return false;
					}
					return true;
				});

				return { lines: validLines };
			});

			// 다음 라인으로 이동
			if (currentLineIndex < lyricsLines.length - 1) {
				setCurrentLineIndex(prev => prev + 1);
				if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
			}

			// 키보드 싱크 상태 초기화
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			setDragStartTime(null);
			setRecordingCharIndex(-1);
		};

		const handleKeyDown = (e) => {
			// 방향키, Enter, Backspace, 단어 싱크(,.), 드래그(/), Seek(z,x)
			const targetKeys = ['ArrowRight', 'ArrowLeft', 'Enter', 'Backspace', ',', '.', '/', 'z', 'x'];
			if (!targetKeys.includes(e.key)) return;

			// record 모드가 아니면 처리하지 않음
			if (mode !== 'record') return;

			console.log('[SyncDataCreator] KeyDown:', e.key, 'mode:', mode, 'lineIndex:', currentLineIndex);

			if (currentLineIndex >= lyricsLines.length) return;

			// 특수문자 패턴 헬퍼 함수들
			const isTrailingChar = (ch) => /[\s!?\.,;:\)\]\}」』】〉》"''""]/i.test(ch);
			const isLeadingChar = (ch) => /[\(\[\{「『【〈《"''""¿¡]/i.test(ch);
			const isWordBoundary = (ch) => /[\s\-–—]/i.test(ch);

			// 한 글자 앞으로 진행하는 헬퍼 함수
			const advanceOneChar = (currentTime) => {
				if (!isKeyboardSyncingRef.current) {
					// 키보드 싱크 시작
					isKeyboardSyncingRef.current = true;
					let startIndex = 0;
					charTimesRef.current = new Array(currentLineChars.length).fill(null);
					charTimesRef.current[0] = currentTime;

					// 첫 글자가 여는 괄호면 다음 글자까지 포함
					if (isLeadingChar(currentLineChars[0])) {
						while (startIndex + 1 < currentLineChars.length && isLeadingChar(currentLineChars[startIndex])) {
							startIndex++;
							charTimesRef.current[startIndex] = currentTime;
						}
					}

					// 다음 글자가 구두점/닫는괄호/공백이면 함께 처리
					while (startIndex + 1 < currentLineChars.length && isTrailingChar(currentLineChars[startIndex + 1])) {
						startIndex++;
						charTimesRef.current[startIndex] = currentTime;
					}

					keyboardCharIndexRef.current = startIndex;
					setDragStartTime(currentTime);
					setRecordingCharIndex(startIndex);
					console.log('[SyncDataCreator] Started keyboard sync, chars:', currentLineChars.length, 'startIndex:', startIndex);
					return startIndex;
				} else {
					// 다음 글자로 진행
					let nextIndex = keyboardCharIndexRef.current + 1;
					if (nextIndex < currentLineChars.length) {
						charTimesRef.current[nextIndex] = currentTime;

						// 현재 글자가 여는 괄호면 다음 글자까지 포함
						while (nextIndex + 1 < currentLineChars.length && isLeadingChar(currentLineChars[nextIndex])) {
							nextIndex++;
							charTimesRef.current[nextIndex] = currentTime;
						}

						// 다음 글자가 구두점/닫는괄호/공백이면 함께 처리
						while (nextIndex + 1 < currentLineChars.length && isTrailingChar(currentLineChars[nextIndex + 1])) {
							nextIndex++;
							charTimesRef.current[nextIndex] = currentTime;
						}

						keyboardCharIndexRef.current = nextIndex;
						setRecordingCharIndex(nextIndex);
						autoScroll(nextIndex);
						console.log('[SyncDataCreator] Advanced to char:', nextIndex);
					}

					// 마지막 글자면 라인 완료
					if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
						finishKeyboardSync();
						console.log('[SyncDataCreator] Line completed');
						return -1; // 완료됨
					}
					return keyboardCharIndexRef.current;
				}
			};

			// 한 단어 앞으로 진행하는 헬퍼 함수
			const advanceOneWord = (currentTime) => {
				if (!isKeyboardSyncingRef.current) {
					// 싱크 시작
					advanceOneChar(currentTime);
				}

				// 현재 위치부터 다음 단어 경계까지 진행
				const startIdx = keyboardCharIndexRef.current;
				let endIdx = startIdx + 1;

				// 먼저 현재 공백들 건너뛰기
				while (endIdx < currentLineChars.length && isWordBoundary(currentLineChars[endIdx])) {
					charTimesRef.current[endIdx] = currentTime;
					endIdx++;
				}

				// 다음 단어 경계까지 진행
				while (endIdx < currentLineChars.length && !isWordBoundary(currentLineChars[endIdx])) {
					charTimesRef.current[endIdx] = currentTime;
					endIdx++;

					// trailing 문자들도 함께 처리
					while (endIdx < currentLineChars.length && isTrailingChar(currentLineChars[endIdx]) && !isWordBoundary(currentLineChars[endIdx])) {
						charTimesRef.current[endIdx] = currentTime;
						endIdx++;
					}
				}

				// 최소 한 글자는 진행했는지 확인
				if (endIdx <= startIdx + 1) {
					endIdx = Math.min(startIdx + 1, currentLineChars.length - 1);
					charTimesRef.current[endIdx] = currentTime;
				}

				keyboardCharIndexRef.current = endIdx - 1;
				if (keyboardCharIndexRef.current < 0) keyboardCharIndexRef.current = 0;
				setRecordingCharIndex(keyboardCharIndexRef.current);
				autoScroll(keyboardCharIndexRef.current);
				console.log('[SyncDataCreator] Word advanced to char:', keyboardCharIndexRef.current);

				// 마지막 글자면 라인 완료
				if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
					finishKeyboardSync();
					console.log('[SyncDataCreator] Line completed by word');
				}
			};

			// 한 단어 뒤로 취소하는 헬퍼 함수 (첫 글자도 취소 가능)
			const revertOneWord = () => {
				if (!isKeyboardSyncingRef.current || keyboardCharIndexRef.current < 0) return;

				let targetIdx = keyboardCharIndexRef.current - 1;

				// trailing 문자들 건너뛰기
				while (targetIdx >= 0 && isTrailingChar(currentLineChars[targetIdx])) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 단어 경계까지 뒤로 가기
				while (targetIdx >= 0 && !isWordBoundary(currentLineChars[targetIdx])) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 공백들 건너뛰기
				while (targetIdx >= 0 && isWordBoundary(currentLineChars[targetIdx])) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 현재 위치부터 targetIdx+1까지의 타임 null 처리
				for (let i = targetIdx + 1; i <= keyboardCharIndexRef.current; i++) {
					charTimesRef.current[i] = null;
				}

				keyboardCharIndexRef.current = targetIdx;
				setRecordingCharIndex(keyboardCharIndexRef.current);
				console.log('[SyncDataCreator] Word reverted to char:', keyboardCharIndexRef.current);

				// 모든 글자 취소시 싱크 상태 초기화
				if (keyboardCharIndexRef.current < 0) {
					isKeyboardSyncingRef.current = false;
					setDragStartTime(null);
					console.log('[SyncDataCreator] All chars reverted by word, sync reset');
				}
			};

			// 오른쪽 방향키: 한 글자 싱크
			if (e.key === 'ArrowRight') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				const currentTime = Spicetify.Player.getProgress() / 1000;
				advanceOneChar(currentTime);
			}

			// 왼쪽 방향키: 한 글자 취소 (첫 글자도 취소 가능)
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
					charTimesRef.current[keyboardCharIndexRef.current] = null;
					keyboardCharIndexRef.current--;
					setRecordingCharIndex(keyboardCharIndexRef.current);
					console.log('[SyncDataCreator] Reverted to char:', keyboardCharIndexRef.current);
					// 모든 글자 취소시 싱크 상태 초기화
					if (keyboardCharIndexRef.current < 0) {
						isKeyboardSyncingRef.current = false;
						setDragStartTime(null);
						console.log('[SyncDataCreator] All chars reverted, sync reset');
					}
				}
			}

			// . (> 키): 한 단어 싱크
			if (e.key === '.') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				const currentTime = Spicetify.Player.getProgress() / 1000;
				advanceOneWord(currentTime);
			}

			// , (< 키): 한 단어 취소
			if (e.key === ',') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				revertOneWord();
			}

			// / 키: 드래그 모드 시작 (누르고 있으면 연속으로 빠르게 진행)
			if (e.key === '/' && !e.repeat) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				// 이미 드래그 중이면 무시
				if (isKeyboardDraggingRef.current) return;

				isKeyboardDraggingRef.current = true;

				// 첫 번째 글자 즉시 처리
				const currentTime = Spicetify.Player.getProgress() / 1000;
				const result = advanceOneChar(currentTime);

				// 라인이 완료되었으면 드래그 시작하지 않음
				if (result === -1) {
					isKeyboardDraggingRef.current = false;
					return;
				}

				// 30ms 간격으로 연속 진행 (딜레이 없이 즉시 시작)
				keyboardDragIntervalRef.current = setInterval(() => {
					if (!isKeyboardDraggingRef.current) {
						clearInterval(keyboardDragIntervalRef.current);
						keyboardDragIntervalRef.current = null;
						return;
					}

					const time = Spicetify.Player.getProgress() / 1000;
					const res = advanceOneChar(time);

					// 라인 완료시 드래그 종료
					if (res === -1) {
						isKeyboardDraggingRef.current = false;
						clearInterval(keyboardDragIntervalRef.current);
						keyboardDragIntervalRef.current = null;
					}
				}, 30);
			}

			// Enter: 현재 라인 완료 (중간에서도 완료 가능, 키보드 싱크 중일 때만)
			if (e.key === 'Enter') {
				// 키보드 싱크 중일 때만 처리 (글자를 하나라도 맞췄을 때)
				if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					finishKeyboardSync();
				}
				// 싱크 중이 아닐 때는 기본 동작 허용 (다른 버튼 클릭 등)
			}

			// Backspace: 현재 라인 싱크 취소
			if (e.key === 'Backspace' && isKeyboardSyncingRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				isKeyboardSyncingRef.current = false;
				keyboardCharIndexRef.current = -1;
				charTimesRef.current = [];
				setDragStartTime(null);
				setRecordingCharIndex(-1);

				// 드래그 모드도 취소
				if (isKeyboardDraggingRef.current) {
					isKeyboardDraggingRef.current = false;
					if (keyboardDragIntervalRef.current) {
						clearInterval(keyboardDragIntervalRef.current);
						keyboardDragIntervalRef.current = null;
					}
				}
			}

			// z: 3초 뒤로
			if (e.key === 'z') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				const currentPos = Spicetify.Player.getProgress();
				Spicetify.Player.seek(Math.max(0, currentPos - 3000));
			}

			// x: 3초 앞으로
			if (e.key === 'x') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				const currentPos = Spicetify.Player.getProgress();
				const duration = Spicetify.Player.getDuration();
				Spicetify.Player.seek(Math.min(duration, currentPos + 3000));
			}
		};

		// / 키 keyup 이벤트 핸들러 (드래그 종료)
		const handleKeyUp = (e) => {
			if (e.key === '/') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				isKeyboardDraggingRef.current = false;
				if (keyboardDragIntervalRef.current) {
					clearInterval(keyboardDragIntervalRef.current);
					keyboardDragIntervalRef.current = null;
				}
			}
		};

		console.log('[SyncDataCreator] Registering keydown/keyup listeners, mode:', mode);
		document.addEventListener('keydown', handleKeyDown, true); // capture phase
		document.addEventListener('keyup', handleKeyUp, true); // capture phase
		return () => {
			console.log('[SyncDataCreator] Removing keydown/keyup listeners');
			document.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keyup', handleKeyUp, true);
			// 정리시 드래그 인터벌도 정리
			if (keyboardDragIntervalRef.current) {
				clearInterval(keyboardDragIntervalRef.current);
				keyboardDragIntervalRef.current = null;
			}
			isKeyboardDraggingRef.current = false;
		};
	}, [mode, currentLineIndex, lyricsLines.length, currentLineChars, lineCharOffsets, autoScroll]);

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
					// 캐시 무효화 - SyncDataService와 SongDataService 모두
					window.SyncDataService?.clearCache(trackId);
					window.SongDataService?.invalidateCache(trackId);
					// 가사 페이지 새로고침
					setTimeout(() => {
						if (typeof window.reloadLyrics === 'function') {
							window.reloadLyrics(true);
						} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
							window.lyricContainer.reloadLyrics(true);
						}
					}, 500);
					if (onClose) onClose();
				} else {
					Toast.error(I18n.t('syncCreator.submitError'));
				}
			} else {
				const userHash = Utils.getCurrentUserHash();
				const response = await fetch('https://lyrics.api.ivl.is/lyrics/sync-data', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ trackId, provider, syncData, userHash })
				});

				if (response.ok) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					// 캐시 무효화 - SyncDataService와 SongDataService 모두
					window.SyncDataService?.clearCache(trackId);
					window.SongDataService?.invalidateCache(trackId);
					// 가사 페이지 새로고침
					setTimeout(() => {
						if (typeof window.reloadLyrics === 'function') {
							window.reloadLyrics(true);
						} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
							window.lyricContainer.reloadLyrics(true);
						}
					}, 500);
					if (onClose) onClose();
				} else {
					Toast.error((await response.json()).error || I18n.t('syncCreator.submitError'));
				}
			}
		} catch (e) {
			console.error('[SyncDataCreator] Submit error:', e);
			Toast.error(`${I18n.t('syncCreator.submitError')}: ${e.message}`);
		}

		setIsSubmitting(false);
	}, [syncData, lyricsLines.length, trackId, provider, onClose]);

	// LRCLIB 등록 취소
	const cancelLrcLibPublish = useCallback(() => {
		setPublishCancelled(true);
		publishWorkersRef.current.forEach(w => w.terminate());
		publishWorkersRef.current = [];
		setIsPublishingToLrcLib(false);
		setLrcLibPublishProgress('');
		Toast.warning(I18n.t('syncCreator.lrclib.publishCancelled') || '등록이 취소되었습니다');
	}, []);

	// LRCLIB Proof-of-Work 솔버 (Web Worker 사용)
	const solveLrcLibChallenge = useCallback((prefix, targetHex) => {
		return new Promise((resolve, reject) => {
			const workerCount = navigator.hardwareConcurrency || 4;
			const workers = [];
			let solved = false;
			let totalProgress = 0;

			// Web Worker 코드를 Blob으로 생성
			const workerCode = `
				self.onmessage = async function(e) {
					const { prefix, targetHex, start, step } = e.data;
					const target = new Uint8Array(targetHex.match(/.{2}/g).map(b => parseInt(b, 16)));

					const isHashLessThanTarget = (hash) => {
						for (let i = 0; i < 32; i++) {
							if (hash[i] < target[i]) return true;
							if (hash[i] > target[i]) return false;
						}
						return false;
					};

					const encoder = new TextEncoder();
					let nonce = start;
					let count = 0;

					while (true) {
						const data = encoder.encode(prefix + nonce);
						const hashBuffer = await crypto.subtle.digest('SHA-256', data);
						const hash = new Uint8Array(hashBuffer);

						if (isHashLessThanTarget(hash)) {
							self.postMessage({ found: true, nonce });
							return;
						}

						nonce += step;
						count++;

						if (count % 10000 === 0) {
							self.postMessage({ found: false, count });
						}
					}
				};
			`;

			const blob = new Blob([workerCode], { type: 'application/javascript' });
			const workerUrl = URL.createObjectURL(blob);

			for (let i = 0; i < workerCount; i++) {
				const worker = new Worker(workerUrl);
				workers.push(worker);

				worker.onmessage = (e) => {
					if (e.data.found && !solved) {
						solved = true;
						console.log('[SyncDataCreator] PoW solved! nonce:', e.data.nonce);
						workers.forEach(w => w.terminate());
						publishWorkersRef.current = [];
						URL.revokeObjectURL(workerUrl);
						resolve(e.data.nonce.toString());
					} else if (!e.data.found && !solved) {
						totalProgress += e.data.count;
						setLrcLibPublishProgress(
							I18n.t('syncCreator.lrclib.solving').replace('{nonce}', totalProgress.toLocaleString())
						);
					}
				};

				worker.postMessage({ prefix, targetHex, start: i, step: workerCount });
			}

			// Worker들을 ref에 저장하여 취소 가능하게 함
			publishWorkersRef.current = workers;
		});
	}, []);

	// LRCLIB에 가사 발행
	const publishToLrcLib = useCallback(async () => {
		if (!manualLyricsInput.trim()) {
			Toast.error(I18n.t('syncCreator.lrclib.noLyricsInput'));
			return;
		}

		setPublishCancelled(false);
		setIsPublishingToLrcLib(true);
		setLrcLibPublishProgress(I18n.t('syncCreator.lrclib.requestingChallenge'));

		try {
			// 1. Challenge 요청 - 직접 호출 먼저 시도
			const challengeUrl = 'https://lrclib.net/api/request-challenge';
			let challengeRes;
			try {
				challengeRes = await fetch(challengeUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (corsError) {
				// CORS 오류 시 프록시 사용
				console.log('[SyncDataCreator] Direct challenge request failed, trying proxy...');
				challengeRes = await fetch('https://corsproxy.io/?url=' + encodeURIComponent(challengeUrl), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
			}

			if (!challengeRes.ok) {
				throw new Error('Failed to request challenge');
			}

			const challenge = await challengeRes.json();
			setLrcLibPublishProgress(I18n.t('syncCreator.lrclib.solvingChallenge'));

			// 2. Proof-of-Work 솔브
			const nonce = await solveLrcLibChallenge(challenge.prefix, challenge.target);

			// 취소 확인
			if (publishCancelled) {
				return;
			}

			const publishToken = `${challenge.prefix}:${nonce}`;

			setLrcLibPublishProgress(I18n.t('syncCreator.lrclib.publishing'));

			// 3. 가사 발행
			const duration = Math.round((Spicetify.Player?.data?.item?.duration?.milliseconds || 0) / 1000);
			const albumName = trackInfo?.album?.name || Spicetify.Player?.data?.item?.album?.name || '';

			// syncData가 있으면 싱크된 가사로 변환
			let syncedLyrics = '';
			if (syncData && syncData.lines && syncData.lines.length > 0) {
				const lines = manualLyricsInput.split('\n').filter(l => l.trim());
				syncedLyrics = syncData.lines.map(lineData => {
					const lineIdx = lyricsLines.findIndex((_, idx) => lineCharOffsets[idx] === lineData.start);
					if (lineIdx >= 0 && lines[lineIdx]) {
						const startTime = lineData.chars[0];
						const mins = Math.floor(startTime / 60);
						const secs = (startTime % 60).toFixed(2);
						return `[${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}] ${lines[lineIdx]}`;
					}
					return null;
				}).filter(Boolean).join('\n');
			}

			// 백엔드 프록시를 통해 발행 (LRCLIB은 CORS를 허용하지 않음)
			const publishRes = await fetch('https://lyrics.api.ivl.is/lyrics/lrclib/publish', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					publishToken: publishToken,
					trackName: trackName,
					artistName: trackInfo?.artists?.[0]?.name || Spicetify.Player?.data?.item?.artists?.[0]?.name || artistName.split(',')[0].trim(),
					albumName: albumName,
					duration: duration,
					plainLyrics: manualLyricsInput.trim(),
					syncedLyrics: syncedLyrics || ''
				})
			});

			if (publishRes.ok) {
				Toast.success(I18n.t('syncCreator.lrclib.publishSuccess'));
				setShowLrcLibPublish(false);
				setManualLyricsInput('');

				// LRCLIB에 가사가 반영될 때까지 잠시 대기 후 자동 로드
				setLrcLibPublishProgress(I18n.t('syncCreator.lrclib.loadingAfterPublish') || '가사를 불러오는 중...');
				setProvider('lrclib');

				// 2초 후 가사 로드 (LRCLIB 서버 반영 대기)
				setTimeout(async () => {
					await loadLyrics();
					setLrcLibPublishProgress('');
					setIsPublishingToLrcLib(false);
				}, 2000);

				// 가사 페이지 새로고침
				setTimeout(() => {
					if (typeof window.reloadLyrics === 'function') {
						window.reloadLyrics(true);
					} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
						window.lyricContainer.reloadLyrics(true);
					}
				}, 3000);
				return; // isPublishingToLrcLib는 위에서 처리
			} else {
				const errData = await publishRes.json().catch(() => ({}));
				throw new Error(errData.message || 'Publish failed');
			}
		} catch (e) {
			if (!publishCancelled) {
				console.error('[SyncDataCreator] LRCLIB publish error:', e);
				Toast.error(I18n.t('syncCreator.lrclib.publishError') + ': ' + e.message);
			}
		}

		setIsPublishingToLrcLib(false);
		setLrcLibPublishProgress('');
	}, [manualLyricsInput, trackName, artistName, trackInfo, syncData, lyricsLines, lineCharOffsets, solveLrcLibChallenge, loadLyrics, publishCancelled]);

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
		charSpan: { padding: '10px 1px', borderRadius: '4px', cursor: mode === 'record' ? 'pointer' : 'default', position: 'relative', fontSize: '32px', fontWeight: '600', minWidth: '6px', textAlign: 'center', flexShrink: 0, color: 'var(--spice-text)', letterSpacing: '-1px' },
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
		// LRCLIB 발행 모달 스타일
		lrcLibModal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' },
		lrcLibContent: { background: 'var(--spice-card)', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '16px' },
		lrcLibTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--spice-text)', margin: 0 },
		lrcLibDesc: { fontSize: '13px', color: 'var(--spice-subtext)', lineHeight: 1.5 },
		lrcLibTextarea: { width: '100%', height: '300px', background: 'var(--spice-main)', color: 'var(--spice-text)', border: '1px solid var(--spice-misc)', borderRadius: '8px', padding: '12px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
		lrcLibBtnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' },
		lrcLibBtn: { background: 'var(--spice-button)', color: 'var(--spice-button-text, #000)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
		lrcLibBtnSecondary: { background: 'var(--spice-misc)', color: 'var(--spice-text)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
		lrcLibBtnCancel: { background: 'transparent', color: 'var(--spice-subtext)', border: '1px solid var(--spice-misc)', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
		lrcLibProgress: { fontSize: '12px', color: 'var(--spice-subtext)', textAlign: 'center', padding: '8px' },
		publishBtn: { background: '#4caf50', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', marginTop: '12px' },
		wrongWarning: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 15px', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: '8px', marginBottom: '15px', marginTop: '-5px', fontSize: '13px', gap: '10px' },
		publishBtnSmall: { background: 'var(--spice-button)', color: 'var(--spice-button-text, #000)', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '12px', flexShrink: 0 },
		// 키보드 단축키 스타일
		shortcutsContainer: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', padding: '12px 16px', background: 'var(--spice-card)', borderRadius: '10px', marginTop: '12px' },
		shortcutItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--spice-subtext)' },
		shortcutKey: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '22px', padding: '0 6px', background: 'var(--spice-misc)', color: 'var(--spice-text)', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 2px 0 rgba(0,0,0,0.3)' },
		shortcutDesc: { color: 'var(--spice-subtext)' },
	};

	return react.createElement('div', { style: s.overlay, ref: containerRef },
		// Header - 가운데 정렬
		react.createElement('div', { style: s.header },
			react.createElement('button', {
				style: s.backBtn, onClick: () => {
					preventNextTrackRef.current = false;
					if (onClose) onClose();
				}
			},
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
				// LRCLIB Upload Button
				react.createElement('button', {
					style: { ...s.publishBtnSmall, marginRight: '10px', background: 'rgba(255, 152, 0, 0.8)', color: '#fff', fontSize: '11px', padding: '4px 8px' },
					onClick: () => setShowLrcLibPublish(true),
					title: I18n.t('syncCreator.lrclib.wrongLyricsWarning')
				}, I18n.t('syncCreator.lrclib.registerLyrics')),

				react.createElement('span', { style: { fontSize: '12px', color: 'var(--spice-subtext)' } }, 'Provider:'),
				react.createElement('select', {
					style: s.select,
					value: provider || '',
					onChange: (e) => {
						const newProvider = e.target.value;
						if (newProvider) loadLyrics(newProvider);
					}
				},
					react.createElement('option', { value: 'spotify' }, 'Spotify'),
					react.createElement('option', { value: 'lrclib' }, 'LRCLIB')
				),
				react.createElement('button', { style: { ...s.loadBtn, opacity: isLoading ? 0.5 : 1 }, onClick: () => loadLyrics(provider), disabled: isLoading },
					isLoading ? I18n.t('syncCreator.loading') : I18n.t('syncCreator.reload') || '다시 로드'
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
			error && react.createElement('div', { style: { ...s.error, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
				react.createElement('div', null, error),
				react.createElement('button', {
					style: s.publishBtn,
					onClick: () => setShowLrcLibPublish(true)
				}, I18n.t('syncCreator.lrclib.registerLyrics'))
			),
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
							const isRec = mode === 'record' && recordingCharIndex >= 0 && i <= recordingCharIndex;
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

				mode === 'record' && react.createElement('div', { style: s.hint }, I18n.t('syncCreator.dragHint')),

				// 키보드 단축키 가이드 (record 모드일 때만 표시)
				mode === 'record' && react.createElement('div', { style: s.shortcutsContainer },
					// 한 글자
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '→'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.charForward') || '한 글자')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '←'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.charBack') || '한 글자 취소')
					),
					// 한 단어
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '.'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.wordForward') || '한 단어')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, ','),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.wordBack') || '한 단어 취소')
					),
					// 드래그
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '/'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.drag') || '누르고 있으면 드래그')
					),
					// 완료/취소
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Enter'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.finish') || '라인 완료')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '⌫'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.cancel') || '취소')
					),
					// 재생 컨트롤
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Space'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.playPause') || '재생/일시정지')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Z'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.seekBack') || '-3초')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'X'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.seekForward') || '+3초')
					)
				)
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



			// 현재 줄 삭제
			isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync },
				I18n.t('syncCreator.deleteLine')
			)
		),

		// LRCLIB 발행 모달
		showLrcLibPublish && react.createElement('div', { style: s.lrcLibModal, onClick: (e) => e.target === e.currentTarget && !isPublishingToLrcLib && setShowLrcLibPublish(false) },
			react.createElement('div', { style: s.lrcLibContent },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.lrclib.title')),
				react.createElement('p', { style: s.lrcLibDesc }, I18n.t('syncCreator.lrclib.description')),
				react.createElement('div', { style: { fontSize: '12px', color: '#ff9800', padding: '10px', background: 'rgba(255, 152, 0, 0.1)', borderRadius: '6px', marginBottom: '8px', border: '1px solid rgba(255, 152, 0, 0.3)' } },
					I18n.t('syncCreator.lrclib.timeWarning') || '⚠️ LRCLIB은 무분별한 가사 등록을 막기 위해 암호화 토큰 해석 작업을 요구합니다. 이 과정은 컴퓨터 성능에 따라 약 5분 정도 소요될 수 있습니다.'
				),
				react.createElement('div', { style: { fontSize: '12px', color: 'var(--spice-subtext)', padding: '8px', background: 'var(--spice-main)', borderRadius: '6px' } },
					react.createElement('div', null, `${I18n.t('syncCreator.lrclib.trackInfo')}:`),
					react.createElement('div', { style: { fontWeight: '600', color: 'var(--spice-text)' } }, `${trackName} - ${artistName}`)
				),
				react.createElement('textarea', {
					style: s.lrcLibTextarea,
					placeholder: I18n.t('syncCreator.lrclib.placeholder'),
					value: manualLyricsInput,
					onChange: (e) => setManualLyricsInput(e.target.value),
					disabled: isPublishingToLrcLib
				}),
				lrcLibPublishProgress && react.createElement('div', { style: s.lrcLibProgress }, lrcLibPublishProgress),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: { ...s.lrcLibBtnCancel, ...(isPublishingToLrcLib ? { background: '#f44336', color: '#fff', borderColor: '#f44336' } : {}) },
						onClick: isPublishingToLrcLib ? cancelLrcLibPublish : () => { setShowLrcLibPublish(false); setManualLyricsInput(''); }
					}, isPublishingToLrcLib ? (I18n.t('syncCreator.lrclib.cancelPublish') || '등록 취소') : I18n.t('cancel')),
					react.createElement('button', {
						style: { ...s.lrcLibBtn, opacity: isPublishingToLrcLib || !manualLyricsInput.trim() ? 0.5 : 1 },
						onClick: publishToLrcLib,
						disabled: isPublishingToLrcLib || !manualLyricsInput.trim()
					}, isPublishingToLrcLib ? I18n.t('syncCreator.lrclib.publishing') : I18n.t('syncCreator.lrclib.publishToLrcLib'))
				)
			)
		)
	);
};

window.SyncDataCreator = SyncDataCreator;
